// backend/src/routes/webhook.js
// Stripe webhook handler — receives real payment events from Stripe Test Mode
// IMPORTANT: Registered BEFORE express.json() so raw body is available for sig verification

const express = require('express');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { analyzeThreat } = require('../services/geminiService');
const { lookupIP, assessGeoRisk } = require('../services/geoService');

const router = express.Router();

// ── Stripe webhook secret ─────────────────────────────────────────────────────
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// ── Lazy Stripe init ──────────────────────────────────────────────────────────
let stripe = null;
const getStripe = () => {
  if (!stripe && process.env.STRIPE_SECRET_KEY) {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  }
  return stripe;
};

// ── System user cache (resolved once, reused) ─────────────────────────────────
let _systemUserId = null;
const getSystemUserId = async () => {
  if (_systemUserId) return _systemUserId;
  // Try to find by metadata in payment intent first, else use first admin/analyst
  const user = await User.findOne({ role: { $in: ['admin', 'analyst'] } })
    .sort({ createdAt: 1 })
    .select('_id')
    .lean();
  if (user) { _systemUserId = user._id; return _systemUserId; }
  // Absolute fallback: first user in DB
  const any = await User.findOne({}).sort({ createdAt: 1 }).select('_id').lean();
  if (any) { _systemUserId = any._id; return _systemUserId; }
  return null;
};

// ── Metadata extractors ───────────────────────────────────────────────────────
const categoryFromMetadata = (pi) =>
  pi.metadata?.merchantCategory ||
  pi.metadata?.merchant_category ||
  pi.charges?.data?.[0]?.merchant_data?.category ||
  'Online Retail';

const merchantFromMetadata = (pi) =>
  pi.metadata?.merchantName ||
  pi.metadata?.merchant_name ||
  pi.charges?.data?.[0]?.merchant_data?.name ||
  'Stripe Merchant';

// ── Validate / normalise currency against schema enum ────────────────────────
const ALLOWED_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'];
const normaliseCurrency = (c) => {
  const upper = (c || 'INR').toUpperCase();
  return ALLOWED_CURRENCIES.includes(upper) ? upper : 'USD';
};

// ── Fraud scoring ─────────────────────────────────────────────────────────────
// ── AI Service call ─────────────────────────────────────────────────────────────
const callAIService = async (data) => {
  try {
    const axios = require('axios');
    const res = await axios.post(
      `${process.env.AI_SERVICE_URL || 'http://127.0.0.1:8001'}/predict`,
      data,
      { timeout: 5000 }
    );
    return res.data;
  } catch (err) {
    console.error('AI Service call failed:', err.message);
    let riskScore = 25;
    if (data.amount > 50000) riskScore += 35;
    return {
      risk_score: riskScore,
      risk_level: riskScore >= 70 ? 'HIGH' : riskScore >= 40 ? 'MEDIUM' : 'LOW',
      is_fraudulent: riskScore >= 70,
      fraud_probability: riskScore / 100,
      reason: 'Fallback rule-based analysis',
      risk_factors: []
    };
  }
};

// ============================================================================
// POST /api/webhooks/stripe
// ============================================================================
router.post(
  '/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const s = getStripe();

    // ── Signature verification ────────────────────────────────────────────
    let event;
    if (s && WEBHOOK_SECRET && sig) {
      try {
        event = s.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
      } catch (err) {
        console.error(`❌ Stripe webhook sig failed: ${err.message}`);
        return res.status(400).json({ error: `Webhook signature error: ${err.message}` });
      }
    } else {
      try {
        event = JSON.parse(req.body.toString());
        console.warn('⚠️  Stripe webhook: no signature verification (dev mode)');
      } catch {
        return res.status(400).json({ error: 'Invalid JSON payload' });
      }
    }

    console.log(`📡 Stripe webhook: ${event.type} [${event.id}]`);

    try {
      await processWebhookEvent(event);

      res.json({
        received: true,
        eventId: event.id,
        type: event.type
      });

    } catch (err) {
      console.error(`❌ Webhook processing error [${event.id}]:`, err);

      return res.status(500).json({
        error: 'Webhook processing failed'
      });
    }
  }
);

// ============================================================================
// EVENT DISPATCHER
// ============================================================================
async function processWebhookEvent(event) {
  switch (event.type) {
    case 'payment_intent.succeeded':
      await handlePaymentIntentSucceeded(event.data.object);
      break;

    case 'payment_intent.payment_failed': {
  const pi = event.data.object;

  console.log(`⚠️ Payment failed: ${pi.id}`);

  const tx = new Transaction({
    userId: await getSystemUserId(),

    amount: pi.amount / 100,
    currency: normaliseCurrency(pi.currency),

    time: new Date(),

    location: pi.metadata?.location || 'Unknown',
    device: pi.metadata?.device || 'Stripe Web',

    merchantName: merchantFromMetadata(pi),
    merchantCategory: categoryFromMetadata(pi),

    status: 'failed',

    riskScore: 95,
    riskLevel: 'HIGH',

    isFraudulent: true,

    fraudProbability: 0.95,

    fraudReason:
      pi.last_payment_error?.message || 'Card declined',

    description: 'Stripe Failed Payment',

    metadata: new Map([
      ['stripePaymentIntentId', pi.id],
      ['source', 'stripe-webhook'],
      ['failureCode', pi.last_payment_error?.code || 'declined']
    ])
  });

  await tx.save();

  // SOCKET EVENT
  if (global.io) {
    global.io.emit('transaction:new', {
      transaction: tx.toJSON(),
      riskLevel: tx.riskLevel,
      source: 'stripe-webhook',
      isWebhook: true
    });
  }

  break;
}

    case 'charge.dispute.created': {
      const dispute = event.data.object;
      console.log(`🚨 Chargeback dispute: ${dispute.id}`);
      if (global.io) {
        global.io.emit('stripe:dispute', {
          disputeId: dispute.id,
          chargeId: dispute.charge,
          amount: dispute.amount / 100,
          reason: dispute.reason,
          status: dispute.status,
          timestamp: new Date().toISOString()
        });
      }
      break;
    }

    default:
      console.log(`ℹ️  Unhandled webhook event: ${event.type}`);
  }
}

// ============================================================================
// payment_intent.succeeded HANDLER
// ============================================================================
async function handlePaymentIntentSucceeded(pi) {
  console.log(`💳 payment_intent.succeeded: ${pi.id} | ${pi.currency.toUpperCase()} ${pi.amount / 100}`);

  // ── Idempotency guard ──────────────────────────────────────────────────
  const existing = await Transaction.findOne({ 'metadata.stripePaymentIntentId': pi.id });
  if (existing) {
    console.log(`⏭️  Already processed: ${pi.id}`);
    return;
  }
  // ── Resolve userId ─────────────────────────────────────────────────────
  // Priority: metadata.userId → system/admin user → demo fallback

  let resolvedUserId = null;

  if (pi.metadata?.userId) {
    try {
      resolvedUserId = new (require('mongoose').Types.ObjectId)(pi.metadata.userId);
    } catch { }
  }

  if (!resolvedUserId) {
    resolvedUserId = await getSystemUserId();
  }

  // Fallback demo user
  if (!resolvedUserId) {
    resolvedUserId = new (require('mongoose').Types.ObjectId)(
      "6821f9f0a12bc123456789ab"
    );
  }

  // ── Extract fields from PaymentIntent ─────────────────────────────────
  const charge = pi.latest_charge || pi.charges?.data?.[0] || {};
  const billing = (typeof charge === 'object' ? charge.billing_details : null) || {};
  const amountINR = pi.amount / 100;

  const merchantName = merchantFromMetadata(pi);
  const merchantCategory = categoryFromMetadata(pi);
  const currency = normaliseCurrency(pi.currency);
  const ipAddress = charge?.ip_address || pi.metadata?.ip_address || undefined;
  const device = pi.metadata?.device || billing.name || 'Stripe Web';

  // Build location string
  let location = 'Unknown';
  if (billing.address?.city && billing.address?.country) {
    location = `${billing.address.city}, ${billing.address.country}`;
  } else if (pi.metadata?.location) {
    location = pi.metadata.location;
  }

  // ── Behavior Tracking ──────────────────────────────────────────────────
  let userHistory = {};
  if (resolvedUserId) {
    const user = await User.findById(resolvedUserId);
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
      
      await user.updateSpending(amountINR);
      
      if (user.spendingMetrics?.averageDailySpend > 0) {
        userHistory.spend_velocity = amountINR / user.spendingMetrics.averageDailySpend;
      }
      
      // Calculate impossible travel
      const lastLogin = user.loginHistory?.[user.loginHistory.length - 1];
      if (lastLogin && lastLogin.location && location !== 'Unknown') {
        const { impossibleTravelCheck } = require('../services/geoService');
        const hoursDiff = (new Date() - lastLogin.timestamp) / (1000 * 60 * 60);
        if (impossibleTravelCheck(lastLogin.location, location, hoursDiff)) {
          console.warn(`🚨 Impossible travel detected for user ${resolvedUserId}`);
        }
      }
      
      await user.recordLogin(ipAddress, device, location);
    }
  }

  // ── Fraud detection ────────────────────────────────────────────────────
  const aiPrediction = await callAIService({
    amount: amountINR,
    time: new Date(pi.created * 1000).toISOString(),
    location,
    device,
    merchant_name: merchantName,
    merchant_category: merchantCategory,
    user_history: userHistory
  });
  
  const fraudResult = {
    riskScore: aiPrediction.risk_score,
    riskLevel: aiPrediction.risk_level,
    isFraudulent: aiPrediction.is_fraudulent,
    fraudProbability: aiPrediction.fraud_probability,
    fraudReason: aiPrediction.reason,
    riskFactors: aiPrediction.risk_factors || []
  };
  if (
  pi.charges?.data?.[0]?.outcome?.risk_level === 'highest'
) {
  fraudResult.riskScore = 99;
  fraudResult.riskLevel = 'HIGH';
  fraudResult.isFraudulent = true;

  fraudResult.fraudReason =
    'Stripe Radar marked transaction as fraudulent';
}
  // ── IPInfo geo enrichment ──────────────────────────────────────────────
  let geoData = null;
  if (ipAddress && process.env.IPINFO_TOKEN) {
    geoData = await lookupIP(ipAddress);
    if (geoData) {
      const geoRisk = assessGeoRisk(geoData);
      if (geoData.location && geoData.location !== 'Unknown') location = geoData.location;
      if (geoRisk.score > 0) {
        fraudResult.riskScore = Math.min(fraudResult.riskScore + geoRisk.score, 100);
        fraudResult.riskFactors = [...fraudResult.riskFactors, ...geoRisk.flags];
        fraudResult.fraudReason = [fraudResult.fraudReason, ...geoRisk.flags].filter(Boolean).join('; ');
        fraudResult.riskLevel = fraudResult.riskScore >= 70 ? 'HIGH' : fraudResult.riskScore >= 40 ? 'MEDIUM' : 'LOW';
        fraudResult.isFraudulent = fraudResult.riskScore >= 70;
      }
    }
  }

  // ── Build metadata map ─────────────────────────────────────────────────
  const metaEntries = [
    ['stripePaymentIntentId', pi.id],
    ['stripeEventId', typeof charge === 'object' ? (charge.id || '') : ''],
    ['stripeCardBrand', typeof charge === 'object' ? (charge.payment_method_details?.card?.brand || '') : ''],
    ['stripeCardLast4', typeof charge === 'object' ? (charge.payment_method_details?.card?.last4 || '') : ''],
    ['source', 'stripe-webhook']
  ];
  if (geoData) {
    metaEntries.push(
      ['geoCity', geoData.city || ''],
      ['geoCountry', geoData.country || ''],
      ['geoOrg', geoData.org || ''],
      ['isVPN', String(geoData.isVPN)],
      ['isTor', String(geoData.isTor)]
    );
  }

  // ── Save to DB ─────────────────────────────────────────────────────────
  const tx = new Transaction({
    userId: resolvedUserId,
    amount: amountINR,
    currency,
    time: new Date(pi.created * 1000),
    location,
    device,
    ipAddress,
    merchantName,
    merchantCategory,
    description: pi.description || `${merchantName} via Stripe`,
    status: 'completed',
    ...fraudResult,
    aiProcessedAt: new Date(),
    aiServiceVersion: '2.0.0-stripe-webhook',
    metadata: new Map(metaEntries)
  });

  try {
    await tx.save();
    console.log(`✅ Transaction saved: ${tx._id}`);
  } catch (err) {
    console.error('❌ Mongo save failed:', err);
    throw err;
  }
  console.log(`✅ Webhook tx saved: ${tx._id} | userId=${resolvedUserId} | Risk=${tx.riskLevel}(${tx.riskScore})`);

  // ── Broadcast via Socket.io ────────────────────────────────────────────
  if (global.io) {
    global.io.emit('transaction:new', {
      transaction: tx.toJSON(),
      riskLevel: tx.riskLevel,
      source: 'stripe-webhook',
      isWebhook: true,
      stripeData: {
        paymentIntentId: pi.id,
        cardBrand: typeof charge === 'object' ? charge.payment_method_details?.card?.brand : null,
        cardLast4: typeof charge === 'object' ? charge.payment_method_details?.card?.last4 : null,
        status: 'succeeded'
      },
      geoData: geoData ? {
        city: geoData.city, country: geoData.country,
        org: geoData.org, isVPN: geoData.isVPN,
        isTor: geoData.isTor, isProxy: geoData.isProxy,
        timezone: geoData.timezone
      } : null
    });

    // Async Gemini analysis for elevated risk
    if (fraudResult.riskScore >= 50) {
      analyzeThreat(tx)
        .then(analysis => global.io.emit('threat:ai', {
          transactionId: tx._id, analysis, timestamp: new Date().toISOString()
        }))
        .catch(() => { });
    }
  }
}

// ============================================================================
// GET /api/webhooks/test
// ============================================================================
router.get('/test', (req, res) => {
  res.json({
    status: '✅ Stripe webhook endpoint ready',
    secret: WEBHOOK_SECRET ? '✅ Configured' : '⚠️ Not configured',
    events: ['payment_intent.succeeded', 'payment_intent.payment_failed', 'charge.dispute.created'],
    endpoint: 'POST /api/webhooks/stripe',
    testMode: true
  });
});

module.exports = router;
