/**
 * BillingService.js
 * 
 * Handles all billing operations for the SaaS platform
 * Supports Stripe and PayPal payment gateways
 * Manages subscriptions, usage tracking, and payment webhooks
 * 
 * @module services/BillingService
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const paypal = require('@paypal/checkout-server-sdk');
const { pool } = require('../config/database');
const { logger } = require('../config/logger');
const GracePeriodService = require('./GracePeriodService');

/**
 * PayPal Environment Configuration
 */
const paypalEnvironment = () => {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  
  if (process.env.PAYPAL_MODE === 'live') {
    return new paypal.core.LiveEnvironment(clientId, clientSecret);
  }
  return new paypal.core.SandboxEnvironment(clientId, clientSecret);
};

const paypalClient = new paypal.core.PayPalHttpClient(paypalEnvironment());

class BillingService {
  /**
   * Create a Stripe customer for a tenant
   * @param {Object} tenantData - Tenant information
   * @returns {Promise<Object>} Stripe customer object
   */
  static async createStripeCustomer(tenantData) {
    try {
      const customer = await stripe.customers.create({
        email: tenantData.email,
        name: tenantData.company_name,
        metadata: {
          tenant_id: tenantData.id,
          subdomain: tenantData.subdomain
        }
      });

      logger.info(`Stripe customer created: ${customer.id} for tenant ${tenantData.id}`);
      return customer;
    } catch (error) {
      logger.error('Error creating Stripe customer:', error);
      throw new Error('Failed to create Stripe customer');
    }
  }

  /**
   * Create a Stripe subscription
   * @param {number} tenantId - Tenant ID
   * @param {number} planId - Subscription plan ID
   * @param {string} paymentMethodId - Stripe payment method ID
   * @returns {Promise<Object>} Subscription details
   */
  static async createStripeSubscription(tenantId, planId, paymentMethodId) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      // Get tenant and plan details
      const [tenants] = await connection.query(
        'SELECT * FROM tenants WHERE id = ?',
        [tenantId]
      );
      
      const [plans] = await connection.query(
        'SELECT * FROM subscription_plans WHERE id = ? AND active = 1',
        [planId]
      );

      if (!tenants.length || !plans.length) {
        throw new Error('Tenant or plan not found');
      }

      const tenant = tenants[0];
      const plan = plans[0];

      // Create or get Stripe customer
      let stripeCustomerId = tenant.stripe_customer_id;
      
      if (!stripeCustomerId) {
        const customer = await this.createStripeCustomer(tenant);
        stripeCustomerId = customer.id;
        
        await connection.query(
          'UPDATE tenants SET stripe_customer_id = ? WHERE id = ?',
          [stripeCustomerId, tenantId]
        );
      }

      // Attach payment method to customer
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: stripeCustomerId
      });

      // Set as default payment method
      await stripe.customers.update(stripeCustomerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId
        }
      });

      // Create Stripe subscription
      const subscription = await stripe.subscriptions.create({
        customer: stripeCustomerId,
        items: [{ price: plan.stripe_price_id }],
        metadata: {
          tenant_id: tenantId,
          plan_id: planId
        },
        expand: ['latest_invoice.payment_intent']
      });

      // Calculate subscription dates
      const startDate = new Date(subscription.current_period_start * 1000);
      const endDate = new Date(subscription.current_period_end * 1000);

      // Save subscription to database
      await connection.query(
        `INSERT INTO subscriptions 
        (tenant_id, plan_id, stripe_subscription_id, status, current_period_start, 
         current_period_end, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [tenantId, planId, subscription.id, subscription.status, startDate, endDate]
      );

      // Update tenant status and set grace period
      await connection.query(
        'UPDATE tenants SET status = ?, subscription_end_date = ?, updated_at = NOW() WHERE id = ?',
        ['active', endDate, tenantId]
      );

      // Set grace period (7 days after subscription end)
      await GracePeriodService.setGracePeriodForSubscription(tenantId, endDate);

      await connection.commit();

      logger.info(`Stripe subscription created: ${subscription.id} for tenant ${tenantId}`);
      
      return {
        subscriptionId: subscription.id,
        status: subscription.status,
        currentPeriodStart: startDate,
        currentPeriodEnd: endDate,
        clientSecret: subscription.latest_invoice.payment_intent.client_secret
      };
    } catch (error) {
      await connection.rollback();
      logger.error('Error creating Stripe subscription:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Cancel a Stripe subscription
   * @param {number} tenantId - Tenant ID
   * @param {boolean} immediately - Cancel immediately or at period end
   * @returns {Promise<Object>} Cancellation result
   */
  static async cancelStripeSubscription(tenantId, immediately = false) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      // Get active subscription
      const [subscriptions] = await connection.query(
        `SELECT * FROM subscriptions 
         WHERE tenant_id = ? AND status IN ('active', 'trialing')
         ORDER BY created_at DESC LIMIT 1`,
        [tenantId]
      );

      if (!subscriptions.length) {
        throw new Error('No active subscription found');
      }

      const subscription = subscriptions[0];

      // Cancel in Stripe
      const canceledSubscription = await stripe.subscriptions.update(
        subscription.stripe_subscription_id,
        { cancel_at_period_end: !immediately }
      );

      if (immediately) {
        await stripe.subscriptions.cancel(subscription.stripe_subscription_id);
      }

      // Update database
      const newStatus = immediately ? 'canceled' : 'canceling';
      await connection.query(
        'UPDATE subscriptions SET status = ?, updated_at = NOW() WHERE id = ?',
        [newStatus, subscription.id]
      );

      if (immediately) {
        await connection.query(
          'UPDATE tenants SET status = ?, updated_at = NOW() WHERE id = ?',
          ['suspended', tenantId]
        );
      }

      await connection.commit();

      logger.info(`Subscription canceled for tenant ${tenantId}, immediately: ${immediately}`);
      
      return {
        success: true,
        canceledAt: immediately ? new Date() : new Date(canceledSubscription.current_period_end * 1000)
      };
    } catch (error) {
      await connection.rollback();
      logger.error('Error canceling subscription:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Update subscription plan
   * @param {number} tenantId - Tenant ID
   * @param {number} newPlanId - New plan ID
   * @returns {Promise<Object>} Updated subscription
   */
  static async updateSubscriptionPlan(tenantId, newPlanId) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      // Get current subscription
      const [subscriptions] = await connection.query(
        `SELECT s.*, sp.stripe_price_id as current_price_id
         FROM subscriptions s
         JOIN subscription_plans sp ON s.plan_id = sp.id
         WHERE s.tenant_id = ? AND s.status = 'active'
         ORDER BY s.created_at DESC LIMIT 1`,
        [tenantId]
      );

      if (!subscriptions.length) {
        throw new Error('No active subscription found');
      }

      const currentSubscription = subscriptions[0];

      // Get new plan
      const [plans] = await connection.query(
        'SELECT * FROM subscription_plans WHERE id = ? AND active = 1',
        [newPlanId]
      );

      if (!plans.length) {
        throw new Error('New plan not found');
      }

      const newPlan = plans[0];

      // Update in Stripe
      const stripeSubscription = await stripe.subscriptions.retrieve(
        currentSubscription.stripe_subscription_id
      );

      const updatedSubscription = await stripe.subscriptions.update(
        currentSubscription.stripe_subscription_id,
        {
          items: [{
            id: stripeSubscription.items.data[0].id,
            price: newPlan.stripe_price_id
          }],
          proration_behavior: 'create_prorations'
        }
      );

      // Update database
      await connection.query(
        'UPDATE subscriptions SET plan_id = ?, updated_at = NOW() WHERE id = ?',
        [newPlanId, currentSubscription.id]
      );

      await connection.commit();

      logger.info(`Subscription updated for tenant ${tenantId} to plan ${newPlanId}`);
      
      return {
        success: true,
        subscription: updatedSubscription
      };
    } catch (error) {
      await connection.rollback();
      logger.error('Error updating subscription:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Handle Stripe webhook events
   * @param {Object} event - Stripe webhook event
   * @returns {Promise<void>}
   */
  static async handleStripeWebhook(event) {
    const connection = await pool.getConnection();
    
    try {
      switch (event.type) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdate(event.data.object, connection);
          break;

        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(event.data.object, connection);
          break;

        case 'invoice.payment_succeeded':
          await this.handlePaymentSucceeded(event.data.object, connection);
          break;

        case 'invoice.payment_failed':
          await this.handlePaymentFailed(event.data.object, connection);
          break;

        default:
          logger.info(`Unhandled Stripe event type: ${event.type}`);
      }
    } catch (error) {
      logger.error('Error handling Stripe webhook:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Handle subscription update from webhook
   * @private
   */
  static async handleSubscriptionUpdate(subscription, connection) {
    await connection.beginTransaction();
    
    try {
      const tenantId = subscription.metadata.tenant_id;
      const startDate = new Date(subscription.current_period_start * 1000);
      const endDate = new Date(subscription.current_period_end * 1000);

      await connection.query(
        `UPDATE subscriptions 
         SET status = ?, current_period_start = ?, current_period_end = ?, updated_at = NOW()
         WHERE stripe_subscription_id = ?`,
        [subscription.status, startDate, endDate, subscription.id]
      );

      // Update tenant status based on subscription status
      const tenantStatus = subscription.status === 'active' ? 'active' : 'suspended';
      await connection.query(
        'UPDATE tenants SET status = ?, subscription_end_date = ?, updated_at = NOW() WHERE id = ?',
        [tenantStatus, endDate, tenantId]
      );

      // Update grace period when subscription is renewed/updated
      if (subscription.status === 'active') {
        await GracePeriodService.setGracePeriodForSubscription(tenantId, endDate);
      }

      await connection.commit();
      logger.info(`Subscription updated via webhook: ${subscription.id}`);
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  }

  /**
   * Handle subscription deletion from webhook
   * @private
   */
  static async handleSubscriptionDeleted(subscription, connection) {
    await connection.beginTransaction();
    
    try {
      const tenantId = subscription.metadata.tenant_id;

      await connection.query(
        'UPDATE subscriptions SET status = ?, updated_at = NOW() WHERE stripe_subscription_id = ?',
        ['canceled', subscription.id]
      );

      await connection.query(
        'UPDATE tenants SET status = ?, updated_at = NOW() WHERE id = ?',
        ['suspended', tenantId]
      );

      await connection.commit();
      logger.info(`Subscription deleted via webhook: ${subscription.id}`);
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  }

  /**
   * Handle successful payment from webhook
   * @private
   */
  static async handlePaymentSucceeded(invoice, connection) {
    await connection.beginTransaction();
    
    try {
      const subscriptionId = invoice.subscription;
      
      // Get subscription details
      const [subscriptions] = await connection.query(
        'SELECT * FROM subscriptions WHERE stripe_subscription_id = ?',
        [subscriptionId]
      );

      if (subscriptions.length) {
        const subscription = subscriptions[0];
        
        // Record payment
        await connection.query(
          `INSERT INTO payments 
          (tenant_id, subscription_id, amount, currency, status, stripe_invoice_id, 
           payment_method, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'succeeded', ?, 'stripe', NOW(), NOW())`,
          [
            subscription.tenant_id,
            subscription.id,
            invoice.amount_paid / 100, // Convert from cents
            invoice.currency,
            invoice.id
          ]
        );

        // Update tenant status to active
        await connection.query(
          'UPDATE tenants SET status = ?, updated_at = NOW() WHERE id = ?',
          ['active', subscription.tenant_id]
        );

        // Check if tenant was previously suspended and send reactivation notification
        const [previousStatus] = await connection.query(
          'SELECT status FROM tenants WHERE id = ?',
          [subscription.tenant_id]
        );
        
        const wasSuspended = previousStatus.length > 0 && 
          (previousStatus[0].status === 'suspended' || previousStatus[0].status === 'grace_period');
        
        if (wasSuspended) {
          try {
            const notificationService = require('./NotificationService');
            await notificationService.sendNotificationToTenant(
              subscription.tenant_id,
              'account_reactivated',
              'both'
            );
            logger.info(`Account reactivation notification sent to tenant ${subscription.tenant_id}`);
          } catch (notifError) {
            logger.error('Failed to send reactivation notification:', notifError);
          }
        }

        // Send payment confirmation notification
        try {
          const notificationService = require('./NotificationService');
          const [tenants] = await connection.query(
            'SELECT * FROM tenants WHERE id = ?',
            [subscription.tenant_id]
          );
          
          if (tenants.length > 0) {
            const [plans] = await connection.query(
              'SELECT name FROM subscription_plans WHERE id = ?',
              [subscription.plan_id]
            );
            
            await notificationService.sendNotificationToTenant(
              subscription.tenant_id,
              'payment_confirmation',
              'both',
              {
                amount: `${invoice.currency.toUpperCase()} ${(invoice.amount_paid / 100).toFixed(2)}`,
                payment_date: new Date().toLocaleDateString('en-US'),
                next_billing_date: new Date(invoice.period_end * 1000).toLocaleDateString('en-US'),
                plan_name: plans.length > 0 ? plans[0].name : 'N/A'
              }
            );
            logger.info(`Payment confirmation notification sent to tenant ${subscription.tenant_id}`);
          }
        } catch (notifError) {
          logger.error('Failed to send payment confirmation notification:', notifError);
          // Don't fail the payment processing if notification fails
        }
      }

      await connection.commit();
      logger.info(`Payment succeeded: ${invoice.id}`);
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  }

  /**
   * Handle failed payment from webhook
   * @private
   */
  static async handlePaymentFailed(invoice, connection) {
    await connection.beginTransaction();
    
    try {
      const subscriptionId = invoice.subscription;
      
      // Get subscription details
      const [subscriptions] = await connection.query(
        'SELECT * FROM subscriptions WHERE stripe_subscription_id = ?',
        [subscriptionId]
      );

      if (subscriptions.length) {
        const subscription = subscriptions[0];
        
        // Record failed payment
        await connection.query(
          `INSERT INTO payments 
          (tenant_id, subscription_id, amount, currency, status, stripe_invoice_id, 
           payment_method, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'failed', ?, 'stripe', NOW(), NOW())`,
          [
            subscription.tenant_id,
            subscription.id,
            invoice.amount_due / 100,
            invoice.currency,
            invoice.id
          ]
        );

        // Update tenant status
        await connection.query(
          'UPDATE tenants SET status = ?, updated_at = NOW() WHERE id = ?',
          ['payment_failed', subscription.tenant_id]
        );
      }

      await connection.commit();
      logger.info(`Payment failed: ${invoice.id}`);
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  }

  /**
   * Track message usage for a tenant
   * @param {number} tenantId - Tenant ID
   * @param {number} count - Number of messages to add
   * @returns {Promise<Object>} Usage information
   */
  static async trackMessageUsage(tenantId, count = 1) {
    const connection = await pool.getConnection();
    
    try {
      // Get tenant info to check status
      const [tenants] = await connection.query(
        'SELECT status, max_messages_per_month FROM tenants WHERE id = ?',
        [tenantId]
      );

      if (!tenants.length) {
        throw new Error('Tenant not found');
      }

      const tenant = tenants[0];

      // Get current subscription and plan
      const [subscriptions] = await connection.query(
        `SELECT s.*, sp.max_messages_per_month
         FROM subscriptions s
         JOIN subscription_plans sp ON s.plan_id = sp.id
         WHERE s.tenant_id = ? AND s.status = 'active'
         ORDER BY s.created_at DESC LIMIT 1`,
        [tenantId]
      );

      // If no subscription, use tenant limits
      let maxMessages;
      if (!subscriptions.length) {
        if (tenant.status === 'active') {
          maxMessages = tenant.max_messages_per_month || 1000;
          logger.info(`No subscription found for tenant ${tenantId}, using tenant limit: ${maxMessages}`);
        } else {
          throw new Error('No active subscription');
        }
      } else {
        maxMessages = subscriptions[0].max_messages_per_month;
      }

      const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

      // Get or create usage record
      const [usageRecords] = await connection.query(
        `SELECT * FROM usage_tracking 
         WHERE tenant_id = ? AND month = ?`,
        [tenantId, currentMonth]
      );

      let currentUsage;
      
      if (usageRecords.length) {
        // Update existing record
        await connection.query(
          `UPDATE usage_tracking 
           SET messages_sent = messages_sent + ?, updated_at = NOW()
           WHERE tenant_id = ? AND month = ?`,
          [count, tenantId, currentMonth]
        );
        
        currentUsage = usageRecords[0].messages_sent + count;
      } else {
        // Create new record
        await connection.query(
          `INSERT INTO usage_tracking 
          (tenant_id, month, messages_sent, created_at, updated_at)
          VALUES (?, ?, ?, NOW(), NOW())`,
          [tenantId, currentMonth, count]
        );
        
        currentUsage = count;
      }

      const limit = maxMessages;
      const remaining = Math.max(0, limit - currentUsage);
      const percentage = (currentUsage / limit) * 100;

      logger.info(`Usage tracked for tenant ${tenantId}: ${currentUsage}/${limit} messages (${tenant.status})`);

      return {
        current: currentUsage,
        limit: limit,
        remaining: remaining,
        percentage: percentage.toFixed(2),
        exceeded: currentUsage > limit
      };
    } catch (error) {
      logger.error('Error tracking usage:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Check if tenant has reached usage limits
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<boolean>} True if within limits
   */
  static async checkUsageLimits(tenantId) {
    const connection = await pool.getConnection();
    
    try {
      const usage = await this.trackMessageUsage(tenantId, 0);
      return !usage.exceeded;
    } catch (error) {
      logger.error('Error checking usage limits:', error.message);
      // If error checking limits, allow usage (fail open for development)
      logger.warn(`Allowing usage for tenant ${tenantId} due to error checking limits`);
      return true;
    } finally {
      connection.release();
    }
  }

  /**
   * Get usage statistics for a tenant
   * @param {number} tenantId - Tenant ID
   * @param {number} months - Number of months to retrieve
   * @returns {Promise<Array>} Usage statistics
   */
  static async getUsageStats(tenantId, months = 6) {
    const connection = await pool.getConnection();
    
    try {
      const [stats] = await connection.query(
        `SELECT * FROM usage_tracking 
         WHERE tenant_id = ?
         ORDER BY month DESC
         LIMIT ?`,
        [tenantId, months]
      );

      return stats;
    } catch (error) {
      logger.error('Error getting usage stats:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Reset monthly usage (called by cron job)
   * @returns {Promise<void>}
   */
  static async resetMonthlyUsage() {
    const connection = await pool.getConnection();
    
    try {
      const currentMonth = new Date().toISOString().slice(0, 7);
      
      logger.info(`Resetting monthly usage for ${currentMonth}`);
      
      // Usage is tracked per month, no reset needed
      // Old records can be archived or deleted after a certain period
      
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const archiveMonth = sixMonthsAgo.toISOString().slice(0, 7);
      
      await connection.query(
        'DELETE FROM usage_tracking WHERE month < ?',
        [archiveMonth]
      );
      
      logger.info('Monthly usage reset completed');
    } catch (error) {
      logger.error('Error resetting monthly usage:', error);
      throw error;
    } finally {
      connection.release();
    }
  }
}

module.exports = BillingService;
