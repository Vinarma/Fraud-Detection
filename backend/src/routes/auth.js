// backend/src/routes/auth.js
const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');
 
const router = express.Router();
 
// ==========================================
// GENERATE JWT TOKEN
// ==========================================
const generateToken = (userId, email, role) => {
  return jwt.sign(
    { userId, email, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};
 
// ==========================================
// POST /api/auth/register
// Create a new user account
// ==========================================
router.post('/register', async (req, res) => {
  try {
    const { fullName, email, password, confirmPassword } = req.body;
 
    // ========== VALIDATION ==========
    if (!fullName || !email || !password) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['fullName', 'email', 'password']
      });
    }
 
    if (password.length < 6) {
      return res.status(400).json({
        error: 'Password must be at least 6 characters'
      });
    }
 
    if (password !== confirmPassword) {
      return res.status(400).json({
        error: 'Passwords do not match'
      });
    }
 
    // ========== CHECK IF USER EXISTS ==========
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        error: 'User already exists',
        message: 'Email is already registered. Try logging in instead.'
      });
    }
 
    // ========== CREATE NEW USER ==========
    const user = new User({
      fullName: fullName.trim(),
      email: email.toLowerCase(),
      password: password
    });
 
    await user.save();
 
    // ========== GENERATE TOKEN ==========
    const token = generateToken(user._id, user.email, user.role);
 
    // ========== RETURN RESPONSE ==========
    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt
      }
    });
 
    console.log(`✅ New user registered: ${email}`);
  } catch (error) {
    console.error('❌ Registration error:', error.message);
 
    // Mongoose validation error
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Validation failed',
        details: Object.values(error.errors).map(e => e.message)
      });
    }
 
    res.status(500).json({
      error: 'Registration failed',
      message: error.message
    });
  }
});
 
// ==========================================
// POST /api/auth/login
// Authenticate user and return JWT token
// ==========================================
router.post('/login', async (req, res) => {
  try {
    const { email, password, deviceId, deviceName } = req.body;
 
    // ========== VALIDATION ==========
    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required'
      });
    }
 
    // ========== FIND USER ==========
    const user = await User.findOne({ email: email.toLowerCase() }).select(
      '+password'
    );
 
    if (!user) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email or password is incorrect'
      });
    }
 
    // ========== CHECK IF ACCOUNT IS LOCKED ==========
    if (user.isAccountLocked()) {
      return res.status(429).json({
        error: 'Account locked',
        message: 'Too many failed login attempts. Try again in 15 minutes.'
      });
    }
 
    // ========== COMPARE PASSWORDS ==========
    const passwordMatch = await user.comparePassword(password);
 
    if (!passwordMatch) {
      // Record failed login attempt
      await user.recordFailedLogin();
      
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email or password is incorrect'
      });
    }
 
    // ========== SUCCESSFUL LOGIN ==========
    // Reset login attempts
    await user.resetLoginAttempts();
 
    // Register device if provided
    if (deviceId && deviceName) {
      await user.addKnownDevice(deviceId, deviceName);
    }
 
    // Generate token
    const token = generateToken(user._id, user.email, user.role);
 
    // ========== RETURN RESPONSE ==========
    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        profileImage: user.profileImage,
        lastLogin: user.lastLogin
      }
    });
 
    console.log(`✅ User logged in: ${email}`);
  } catch (error) {
    console.error('❌ Login error:', error.message);
 
    res.status(500).json({
      error: 'Login failed',
      message: error.message
    });
  }
});
 
// ==========================================
// GET /api/auth/profile
// Get current user profile (protected route)
// ==========================================
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
 
    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }
 
    res.status(200).json({
      message: 'Profile retrieved successfully',
      user: user.toJSON()
    });
  } catch (error) {
    console.error('❌ Profile error:', error.message);
 
    res.status(500).json({
      error: 'Failed to retrieve profile',
      message: error.message
    });
  }
});
 
// ==========================================
// POST /api/auth/logout
// Logout user (frontend handles token removal)
// ==========================================
router.post('/logout', authMiddleware, async (req, res) => {
  try {
    // In practice, you might want to:
    // 1. Blacklist the token
    // 2. Clear any session data
    // For now, frontend removes token from localStorage
 
    res.status(200).json({
      message: 'Logged out successfully'
    });
 
    console.log(`✅ User logged out: ${req.user.email}`);
  } catch (error) {
    res.status(500).json({
      error: 'Logout failed',
      message: error.message
    });
  }
});
 
// ==========================================
// PUT /api/auth/update-profile
// Update user profile (protected route)
// ==========================================
router.put('/update-profile', authMiddleware, async (req, res) => {
  try {
    const { fullName, phone, profileImage } = req.body;
 
    const user = await User.findByIdAndUpdate(
      req.user.userId,
      {
        fullName: fullName || undefined,
        phone: phone || undefined,
        profileImage: profileImage || undefined
      },
      { new: true, runValidators: true }
    );
 
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
 
    res.status(200).json({
      message: 'Profile updated successfully',
      user: user.toJSON()
    });
 
    console.log(`✅ Profile updated: ${req.user.email}`);
  } catch (error) {
    console.error('❌ Update error:', error.message);
 
    res.status(500).json({
      error: 'Update failed',
      message: error.message
    });
  }
});
 
module.exports = router;