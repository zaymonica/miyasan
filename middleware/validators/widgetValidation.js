/**
 * Widget Validation Middleware
 * 
 * Validates widget configuration data for creation and updates.
 * Ensures data integrity and security for widget operations.
 * 
 * @module middleware/validators/widgetValidation
 */

const { body, validationResult } = require('express-validator');
const { logger } = require('../../config/logger');

/**
 * Validation rules for creating a widget
 */
const validateCreateWidget = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Widget name is required')
    .isLength({ min: 3, max: 100 })
    .withMessage('Widget name must be between 3 and 100 characters'),

  body('whatsapp_number')
    .trim()
    .notEmpty()
    .withMessage('WhatsApp number is required')
    .matches(/^\+?[0-9]{8,15}$/)
    .withMessage('Invalid WhatsApp number format. Use international format (e.g., +5511999999999)'),

  body('button_title')
    .trim()
    .notEmpty()
    .withMessage('Button title is required')
    .isLength({ min: 1, max: 50 })
    .withMessage('Button title must be between 1 and 50 characters'),

  body('button_background_color')
    .optional()
    .trim()
    .matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .withMessage('Invalid color format. Use hex format (e.g., #25D366)'),

  body('widget_title')
    .trim()
    .notEmpty()
    .withMessage('Widget title is required')
    .isLength({ min: 1, max: 100 })
    .withMessage('Widget title must be between 1 and 100 characters'),

  body('predefined_message')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Predefined message cannot exceed 1000 characters'),

  body('max_message_length')
    .optional()
    .isInt({ min: 50, max: 5000 })
    .withMessage('Max message length must be between 50 and 5000 characters'),

  body('margin_right')
    .optional()
    .isInt({ min: 0, max: 500 })
    .withMessage('Margin right must be between 0 and 500 pixels'),

  body('margin_bottom')
    .optional()
    .isInt({ min: 0, max: 500 })
    .withMessage('Margin bottom must be between 0 and 500 pixels'),

  body('border_radius')
    .optional()
    .isInt({ min: 0, max: 100 })
    .withMessage('Border radius must be between 0 and 100 pixels'),

  body('is_active')
    .optional()
    .isBoolean()
    .withMessage('is_active must be a boolean'),

  // Validation result handler
  (req, res, next) => {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      logger.warn('Widget validation failed', { 
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

/**
 * Validation rules for updating a widget
 */
const validateUpdateWidget = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('Widget name must be between 3 and 100 characters'),

  body('whatsapp_number')
    .optional()
    .trim()
    .matches(/^\+?[0-9]{8,15}$/)
    .withMessage('Invalid WhatsApp number format. Use international format (e.g., +5511999999999)'),

  body('button_title')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Button title must be between 1 and 50 characters'),

  body('button_background_color')
    .optional()
    .trim()
    .matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .withMessage('Invalid color format. Use hex format (e.g., #25D366)'),

  body('widget_title')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Widget title must be between 1 and 100 characters'),

  body('predefined_message')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Predefined message cannot exceed 1000 characters'),

  body('max_message_length')
    .optional()
    .isInt({ min: 50, max: 5000 })
    .withMessage('Max message length must be between 50 and 5000 characters'),

  body('margin_right')
    .optional()
    .isInt({ min: 0, max: 500 })
    .withMessage('Margin right must be between 0 and 500 pixels'),

  body('margin_bottom')
    .optional()
    .isInt({ min: 0, max: 500 })
    .withMessage('Margin bottom must be between 0 and 500 pixels'),

  body('border_radius')
    .optional()
    .isInt({ min: 0, max: 100 })
    .withMessage('Border radius must be between 0 and 100 pixels'),

  body('is_active')
    .optional()
    .isBoolean()
    .withMessage('is_active must be a boolean'),

  // Validation result handler
  (req, res, next) => {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      logger.warn('Widget update validation failed', { 
        errors: errors.array(),
        widgetId: req.params.id,
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

/**
 * Validation rules for widget event tracking
 */
const validateWidgetEvent = [
  body('event_type')
    .trim()
    .notEmpty()
    .withMessage('Event type is required')
    .isIn(['loaded', 'opened', 'closed', 'message_sent', 'clicked'])
    .withMessage('Invalid event type'),

  body('event_data')
    .optional()
    .isObject()
    .withMessage('Event data must be an object'),

  body('session_id')
    .optional()
    .trim()
    .isLength({ max: 64 })
    .withMessage('Session ID cannot exceed 64 characters'),

  // Validation result handler
  (req, res, next) => {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      logger.warn('Widget event validation failed', { 
        errors: errors.array(),
        widgetId: req.params.id
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
  validateCreateWidget,
  validateUpdateWidget,
  validateWidgetEvent
};
