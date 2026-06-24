// backend/src/models/InsiderLog.js
const mongoose = require('mongoose');
 
const insiderLogSchema = new mongoose.Schema(
  {
    // User Reference
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required']
    },
 
    // Activity Type
    activityType: {
      type: String,
      enum: [
        'multiple_failed_logins',
        'unusual_location',
        'unusual_time',
        'rapid_transactions',
        'high_amount_transaction',
        'new_device',
        'device_mismatch',
        'pattern_deviation',
        'suspicious_merchant',
        'account_takeover_risk'
      ],
      required: true
    },
 
    // Activity Details
    description: {
      type: String,
      required: true
    },
 
    details: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    },
 
    // Risk Assessment
    riskScore: {
      type: Number,
      min: 0,
      max: 100,
      required: true
    },
 
    severity: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      required: true
    },
 
    isSuspicious: {
      type: Boolean,
      default: false
    },
 
    // Related Transaction (if applicable)
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      default: null
    },
 
    // Detection Metadata
    detectedAt: {
      type: Date,
      default: Date.now
    },
 
    detectionMethod: {
      type: String,
      enum: ['rule_based', 'ml_model', 'anomaly_detection', 'manual_report'],
      default: 'rule_based'
    },
 
    // Status & Resolution
    status: {
      type: String,
      enum: ['new', 'investigating', 'confirmed', 'false_positive', 'resolved'],
      default: 'new'
    },
 
    isResolved: {
      type: Boolean,
      default: false
    },
 
    // Investigation Details
    investigatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
 
    investigatedAt: Date,
 
    investigationNotes: String,
 
    // Action Taken
    actionTaken: {
      type: String,
      enum: [
        'none',
        'warning_sent',
        'account_locked',
        'additional_verification',
        'escalated_to_security',
        'reported_to_authorities'
      ],
      default: 'none'
    },
 
    actionDetails: String,
 
    // Verification
    userConfirmed: {
      type: Boolean,
      default: null
    },
 
    userConfirmationMethod: String,
 
    userConfirmationAt: Date,
 
    // Risk Factors Contributing to Alert
    riskFactors: [
      {
        factor: String,
        weight: Number,
        value: mongoose.Schema.Types.Mixed
      }
    ],
 
    // Historical Context
    similarIncidentsCount: {
      type: Number,
      default: 0
    },
 
    firstOccurrenceDate: Date,
 
    lastOccurrenceDate: Date,
 
    // Additional Metadata
    ipAddress: String,
    device: String,
    location: String,
    userAgent: String,
 
    tags: [String]
  },
  { timestamps: true }
);
 
// ==========================================
// INDEXES FOR PERFORMANCE
// ==========================================
insiderLogSchema.index({ userId: 1, createdAt: -1 });
insiderLogSchema.index({ severity: 1 });
insiderLogSchema.index({ status: 1 });
insiderLogSchema.index({ isSuspicious: 1 });
insiderLogSchema.index({ activityType: 1 });
insiderLogSchema.index({ detectedAt: -1 });
 
// ==========================================
// METHOD: Get severity color
// ==========================================
insiderLogSchema.methods.getSeverityColor = function () {
  switch (this.severity) {
    case 'CRITICAL':
      return '#c53030';
    case 'HIGH':
      return '#f56565';
    case 'MEDIUM':
      return '#ed8936';
    case 'LOW':
      return '#ecc94b';
    default:
      return '#cbd5e0';
  }
};
 
// ==========================================
// METHOD: Get severity emoji
// ==========================================
insiderLogSchema.methods.getSeverityEmoji = function () {
  switch (this.severity) {
    case 'CRITICAL':
      return '🚨';
    case 'HIGH':
      return '🔴';
    case 'MEDIUM':
      return '🟡';
    case 'LOW':
      return '🟠';
    default:
      return '⚪';
  }
};
 
// ==========================================
// METHOD: Format for API response
// ==========================================
insiderLogSchema.methods.toJSON = function () {
  const obj = this.toObject();
  return {
    id: obj._id,
    userId: obj.userId,
    activityType: obj.activityType,
    description: obj.description,
    riskScore: obj.riskScore,
    severity: obj.severity,
    isSuspicious: obj.isSuspicious,
    status: obj.status,
    isResolved: obj.isResolved,
    detectedAt: obj.detectedAt,
    detectionMethod: obj.detectionMethod,
    riskFactors: obj.riskFactors,
    userConfirmed: obj.userConfirmed,
    actionTaken: obj.actionTaken,
    transactionId: obj.transactionId,
    similarIncidentsCount: obj.similarIncidentsCount,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt
  };
};
 
// ==========================================
// STATIC METHOD: Get critical alerts
// ==========================================
insiderLogSchema.statics.getCriticalAlerts = async function (userId = null) {
  const query = {
    severity: 'CRITICAL',
    isResolved: false
  };
 
  if (userId) {
    query.userId = mongoose.Types.ObjectId(userId);
  }
 
  return await this.find(query).sort({ detectedAt: -1 }).limit(10);
};
 
// ==========================================
// STATIC METHOD: Get unresolved alerts by severity
// ==========================================
insiderLogSchema.statics.getUnresolvedAlerts = async function (userId) {
  return await this.find({
    userId: mongoose.Types.ObjectId(userId),
    isResolved: false
  })
    .sort({ riskScore: -1, detectedAt: -1 })
    .limit(20);
};
 
// ==========================================
// STATIC METHOD: Get statistics
// ==========================================
insiderLogSchema.statics.getStats = async function (userId) {
  const stats = await this.aggregate([
    { $match: { userId:new mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: null,
        totalAlerts: { $sum: 1 },
        unresolved: {
          $sum: { $cond: [{ $eq: ['$isResolved', false] }, 1, 0] }
        },
        criticalCount: {
          $sum: { $cond: [{ $eq: ['$severity', 'CRITICAL'] }, 1, 0] }
        },
        highCount: {
          $sum: { $cond: [{ $eq: ['$severity', 'HIGH'] }, 1, 0] }
        },
        mediumCount: {
          $sum: { $cond: [{ $eq: ['$severity', 'MEDIUM'] }, 1, 0] }
        },
        lowCount: {
          $sum: { $cond: [{ $eq: ['$severity', 'LOW'] }, 1, 0] }
        },
        averageRiskScore: { $avg: '$riskScore' },
        confirmedSuspicious: {
          $sum: { $cond: [{ $eq: ['$isSuspicious', true] }, 1, 0] }
        }
      }
    }
  ]);
 
  return stats[0] || {
    totalAlerts: 0,
    unresolved: 0,
    criticalCount: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
    averageRiskScore: 0,
    confirmedSuspicious: 0
  };
};
 
// ==========================================
// STATIC METHOD: Check for recent suspicious pattern
// ==========================================
insiderLogSchema.statics.checkRecentPattern = async function (userId, activityType) {
  const recentAlerts = await this.find({
    userId: mongoose.Types.ObjectId(userId),
    activityType: activityType,
    detectedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
  }).countDocuments();
 
  return recentAlerts;
};
 
module.exports = mongoose.model('InsiderLog', insiderLogSchema);