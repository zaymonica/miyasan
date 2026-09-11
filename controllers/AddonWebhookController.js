/**
 * Addon Webhook Controller
 * Handles webhooks from payment gateways for add-on purchases
 */

const BaseController = require('./BaseController');
const { pool } = require('../config/database');
const { logger } = require('../config/logger');

class AddonWebhookController extends BaseController {
  /**
   * Handle Stripe webhook for add-ons
   * POST /api/webhooks/stripe-addons
   */
  static async handleStripeWebhook(req, res) {
    try {
      console.log('🔔 Stripe webhook received');
      const sig = req.headers['stripe-signature'];

      // Get Stripe settings from payment_gateway_settings
      const [stripeSettings] = await pool.execute(
        "SELECT stripe_webhook_secret, stripe_secret_key FROM payment_gateway_settings WHERE gateway_name = 'stripe'"
      );

      if (stripeSettings.length === 0 || !stripeSettings[0].stripe_secret_key) {
        console.log('❌ Stripe not configured');
        return res.status(400).json({ success: false, message: 'Stripe not configured' });
      }

      const webhookSecret = stripeSettings[0].stripe_webhook_secret;
      const stripe = require('stripe')(stripeSettings[0].stripe_secret_key);

      let event;

      try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
        console.log('✅ Webhook signature verified, event type:', event.type);
      } catch (err) {
        console.error('❌ Stripe webhook signature verification failed:', err.message);
        logger.error('Stripe webhook signature verification failed', { error: err.message });
        return res.status(400).json({ success: false, message: 'Webhook signature verification failed' });
      }

      // Handle the event
      console.log('🔄 Processing event:', event.type);
      switch (event.type) {
        case 'checkout.session.completed':
          console.log('💳 Checkout session completed');
          await AddonWebhookController.handleStripeCheckoutCompleted(event.data.object);
          break;
        case 'customer.subscription.created':
          console.log('📝 Subscription created');
          await AddonWebhookController.handleStripeSubscriptionCreated(event.data.object);
          break;
        case 'customer.subscription.updated':
          console.log('🔄 Subscription updated');
          await AddonWebhookController.handleStripeSubscriptionUpdated(event.data.object);
          break;
        case 'customer.subscription.deleted':
          console.log('❌ Subscription deleted');
          await AddonWebhookController.handleStripeSubscriptionDeleted(event.data.object);
          break;
        default:
          console.log('ℹ️ Unhandled event type:', event.type);
          logger.info('Unhandled Stripe event type', { type: event.type });
      }

      return res.json({ success: true, received: true });
    } catch (error) {
      console.error('❌ Stripe webhook error:', error);
      logger.error('Stripe webhook error', { error: error.message });
      return res.status(500).json({ success: false, message: 'Webhook processing failed' });
    }
  }

  /**
   * Handle Stripe checkout completed
   */
  static async handleStripeCheckoutCompleted(session) {
    try {
      console.log('🔍 Processing checkout session:', session.id);
      console.log('📋 Session metadata:', JSON.stringify(session.metadata, null, 2));
      
      const metadata = session.metadata;
      
      if (metadata.type !== 'addon') {
        console.log('ℹ️ Not an addon purchase, skipping');
        return; // Not an addon purchase
      }

      const purchaseId = metadata.purchase_id;
      const tenantId = metadata.tenant_id;

      console.log('🔍 Looking for purchase:', purchaseId);

      // Get purchase details
      const [purchases] = await pool.execute(
        'SELECT * FROM addon_purchases WHERE id = ?',
        [purchaseId]
      );

      if (purchases.length === 0) {
        console.error('❌ Purchase not found:', purchaseId);
        logger.error('Purchase not found', { purchaseId });
        return;
      }

      const purchase = purchases[0];
      console.log('📦 Purchase found:', { id: purchase.id, status: purchase.status });
      
      const items = JSON.parse(purchase.items);
      console.log('📋 Items to activate:', items);

      // Update purchase status
      await pool.execute(
        'UPDATE addon_purchases SET status = ?, payment_id = ?, updated_at = NOW() WHERE id = ?',
        ['completed', session.id, purchaseId]
      );
      console.log('✅ Purchase status updated to completed');

      // Activate resources
      console.log('🚀 Activating resources for tenant:', tenantId);
      await AddonWebhookController.activateAddonResources(tenantId, items);
      console.log('✅ Resources activated successfully');

      logger.info('Stripe addon purchase completed', { purchaseId, tenantId });
    } catch (error) {
      console.error('❌ Error handling Stripe checkout completed:', error);
      logger.error('Error handling Stripe checkout completed', { error: error.message });
    }
  }

  /**
   * Handle Stripe subscription created
   */
  static async handleStripeSubscriptionCreated(subscription) {
    try {
      // Additional subscription handling if needed
      logger.info('Stripe subscription created', { subscriptionId: subscription.id });
    } catch (error) {
      logger.error('Error handling Stripe subscription created', { error: error.message });
    }
  }

  /**
   * Handle Stripe subscription updated
   */
  static async handleStripeSubscriptionUpdated(subscription) {
    try {
      // Handle subscription updates (e.g., quantity changes)
      logger.info('Stripe subscription updated', { subscriptionId: subscription.id });
    } catch (error) {
      logger.error('Error handling Stripe subscription updated', { error: error.message });
    }
  }

  /**
   * Handle Stripe subscription deleted
   */
  static async handleStripeSubscriptionDeleted(subscription) {
    try {
      // Handle subscription cancellation
      logger.info('Stripe subscription deleted', { subscriptionId: subscription.id });
    } catch (error) {
      logger.error('Error handling Stripe subscription deleted', { error: error.message });
    }
  }

  /**
   * Handle PayPal webhook for add-ons
   * POST /api/webhooks/paypal-addons
   */
  static async handlePayPalWebhook(req, res) {
    try {
      const webhookEvent = req.body;

      // Verify webhook signature (implement PayPal webhook verification)
      // For now, we'll process the event

      const eventType = webhookEvent.event_type;

      switch (eventType) {
        case 'PAYMENT.CAPTURE.COMPLETED':
          await this.handlePayPalPaymentCompleted(webhookEvent.resource);
          break;
        case 'BILLING.SUBSCRIPTION.CREATED':
          await this.handlePayPalSubscriptionCreated(webhookEvent.resource);
          break;
        case 'BILLING.SUBSCRIPTION.CANCELLED':
          await this.handlePayPalSubscriptionCancelled(webhookEvent.resource);
          break;
        default:
          logger.info('Unhandled PayPal event type', { type: eventType });
      }

      return res.json({ success: true, received: true });
    } catch (error) {
      logger.error('PayPal webhook error', { error: error.message });
      return res.status(500).json({ success: false, message: 'Webhook processing failed' });
    }
  }

  /**
   * Handle PayPal payment completed
   */
  static async handlePayPalPaymentCompleted(payment) {
    try {
      const orderId = payment.supplementary_data?.related_ids?.order_id;

      if (!orderId) {
        logger.error('Order ID not found in PayPal payment');
        return;
      }

      // Find purchase by payment ID
      const [purchases] = await pool.execute(
        'SELECT * FROM addon_purchases WHERE payment_id = ?',
        [orderId]
      );

      if (purchases.length === 0) {
        logger.error('Purchase not found for PayPal order', { orderId });
        return;
      }

      const purchase = purchases[0];
      const items = JSON.parse(purchase.items);

      // Update purchase status
      await pool.execute(
        'UPDATE addon_purchases SET status = ?, updated_at = NOW() WHERE id = ?',
        ['completed', purchase.id]
      );

      // Activate resources
      await AddonWebhookController.activateAddonResources(purchase.tenant_id, items);

      logger.info('PayPal addon purchase completed', { purchaseId: purchase.id, tenantId: purchase.tenant_id });
    } catch (error) {
      logger.error('Error handling PayPal payment completed', { error: error.message });
    }
  }

  /**
   * Handle PayPal subscription created
   */
  static async handlePayPalSubscriptionCreated(subscription) {
    try {
      logger.info('PayPal subscription created', { subscriptionId: subscription.id });
    } catch (error) {
      logger.error('Error handling PayPal subscription created', { error: error.message });
    }
  }

  /**
   * Handle PayPal subscription cancelled
   */
  static async handlePayPalSubscriptionCancelled(subscription) {
    try {
      logger.info('PayPal subscription cancelled', { subscriptionId: subscription.id });
    } catch (error) {
      logger.error('Error handling PayPal subscription cancelled', { error: error.message });
    }
  }

  /**
   * Activate addon resources for tenant
   */
  static async activateAddonResources(tenantId, items) {
    try {
      const connection = await pool.getConnection();
      await connection.beginTransaction();

      try {
        for (const item of items) {
          // Get addon details
          const [addons] = await connection.execute(
            'SELECT * FROM plan_addons WHERE id = ?',
            [item.addon_id]
          );

          if (addons.length === 0) {
            logger.error('Addon not found', { addonId: item.addon_id });
            continue;
          }

          const addon = addons[0];

          // Insert or update tenant_addons
          await connection.execute(
            `INSERT INTO tenant_addons (tenant_id, addon_id, quantity, status, started_at)
             VALUES (?, ?, ?, 'active', NOW())
             ON DUPLICATE KEY UPDATE 
               quantity = quantity + VALUES(quantity),
               status = 'active',
               updated_at = NOW()`,
            [tenantId, item.addon_id, item.quantity]
          );

          // Update tenant limits based on resource type
          const resourceKey = addon.resource_key;
          const quantity = item.quantity;

          switch (resourceKey) {
            case 'stores':
              await connection.execute(
                'UPDATE tenants SET max_stores = max_stores + ? WHERE id = ?',
                [quantity, tenantId]
              );
              break;
            case 'departments':
              await connection.execute(
                'UPDATE tenants SET max_departments = max_departments + ? WHERE id = ?',
                [quantity, tenantId]
              );
              break;
            case 'users':
              await connection.execute(
                'UPDATE tenants SET max_users = max_users + ? WHERE id = ?',
                [quantity, tenantId]
              );
              break;
            case 'conversations':
              await connection.execute(
                'UPDATE tenants SET max_conversations = max_conversations + ? WHERE id = ?',
                [quantity * 100, tenantId] // 100 conversations per unit
              );
              break;
            case 'messages':
              await connection.execute(
                'UPDATE tenants SET max_messages_per_month = max_messages_per_month + ? WHERE id = ?',
                [quantity * 1000, tenantId] // 1000 messages per unit
              );
              break;
            case 'contacts':
              await connection.execute(
                'UPDATE tenants SET max_contacts = max_contacts + ? WHERE id = ?',
                [quantity * 100, tenantId] // 100 contacts per unit
              );
              break;
            case 'faq':
              await connection.execute(
                'UPDATE tenants SET max_faqs = max_faqs + ? WHERE id = ?',
                [quantity * 10, tenantId] // 10 FAQs per unit
              );
              break;
            case 'widget':
              // Enable widgets and increase limit
              await connection.execute(
                `UPDATE tenants SET 
                  max_widgets = max_widgets + ?,
                  settings = JSON_SET(COALESCE(settings, '{}'), '$.widgets_enabled', true)
                WHERE id = ?`,
                [quantity, tenantId]
              );
              break;
            case 'invoice':
              // Enable invoices/quotes and increase limits
              await connection.execute(
                `UPDATE tenants SET 
                  max_invoices_per_month = max_invoices_per_month + ?,
                  max_quotes_per_month = max_quotes_per_month + ?,
                  settings = JSON_SET(
                    JSON_SET(COALESCE(settings, '{}'), '$.invoices_enabled', true),
                    '$.quotes_enabled', true
                  )
                WHERE id = ?`,
                [quantity * 50, quantity * 50, tenantId] // 50 invoices/quotes per unit
              );
              break;
            case 'ai':
              // Enable AI feature
              await connection.execute(
                `UPDATE tenants SET 
                  settings = JSON_SET(COALESCE(settings, '{}'), '$.ai_enabled', true)
                WHERE id = ?`,
                [tenantId]
              );
              break;
            case 'woocommerce':
              // Enable WooCommerce feature
              await connection.execute(
                `UPDATE tenants SET 
                  settings = JSON_SET(COALESCE(settings, '{}'), '$.woocommerce_enabled', true)
                WHERE id = ?`,
                [tenantId]
              );
              break;
            case 'payment_links':
              // Enable payment links and increase limit
              await connection.execute(
                `UPDATE tenants SET 
                  max_payment_links_per_month = max_payment_links_per_month + ?,
                  settings = JSON_SET(COALESCE(settings, '{}'), '$.payment_links_enabled', true)
                WHERE id = ?`,
                [quantity * 50, tenantId] // 50 payment links per unit
              );
              break;
            default:
              logger.warn('Unknown resource key', { resourceKey });
          }
        }

        await connection.commit();
        logger.info('Addon resources activated', { tenantId, itemCount: items.length });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      logger.error('Error activating addon resources', { error: error.message, tenantId });
      throw error;
    }
  }

  /**
   * Get all addon purchases (for superadmin)
   * GET /api/superadmin/addon-purchases
   */
  static async getAddonPurchases(req, res) {
    // Set JSON content type at the very beginning
    res.setHeader('Content-Type', 'application/json');
    
    try {
      logger.info('📦 getAddonPurchases called', { query: req.query, user: req.user });
      
      const { page = 1, limit = 20, status, tenant_id } = req.query;
      const offset = (page - 1) * limit;

      // First, check if table exists
      try {
        await pool.execute('SELECT 1 FROM addon_purchases LIMIT 1');
        logger.info('✅ addon_purchases table exists');
      } catch (tableError) {
        logger.error('❌ addon_purchases table does not exist', { error: tableError.message });
        return res.status(500).json({
          success: false,
          message: 'Database table not found. Please run migrations.',
          error: 'addon_purchases table does not exist'
        });
      }

      let query = `
        SELECT 
          ap.*,
          t.name as tenant_name,
          t.email as tenant_email
        FROM addon_purchases ap
        LEFT JOIN tenants t ON ap.tenant_id = t.id
        WHERE 1=1
      `;
      const params = [];

      if (status) {
        query += ' AND ap.status = ?';
        params.push(status);
      }

      if (tenant_id) {
        query += ' AND ap.tenant_id = ?';
        params.push(tenant_id);
      }

      query += ' ORDER BY ap.created_at DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit), parseInt(offset));

      logger.info('🔍 Executing query', { query: query.substring(0, 100) + '...', paramsCount: params.length });
      const [purchases] = await pool.execute(query, params);
      logger.info('✅ Purchases found', { count: purchases.length });

      // Get total count
      let countQuery = 'SELECT COUNT(*) as total FROM addon_purchases WHERE 1=1';
      const countParams = [];

      if (status) {
        countQuery += ' AND status = ?';
        countParams.push(status);
      }

      if (tenant_id) {
        countQuery += ' AND tenant_id = ?';
        countParams.push(tenant_id);
      }

      const [countResult] = await pool.execute(countQuery, countParams);
      const total = countResult[0].total;

      const response = {
        success: true,
        data: {
          purchases: purchases.map(p => ({
            ...p,
            items: typeof p.items === 'string' ? JSON.parse(p.items) : p.items
          })),
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
          }
        }
      };

      logger.info('📤 Sending response', { purchasesCount: purchases.length, total });
      return res.json(response);
    } catch (error) {
      // Ensure JSON response even on error
      res.setHeader('Content-Type', 'application/json');
      
      // Safe error logging
      const errorMessage = error && error.message ? error.message : 'Unknown error';
      const errorStack = error && error.stack ? error.stack : '';
      
      try {
        logger.error('❌ Error getting addon purchases', { 
          error: errorMessage, 
          stack: errorStack,
          query: req.query 
        });
      } catch (logError) {
        // If logger fails, use console as fallback
        console.error('Logger error:', logError);
        console.error('Original error:', errorMessage);
      }
      
      return res.status(500).json({
        success: false,
        message: 'Error loading addon purchases',
        error: errorMessage
      });
    }
  }

  /**
   * Manual approval for cash/transfer payments
   * POST /api/superadmin/addon-purchases/:id/approve
   */
  static async approveManualPayment(req, res) {
    // Set JSON content type at the very beginning
    res.setHeader('Content-Type', 'application/json');
    
    try {
      const purchaseId = req.params.id;
      
      console.log('🔍 Approving purchase:', purchaseId);

      // Get purchase details
      const [purchases] = await pool.execute(
        'SELECT * FROM addon_purchases WHERE id = ?',
        [purchaseId]
      );

      if (purchases.length === 0) {
        console.log('❌ Purchase not found:', purchaseId);
        return res.status(404).json({
          success: false,
          message: 'Purchase not found'
        });
      }

      const purchase = purchases[0];
      console.log('📦 Purchase found:', { id: purchase.id, status: purchase.status, tenant_id: purchase.tenant_id });
      
      const items = JSON.parse(purchase.items);
      console.log('📋 Items to activate:', items);

      // Update purchase status
      await pool.execute(
        'UPDATE addon_purchases SET status = ?, updated_at = NOW() WHERE id = ?',
        ['completed', purchaseId]
      );
      console.log('✅ Purchase status updated to completed');

      // Activate resources
      console.log('🚀 Activating resources for tenant:', purchase.tenant_id);
      await AddonWebhookController.activateAddonResources(purchase.tenant_id, items);
      console.log('✅ Resources activated successfully');

      return res.json({
        success: true,
        message: 'Payment approved and resources activated'
      });
    } catch (error) {
      // Ensure JSON response even on error
      res.setHeader('Content-Type', 'application/json');
      
      // Safe error logging
      const errorMessage = error && error.message ? error.message : 'Unknown error';
      const errorStack = error && error.stack ? error.stack : 'No stack trace';
      
      console.error('❌ Error approving manual payment:', errorMessage);
      console.error('Stack:', errorStack);
      
      try {
        logger.error('Error approving manual payment', { error: errorMessage, stack: errorStack });
      } catch (logError) {
        console.error('Logger error:', logError);
      }
      
      return res.status(500).json({
        success: false,
        message: 'Error approving payment',
        error: errorMessage
      });
    }
  }
}

module.exports = AddonWebhookController;
