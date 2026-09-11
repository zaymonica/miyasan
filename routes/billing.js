/**
 * Billing Routes
 * 
 * Handles all billing and subscription related endpoints
 * Requires authentication for all routes except webhooks
 * 
 * @module routes/billing
 */

const express = require('express');
const router = express.Router();
const BillingController = require('../controllers/BillingController');
const { requireAuth } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');

/**
 * @swagger
 * tags:
 *   name: Billing
 *   description: Billing and subscription management
 */

/**
 * @swagger
 * /api/billing/plans:
 *   get:
 *     summary: Get available subscription plans
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of available plans
 *       401:
 *         description: Unauthorized
 */
router.get('/plans', requireAuth, tenantMiddleware, BillingController.getPlans);

/**
 * @swagger
 * /api/billing/subscribe:
 *   post:
 *     summary: Create a new subscription
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - planId
 *               - paymentMethodId
 *             properties:
 *               planId:
 *                 type: integer
 *               paymentMethodId:
 *                 type: string
 *               paymentGateway:
 *                 type: string
 *                 enum: [stripe, paypal]
 *                 default: stripe
 *     responses:
 *       200:
 *         description: Subscription created successfully
 *       400:
 *         description: Invalid input or already subscribed
 *       401:
 *         description: Unauthorized
 */
router.post('/subscribe', requireAuth, tenantMiddleware, BillingController.subscribe);

/**
 * @swagger
 * /api/billing/subscription:
 *   get:
 *     summary: Get current subscription details
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current subscription details
 *       404:
 *         description: No subscription found
 *       401:
 *         description: Unauthorized
 */
router.get('/subscription', requireAuth, tenantMiddleware, BillingController.getSubscription);

/**
 * @swagger
 * /api/billing/cancel:
 *   post:
 *     summary: Cancel subscription
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               immediately:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       200:
 *         description: Subscription canceled
 *       401:
 *         description: Unauthorized
 */
router.post('/cancel', requireAuth, tenantMiddleware, BillingController.cancelSubscription);

/**
 * @swagger
 * /api/billing/plan:
 *   put:
 *     summary: Update subscription plan
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - planId
 *             properties:
 *               planId:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Plan updated successfully
 *       400:
 *         description: Invalid plan ID
 *       401:
 *         description: Unauthorized
 */
router.put('/plan', requireAuth, tenantMiddleware, BillingController.updatePlan);

/**
 * @swagger
 * /api/billing/usage:
 *   get:
 *     summary: Get usage statistics
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: months
 *         schema:
 *           type: integer
 *           default: 6
 *         description: Number of months to retrieve
 *     responses:
 *       200:
 *         description: Usage statistics
 *       401:
 *         description: Unauthorized
 */
router.get('/usage', requireAuth, tenantMiddleware, BillingController.getUsage);

/**
 * @swagger
 * /api/billing/payments:
 *   get:
 *     summary: Get payment history
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Payment history
 *       401:
 *         description: Unauthorized
 */
router.get('/payments', requireAuth, tenantMiddleware, BillingController.getPayments);

/**
 * @swagger
 * /api/billing/invoice/{id}:
 *   get:
 *     summary: Get invoice by ID
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Invoice details
 *       404:
 *         description: Invoice not found
 *       401:
 *         description: Unauthorized
 */
router.get('/invoice/:id', requireAuth, tenantMiddleware, BillingController.getInvoice);

/**
 * @swagger
 * /api/billing/setup-intent:
 *   post:
 *     summary: Create Stripe setup intent for payment method
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Setup intent created
 *       401:
 *         description: Unauthorized
 */
router.post('/setup-intent', requireAuth, tenantMiddleware, BillingController.createSetupIntent);

/**
 * @swagger
 * /api/billing/webhook/stripe:
 *   post:
 *     summary: Stripe webhook endpoint
 *     tags: [Billing]
 *     description: Handles Stripe webhook events (no authentication required)
 *     responses:
 *       200:
 *         description: Webhook processed
 *       400:
 *         description: Invalid webhook
 */
router.post('/webhook/stripe', express.raw({ type: 'application/json' }), BillingController.stripeWebhook);

module.exports = router;
