/**
 * Security Middleware
 * Rate limiting, input sanitization, and security headers
 * 
 * @module middleware/security
 */

const rateLimit = require('express-rate-limit');
const validator = require('validator');
const { logger } = require('../config/logger');

/**
 * API Rate Limiter
 * General rate limiting for all API endpoints
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Limit each IP to 500 requests per windowMs (increased from 100)
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      success: false,
      error: 'Too many requests, please try again later.',
    });
  },
});

/**
 * Authentication Rate Limiter
 * Stricter rate limiting for authentication endpoints
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login requests per windowMs
  message: 'Too many login attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    logger.warn(`Auth rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      success: false,
      error: 'Too many login attempts, please try again in 15 minutes.',
    });
  },
});

/**
 * Input Sanitization Middleware
 * Sanitizes all user inputs to prevent XSS attacks
 */
function sanitizeInput(req, res, next) {
  try {
    // Sanitize body
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body);
    }

    // Sanitize query parameters
    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeObject(req.query);
    }

    // Sanitize URL parameters
    if (req.params && typeof req.params === 'object') {
      req.params = sanitizeObject(req.params);
    }

    next();
  } catch (error) {
    logger.error('Error in input sanitization', { error: error.message });
    next(error);
  }
}

/**
 * Recursively sanitize object properties
 */
function sanitizeObject(obj) {
  const sanitized = {};
  
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const value = obj[key];
      
      if (typeof value === 'string') {
        // Escape HTML and trim whitespace
        sanitized[key] = validator.escape(value.trim());
      } else if (typeof value === 'object' && value !== null) {
        // Recursively sanitize nested objects
        sanitized[key] = Array.isArray(value)
          ? value.map(item => typeof item === 'string' ? validator.escape(item.trim()) : item)
          : sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }
  }
  
  return sanitized;
}

/**
 * Validate email format
 */
function isValidEmail(email) {
  return validator.isEmail(email);
}

/**
 * Validate phone number format
 */
function isValidPhone(phone) {
  return validator.isMobilePhone(phone, 'any', { strictMode: false });
}

/**
 * Validate URL format
 */
function isValidURL(url) {
  return validator.isURL(url);
}

module.exports = {
  apiLimiter,
  authLimiter,
  sanitizeInput,
  isValidEmail,
  isValidPhone,
  isValidURL,
};
