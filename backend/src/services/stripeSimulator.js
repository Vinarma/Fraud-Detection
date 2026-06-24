// backend/src/services/stripeSimulator.js
// Simulates Stripe Test API transactions — uses real Stripe SDK if key is present,
// otherwise generates realistic synthetic Stripe-format test data.

let stripe = null;
const initStripe = () => {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  if (!stripe) stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  return stripe;
};

// ==========================================
// MERCHANT DATA POOL
// ==========================================
const MERCHANTS = [
  { name: 'Amazon India',      category: 'Online Retail',   amountRange: [199, 15000] },
  { name: 'Swiggy',            category: 'Food & Dining',   amountRange: [150, 800]   },
  { name: 'Zomato',            category: 'Food & Dining',   amountRange: [200, 1200]  },
  { name: 'Flipkart',          category: 'Online Retail',   amountRange: [299, 25000] },
  { name: 'BookMyShow',        category: 'Entertainment',   amountRange: [199, 1500]  },
  { name: 'MakeMyTrip',        category: 'Travel',          amountRange: [2000, 50000]},
  { name: 'BigBasket',         category: 'Grocery',         amountRange: [400, 3000]  },
  { name: 'Uber',              category: 'Transportation',  amountRange: [50, 800]    },
  { name: 'Airtel Payments',   category: 'Utilities',       amountRange: [199, 999]   },
  { name: 'WazirX',            category: 'Cryptocurrency',  amountRange: [500, 100000]},
  { name: 'PhonePe',           category: 'Money Transfer',  amountRange: [100, 50000] },
  { name: 'Paytm Mall',        category: 'Online Retail',   amountRange: [100, 8000]  },
  { name: 'Nykaa',             category: 'Retail',          amountRange: [299, 5000]  },
  { name: 'HDFC NetBanking',   category: 'Wire Transfer',   amountRange: [10000, 200000]},
  { name: 'Steam Games',       category: 'Entertainment',   amountRange: [249, 4999]  }
];

const LOCATIONS = [
  'Mumbai, IN', 'Delhi, IN', 'Bengaluru, IN', 'Chennai, IN',
  'Hyderabad, IN', 'Kolkata, IN', 'Pune, IN', 'Ahmedabad, IN',
  'New York, US', 'London, UK', 'Dubai, AE', 'Singapore, SG',
  'Unknown, --', 'Tor Exit Node', 'VPN Detected'
];

const DEVICES = [
  'iPhone 15 Pro', 'Samsung Galaxy S24', 'Chrome/Windows',
  'Firefox/Linux', 'Safari/macOS', 'Unknown Device',
  'Android 14', 'iPad Pro', 'Edge/Windows'
];

const IP_POOL = [
  '103.21.244.1', '49.36.92.115', '157.240.22.35',
  '104.16.249.249', '185.220.101.47', '10.0.0.1',
  '192.168.1.1', '172.217.16.142', '151.101.193.67'
];

// ==========================================
// GENERATE SYNTHETIC STRIPE-FORMAT TRANSACTION
// ==========================================
const generateTestTransaction = (opts = {}) => {
  const merchant = opts.merchant || MERCHANTS[Math.floor(Math.random() * MERCHANTS.length)];
  const location = opts.location || LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
  const device   = opts.device   || DEVICES[Math.floor(Math.random() * DEVICES.length)];

  // Determine amount
  const [min, max] = merchant.amountRange;
  const amount = opts.amount || Math.floor(Math.random() * (max - min) + min);

  // Suspicious flag: high amount + unusual location
  const isSuspiciousLocation = ['Unknown, --', 'Tor Exit Node', 'VPN Detected', 'New York, US', 'London, UK', 'Dubai, AE', 'Singapore, SG'].includes(location);
  const isHighAmount = amount > 10000;

  // Stripe-format payment intent simulation
  const stripePaymentIntentId = `pi_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const stripeChargeId        = `ch_${Math.random().toString(36).slice(2, 16)}`;

  return {
    // Stripe fields
    stripePaymentIntentId,
    stripeChargeId,
    stripeStatus: 'succeeded',
    stripeCardLast4: String(Math.floor(Math.random() * 9000) + 1000),
    stripeCardBrand: ['visa', 'mastercard', 'amex', 'rupay'][Math.floor(Math.random() * 4)],

    // Transaction fields
    amount,
    currency:         'INR',
    merchantName:     merchant.name,
    merchantCategory: merchant.category,
    location,
    device,
    deviceId:         `device-${Math.random().toString(36).slice(2, 10)}`,
    ipAddress:        IP_POOL[Math.floor(Math.random() * IP_POOL.length)],
    description:      `${merchant.name} purchase`,

    // Metadata
    isSuspiciousSimulated: isSuspiciousLocation || isHighAmount,
    simulatedAt: new Date().toISOString(),
    source: 'stripe-simulator'
  };
};

// ==========================================
// CREATE REAL STRIPE PAYMENT INTENT (if key exists)
// ==========================================
const createStripePaymentIntent = async (amount, metadata = {}) => {
  const s = initStripe();
  if (!s) {
    return { id: `pi_simulated_${Date.now()}`, status: 'succeeded', amount, simulated: true };
  }

  try {
    const paymentIntent = await s.paymentIntents.create({
      amount:   amount * 100, // Stripe uses paisa
      currency: 'inr',
      metadata,
      confirm:  false
    });
    return paymentIntent;
  } catch (err) {
    console.error('❌ Stripe error:', err.message);
    return { id: `pi_error_${Date.now()}`, status: 'failed', error: err.message };
  }
};

// ==========================================
// GENERATE BATCH OF TEST TRANSACTIONS
// ==========================================
const generateBatch = (count = 5, userId = null) => {
  return Array.from({ length: count }, () => ({
    ...generateTestTransaction(),
    userId,
    time: new Date(Date.now() - Math.random() * 3600000) // Random within last hour
  }));
};

module.exports = { generateTestTransaction, createStripePaymentIntent, generateBatch };
