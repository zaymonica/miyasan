/**
 * Widget Routes
 * 
 * Handles routes for WhatsApp chat widget configuration and embed functionality.
 * Includes both admin routes (protected) and public routes (for widget embedding).
 * 
 * @module routes/widget
 */

const express = require('express');
const router = express.Router();
const WidgetController = require('../controllers/WidgetController');
const { requireAuth } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');
const { checkResourceLimit, checkFeatureEnabled } = require('../middleware/planLimits');
const { 
  validateCreateWidget, 
  validateUpdateWidget,
  validateWidgetEvent 
} = require('../middleware/validators/widgetValidation');
const rateLimit = require('express-rate-limit');

// Rate limiters
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later'
});

const publicLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // limit each IP to 60 requests per windowMs
  message: 'Too many requests, please try again later'
});

// ============================================
// ADMIN ROUTES (Protected)
// ============================================

/**
 * @route   GET /api/widget/admin
 * @desc    Get all widget configurations for tenant
 * @access  Admin only
 * @query   {number} page - Page number (default: 1)
 * @query   {number} limit - Items per page (default: 10)
 * @query   {string} search - Search term
 */
router.get('/admin', requireAuth, tenantMiddleware, adminLimiter, WidgetController.getAllWidgets);

/**
 * @route   GET /api/widget/admin/:id
 * @desc    Get widget configuration by ID
 * @access  Admin only
 * @param   {number} id - Widget ID
 */
router.get('/admin/:id', requireAuth, tenantMiddleware, adminLimiter, WidgetController.getWidgetById);

/**
 * @route   POST /api/widget/admin
 * @desc    Create new widget configuration
 * @access  Admin only
 * @body    {object} Widget configuration data
 */
router.post('/admin', requireAuth, tenantMiddleware, adminLimiter, checkFeatureEnabled('widgets'), checkResourceLimit('widgets'), validateCreateWidget, WidgetController.createWidget);

/**
 * @route   PUT /api/widget/admin/:id
 * @desc    Update widget configuration
 * @access  Admin only
 * @param   {number} id - Widget ID
 * @body    {object} Widget configuration data
 */
router.put('/admin/:id', requireAuth, tenantMiddleware, adminLimiter, validateUpdateWidget, WidgetController.updateWidget);

/**
 * @route   DELETE /api/widget/admin/:id
 * @desc    Delete widget configuration
 * @access  Admin only
 * @param   {number} id - Widget ID
 */
router.delete('/admin/:id', requireAuth, tenantMiddleware, adminLimiter, WidgetController.deleteWidget);

/**
 * @route   GET /api/widget/admin/:id/embed-code
 * @desc    Generate embed code for widget
 * @access  Admin only
 * @param   {number} id - Widget ID
 */
router.get('/admin/:id/embed-code', requireAuth, tenantMiddleware, adminLimiter, WidgetController.generateEmbedCode);

/**
 * @route   GET /api/widget/admin/:id/analytics
 * @desc    Get widget analytics
 * @access  Admin only
 * @param   {number} id - Widget ID
 * @query   {string} start_date - Start date (YYYY-MM-DD)
 * @query   {string} end_date - End date (YYYY-MM-DD)
 */
router.get('/admin/:id/analytics', requireAuth, tenantMiddleware, adminLimiter, WidgetController.getWidgetAnalytics);

// ============================================
// PUBLIC ROUTES (For widget embedding)
// ============================================

/**
 * @route   GET /api/widget/public/:id/:token
 * @desc    Get widget configuration by ID and token (public)
 * @access  Public
 * @param   {number} id - Widget ID
 * @param   {string} token - Widget token
 */
router.get('/public/:id/:token', publicLimiter, WidgetController.getWidgetByToken);

/**
 * @route   POST /api/widget/public/:id/:token/track
 * @desc    Track widget event (public)
 * @access  Public
 * @param   {number} id - Widget ID
 * @param   {string} token - Widget token
 * @body    {object} Event data
 */
router.post('/public/:id/:token/track', publicLimiter, validateWidgetEvent, WidgetController.trackWidgetEvent);

module.exports = router;
