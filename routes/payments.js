/**
 * Payment Routes - Multi-tenant Payment Management
 * Handles payment method configuration and payment link generation
 */

const express = require('express');
const router = express.Router();
const PaymentController = require('../controllers/PaymentController');

// Note: Authentication (requireAuth) and tenant middleware are applied in server.js

/**
 * @route GET /api/tenant/payments/methods
 * @desc Get payment methods for tenant
 * @access Private (Tenant)
 */
router.get('/methods', (req, res) => PaymentController.getPaymentMethods(req, res));

/**
 * @route POST /api/tenant/payments/methods
 * @desc Configure payment method
 * @access Private (Tenant)
 */
router.post('/methods', (req, res) => PaymentController.configurePaymentMethod(req, res));

/**
 * @route PATCH /api/tenant/payments/methods/:id/toggle
 * @desc Toggle payment method active status
 * @access Private (Tenant)
 */
router.patch('/methods/:id/toggle', (req, res) => PaymentController.togglePaymentMethod(req, res));

/**
 * @route POST /api/tenant/payments/create-link
 * @desc Create payment link
 * @access Private (Tenant)
 */
router.post('/create-link', (req, res) => PaymentController.createPaymentLink(req, res));

/**
 * @route GET /api/tenant/payments/links
 * @desc List payment links with pagination and filters
 * @access Private (Tenant)
 */
router.get('/links', (req, res) => PaymentController.listPaymentLinks(req, res));

/**
 * @route GET /api/tenant/payments/links/:id/status
 * @desc Check payment status
 * @access Private (Tenant)
 */
router.get('/links/:id/status', (req, res) => PaymentController.checkPaymentStatus(req, res));

/**
 * @route GET /api/tenant/payments/stats
 * @desc Get payment statistics
 * @access Private (Tenant)
 */
router.get('/stats', (req, res) => PaymentController.getPaymentStats(req, res));

module.exports = router;
