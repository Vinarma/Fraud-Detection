// backend/src/routes/transaction.js
const express    = require('express');
const axios      = require('axios');
const mongoose   = require('mongoose');
const Transaction = require('../models/Transaction');
const { authMiddleware } = require('../middleware/auth');
const { analyzeThreat }  = require('../services/geminiService');

const router = express.Router();

// ==========================================
// AI SERVICE INTEGRATION
// ==========================================
const callAIService = async (transactionData) => {
  try {
    const response = await axios.post(
      `${process.env.AI_SERVICE_URL}/predict`,
      {
        amount:            transactionData.amount,
        time:              transactionData.time.toISOString(),
        location:          transactionData.location,
        device:            transactionData.device,
        merchant_name:     transactionData.merchantName,
        merchant_category: transactionData.merchantCategory,
        user_history:      transactionData.userHistory || { known_devices: transactionData.knownDevices || [] }
      },
      { timeout: process.env.AI_SERVICE_TIMEOUT || 5000 }
    );
    return response.data;
  } catch (error) {
    // Fallback rule-based scoring
    let riskScore = 25;
    const reasons = [];

    if (transactionData.amount > 50000) { riskScore += 35; reasons.push('Very high amount'); }
    else if (transactionData.amount > 10000) { riskScore += 20; reasons.push('High amount'); }

    const suspLocs = ['Unknown, --', 'Tor Exit Node', 'VPN Detected'];
    if (suspLocs.includes(transactionData.location)) { riskScore += 35; reasons.push('Anonymous location'); }

    if (['Cryptocurrency', 'Wire Transfer'].includes(transactionData.merchantCategory)) {
      riskScore += 20; reasons.push('High-risk category');
    }

    riskScore = Math.min(riskScore, 100);

    return {
      risk_score:         riskScore,
      risk_level:         riskScore >= 70 ? 'HIGH' : riskScore >= 40 ? 'MEDIUM' : 'LOW',
      fraud_probability:  riskScore / 100,
      is_fraudulent:      riskScore >= 70,
      reason:             reasons.join('; ') || 'AI service unavailable — rule-based analysis',
      timestamp:          new Date().toISOString()
    };
  }
};

// ==========================================
// POST /api/transaction
// Create transaction with fraud detection + Socket.io emit
// ==========================================
router.post('/', authMiddleware, async (req, res) => {
  try {
    const {
      amount, currency, location, device, deviceId,
      ipAddress, merchantName, merchantCategory,
      latitude, longitude, description
    } = req.body;

    if (!amount || !location || !device || !merchantName || !merchantCategory) {
      return res.status(400).json({
        error:    'Missing required fields',
        required: ['amount', 'location', 'device', 'merchantName', 'merchantCategory']
      });
    }

    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }

    const transaction = new Transaction({
      userId: req.user.userId,
      amount, currency: currency || 'INR',
      time: new Date(), location, device, deviceId, ipAddress,
      merchantName, merchantCategory, latitude, longitude,
      description, status: 'completed'
    });

    // ── Behavior Tracking ──────────────────────────────────────────────────
    let userHistory = {};
    const user = await require('../models/User').findById(req.user.userId);
    if (user) {
      userHistory = {
        known_devices: user.knownDevices?.map(d => d.deviceName) || [],
        spend_velocity: 1.0,
        ip_switches: 0
      };
      
      if (ipAddress) {
        if (!user.knownIps?.find(ip => ip.ipAddress === ipAddress)) {
          userHistory.ip_switches = 1;
          await user.addKnownIp(ipAddress);
        }
      }
      
      await user.updateSpending(amount);
      if (user.spendingMetrics?.averageDailySpend > 0) {
        userHistory.spend_velocity = amount / user.spendingMetrics.averageDailySpend;
      }
      
      await user.recordLogin(ipAddress, device, location);
    }

    // AI fraud detection
    const aiPrediction = await callAIService({
      amount: transaction.amount, time: transaction.time,
      location: transaction.location, device: transaction.device,
      merchantName: transaction.merchantName, merchantCategory: transaction.merchantCategory,
      knownDevices: userHistory.known_devices,
      userHistory
    });

    transaction.riskScore        = aiPrediction.risk_score;
    transaction.riskLevel        = aiPrediction.risk_level;
    transaction.isFraudulent     = aiPrediction.is_fraudulent;
    transaction.fraudProbability = aiPrediction.fraud_probability;
    transaction.fraudReason      = aiPrediction.reason;
    transaction.riskFactors      = aiPrediction.risk_factors || [];
    transaction.aiProcessedAt    = new Date();
    transaction.aiServiceVersion = '2.0.0';

    await transaction.save();

    // ── Socket.io: broadcast new transaction ──
    if (global.io) {
      global.io.emit('transaction:new', {
        transaction: transaction.toJSON(),
        riskLevel:   transaction.riskLevel,
        isSimulated: false,
        source:      'manual'
      });
    }

    // ── Gemini AI threat analysis for high-risk (async, non-blocking) ──
    if (transaction.isFraudulent) {
      analyzeThreat(transaction).then(aiAnalysis => {
        if (global.io) {
          global.io.emit('threat:ai', {
            transactionId: transaction.id,
            analysis:      aiAnalysis,
            timestamp:     new Date().toISOString()
          });
        }
      }).catch(err => console.error('Gemini async error:', err.message));
    }

    const riskColor = transaction.riskLevel === 'HIGH' ? '🔴' : transaction.riskLevel === 'MEDIUM' ? '🟡' : '🟢';

    res.status(201).json({
      message:     'Transaction created and analyzed',
      riskDetected: transaction.isFraudulent,
      riskColor,
      transaction: transaction.toJSON()
    });

    console.log(`✅ Transaction: ₹${transaction.amount} @ ${transaction.merchantName} — ${transaction.riskLevel} (${transaction.riskScore}/100)`);

    if (transaction.isFraudulent) {
      console.log(`⚠️  FRAUD ALERT: ${riskColor} Reason: ${transaction.fraudReason}`);
    }
  } catch (error) {
    console.error('❌ Transaction error:', error.message);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: 'Validation failed', details: Object.values(error.errors).map(e => e.message) });
    }
    res.status(500).json({ error: 'Failed to create transaction', message: error.message });
  }
});

// ==========================================
// GET /api/transaction
// SOC platform: own transactions + webhook/system-sourced transactions
// ==========================================
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { riskLevel, status, sortBy = '-createdAt', limit = 50, page = 1 } = req.query;

    // Show user's own transactions + webhook-sourced (null userId or metadata.source=stripe-webhook)
    const userFilter = { userId: new mongoose.Types.ObjectId(req.user.userId) };
    const filter = {
      $or: [
        userFilter,
        { userId: null },
        { 'metadata.source': 'stripe-webhook' }
      ]
    };
    if (riskLevel) filter.riskLevel = riskLevel;
    if (status)    filter.status    = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const transactions = await Transaction.find(filter).sort(sortBy).skip(skip).limit(parseInt(limit));
    const total = await Transaction.countDocuments(filter);

    res.json({
      message: 'Transactions retrieved successfully',
      data: transactions.map(t => t.toJSON()),
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve transactions', message: error.message });
  }
});


// ==========================================
// GET /api/transaction/stats/overview
// ==========================================
router.get('/stats/overview', authMiddleware, async (req, res) => {
  try {
    const stats = await Transaction.getStats(req.user.userId);
    res.json({ message: 'Statistics retrieved', stats });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve statistics', message: error.message });
  }
});

// ==========================================
// GET /api/transaction/risk/high
// ==========================================
router.get('/risk/high', authMiddleware, async (req, res) => {
  try {
    const txs = await Transaction.getHighRisk(req.user.userId);
    res.json({ message: 'High-risk transactions retrieved', count: txs.length, transactions: txs.map(t => t.toJSON()) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve high-risk', message: error.message });
  }
});

// ==========================================
// GET /api/transaction/:id
// ==========================================
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const tx = await Transaction.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    res.json({ message: 'Transaction retrieved', transaction: tx.toJSON() });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve transaction', message: error.message });
  }
});

// ==========================================
// PUT /api/transaction/:id/review
// ==========================================
router.put('/:id/review', authMiddleware, async (req, res) => {
  try {
    const { resolution, notes } = req.body;
    if (!['legitimate', 'fraud_confirmed', 'pending'].includes(resolution)) {
      return res.status(400).json({ error: 'Invalid resolution' });
    }

    const tx = await Transaction.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId },
      { isResolved: true, resolution, reviewedBy: req.user.userId, reviewedAt: new Date(), reviewNotes: notes },
      { new: true, runValidators: true }
    );

    if (!tx) return res.status(404).json({ error: 'Transaction not found' });

    // Emit review event
    if (global.io) {
      global.io.emit('transaction:reviewed', { transactionId: tx.id, resolution, timestamp: new Date().toISOString() });
    }

    res.json({ message: 'Transaction reviewed', transaction: tx.toJSON() });
  } catch (error) {
    res.status(500).json({ error: 'Failed to review transaction', message: error.message });
  }
});

// ==========================================
// DELETE /api/transaction/:id
// ==========================================
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const tx = await Transaction.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    res.json({ message: 'Transaction deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete transaction', message: error.message });
  }
});

module.exports = router;