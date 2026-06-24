// backend/src/routes/simulate.js
// Stripe Test API simulation endpoint
const express  = require('express');
const Transaction    = require('../models/Transaction');
const InsiderLog     = require('../models/InsiderLog');
const { authMiddleware } = require('../middleware/auth');
const { generateTestTransaction, createStripePaymentIntent } = require('../services/stripeSimulator');
const { analyzeThreat } = require('../services/geminiService');
const { lookupIP, assessGeoRisk } = require('../services/geoService');

const router = express.Router();

// ==========================================
// FRAUD DETECTION ENGINE (local rules)
// ==========================================
const detectFraud = (txData) => {
  let riskScore = 0;
  const factors = [];

  // High amount
  if (txData.amount > 50000) { riskScore += 35; factors.push('Extremely high amount'); }
  else if (txData.amount > 10000) { riskScore += 20; factors.push('High amount transaction'); }
  else if (txData.amount > 5000)  { riskScore += 10; factors.push('Above average amount'); }

  // Suspicious location
  const suspiciousLocations = ['Unknown, --', 'Tor Exit Node', 'VPN Detected'];
  const foreignLocations    = ['New York, US', 'London, UK', 'Dubai, AE', 'Singapore, SG'];
  if (suspiciousLocations.includes(txData.location)) { riskScore += 40; factors.push('Anonymous/masked location'); }
  else if (foreignLocations.includes(txData.location)) { riskScore += 20; factors.push('International transaction'); }

  // Suspicious category
  if (['Cryptocurrency', 'Wire Transfer'].includes(txData.merchantCategory)) {
    riskScore += 25; factors.push('High-risk merchant category');
  }

  // Unknown device
  if (txData.device === 'Unknown Device') { riskScore += 20; factors.push('Unidentified device'); }

  // Time-based (late night 0-5 AM)
  const hour = new Date().getHours();
  if (hour >= 0 && hour <= 5) { riskScore += 15; factors.push('Late-night activity'); }

  riskScore = Math.min(riskScore, 100);

  const riskLevel       = riskScore >= 70 ? 'HIGH' : riskScore >= 40 ? 'MEDIUM' : 'LOW';
  const isFraudulent    = riskScore >= 70;
  const fraudProbability = riskScore / 100;

  return {
    riskScore,
    riskLevel,
    isFraudulent,
    fraudProbability,
    fraudReason: factors.join('; ') || 'Normal transaction',
    riskFactors: factors   // already string array ✓

  };
};

// ==========================================
// POST /api/simulate/transaction
// Simulate a single Stripe test transaction
// ==========================================
router.post('/transaction', authMiddleware, async (req, res) => {
  try {
    const { forceSuspicious = false, amount, merchantName, location } = req.body;

    // Generate synthetic transaction data
    let txData = generateTestTransaction({
      amount:   amount ? Number(amount) : undefined,
      merchant: merchantName ? { name: merchantName, category: 'Retail', amountRange: [100, 99999] } : undefined,
      location: forceSuspicious
        ? ['Tor Exit Node', 'VPN Detected', 'Unknown, --'][Math.floor(Math.random() * 3)]
        : location || undefined
    });

    // Override amount for forced suspicious — ensure amount > 50000 so rule-based
    // scoring always reaches HIGH risk (35 pts for amount + 40 pts for suspicious
    // location = 75, guaranteed HIGH)
    if (forceSuspicious && !amount) {
      txData.amount = Math.floor(Math.random() * 49000) + 51000; // 51000–99999
    }

    // Run fraud detection
    const fraudResult = detectFraud(txData);

    // ── Real Stripe Payment Intent (if key configured) ──
    let stripeResult = null;
    if (process.env.STRIPE_SECRET_KEY) {
      stripeResult = await createStripePaymentIntent(txData.amount, {
        merchantName:     txData.merchantName,
        merchantCategory: txData.merchantCategory,
        userId:           req.user.userId,
        riskLevel:        fraudResult.riskLevel
      });
    }

    // ── IPInfo geo enrichment ──
    let geoData = null;
    let geoRisk = { score: 0, flags: [] };
    if (txData.ipAddress && process.env.IPINFO_TOKEN) {
      geoData = await lookupIP(txData.ipAddress);
      if (geoData) {
        geoRisk = assessGeoRisk(geoData);
        // Override location with real geo data
        if (geoData.location && geoData.location !== 'Unknown') {
          txData.location = geoData.location;
        }
        // Add geo risk to fraud score
        if (geoRisk.score > 0) {
          fraudResult.riskScore = Math.min(fraudResult.riskScore + geoRisk.score, 100);
          fraudResult.riskFactors = [...(fraudResult.riskFactors || []), ...geoRisk.flags];
          fraudResult.fraudReason = [fraudResult.fraudReason, ...geoRisk.flags].filter(Boolean).join('; ');
          fraudResult.riskLevel = fraudResult.riskScore >= 70 ? 'HIGH' : fraudResult.riskScore >= 40 ? 'MEDIUM' : 'LOW';
          fraudResult.isFraudulent = fraudResult.riskScore >= 70;
        }
      }
    }

    // Create transaction record
    const transaction = new Transaction({
      userId:           req.user.userId,
      amount:           txData.amount,
      currency:         'INR',
      time:             new Date(),
      location:         txData.location,
      device:           txData.device,
      deviceId:         txData.deviceId,
      ipAddress:        txData.ipAddress,
      merchantName:     txData.merchantName,
      merchantCategory: txData.merchantCategory,
      description:      txData.description,
      status:           'completed',
      ...fraudResult,
      aiProcessedAt:    new Date(),
      aiServiceVersion: process.env.STRIPE_SECRET_KEY ? '2.0.0-stripe-live' : '2.0.0-simulator'
    });

    await transaction.save();

    // ── Emit Socket.io event ──
    if (global.io) {
      global.io.emit('transaction:new', {
        transaction: transaction.toJSON(),
        riskLevel:   transaction.riskLevel,
        isSimulated: true,
        source:      process.env.STRIPE_SECRET_KEY ? 'stripe-live' : 'stripe-simulator',
        stripeData: {
          paymentIntentId: stripeResult?.id || txData.stripePaymentIntentId,
          chargeId:        txData.stripeChargeId,
          cardLast4:       txData.stripeCardLast4,
          cardBrand:       txData.stripeCardBrand,
          status:          stripeResult?.status || 'succeeded'
        },
        geoData: geoData ? { city: geoData.city, country: geoData.country, isVPN: geoData.isVPN, isTor: geoData.isTor } : null
      });
    }

    // ── Gemini AI analysis — only for HIGH risk simulated transactions ──
    if (transaction.riskLevel === 'HIGH') {
      // Run async — don't block response
      analyzeThreat(transaction).then(aiAnalysis => {
        if (global.io) {
          global.io.emit('threat:ai', {
            transactionId: transaction.id,
            analysis:      aiAnalysis,
            isSimulated:   true,
            timestamp:     new Date().toISOString()
          });
        }
      }).catch(err => console.error('Gemini error:', err.message));
    }

    console.log(`💳 Stripe sim: ₹${transaction.amount} @ ${transaction.merchantName} — ${transaction.riskLevel} risk`);

    res.status(201).json({
      message:     'Simulated Stripe transaction created',
      transaction: transaction.toJSON(),
      stripe: {
        paymentIntentId: txData.stripePaymentIntentId,
        chargeId:        txData.stripeChargeId,
        cardLast4:       txData.stripeCardLast4,
        cardBrand:       txData.stripeCardBrand,
        status:          'succeeded'
      }
    });
  } catch (err) {
    console.error('❌ Simulate error:', err.message);
    res.status(500).json({ error: 'Simulation failed', message: err.message });
  }
});

// ==========================================
// POST /api/simulate/batch
// Simulate multiple transactions at once
// ==========================================
router.post('/batch', authMiddleware, async (req, res) => {
  try {
    const { count = 5 } = req.body;
    const batchCount = Math.min(Number(count), 20);

    const created = [];
    for (let i = 0; i < batchCount; i++) {
      const txData      = generateTestTransaction();
      const fraudResult = detectFraud(txData);

      const tx = new Transaction({
        userId: req.user.userId,
        amount: txData.amount, currency: 'INR',
        time: new Date(Date.now() - i * 60000),
        location: txData.location, device: txData.device,
        deviceId: txData.deviceId, ipAddress: txData.ipAddress,
        merchantName: txData.merchantName,
        merchantCategory: txData.merchantCategory,
        description: txData.description, status: 'completed',
        ...fraudResult,
        aiProcessedAt: new Date(), aiServiceVersion: '2.0.0-batch'
      });

      await tx.save();
      created.push(tx.toJSON());

      if (global.io) {
        global.io.emit('transaction:new', {
          transaction: tx.toJSON(), riskLevel: tx.riskLevel, isSimulated: true
        });
      }

      // Small delay between emissions for live feel
      await new Promise(r => setTimeout(r, 150));
    }

    res.json({ message: `${created.length} transactions simulated`, count: created.length, transactions: created });
  } catch (err) {
    res.status(500).json({ error: 'Batch simulation failed', message: err.message });
  }
});

// ==========================================
// POST /api/simulate/insider
// Simulate an insider threat alert
// ==========================================
router.post('/insider', authMiddleware, async (req, res) => {
  try {
    const { analyzeInsiderThreat } = require('../services/geminiService');

    const types = [
      { type: 'multiple_failed_logins', sev: 'HIGH',     score: 72, desc: '7 failed login attempts from unknown IP' },
      { type: 'unusual_location',       sev: 'HIGH',     score: 68, desc: 'Login from VPN — location mismatch detected' },
      { type: 'rapid_transactions',     sev: 'CRITICAL', score: 88, desc: '12 transactions in 8 minutes — velocity attack' },
      { type: 'pattern_deviation',      sev: 'MEDIUM',   score: 55, desc: 'Transaction pattern deviates 3σ from baseline' },
      { type: 'unusual_time',           sev: 'LOW',      score: 40, desc: 'Activity at 03:47 AM — outside working hours' },
      { type: 'high_amount_transaction',sev: 'CRITICAL', score: 91, desc: '₹89,500 wire transfer to new beneficiary' }
    ];

    const pick  = types[Math.floor(Math.random() * types.length)];
    const alert = new InsiderLog({
      userId:          req.user.userId,
      activityType:    pick.type,
      description:     pick.desc,
      riskScore:       pick.score,
      severity:        pick.sev,
      isSuspicious:    true,
      detectedAt:      new Date(),
      detectionMethod: 'rule_based'
    });

    await alert.save();

    // Gemini analysis async
    analyzeInsiderThreat(alert).then(aiAnalysis => {
      if (global.io) {
        global.io.emit('alert:new', {
          alert:     alert.toJSON(),
          analysis:  aiAnalysis,
          timestamp: new Date().toISOString()
        });
      }
    }).catch(err => console.error('Gemini insider error:', err.message));

    res.json({ message: 'Insider threat simulated', alert: alert.toJSON() });
  } catch (err) {
    res.status(500).json({ error: 'Insider simulation failed', message: err.message });
  }
});

// ==========================================
// GET /api/simulate/stream-status
// Check simulation status
// ==========================================
router.get('/stream-status', authMiddleware, (req, res) => {
  res.json({
    socketConnections: global.io?.engine?.clientsCount || 0,
    stripeMode:        process.env.STRIPE_SECRET_KEY ? 'live-test' : 'simulator',
    geminiEnabled:     !!process.env.GEMINI_API_KEY,
    timestamp:         new Date().toISOString()
  });
});

module.exports = router;
