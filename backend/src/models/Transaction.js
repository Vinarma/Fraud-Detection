// backend/src/models/Transaction.js
const mongoose = require('mongoose');
 
const transactionSchema = new mongoose.Schema(
  {
    // User Reference — optional for system-level webhook transactions
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },

 
    // Transaction Details
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0, 'Amount cannot be negative']
    },
 
    currency: {
      type: String,
      default: 'INR',
      enum: ['INR', 'USD', 'EUR', 'GBP']
    },
 
    time: {
      type: Date,
      required: [true, 'Transaction time is required'],
      default: Date.now
    },
 
    // Location & Device
    location: {
      type: String,
      default: 'Unknown'
    },
 
    latitude: Number,
    longitude: Number,
 
    device: {
      type: String,
      required: [true, 'Device is required']
    },
 
    deviceId: String,
    ipAddress: String,
 
    // Merchant Information
    merchantName: {
      type: String,
      required: [true, 'Merchant name is required']
    },
 
    merchantCategory: {
      type: String,
      required: [true, 'Merchant category is required']
    },
 
    merchantId: String,
 
    // Transaction Status
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'reversed'],
      default: 'completed'
    },
 
    // Fraud Detection (AI Results)
    riskScore: {
      type: Number,
      min: 0,
      max: 100,
      default: null
    },
 
    riskLevel: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH'],
      default: null
    },
 
    isFraudulent: {
      type: Boolean,
      default: false
    },
 
    fraudProbability: {
      type: Number,
      min: 0,
      max: 1,
      default: null
    },
 
    fraudReason: {
      type: String,
      default: null
    },
 
    riskFactors: [String],
 
    // AI Prediction Metadata
    aiProcessedAt: Date,
    aiServiceVersion: String,
    aiExplanation: String,
    confidenceScore: Number,
    recommendedAction: String,
    mlModelUsed: String,
 
    // Manual Review
    flaggedByUser: {
      type: Boolean,
      default: false
    },
 
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
 
    reviewedAt: Date,
    reviewNotes: String,
 
    // Resolution
    isResolved: {
      type: Boolean,
      default: false
    },
 
    resolution: {
      type: String,
      enum: ['legitimate', 'fraud_confirmed', 'pending'],
      default: 'pending'
    },
 
    resolutionAt: Date,
 
    // Additional Fields
    description: String,
    metadata: {
      type: Map,
      of: String
    }
  },
  { timestamps: true }
);
 
// ==========================================
// INDEXES FOR PERFORMANCE
// ==========================================
transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ riskScore: -1 });
transactionSchema.index({ isFraudulent: 1 });
transactionSchema.index({ time: -1 });
transactionSchema.index({ location: 1 });
transactionSchema.index({ merchantName: 1 });
 
// ==========================================
// VIRTUAL: Days since transaction
// ==========================================
transactionSchema.virtual('daysSinceTransaction').get(function () {
  const now = new Date();
  const diff = now - this.time;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
});
 
// ==========================================
// METHOD: Get risk badge color
// ==========================================
transactionSchema.methods.getRiskColor = function () {
  switch (this.riskLevel) {
    case 'HIGH':
      return 'red';
    case 'MEDIUM':
      return 'yellow';
    case 'LOW':
      return 'green';
    default:
      return 'gray';
  }
};
 
// ==========================================
// METHOD: Format for API response
// ==========================================
transactionSchema.methods.toJSON = function () {
  const obj = this.toObject({ virtuals: true });
  // Convert metadata Map → plain object for JSON serialisation
  let metaObj = {};
  if (obj.metadata instanceof Map) {
    obj.metadata.forEach((v, k) => { metaObj[k] = v; });
  } else if (obj.metadata && typeof obj.metadata === 'object') {
    metaObj = Object.fromEntries(Object.entries(obj.metadata));
  }
  return {
    id:               obj._id,
    userId:           obj.userId,
    amount:           obj.amount,
    currency:         obj.currency,
    time:             obj.time,
    location:         obj.location,
    device:           obj.device,
    deviceId:         obj.deviceId,
    ipAddress:        obj.ipAddress,
    merchantName:     obj.merchantName,
    merchantId:       obj.merchantId,
    merchantCategory: obj.merchantCategory,
    description:      obj.description,
    status:           obj.status,
    riskScore:        obj.riskScore,
    riskLevel:        obj.riskLevel,
    isFraudulent:     obj.isFraudulent,
    fraudProbability: obj.fraudProbability,
    fraudReason:      obj.fraudReason,
    riskFactors:      obj.riskFactors,
    flaggedByUser:    obj.flaggedByUser,
    isResolved:       obj.isResolved,
    resolution:       obj.resolution,
    reviewedAt:       obj.reviewedAt,
    reviewNotes:      obj.reviewNotes,
    aiProcessedAt:    obj.aiProcessedAt,
    aiServiceVersion: obj.aiServiceVersion,
    aiExplanation:    obj.aiExplanation,
    confidenceScore:  obj.confidenceScore,
    recommendedAction:obj.recommendedAction,
    mlModelUsed:      obj.mlModelUsed,
    metadata:         metaObj,
    source:           metaObj.source || 'manual',
    isWebhook:        metaObj.source === 'stripe-webhook',
    stripeCardBrand:  metaObj.stripeCardBrand,
    stripeCardLast4:  metaObj.stripeCardLast4,
    daysSinceTransaction: obj.daysSinceTransaction,
    createdAt:        obj.createdAt,
    updatedAt:        obj.updatedAt
  };
};
 
// ==========================================
// STATIC METHOD: Get statistics
// ==========================================
transactionSchema.statics.getStats = async function (userId) {
  const stats = await this.aggregate([
    { $match: { userId:new mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: null,
        totalTransactions: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
        fraudCount: {
          $sum: { $cond: [{ $eq: ['$isFraudulent', true] }, 1, 0] }
        },
        averageRiskScore: { $avg: '$riskScore' },
        highRiskCount: {
          $sum: { $cond: [{ $eq: ['$riskLevel', 'HIGH'] }, 1, 0] }
        },
        mediumRiskCount: {
          $sum: { $cond: [{ $eq: ['$riskLevel', 'MEDIUM'] }, 1, 0] }
        },
        lowRiskCount: {
          $sum: { $cond: [{ $eq: ['$riskLevel', 'LOW'] }, 1, 0] }
        }
      }
    }
  ]);
 
  return stats[0] || {
    totalTransactions: 0,
    totalAmount: 0,
    fraudCount: 0,
    averageRiskScore: 0,
    highRiskCount: 0,
    mediumRiskCount: 0,
    lowRiskCount: 0
  };
};
 
// ==========================================
// STATIC METHOD: Get high-risk transactions
// ==========================================
transactionSchema.statics.getHighRisk = async function (userId) {
  return await this.find({
    userId,
    riskLevel: 'HIGH',
    isResolved: false
  })
    .sort({ createdAt: -1 })
    .limit(10);
};
 
module.exports = mongoose.model('Transaction', transactionSchema);