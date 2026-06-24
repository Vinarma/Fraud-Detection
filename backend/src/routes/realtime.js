// backend/src/routes/realtime.js
// Real-time trend data endpoint — serves actual DB aggregations for charts
const express    = require('express');
const mongoose   = require('mongoose');
const Transaction = require('../models/Transaction');
const InsiderLog  = require('../models/InsiderLog');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// ==========================================
// GET /api/realtime/trend
// Hourly transaction trend — last 24h
// ==========================================
router.get('/trend', authMiddleware, async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const pipeline = [
      {
        $match: {
          userId: new mongoose.Types.ObjectId(req.user.userId),
          createdAt: { $gte: since }
        }
      },
      {
        $group: {
          _id: {
            year:  { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day:   { $dayOfMonth: '$createdAt' },
            hour:  { $hour: '$createdAt' }
          },
          total:        { $sum: 1 },
          fraudulent:   { $sum: { $cond: ['$isFraudulent', 1, 0] } },
          highRisk:     { $sum: { $cond: [{ $eq: ['$riskLevel', 'HIGH'] }, 1, 0] } },
          totalAmount:  { $sum: '$amount' },
          avgRiskScore: { $avg: '$riskScore' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.hour': 1 } }
    ];

    const rawData = await Transaction.aggregate(pipeline);

    // Build complete hourly grid (fill empty hours with 0)
    const hoursGrid = [];
    for (let i = hours - 1; i >= 0; i--) {
      const ts   = new Date(Date.now() - i * 3600000);
      const year = ts.getFullYear();
      const month = ts.getMonth() + 1;
      const day  = ts.getDate();
      const hour = ts.getHours();

      const found = rawData.find(d =>
        d._id.year === year && d._id.month === month &&
        d._id.day === day   && d._id.hour === hour
      );

      hoursGrid.push({
        label: ts.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
        timestamp: ts.toISOString(),
        total:        found?.total        || 0,
        fraudulent:   found?.fraudulent   || 0,
        highRisk:     found?.highRisk     || 0,
        totalAmount:  found?.totalAmount  || 0,
        avgRiskScore: found?.avgRiskScore ? Math.round(found.avgRiskScore) : 0
      });
    }

    res.json({
      message:   'Trend data retrieved',
      hours,
      dataPoints: hoursGrid.length,
      data:       hoursGrid,
      generatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('❌ Trend error:', err.message);
    res.status(500).json({ error: 'Failed to fetch trend data', message: err.message });
  }
});

// ==========================================
// GET /api/realtime/stats
// Live statistics snapshot
// ==========================================
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const now = new Date();
    const last1h  = new Date(now - 1   * 3600000);
    const last24h = new Date(now - 24  * 3600000);
    const last7d  = new Date(now - 168 * 3600000);

    const [
      total, last1hCount, last24hCount, last7dCount,
      highRisk, fraudulent, avgRisk,
      activeAlerts
    ] = await Promise.all([
      Transaction.countDocuments({ userId }),
      Transaction.countDocuments({ userId, createdAt: { $gte: last1h } }),
      Transaction.countDocuments({ userId, createdAt: { $gte: last24h } }),
      Transaction.countDocuments({ userId, createdAt: { $gte: last7d } }),
      Transaction.countDocuments({ userId, riskLevel: 'HIGH' }),
      Transaction.countDocuments({ userId, isFraudulent: true }),
      Transaction.aggregate([
        { $match: { userId } },
        { $group: { _id: null, avg: { $avg: '$riskScore' } } }
      ]),
      InsiderLog.countDocuments({ userId, isResolved: false })
    ]);

    res.json({
      stats: {
        total,
        last1h:      last1hCount,
        last24h:     last24hCount,
        last7d:      last7dCount,
        highRisk,
        fraudulent,
        avgRiskScore: avgRisk[0]?.avg ? Math.round(avgRisk[0].avg) : 0,
        activeAlerts,
        threatLevel: highRisk >= 5 ? 'CRITICAL' : highRisk >= 2 ? 'HIGH' : activeAlerts > 0 ? 'MEDIUM' : 'LOW'
      },
      timestamp: now.toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch live stats', message: err.message });
  }
});

// ==========================================
// GET /api/realtime/feed
// Latest 20 events (transactions + alerts)
// ==========================================
router.get('/feed', authMiddleware, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const limit  = parseInt(req.query.limit) || 20;

    const [transactions, alerts] = await Promise.all([
      Transaction.find({ userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .select('merchantName merchantCategory amount riskLevel riskScore isFraudulent location device createdAt'),
      InsiderLog.find({ userId, isResolved: false })
        .sort({ detectedAt: -1 })
        .limit(10)
        .select('activityType severity riskScore description detectedAt')
    ]);

    const feed = [
      ...transactions.map(t => ({
        type:      'transaction',
        id:        t._id,
        title:     t.merchantName,
        subtitle:  t.merchantCategory,
        amount:    t.amount,
        riskLevel: t.riskLevel,
        riskScore: t.riskScore,
        isFraud:   t.isFraudulent,
        location:  t.location,
        device:    t.device,
        timestamp: t.createdAt
      })),
      ...alerts.map(a => ({
        type:      'alert',
        id:        a._id,
        title:     a.activityType.replace(/_/g, ' ').toUpperCase(),
        subtitle:  a.description,
        severity:  a.severity,
        riskScore: a.riskScore,
        timestamp: a.detectedAt
      }))
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, limit);

    res.json({ feed, count: feed.length, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch feed', message: err.message });
  }
});

// ==========================================
// GET /api/realtime/heatmap
// Risk by location for heatmap
// ==========================================
router.get('/heatmap', authMiddleware, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.userId);

    const data = await Transaction.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id:          '$location',
          count:        { $sum: 1 },
          avgRisk:      { $avg: '$riskScore' },
          fraudCount:   { $sum: { $cond: ['$isFraudulent', 1, 0] } },
          totalAmount:  { $sum: '$amount' }
        }
      },
      { $sort: { avgRisk: -1 } },
      { $limit: 20 }
    ]);

    res.json({
      heatmap: data.map(d => ({
        location:    d._id || 'Unknown',
        count:       d.count,
        avgRisk:     Math.round(d.avgRisk || 0),
        fraudCount:  d.fraudCount,
        totalAmount: d.totalAmount,
        riskLevel:   d.avgRisk >= 70 ? 'HIGH' : d.avgRisk >= 40 ? 'MEDIUM' : 'LOW'
      })),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch heatmap', message: err.message });
  }
});

module.exports = router;
