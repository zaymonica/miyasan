/**
 * Input Validation Middleware
 * 
 * Comprehensive validation rules using express-validator
 * for all API endpoints to ensure data integrity and security
 */

const { body, param, query, validationResult } = require('express-validator');
const validator = require('validator');

/**
 * Middleware to handle validation results
 * Returns 400 with validation errors if validation fails
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(err => ({
      field: err.path || err.param,
      message: err.msg,
      value: err.value
    }));

    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: formattedErrors
    });
  }
  
  next();
};

/**
 * Common validation rules that can be reused
 */
const commonValidations = {
  // Username validation
  username: body('username')
    .trim()
    .notEmpty().withMessage('Username is required')
    .isLength({ min: 3, max: 50 }).withMessage('Username must be between 3 and 50 characters')
    .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username can only contain letters, numbers, and underscores'),

  // Password validation
  password: body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),

  // Email validation
  email: body('email')
    .optional()
    .trim()
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),

  // Phone number validation
  phone: body('phone')
    .optional()
    .trim()
    .matches(/^[\d\s\-\+\(\)]+$/).withMessage('Invalid phone number format')
    .isLength({ min: 10, max: 20 }).withMessage('Phone number must be between 10 and 20 characters'),

  // Text/Message validation
  message: body('message')
    .trim()
    .notEmpty().withMessage('Message is required')
    .isLength({ max: 5000 }).withMessage('Message must not exceed 5000 characters'),

  // ID parameter validation
  id: param('id')
    .isInt({ min: 1 }).withMessage('Invalid ID format'),

  // Pagination
  page: query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer')
    .toInt(),

  limit: query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
    .toInt()
};

/**
 * Custom sanitization middleware
 * Removes potentially dangerous characters from inputs
 */
const sanitizeInput = (req, res, next) => {
  // Sanitize body
  if (req.body && typeof req.body === 'object') {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        // Remove null bytes
        req.body[key] = req.body[key].replace(/\0/g, '');
        
        // For fields that shouldn't contain HTML, strip tags
        if (!['message', 'answer', 'description'].includes(key)) {
          req.body[key] = validator.stripLow(req.body[key]);
        }
      }
    });
  }

  // Sanitize query parameters
  if (req.query && typeof req.query === 'object') {
    Object.keys(req.query).forEach(key => {
      if (typeof req.query[key] === 'string') {
        req.query[key] = req.query[key].replace(/\0/g, '');
        req.query[key] = validator.stripLow(req.query[key]);
      }
    });
  }

  next();
};

module.exports = {
  // Validation result handler
  handleValidationErrors,
  
  // Common validations
  commonValidations,
  
  // Sanitization
  sanitizeInput
};
