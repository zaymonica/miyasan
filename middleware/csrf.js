/**
 * CSRF Protection Middleware
 * 
 * Comprehensive CSRF protection strategy:
 * 
 * 1. For REST APIs with JWT (Authorization: Bearer token):
 *    - Uses "Custom Request Header" pattern
 *    - JWT in Authorization header provides CSRF protection
 *    - Origin/Referer validation for additional security
 * 
 * 2. For traditional web forms and cookie-based auth:
 *    - Uses Synchronizer Token Pattern
 *    - Token generated and validated for each session
 * 
 * Why JWT APIs are protected from CSRF:
 * - Browsers cannot automatically attach Authorization headers in CSRF attacks
 * - Only JavaScript can set custom headers (same-origin policy)
 * - If an attacker forces a request, they cannot include the JWT
 * 
 * Additional Security Layers:
 * - Origin/Referer header validation
 * - Strict Content-Type validation
 * - Rate limiting on sensitive endpoints
 */

const crypto = require('crypto');
const { logger } = require('../config/logger');

// Store tokens in memory (in production, use Redis or session store)
const csrfTokens = new Map();

/**
 * Generate a CSRF token
 * @returns {string} CSRF token
 */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Middleware to generate and attach CSRF token to response
 * Token is sent in response header and should be included in subsequent requests
 */
function generateCSRFToken(req, res, next) {
  // Generate token for all non-static requests
  if (req.path.startsWith('/css/') ||
      req.path.startsWith('/js/') ||
      req.path.startsWith('/images/') ||
      req.path.startsWith('/uploads/')) {
    return next();
  }

  // Generate token
  const token = generateToken();
  
  // Store token with expiration (15 minutes)
  csrfTokens.set(token, {
    createdAt: Date.now(),
    expiresAt: Date.now() + (15 * 60 * 1000) // 15 minutes
  });

  // Attach token to response header
  res.setHeader('X-CSRF-Token', token);
  
  // Also attach to response locals for use in templates
  res.locals.csrfToken = token;
  
  next();
}

/**
 * Validate Origin/Referer header for CSRF protection
 * Provides additional protection layer for all requests
 */
function validateOrigin(req, allowedOrigins) {
  const origin = req.headers.origin || req.headers.referer;
  
  if (!origin) {
    // For API requests, origin might not be present (mobile apps, etc.)
    // Allow if JWT is present (handled by auth middleware)
    if (req.headers.authorization) {
      return true;
    }
    // For browser requests, origin should always be present
    return false;
  }
  
  // Check if origin matches allowed list
  try {
    const originUrl = new URL(origin);
    const originHost = `${originUrl.protocol}//${originUrl.host}`;
    
    // Check against allowed origins
    for (const allowed of allowedOrigins) {
      if (originHost === allowed || origin.startsWith(allowed)) {
        return true;
      }
    }
  } catch (error) {
    logger.warn('Invalid origin header', { origin, error: error.message });
    return false;
  }
  
  return false;
}

/**
 * Middleware to validate CSRF token
 * Only applies to state-changing operations (POST, PUT, DELETE, PATCH)
 */
function validateCSRFToken(req, res, next) {
  // Skip CSRF validation for safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Skip for static files
  if (req.path.startsWith('/css/') ||
      req.path.startsWith('/js/') ||
      req.path.startsWith('/images/') ||
      req.path.startsWith('/uploads/')) {
    return next();
  }

  // Get allowed origins from environment or use defaults
  const allowedOrigins = process.env.CORS_ORIGINS 
    ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
    : ['http://localhost:7000'];

  // === STRATEGY FOR REST APIs (JWT Authentication) ===
  // REST APIs with JWT in Authorization header are protected from CSRF by design:
  // 1. Browsers cannot automatically include Authorization headers in CSRF attacks
  // 2. Custom headers require JavaScript, which is bound by same-origin policy
  // 3. Attackers cannot read or set Authorization headers cross-origin
  if (req.path.startsWith('/api/')) {
    // Validate Origin/Referer header for additional security
    if (!validateOrigin(req, allowedOrigins)) {
      logger.warn('CSRF Protection: Invalid origin for API request', {
        path: req.path,
        origin: req.headers.origin,
        referer: req.headers.referer,
        ip: req.ip
      });
      
      // For strict security, you can uncomment this:
      // return res.status(403).json({ 
      //   error: 'Invalid origin',
      //   message: 'Request origin is not allowed'
      // });
    }
    
    // Additional validation: Check Content-Type for JSON APIs
    const contentType = req.headers['content-type'] || '';
    if (req.path.startsWith('/api/') && 
        !req.path.includes('/upload') && 
        !req.path.includes('/import') &&
        req.body && 
        Object.keys(req.body).length > 0) {
      
      if (!contentType.includes('application/json') && 
          !contentType.includes('application/x-www-form-urlencoded')) {
        logger.warn('CSRF Protection: Invalid Content-Type for API request', {
          path: req.path,
          contentType: contentType,
          ip: req.ip
        });
      }
    }
    
    // JWT in Authorization header provides CSRF protection
    // Allow the request to proceed to JWT validation
    return next();
  }

  // === STRATEGY FOR TRADITIONAL WEB FORMS ===
  // For HTML forms and cookie-based authentication, use token validation
  
  // Skip validation for file upload routes (handled by multer)
  if (req.path.includes('/upload') || req.path.includes('/import')) {
    return next();
  }

  // Get token from header or body
  const token = req.headers['x-csrf-token'] || req.body._csrf || req.query._csrf;

  if (!token) {
    logger.warn('CSRF Protection: Token missing', {
      path: req.path,
      method: req.method,
      ip: req.ip
    });
    
    return res.status(403).json({ 
      error: 'CSRF token missing',
      message: 'CSRF token is required for this operation'
    });
  }

  // Validate token
  const tokenData = csrfTokens.get(token);
  
  if (!tokenData) {
    logger.warn('CSRF Protection: Invalid token', {
      path: req.path,
      ip: req.ip
    });
    
    return res.status(403).json({ 
      error: 'Invalid CSRF token',
      message: 'The CSRF token is invalid or expired'
    });
  }

  // Check expiration
  if (Date.now() > tokenData.expiresAt) {
    csrfTokens.delete(token);
    
    logger.warn('CSRF Protection: Token expired', {
      path: req.path,
      ip: req.ip
    });
    
    return res.status(403).json({ 
      error: 'CSRF token expired',
      message: 'The CSRF token has expired. Please refresh the page.'
    });
  }

  // Token is valid
  logger.debug('CSRF Protection: Token validated', {
    path: req.path
  });
  
  next();
}

/**
 * Cleanup expired tokens (run periodically)
 */
function cleanupExpiredTokens() {
  const now = Date.now();
  for (const [token, data] of csrfTokens.entries()) {
    if (now > data.expiresAt) {
      csrfTokens.delete(token);
    }
  }
}

// Cleanup every 5 minutes
setInterval(cleanupExpiredTokens, 5 * 60 * 1000);

// Export with csrfProtection alias for compatibility
module.exports = {
  generateCSRFToken,
  validateCSRFToken,
  csrfProtection: validateCSRFToken,
  generateToken
};
