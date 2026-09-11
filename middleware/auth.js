/**
 * Authentication Middleware
 * JWT token validation and role-based access control
 * 
 * @module middleware/auth
 */

const jwt = require('jsonwebtoken');
const { logger } = require('../config/logger');

/**
 * Verify JWT token and attach user to request
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.warn('Auth header missing or invalid', { path: req.path });
    return res.status(401).json({
      success: false,
      error: 'Access denied. Token not provided.',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    req.userId = decoded.id;
    req.userRole = decoded.role;
    
    // Set tenant context if present in token
    if (decoded.tenantId) {
      req.tenantId = decoded.tenantId;
    }
    
    logger.debug('Token validated successfully', { userId: decoded.id, tenantId: decoded.tenantId });
    next();
  } catch (error) {
    logger.error('Token validation failed', { 
      error: error.message, 
      path: req.path
    });
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired token.',
    });
  }
}

/**
 * Require Super Admin role
 */
function requireSuperAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'superadmin') {
    return res.status(403).json({
      success: false,
      error: 'Access denied. Super Admin privileges required.',
    });
  }
  next();
}

/**
 * Require Admin role (tenant admin)
 */
function requireAdmin(req, res, next) {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'superadmin')) {
    return res.status(403).json({
      success: false,
      error: 'Access denied. Admin privileges required.',
    });
  }
  next();
}

/**
 * Require User role (any authenticated user)
 */
function requireUser(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required.',
    });
  }
  next();
}

/**
 * Optional authentication
 * Attaches user if token is valid, but doesn't require it
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
      req.userId = decoded.id;
      req.userRole = decoded.role;
      
      if (decoded.tenantId) {
        req.tenantId = decoded.tenantId;
      }
    } catch (error) {
      // Token invalid, but we don't fail the request
      logger.debug('Optional auth: Invalid token');
    }
  }
  
  next();
}

/**
 * Generate JWT token
 */
function generateToken(payload, expiresIn = '24h') {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
}

/**
 * Verify token without middleware
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null;
  }
}

module.exports = {
  requireAuth,
  authenticateToken: requireAuth, // Alias for backward compatibility
  requireSuperAdmin,
  requireAdmin,
  requireUser,
  optionalAuth,
  generateToken,
  verifyToken,
};
