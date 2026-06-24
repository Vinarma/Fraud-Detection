// backend/src/models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
 
const userSchema = new mongoose.Schema(
  {
    // Personal Information
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      minlength: [3, 'Name must be at least 3 characters']
    },
 
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        'Please provide a valid email'
      ]
    },
 
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false // Don't return by default
    },
 
    // Account Status
    isActive: {
      type: Boolean,
      default: true
    },
 
    role: {
      type: String,
      enum: ['user', 'admin', 'analyst'],
      default: 'user'
    },
 
    // Profile
    phone: String,
    profileImage: String,
 
    // Device Management (for fraud detection)
    knownDevices: [
      {
        deviceName: String,
        deviceId: String,
        addedAt: { type: Date, default: Date.now }
      }
    ],
    
    knownIps: [
      {
        ipAddress: String,
        addedAt: { type: Date, default: Date.now }
      }
    ],

    // Behavior Tracking
    loginHistory: [
      {
        timestamp: { type: Date, default: Date.now },
        ipAddress: String,
        deviceId: String,
        location: String
      }
    ],

    spendingMetrics: {
      averageDailySpend: { type: Number, default: 0 },
      transactionCount: { type: Number, default: 0 },
      lastTransactionDate: Date
    },
 
    // Security
    lastLogin: Date,
    loginAttempts: { type: Number, default: 0 },
    lockUntil: Date,
 
    // Risk Preferences
    riskThreshold: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH'],
      default: 'MEDIUM'
    },
 
    enableNotifications: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);
 
// ==========================================
// HASH PASSWORD BEFORE SAVING
// ==========================================
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
 
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});
 
// ==========================================
// COMPARE PASSWORD METHOD
// ==========================================
userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};
 
// ==========================================
// RECORD FAILED LOGIN
// ==========================================
userSchema.methods.recordFailedLogin = function () {
  this.loginAttempts = (this.loginAttempts || 0) + 1;
 
  // Lock account after 5 failed attempts for 15 minutes
  if (this.loginAttempts >= 5) {
    this.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
  }
 
  return this.save();
};
 
// ==========================================
// RESET LOGIN ATTEMPTS AFTER SUCCESS
// ==========================================
userSchema.methods.resetLoginAttempts = function () {
  this.loginAttempts = 0;
  this.lockUntil = null;
  this.lastLogin = new Date();
  return this.save();
};
 
// ==========================================
// CHECK IF ACCOUNT IS LOCKED
// ==========================================
userSchema.methods.isAccountLocked = function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};
 
// ==========================================
// REMOVE SENSITIVE DATA
// ==========================================
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.lockUntil;
  delete obj.loginAttempts;
  return obj;
};

// ==========================================
// ADD KNOWN DEVICE (FOR FRAUD DETECTION)
// ==========================================
userSchema.methods.addKnownDevice = async function (deviceId, deviceName) {
  if (!this.knownDevices) {
    this.knownDevices = [];
  }

  const exists = this.knownDevices.find(
    (device) => device.deviceId === deviceId
  );

  if (!exists) {
    this.knownDevices.push({
      deviceId,
      deviceName,
      addedAt: new Date()
    });
  }

  return this.save();
};

// ==========================================
// BEHAVIORAL TRACKING METHODS
// ==========================================
userSchema.methods.addKnownIp = async function (ipAddress) {
  if (!this.knownIps) this.knownIps = [];
  if (!this.knownIps.find(ip => ip.ipAddress === ipAddress)) {
    this.knownIps.push({ ipAddress, addedAt: new Date() });
    return this.save();
  }
  return this;
};

userSchema.methods.recordLogin = async function (ipAddress, deviceId, location) {
  if (!this.loginHistory) this.loginHistory = [];
  this.loginHistory.push({ timestamp: new Date(), ipAddress, deviceId, location });
  // Keep only last 20 logins
  if (this.loginHistory.length > 20) {
    this.loginHistory.shift();
  }
  return this.save();
};

userSchema.methods.updateSpending = async function (amount) {
  if (!this.spendingMetrics) {
    this.spendingMetrics = { averageDailySpend: 0, transactionCount: 0 };
  }
  
  // Exponential moving average for spend
  const prevAvg = this.spendingMetrics.averageDailySpend || 0;
  const count = this.spendingMetrics.transactionCount || 0;
  
  if (count === 0) {
    this.spendingMetrics.averageDailySpend = amount;
  } else {
    // Simple EMA favoring recent transactions
    this.spendingMetrics.averageDailySpend = (prevAvg * 0.8) + (amount * 0.2);
  }
  
  this.spendingMetrics.transactionCount = count + 1;
  this.spendingMetrics.lastTransactionDate = new Date();
  return this.save();
};
 
module.exports = mongoose.model('User', userSchema);