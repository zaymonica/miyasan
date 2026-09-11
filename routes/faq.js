/**
 * FAQ Routes
 * Multi-tenant FAQ management endpoints
 * 
 * @module routes/faq
 */

const express = require('express');
const router = express.Router();
const FAQController = require('../controllers/FAQController');
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { checkResourceLimit } = require('../middleware/planLimits');

// Apply authentication to all routes
router.use(requireAdmin);

/**
 * @route GET /api/tenant/faqs
 * @desc List all FAQs for tenant
 * @access Private (Tenant users)
 * @query {boolean} active - Filter by active status
 */
router.get('/', FAQController.list);

/**
 * @route GET /api/tenant/faqs/search
 * @desc Search FAQs
 * @access Private (Tenant users)
 * @query {string} q - Search query
 */
router.get('/search', FAQController.search);

/**
 * @route GET /api/tenant/faqs/statistics
 * @desc Get FAQ statistics
 * @access Private (Tenant users)
 */
router.get('/statistics', FAQController.getStatistics);

/**
 * @route GET /api/tenant/faqs/welcome-messages
 * @desc Get welcome messages
 * @access Private (Tenant users)
 */
router.get('/welcome-messages', FAQController.getWelcomeMessages);

/**
 * @route POST /api/tenant/faqs/welcome-messages
 * @desc Save welcome messages
 * @access Private (Tenant users)
 * @body {array} messages - Array of message objects with text property
 */
router.post('/welcome-messages', FAQController.saveWelcomeMessages);

/**
 * @route GET /api/tenant/faqs/placeholders
 * @desc Get message placeholders
 * @access Private (Tenant users)
 */
router.get('/placeholders', FAQController.getPlaceholders);

/**
 * @route GET /api/tenant/faqs/:id
 * @desc Get FAQ by ID
 * @access Private (Tenant users)
 * @param {number} id - FAQ ID
 */
router.get('/:id', FAQController.getById);

/**
 * @route POST /api/tenant/faqs
 * @desc Create new FAQ
 * @access Private (Tenant users)
 * @body {string} question - FAQ question (required)
 * @body {string} answer - FAQ answer (required)
 * @body {string} emoji - Emoji icon (optional)
 * @body {string} placeholder_key - Placeholder key (optional)
 * @body {boolean} active - Active status (default: true)
 * @body {number} order_position - Display order (default: 0)
 */
router.post('/', checkResourceLimit('faqs'), FAQController.create);

/**
 * @route PUT /api/tenant/faqs/:id
 * @desc Update FAQ
 * @access Private (Tenant users)
 * @param {number} id - FAQ ID
 * @body {string} question - FAQ question
 * @body {string} answer - FAQ answer
 * @body {string} emoji - Emoji icon
 * @body {string} placeholder_key - Placeholder key
 * @body {boolean} active - Active status
 * @body {number} order_position - Display order
 */
router.put('/:id', FAQController.update);

/**
 * @route PATCH /api/tenant/faqs/:id/toggle
 * @desc Toggle FAQ active status
 * @access Private (Tenant users)
 * @param {number} id - FAQ ID
 */
router.patch('/:id/toggle', FAQController.toggleActive);

/**
 * @route POST /api/tenant/faqs/reorder
 * @desc Reorder FAQs
 * @access Private (Tenant users)
 * @body {array} order - Array of FAQ IDs in new order
 */
router.post('/reorder', FAQController.reorder);

/**
 * @route DELETE /api/tenant/faqs/:id
 * @desc Delete FAQ
 * @access Private (Tenant users)
 * @param {number} id - FAQ ID
 */
router.delete('/:id', FAQController.delete);

module.exports = router;
