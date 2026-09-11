/**
 * BillingController.js
 * 
 * Handles billing and subscription management endpoints
 * Manages Stripe/PayPal integrations, subscriptions, and usage tracking
 * 
 * @module controllers/BillingController
 */

const BaseController = require('./BaseController');
const BillingService = require('../services/BillingService');
const { pool } = require('../config/database');
const logger = require('../config/logger');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

class BillingController extends BaseController {
  /**
   * Create a new subscription
   * POST /api/billing/subscribe
   */
  static async subscribe(req, res) {
    const connection = await pool.getConnection();
    
    try {
      const { planId, paymentMethodId, paymentGateway = 'stripe' } = req.body;
      const tenantId = req.user.tenantId;

      // Validate input
      if (!planId || !paymentMethodId) {
        return res.status(400).json({
          success: false,
          message: req.t('validation.required_fields')
        });
      }

      // Check if tenant already has active subscription
      const [existing] = await connection.query(
        `SELECT * FROM subscriptions 
         WHERE tenant_id = ? AND status IN ('active', 'trialing')`,
        [tenantId]
      );

      if (existing.length) {
        return res.status(400).json({
          success: false,
          message: req.t('billing.already_subscribed')
        });
      }

      // Create subscription based on gateway
      let result;
      if (paymentGateway === 'stripe') {
        result = await BillingService.createStripeSubscription(
          tenantId,
          planId,
          paymentMethodId
        );
      } else {
        return res.status(400).json({
          success: false,
          message: req.t('billing.invalid_gateway')
        });
      }

      logger.info(`Subscription created for tenant ${tenantId}`);

      res.json({
        success: true,
        message: req.t('billing.subscription_created'),
        data: result
      });
    } catch (error) {
      logger.error('Error creating subscription:', error);
      res.status(500).json({
        success: false,
        message: req.t('errors.internal_server_error'),
        error: error.message
      });
    } finally {
      connection.release();
    }
  }

  /**
   * Cancel subscription
   * POST /api/billing/cancel
   */
  static async cancelSubscription(req, res) {
    try {
      const { immediately = false } = req.body;
      const tenantId = req.user.tenantId;

      const result = await BillingService.cancelStripeSubscription(
        tenantId,
        immediately
      );

      logger.info(`Subscription canceled for tenant ${tenantId}`);

      res.json({
        success: true,
        message: req.t('billing.subscription_canceled'),
        data: result
      });
    } catch (error) {
      logger.error('Error canceling subscription:', error);
      res.status(500).json({
        success: false,
        message: req.t('errors.internal_server_error'),
        error: error.message
      });
    }
  }

  /**
   * Update subscription plan
   * PUT /api/billing/plan
   */
  static async updatePlan(req, res) {
    try {
      const { planId } = req.body;
      const tenantId = req.user.tenantId;

      if (!planId) {
        return res.status(400).json({
          success: false,
          message: req.t('validation.required_fields')
        });
      }

      const result = await BillingService.updateSubscriptionPlan(
        tenantId,
        planId
      );

      logger.info(`Subscription plan updated for tenant ${tenantId}`);

      res.json({
        success: true,
        message: req.t('billing.plan_updated'),
        data: result
      });
    } catch (error) {
      logger.error('Error updating plan:', error);
      res.status(500).json({
        success: false,
        message: req.t('errors.internal_server_error'),
        error: error.message
      });
    }
  }

  /**
   * Get current subscription details
   * GET /api/billing/subscription
   */
  static async getSubscription(req, res) {
    const connection = await pool.getConnection();
    
    try {
      const tenantId = req.user.tenantId;

      const [subscriptions] = await connection.query(
        `SELECT s.*, sp.name as plan_name, sp.price, sp.currency, 
                sp.max_messages_per_month, sp.max_users, sp.features
         FROM subscriptions s
         JOIN subscription_plans sp ON s.plan_id = sp.id
         WHERE s.tenant_id = ?
         ORDER BY s.created_at DESC
         LIMIT 1`,
        [tenantId]
      );

      if (!subscriptions.length) {
        return res.status(404).json({
          success: false,
          message: req.t('billing.no_subscription')
        });
      }

      const subscription = subscriptions[0];
      
      // Parse features if stored as JSON
      if (subscription.features && typeof subscription.features === 'string') {
        subscription.features = JSON.parse(subscription.features);
      }

      res.json({
        success: true,
        data: subscription
      });
    } catch (error) {
      logger.error('Error getting subscription:', error);
      res.status(500).json({
        success: false,
        message: req.t('errors.internal_server_error'),
        error: error.message
      });
    } finally {
      connection.release();
    }
  }

  /**
   * Get usage statistics
   * GET /api/billing/usage
   */
  static async getUsage(req, res) {
    try {
      const tenantId = req.user.tenantId;
      const { months = 6 } = req.query;

      const stats = await BillingService.getUsageStats(tenantId, parseInt(months));
      const current = await BillingService.trackMessageUsage(tenantId, 0);

      res.json({
        success: true,
        data: {
          current: current,
          history: stats
        }
      });
    } catch (error) {
      logger.error('Error getting usage:', error);
      res.status(500).json({
        success: false,
        message: req.t('errors.internal_server_error'),
        error: error.message
      });
    }
  }

  /**
   * Get payment history
   * GET /api/billing/payments
   */
  static async getPayments(req, res) {
    const connection = await pool.getConnection();
    
    try {
      const tenantId = req.user.tenantId;
      const { page = 1, limit = 20 } = req.query;
      const offset = (page - 1) * limit;

      const [payments] = await connection.query(
        `SELECT p.*, sp.name as plan_name
         FROM payments p
         LEFT JOIN subscriptions s ON p.subscription_id = s.id
         LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
         WHERE p.tenant_id = ?
         ORDER BY p.created_at DESC
         LIMIT ? OFFSET ?`,
        [tenantId, parseInt(limit), offset]
      );

      const [countResult] = await connection.query(
        'SELECT COUNT(*) as total FROM payments WHERE tenant_id = ?',
        [tenantId]
      );

      res.json({
        success: true,
        data: payments,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: countResult[0].total,
          pages: Math.ceil(countResult[0].total / limit)
        }
      });
    } catch (error) {
      logger.error('Error getting payments:', error);
      res.status(500).json({
        success: false,
        message: req.t('errors.internal_server_error'),
        error: error.message
      });
    } finally {
      connection.release();
    }
  }

  /**
   * Get available plans
   * GET /api/billing/plans
   */
  static async getPlans(req, res) {
    const connection = await pool.getConnection();
    
    try {
      const [plans] = await connection.query(
        `SELECT * FROM subscription_plans 
         WHERE is_active = 1
         ORDER BY price ASC`
      );

      // Parse features JSON
      plans.forEach(plan => {
        if (plan.features && typeof plan.features === 'string') {
          plan.features = JSON.parse(plan.features);
        }
      });

      res.json({
        success: true,
        data: plans
      });
    } catch (error) {
      logger.error('Error getting plans:', error);
      res.status(500).json({
        success: false,
        message: req.t('errors.internal_server_error'),
        error: error.message
      });
    } finally {
      connection.release();
    }
  }

  /**
   * Create Stripe setup intent for payment method
   * POST /api/billing/setup-intent
   */
  static async createSetupIntent(req, res) {
    const connection = await pool.getConnection();
    
    try {
      const tenantId = req.user.tenantId;

      // Get tenant details
      const [tenants] = await connection.query(
        'SELECT * FROM tenants WHERE id = ?',
        [tenantId]
      );

      if (!tenants.length) {
        return res.status(404).json({
          success: false,
          message: req.t('errors.tenant_not_found')
        });
      }

      const tenant = tenants[0];

      // Get or create Stripe customer
      let customerId = tenant.stripe_customer_id;
      
      if (!customerId) {
        const customer = await BillingService.createStripeCustomer(tenant);
        customerId = customer.id;
        
        await connection.query(
          'UPDATE tenants SET stripe_customer_id = ? WHERE id = ?',
          [customerId, tenantId]
        );
      }

      // Create setup intent
      const setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ['card']
      });

      res.json({
        success: true,
        data: {
          clientSecret: setupIntent.client_secret
        }
      });
    } catch (error) {
      logger.error('Error creating setup intent:', error);
      res.status(500).json({
        success: false,
        message: req.t('errors.internal_server_error'),
        error: error.message
      });
    } finally {
      connection.release();
    }
  }

  /**
   * Handle Stripe webhook
   * POST /api/billing/webhook/stripe
   */
  static async stripeWebhook(req, res) {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    try {
      // Verify webhook signature
      const event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        webhookSecret
      );

      // Handle the event
      await BillingService.handleStripeWebhook(event);

      res.json({ received: true });
    } catch (error) {
      logger.error('Stripe webhook error:', error);
      res.status(400).json({
        success: false,
        message: `Webhook Error: ${error.message}`
      });
    }
  }

  /**
   * Get invoice by ID
   * GET /api/billing/invoice/:id
   */
  static async getInvoice(req, res) {
    const connection = await pool.getConnection();
    
    try {
      const { id } = req.params;
      const tenantId = req.user.tenantId;

      const [payments] = await connection.query(
        `SELECT p.*, sp.name as plan_name, t.company_name, t.email
         FROM payments p
         LEFT JOIN subscriptions s ON p.subscription_id = s.id
         LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
         LEFT JOIN tenants t ON p.tenant_id = t.id
         WHERE p.id = ? AND p.tenant_id = ?`,
        [id, tenantId]
      );

      if (!payments.length) {
        return res.status(404).json({
          success: false,
          message: req.t('billing.invoice_not_found')
        });
      }

      res.json({
        success: true,
        data: payments[0]
      });
    } catch (error) {
      logger.error('Error getting invoice:', error);
      res.status(500).json({
        success: false,
        message: req.t('errors.internal_server_error'),
        error: error.message
      });
    } finally {
      connection.release();
    }
  }
}

module.exports = BillingController;

