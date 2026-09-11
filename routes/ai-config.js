/**
 * AI Configuration Routes - Multi-tenant AI Management
 * Handles AI provider configuration and testing
 */

const express = require('express');
const router = express.Router();
const AIConfigController = require('../controllers/AIConfigController');
const { requireAuth } = require('../middleware/auth');

// Note: Authentication and tenant middleware are applied in server.js

/**
 * @route GET /api/tenant/ai-config/settings
 * @desc Get AI configurations for tenant
 * @access Private (Tenant)
 */
router.get('/settings', AIConfigController.getSettings);

/**
 * @route POST /api/tenant/ai-config/settings
 * @desc Create new AI configuration
 * @access Private (Tenant)
 */
router.post('/settings', AIConfigController.createSetting);

/**
 * @route PUT /api/tenant/ai-config/settings/:id
 * @desc Update AI configuration
 * @access Private (Tenant)
 */
router.put('/settings/:id', AIConfigController.updateSetting);

/**
 * @route PATCH /api/tenant/ai-config/settings/:id/toggle
 * @desc Toggle AI configuration active status
 * @access Private (Tenant)
 */
router.patch('/settings/:id/toggle', AIConfigController.toggleSetting);

/**
 * @route DELETE /api/tenant/ai-config/settings/:id
 * @desc Delete AI configuration
 * @access Private (Tenant)
 */
router.delete('/settings/:id', AIConfigController.deleteSetting);

/**
 * @route POST /api/tenant/ai-config/test/:id
 * @desc Test AI configuration connection
 * @access Private (Tenant)
 */
router.post('/test/:id', AIConfigController.testConfiguration);

/**
 * @route GET /api/tenant/ai-config/models/:provider
 * @desc Get available models by provider
 * @access Private (Tenant)
 */
router.get('/models/:provider', AIConfigController.getModels);

/**
 * @route GET /api/tenant/ai-config/stats
 * @desc Get AI usage statistics
 * @access Private (Tenant)
 */
router.get('/stats', AIConfigController.getStats);

module.exports = router;
