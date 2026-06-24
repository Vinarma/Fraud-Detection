// backend/src/middleware/auth.js
const jwt = require('jsonwebtoken');
 
// ==========================================
// JWT VERIFICATION MIDDLEWARE
// ==========================================
const authMiddleware = (req, res, next) => {
  try {
    // Get token from header: "Bearer TOKEN"
    const token = req.headers.authorization?.split(' ')[1];
 
    if (!token) {
      return res.status(401).json({
        error: 'No token provided',
        message: 'Please login to continue'
      });
    }
 
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Attach user to request
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expired',
        message: 'Please login again'
      });
    }
 
    return res.status(401).json({
      error: 'Invalid token',
      message: 'Authentication failed'
    });
  }
};
 
// ==========================================
// ROLE-BASED ACCESS CONTROL
// ==========================================
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
 
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Insufficient permissions'
      });
    }
 
    next();
  };
};
 
module.exports = {
  authMiddleware,
  authorize
};