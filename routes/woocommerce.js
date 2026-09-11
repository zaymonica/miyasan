/**
 * WooCommerce Routes - Multi-tenant
 * 
 * Handles WooCommerce integration endpoints with tenant isolation
 * 
 * @module routes/woocommerce
 */

const express = require('express');
const WooCommerceController = require('../controllers/WooCommerceController');
const WooCommerceNotificationController = require('../controllers/WooCommerceNotificationController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * @route POST /api/woocommerce/webhook/:tenantId
 * @desc Receive WooCommerce webhook (PUBLIC - verified by signature)
 * @access Public
 */
router.post('/woocommerce/webhook/:tenantId', WooCommerceNotificationController.handleWebhook);

// All other routes require authentication and are under /tenant/woocommerce
router.use('/tenant/woocommerce', requireAuth);

/**
 * @route GET /api/tenant/woocommerce/settings
 * @desc Get WooCommerce settings
 * @access Private (Tenant users)
 */
router.get('/tenant/woocommerce/settings', WooCommerceController.getSettings);

/**
 * @route POST /api/tenant/woocommerce/settings
 * @desc Save WooCommerce settings
 * @access Private (Tenant users)
 */
router.post('/tenant/woocommerce/settings', WooCommerceController.saveSettings);

/**
 * @route DELETE /api/tenant/woocommerce/settings
 * @desc Delete WooCommerce settings
 * @access Private (Tenant users)
 */
router.delete('/tenant/woocommerce/settings', WooCommerceController.deleteSettings);

/**
 * @route POST /api/tenant/woocommerce/test-connection
 * @desc Test WooCommerce connection
 * @access Private (Tenant users)
 */
router.post('/tenant/woocommerce/test-connection', WooCommerceController.testConnectionEndpoint);

/**
 * @route POST /api/tenant/woocommerce/sync-products
 * @desc Sync products from WooCommerce
 * @access Private (Tenant users)
 */
router.post('/tenant/woocommerce/sync-products', WooCommerceController.syncProducts);

/**
 * @route GET /api/tenant/woocommerce/products
 * @desc Get all products
 * @access Private (Tenant users)
 */
router.get('/tenant/woocommerce/products', WooCommerceController.getProducts);

/**
 * @route GET /api/tenant/woocommerce/products/:id
 * @desc Get single product
 * @access Private (Tenant users)
 */
router.get('/tenant/woocommerce/products/:id', WooCommerceController.getProduct);

/**
 * @route GET /api/tenant/woocommerce/notifications/settings
 * @desc Get notification settings
 * @access Private (Tenant users)
 */
router.get('/tenant/woocommerce/notifications/settings', WooCommerceNotificationController.getSettings);

/**
 * @route POST /api/tenant/woocommerce/notifications/settings
 * @desc Save notification settings
 * @access Private (Tenant users)
 */
router.post('/tenant/woocommerce/notifications/settings', WooCommerceNotificationController.saveSettings);

/**
 * @route POST /api/tenant/woocommerce/notifications/generate-secret
 * @desc Generate webhook secret
 * @access Private (Tenant users)
 */
router.post('/tenant/woocommerce/notifications/generate-secret', WooCommerceNotificationController.generateSecret);

/**
 * @route POST /api/tenant/woocommerce/notifications/test
 * @desc Test notification
 * @access Private (Tenant users)
 */
router.post('/tenant/woocommerce/notifications/test', WooCommerceNotificationController.testNotification);

module.exports = router;
