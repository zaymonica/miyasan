/**
 * Profile Validation Middleware
 * 
 * Validates profile customization data including colors.
 * Ensures data integrity and security for profile operations.
 * 
 * @module middleware/validators/profileValidation
 */

const { body, validationResult } = require('express-validator');
const { logger } = require('../../config/logger');

/**
 * Validation rules for updating colors
 */
const validateColors = [
  body('primary_color')
    .optional()
    .trim()
    .matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .withMessage('Invalid primary color format. Use hex format (e.g., #00a149)'),

  body('primary_dark')
    .optional()
    .trim()
    .matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .withMessage('Invalid primary dark color format. Use hex format (e.g., #654321)'),

  body('primary_light')
    .optional()
    .trim()
    .matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .withMessage('Invalid primary light color format. Use hex format (e.g., #A0522D)'),

  body('accent_color')
    .optional()
    .trim()
    .matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .withMessage('Invalid accent color format. Use hex format (e.g., #CD853F)'),

  body('text_color')
    .optional()
    .trim()
    .matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .withMessage('Invalid text color format. Use hex format (e.g., #333333)'),

  body('text_light')
    .optional()
    .trim()
    .matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .withMessage('Invalid text light color format. Use hex format (e.g., #666666)'),

  body('bg_color')
    .optional()
    .trim()
    .matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .withMessage('Invalid background color format. Use hex format (e.g., #f5f5f5)'),

  body('white')
    .optional()
    .trim()
    .matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .withMessage('Invalid white color format. Use hex format (e.g., #ffffff)'),

  body('success')
    .optional()
    .trim()
    .matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .withMessage('Invalid success color format. Use hex format (e.g., #28a745)'),

  body('warning')
    .optional()
    .trim()
    .matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .withMessage('Invalid warning color format. Use hex format (e.g., #ffc107)'),

  body('danger')
    .optional()
    .trim()
    .matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .withMessage('Invalid danger color format. Use hex format (e.g., #dc3545)'),

  body('info')
    .optional()
    .trim()
    .matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .withMessage('Invalid info color format. Use hex format (e.g., #17a2b8)'),

  // Validation result handler
  (req, res, next) => {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      logger.warn('Profile color validation failed', { 
        errors: errors.array(),
        userId: req.user?.id,
        tenantId: req.user?.tenantId
      });
      
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array().map(err => ({
          field: err.path,
          message: err.msg
        }))
      });
    }
    
    next();
  }
];

module.exports = {
  validateColors
};
