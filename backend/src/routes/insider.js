// backend/src/routes/insider.js
const express = require('express');
const InsiderLog = require('../models/InsiderLog');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');
 
const router = express.Router();
 
// ==========================================
// INSIDER DETECTION LOGIC
// ==========================================
const detectSuspiciousActivity = async (userId, transaction = null) => {
  const alerts = [];
 
  try {
    // Get user data
    const user = await User.findById(userId);
    if (!user) return alerts;
 
    // Get recent transactions
    const recentTransactions = await Transaction.find({ userId })
      .sort({ createdAt: -1 })
      .limit(20);
 
    // ========== DETECTION RULE 1: Multiple High-Risk Transactions ==========
    const highRiskInLastHour = recentTransactions.filter(
      tx => tx.riskLevel === 'HIGH' &&
        new Date(tx.createdAt) > new Date(Date.now() - 60 * 60 * 1000)
    ).length;
 
    if (highRiskInLastHour >= 3) {
      alerts.push({
        activityType: 'rapid_transactions',
        description: `${highRiskInLastHour} high-risk transactions detected in the last hour`,
        riskScore: 75,
        severity: 'HIGH',
        isSuspicious: true,
        riskFactors: [
          { factor: 'High-risk transaction count', weight: 30, value: highRiskInLastHour }
        ]
      });
    }
 
    // ========== DETECTION RULE 2: Large Amount Spike ==========
    const avgTransactionAmount = recentTransactions.length > 0
      ? recentTransactions.reduce((sum, tx) => sum + tx.amount, 0) / recentTransactions.length
      : 0;
 
    if (transaction && transaction.amount > avgTransactionAmount * 5) {
      alerts.push({
        activityType: 'high_amount_transaction',
        description: `Transaction amount (₹${transaction.amount}) is 5x higher than average (₹${Math.round(avgTransactionAmount)})`,
        riskScore: 65,
        severity: 'MEDIUM',
        isSuspicious: true,
        transactionId: transaction._id,
        riskFactors: [
          { factor: 'Amount spike', weight: 25, value: transaction.amount / avgTransactionAmount }
        ]
      });
    }
 
    // ========== DETECTION RULE 3: Unusual Location Pattern ==========
    const locations = recentTransactions.map(tx => tx.location);
    const uniqueLocations = [...new Set(locations)];
 
    if (uniqueLocations.length > 3 && recentTransactions.length > 5) {
      const recentLocations = recentTransactions.slice(0, 5).map(tx => tx.location);
      const hasUnusualJump = recentLocations[0] !== recentLocations[recentLocations.length - 1];
 
      if (hasUnusualJump) {
        alerts.push({
          activityType: 'unusual_location',
          description: `Location changed rapidly: ${recentLocations.slice(0, 2).join(' → ')} (unusual pattern)`,
          riskScore: 55,
          severity: 'MEDIUM',
          isSuspicious: true,
          riskFactors: [
            { factor: 'Location variance', weight: 20, value: uniqueLocations.length }
          ]
        });
      }
    }
 
    // ========== DETECTION RULE 4: New Device Usage ==========
    const failedLogins = user.loginAttempts || 0;
    if (failedLogins >= 3) {
      alerts.push({
        activityType: 'multiple_failed_logins',
        description: `${failedLogins} failed login attempts recorded`,
        riskScore: 70,
        severity: 'HIGH',
        isSuspicious: failedLogins >= 5,
        riskFactors: [
          { factor: 'Failed login count', weight: 28, value: failedLogins }
        ]
      });
    }
 
    // ========== DETECTION RULE 5: Pattern Deviation ==========
    const fraudTransactions = recentTransactions.filter(tx => tx.isFraudulent).length;
    const fraudRate = recentTransactions.length > 0
      ? (fraudTransactions / recentTransactions.length) * 100
      : 0;
 
    if (fraudRate > 30) {
      alerts.push({
        activityType: 'pattern_deviation',
        description: `High fraud rate detected: ${fraudRate.toFixed(1)}% of recent transactions flagged`,
        riskScore: 80,
        severity: 'HIGH',
        isSuspicious: true,
        riskFactors: [
          { factor: 'Fraud rate', weight: 32, value: fraudRate }
        ]
      });
    }
 
    // ========== DETECTION RULE 6: Unusual Time Activity ==========
    const lateNightTransactions = recentTransactions.filter(tx => {
      const hour = new Date(tx.time).getHours();
      return hour < 6 || hour > 23;
    }).length;
 
    if (lateNightTransactions > recentTransactions.length * 0.5) {
      alerts.push({
        activityType: 'unusual_time',
        description: `${lateNightTransactions} transactions during unusual hours (late night/early morning)`,
        riskScore: 50,
        severity: 'LOW',
        isSuspicious: true,
        riskFactors: [
          { factor: 'Late night activity', weight: 18, value: lateNightTransactions }
        ]
      });
    }
 
  } catch (error) {
    console.error('❌ Insider detection error:', error);
  }
 
  return alerts;
};
 
// ==========================================
// POST /api/insider
// Create insider activity log (internal use)
// ==========================================
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { activityType, description, riskScore, severity, transactionId } = req.body;
 
    // Validation
    if (!activityType || !description || riskScore === undefined || !severity) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['activityType', 'description', 'riskScore', 'severity']
      });
    }
 
    // Create log
    const insiderLog = new InsiderLog({
      userId: req.user.userId,
      activityType,
      description,
      riskScore,
      severity,
      isSuspicious: severity === 'HIGH' || severity === 'CRITICAL',
      transactionId: transactionId || null,
      detectedAt: new Date(),
      detectionMethod: 'manual_report'
    });
 
    await insiderLog.save();

    // ── Socket.io: broadcast + Gemini analysis async ──
    if (global.io) {
      const { analyzeInsiderThreat } = require('../services/geminiService');
      analyzeInsiderThreat(insiderLog).then(analysis => {
        global.io.emit('alert:new', { alert: insiderLog.toJSON(), analysis, timestamp: new Date().toISOString() });
      }).catch(() => {
        global.io.emit('alert:new', { alert: insiderLog.toJSON(), timestamp: new Date().toISOString() });
      });
    }

    res.status(201).json({
      message: 'Insider activity logged',
      alert: insiderLog.toJSON()
    });

    console.log(`⚠️  Insider alert created: ${activityType} (${severity})`);

  } catch (error) {
    console.error('❌ Error creating insider log:', error);
    res.status(500).json({
      error: 'Failed to create insider log',
      message: error.message
    });
  }
});
 
// ==========================================
// GET /api/insider
// Get all insider alerts for current user
// ==========================================
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { severity, status, resolved, limit = 50, page = 1 } = req.query;
 
    // Build filter
    const filter = { userId: req.user.userId };
 
    if (severity) {
      filter.severity = severity;
    }
 
    if (status) {
      filter.status = status;
    }
 
    if (resolved === 'true') {
      filter.isResolved = true;
    } else if (resolved === 'false') {
      filter.isResolved = false;
    }
 
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
 
    // Get alerts
    const alerts = await InsiderLog.find(filter)
      .sort({ detectedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
 
    // Get total count
    const total = await InsiderLog.countDocuments(filter);
 
    res.status(200).json({
      message: 'Insider alerts retrieved',
      data: alerts.map(a => a.toJSON()),
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('❌ Error fetching insider alerts:', error);
    res.status(500).json({
      error: 'Failed to retrieve alerts',
      message: error.message
    });
  }
});
 
// ==========================================
// GET /api/insider/critical
// Get critical alerts only
// ==========================================
router.get('/critical', authMiddleware, async (req, res) => {
  try {
    const criticalAlerts = await InsiderLog.find({
      userId: req.user.userId,
      severity: 'CRITICAL',
      isResolved: false
    })
      .sort({ riskScore: -1, detectedAt: -1 })
      .limit(10);
 
    res.status(200).json({
      message: 'Critical alerts retrieved',
      count: criticalAlerts.length,
      alerts: criticalAlerts.map(a => a.toJSON())
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to retrieve critical alerts',
      message: error.message
    });
  }
});
 
// ==========================================
// GET /api/insider/:id
// Get specific insider alert
// ==========================================
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const alert = await InsiderLog.findOne({
      _id: req.params.id,
      userId: req.user.userId
    });
 
    if (!alert) {
      return res.status(404).json({
        error: 'Alert not found'
      });
    }
 
    res.status(200).json({
      message: 'Alert retrieved',
      alert: alert.toJSON()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to retrieve alert',
      message: error.message
    });
  }
});
 
// ==========================================
// GET /api/insider/stats/overview
// Get insider monitoring statistics
// ==========================================
router.get('/stats/overview', authMiddleware, async (req, res) => {
  try {
    const stats = await InsiderLog.getStats(req.user.userId);
 
    res.status(200).json({
      message: 'Insider statistics retrieved',
      stats
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to retrieve statistics',
      message: error.message
    });
  }
});
 
// ==========================================
// PUT /api/insider/:id/resolve
// Mark alert as resolved
// ==========================================
router.put('/:id/resolve', authMiddleware, async (req, res) => {
  try {
    const { status, notes, actionTaken } = req.body;
 
    const alert = await InsiderLog.findOneAndUpdate(
      {
        _id: req.params.id,
        userId: req.user.userId
      },
      {
        isResolved: true,
        status: status || 'resolved',
        investigatedBy: req.user.userId,
        investigatedAt: new Date(),
        investigationNotes: notes,
        actionTaken: actionTaken || 'none'
      },
      { new: true }
    );
 
    if (!alert) {
      return res.status(404).json({
        error: 'Alert not found'
      });
    }
 
    res.status(200).json({
      message: 'Alert resolved',
      alert: alert.toJSON()
    });
 
    console.log(`✅ Insider alert resolved: ${req.params.id}`);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to resolve alert',
      message: error.message
    });
  }
});
 
// ==========================================
// POST /api/insider/scan
// Scan for suspicious activities (internal)
// ==========================================
router.post('/scan', authMiddleware, async (req, res) => {
  try {
    const { transactionId } = req.body;
 
    let transaction = null;
    if (transactionId) {
      transaction = await Transaction.findOne({
        _id: transactionId,
        userId: req.user.userId
      });
    }
 
    // Run detection
    const detectedAlerts = await detectSuspiciousActivity(req.user.userId, transaction);
 
    // Save alerts
    const savedAlerts = [];
    for (const alert of detectedAlerts) {
      const insiderLog = new InsiderLog({
        userId: req.user.userId,
        ...alert,
        detectedAt: new Date(),
        detectionMethod: 'rule_based'
      });
 
      await insiderLog.save();
      savedAlerts.push(insiderLog.toJSON());
    }
 
    res.status(200).json({
      message: `${savedAlerts.length} suspicious activities detected`,
      alertsCreated: savedAlerts
    });
 
    if (savedAlerts.length > 0) {
      console.log(`⚠️  Detected ${savedAlerts.length} suspicious patterns for user ${req.user.userId}`);
    }
  } catch (error) {
    console.error('❌ Error scanning for suspicious activity:', error);
    res.status(500).json({
      error: 'Scan failed',
      message: error.message
    });
  }
});
 
module.exports = router;