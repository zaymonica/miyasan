/**
 * Plan Management Routes
 * Routes for tenant plan and add-on resources management
 */

const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const PlanManagementController = require('../controllers/PlanManagementController');

/**
 * @route GET /api/tenant/plan/current
 * @desc Get current plan information
 */
router.get('/current', requireAuth, requireAdmin, asyncHandler(PlanManagementController.getCurrentPlan));

/**
 * @route GET /api/tenant/plan/resources-usage
 * @desc Get resources usage
 */
router.get('/resources-usage', requireAuth, requireAdmin, asyncHandler(PlanManagementController.getResourcesUsage));

/**
 * @route GET /api/tenant/plan/purchased-addons
 * @desc Get purchased add-ons for tenant
 */
router.get('/purchased-addons', requireAuth, requireAdmin, asyncHandler(PlanManagementController.getPurchasedAddons));

/**
 * @route GET /api/tenant/plan/available-addons
 * @desc Get available add-ons
 */
router.get('/available-addons', requireAuth, requireAdmin, asyncHandler(PlanManagementController.getAvailableAddons));

/**
 * @route POST /api/tenant/plan/checkout-addons
 * @desc Checkout add-ons
 */
router.post('/checkout-addons', requireAuth, requireAdmin, asyncHandler(PlanManagementController.checkoutAddons));

/**
 * @route GET /api/tenant/plan/system-addons
 * @desc Get system add-ons (Bio Link, etc.)
 */
router.get('/system-addons', requireAuth, requireAdmin, asyncHandler(PlanManagementController.getSystemAddons));

module.exports = router;
