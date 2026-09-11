/**
 * Payment Gateway Controller
 * Manages payment gateway configurations
 */

const BaseController = require('./BaseController');
const { pool } = require('../config/database');
const { logger } = require('../config/logger');

class PaymentGatewayController extends BaseController {
  /**
   * Get all payment gateways configuration
   * GET /api/superadmin/payment-gateways
   */
  static async getAllGateways(req, res) {
    try {
      const [gateways] = await pool.execute(
        'SELECT * FROM payment_gateway_settings'
      );

      const gatewaysMap = {
        stripe: null,
        paypal: null,
        cash: null
      };

      gateways.forEach(gateway => {
        gatewaysMap[gateway.gateway_name] = gateway;
      });

      return res.json({
        success: true,
        data: gatewaysMap
      });
    } catch (error) {
      logger.error('Error getting payment gateways', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error loading payment gateways'
      });
    }
  }

  /**
   * Update gateway settings
   * PUT /api/superadmin/payment-gateways/:gateway
   */
  static async updateGateway(req, res) {
    try {
      const { gateway } = req.params;
      const updates = req.body;

      // Validate gateway name
      if (!['stripe', 'paypal', 'cash'].includes(gateway)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid gateway name'
        });
      }

      // Check if gateway exists
      const [existing] = await pool.execute(
        'SELECT id FROM payment_gateway_settings WHERE gateway_name = ?',
        [gateway]
      );

      if (existing.length === 0) {
        // Insert new gateway
        const fields = [];
        const values = [gateway];
        const placeholders = ['?'];

        if (gateway === 'stripe') {
          if (updates.stripe_secret_key) {
            fields.push('stripe_secret_key');
            values.push(updates.stripe_secret_key);
            placeholders.push('?');
          }
          if (updates.stripe_publishable_key) {
            fields.push('stripe_publishable_key');
            values.push(updates.stripe_publishable_key);
            placeholders.push('?');
          }
          if (updates.stripe_webhook_secret) {
            fields.push('stripe_webhook_secret');
            values.push(updates.stripe_webhook_secret);
            placeholders.push('?');
          }
          if (updates.stripe_mode) {
            fields.push('stripe_mode');
            values.push(updates.stripe_mode);
            placeholders.push('?');
          }
        } else if (gateway === 'paypal') {
          if (updates.paypal_client_id) {
            fields.push('paypal_client_id');
            values.push(updates.paypal_client_id);
            placeholders.push('?');
          }
          if (updates.paypal_client_secret) {
            fields.push('paypal_client_secret');
            values.push(updates.paypal_client_secret);
            placeholders.push('?');
          }
          if (updates.paypal_mode) {
            fields.push('paypal_mode');
            values.push(updates.paypal_mode);
            placeholders.push('?');
          }
          if (updates.paypal_webhook_id) {
            fields.push('paypal_webhook_id');
            values.push(updates.paypal_webhook_id);
            placeholders.push('?');
          }
        } else if (gateway === 'cash') {
          if (updates.cash_instructions) {
            fields.push('cash_instructions');
            values.push(updates.cash_instructions);
            placeholders.push('?');
          }
          if (updates.cash_contact_email) {
            fields.push('cash_contact_email');
            values.push(updates.cash_contact_email);
            placeholders.push('?');
          }
          if (updates.cash_contact_phone) {
            fields.push('cash_contact_phone');
            values.push(updates.cash_contact_phone);
            placeholders.push('?');
          }
        }

        const fieldNames = fields.length > 0 ? ', ' + fields.join(', ') : '';
        const fieldPlaceholders = fields.length > 0 ? ', ' + placeholders.slice(1).join(', ') : '';

        await pool.execute(
          `INSERT INTO payment_gateway_settings (gateway_name${fieldNames}) VALUES (?${fieldPlaceholders})`,
          values
        );
      } else {
        // Update existing gateway
        const updateFields = [];
        const values = [];

        if (gateway === 'stripe') {
          if (updates.stripe_secret_key !== undefined) {
            updateFields.push('stripe_secret_key = ?');
            values.push(updates.stripe_secret_key);
          }
          if (updates.stripe_publishable_key !== undefined) {
            updateFields.push('stripe_publishable_key = ?');
            values.push(updates.stripe_publishable_key);
          }
          if (updates.stripe_webhook_secret !== undefined) {
            updateFields.push('stripe_webhook_secret = ?');
            values.push(updates.stripe_webhook_secret);
          }
          if (updates.stripe_mode !== undefined) {
            updateFields.push('stripe_mode = ?');
            values.push(updates.stripe_mode);
          }
        } else if (gateway === 'paypal') {
          if (updates.paypal_client_id !== undefined) {
            updateFields.push('paypal_client_id = ?');
            values.push(updates.paypal_client_id);
          }
          if (updates.paypal_client_secret !== undefined) {
            updateFields.push('paypal_client_secret = ?');
            values.push(updates.paypal_client_secret);
          }
          if (updates.paypal_mode !== undefined) {
            updateFields.push('paypal_mode = ?');
            values.push(updates.paypal_mode);
          }
          if (updates.paypal_webhook_id !== undefined) {
            updateFields.push('paypal_webhook_id = ?');
            values.push(updates.paypal_webhook_id);
          }
        } else if (gateway === 'cash') {
          if (updates.cash_instructions !== undefined) {
            updateFields.push('cash_instructions = ?');
            values.push(updates.cash_instructions);
          }
          if (updates.cash_contact_email !== undefined) {
            updateFields.push('cash_contact_email = ?');
            values.push(updates.cash_contact_email);
          }
          if (updates.cash_contact_phone !== undefined) {
            updateFields.push('cash_contact_phone = ?');
            values.push(updates.cash_contact_phone);
          }
        }

        if (updateFields.length > 0) {
          values.push(gateway);
          await pool.execute(
            `UPDATE payment_gateway_settings SET ${updateFields.join(', ')} WHERE gateway_name = ?`,
            values
          );
        }
      }

      logger.info('Payment gateway updated', { gateway });

      return res.json({
        success: true,
        message: 'Gateway settings updated successfully'
      });
    } catch (error) {
      logger.error('Error updating payment gateway', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error updating gateway settings'
      });
    }
  }

  /**
   * Toggle gateway enabled status
   * PUT /api/superadmin/payment-gateways/:gateway/toggle
   */
  static async toggleGateway(req, res) {
    try {
      const { gateway } = req.params;
      const { enabled } = req.body;

      // Validate gateway name
      if (!['stripe', 'paypal', 'cash'].includes(gateway)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid gateway name'
        });
      }

      // Check if gateway exists
      const [existing] = await pool.execute(
        'SELECT id FROM payment_gateway_settings WHERE gateway_name = ?',
        [gateway]
      );

      if (existing.length === 0) {
        // Insert new gateway with enabled status
        await pool.execute(
          'INSERT INTO payment_gateway_settings (gateway_name, enabled) VALUES (?, ?)',
          [gateway, enabled]
        );
      } else {
        // Update enabled status
        await pool.execute(
          'UPDATE payment_gateway_settings SET enabled = ? WHERE gateway_name = ?',
          [enabled, gateway]
        );
      }

      logger.info('Payment gateway toggled', { gateway, enabled });

      return res.json({
        success: true,
        message: `Gateway ${enabled ? 'enabled' : 'disabled'} successfully`
      });
    } catch (error) {
      logger.error('Error toggling payment gateway', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error toggling gateway'
      });
    }
  }

  /**
   * Get enabled gateways (for public use)
   * GET /api/public/payment-gateways
   */
  static async getEnabledGateways(req, res) {
    try {
      const [gateways] = await pool.execute(
        'SELECT gateway_name, enabled FROM payment_gateway_settings WHERE enabled = TRUE'
      );

      return res.json({
        success: true,
        data: gateways
      });
    } catch (error) {
      logger.error('Error getting enabled gateways', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error loading enabled gateways'
      });
    }
  }

  /**
   * Create payment session for new tenant
   * POST /api/public/create-payment-session
   */
  static async createPaymentSession(req, res) {
    try {
      const { tenant_id, plan_id, gateway } = req.body;

      // Validate required fields
      if (!tenant_id || !plan_id || !gateway) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields'
        });
      }

      // Validate gateway
      if (!['stripe', 'paypal', 'cash'].includes(gateway)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid gateway'
        });
      }

      // Get plan details
      const [plans] = await pool.execute(
        'SELECT * FROM subscription_plans WHERE id = ? AND active = TRUE',
        [plan_id]
      );

      if (plans.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Plan not found'
        });
      }

      const plan = plans[0];
      
      // Ensure price is a number
      plan.price = parseFloat(plan.price) || 0;
      
      // Validate price
      if (plan.price <= 0 && !plan.is_free) {
        return res.status(400).json({
          success: false,
          message: 'Invalid plan price'
        });
      }

      // Get tenant details
      const [tenants] = await pool.execute(
        'SELECT * FROM tenants WHERE id = ?',
        [tenant_id]
      );

      if (tenants.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Tenant not found'
        });
      }

      const tenant = tenants[0];

      // Handle different gateways
      if (gateway === 'stripe') {
        // Get Stripe configuration
        const [stripeConfig] = await pool.execute(
          'SELECT * FROM payment_gateway_settings WHERE gateway_name = ? AND enabled = TRUE',
          ['stripe']
        );

        if (stripeConfig.length === 0 || !stripeConfig[0].stripe_secret_key) {
          return res.status(400).json({
            success: false,
            message: 'Stripe is not configured. Please configure Stripe in the Super Admin panel first.'
          });
        }

        // Validate Stripe key format
        if (!stripeConfig[0].stripe_secret_key.startsWith('sk_')) {
          return res.status(400).json({
            success: false,
            message: 'Invalid Stripe secret key. It should start with "sk_"'
          });
        }

        // Initialize Stripe
        const stripe = require('stripe')(stripeConfig[0].stripe_secret_key);

        try {
          // Create Stripe Checkout Session
          const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
              {
                price_data: {
                  currency: plan.currency.toLowerCase(),
                  product_data: {
                    name: plan.name,
                    description: `${plan.name} - Monthly Subscription`,
                  },
                  unit_amount: Math.round(plan.price * 100), // Convert to cents
                  recurring: {
                    interval: 'month',
                  },
                },
                quantity: 1,
              },
            ],
            mode: 'subscription',
            success_url: `${process.env.BASE_URL || 'http://localhost:3000'}/payment-success?session_id={CHECKOUT_SESSION_ID}&tenant=${tenant_id}`,
            cancel_url: `${process.env.BASE_URL || 'http://localhost:3000'}/checkout?plan=${plan_id}&tenant=${tenant_id}&cancelled=true`,
            client_reference_id: tenant_id.toString(),
            metadata: {
              tenant_id: tenant_id.toString(),
              plan_id: plan_id.toString(),
            },
          });

          // Save session info
          await pool.execute(
            `INSERT INTO payments (tenant_id, plan_id, amount, currency, status, payment_method, external_id, created_at)
             VALUES (?, ?, ?, ?, 'pending', 'stripe', ?, NOW())`,
            [tenant_id, plan_id, plan.price, plan.currency, session.id]
          );

          return res.json({
            success: true,
            data: {
              gateway: 'stripe',
              checkout_url: session.url,
              session_id: session.id
            }
          });
        } catch (stripeError) {
          logger.error('Stripe error', { error: stripeError.message });
          return res.status(400).json({
            success: false,
            message: `Stripe error: ${stripeError.message}`
          });
        }

      } else if (gateway === 'paypal') {
        // Get PayPal configuration
        const [paypalConfig] = await pool.execute(
          'SELECT * FROM payment_gateway_settings WHERE gateway_name = ? AND enabled = TRUE',
          ['paypal']
        );

        if (paypalConfig.length === 0 || !paypalConfig[0].paypal_client_id || !paypalConfig[0].paypal_client_secret) {
          return res.status(400).json({
            success: false,
            message: 'PayPal is not configured. Please configure PayPal in the Super Admin panel first.'
          });
        }

        try {
          const paypal = require('@paypal/checkout-server-sdk');
          
          // Configure PayPal environment
          const environment = paypalConfig[0].paypal_mode === 'live'
            ? new paypal.core.LiveEnvironment(
                paypalConfig[0].paypal_client_id,
                paypalConfig[0].paypal_client_secret
              )
            : new paypal.core.SandboxEnvironment(
                paypalConfig[0].paypal_client_id,
                paypalConfig[0].paypal_client_secret
              );

          const client = new paypal.core.PayPalHttpClient(environment);

          // Create PayPal order
          const request = new paypal.orders.OrdersCreateRequest();
          request.prefer("return=representation");
          request.requestBody({
            intent: 'CAPTURE',
            purchase_units: [{
              reference_id: tenant_id.toString(),
              description: `${plan.name} - Monthly Subscription`,
              amount: {
                currency_code: plan.currency,
                value: plan.price.toFixed(2)
              }
            }],
            application_context: {
              brand_name: 'Misayan SaaS',
              landing_page: 'BILLING',
              user_action: 'PAY_NOW',
              return_url: `${process.env.BASE_URL || 'http://localhost:3000'}/payment-success?gateway=paypal&tenant=${tenant_id}`,
              cancel_url: `${process.env.BASE_URL || 'http://localhost:3000'}/checkout?plan=${plan_id}&tenant=${tenant_id}&cancelled=true`
            }
          });

          const order = await client.execute(request);
          
          // Get approval URL
          const approvalUrl = order.result.links.find(link => link.rel === 'approve').href;

          // Save order info
          await pool.execute(
            `INSERT INTO payments (tenant_id, plan_id, amount, currency, status, payment_method, external_id, created_at)
             VALUES (?, ?, ?, ?, 'pending', 'paypal', ?, NOW())`,
            [tenant_id, plan_id, plan.price, plan.currency, order.result.id]
          );

          return res.json({
            success: true,
            data: {
              gateway: 'paypal',
              approval_url: approvalUrl,
              order_id: order.result.id
            }
          });
        } catch (paypalError) {
          logger.error('PayPal error', { error: paypalError.message });
          return res.status(400).json({
            success: false,
            message: `PayPal error: ${paypalError.message}`
          });
        }

      } else if (gateway === 'cash') {
        // For cash/manual payment, just return instructions
        const [cashConfig] = await pool.execute(
          'SELECT * FROM payment_gateway_settings WHERE gateway_name = ? AND enabled = TRUE',
          ['cash']
        );

        if (cashConfig.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'Cash payment is not configured'
          });
        }

        // Create pending payment record
        await pool.execute(
          `INSERT INTO payments (tenant_id, plan_id, amount, currency, status, payment_method, created_at)
           VALUES (?, ?, ?, ?, 'pending', 'cash', NOW())`,
          [tenant_id, plan_id, plan.price, plan.currency]
        );

        return res.json({
          success: true,
          data: {
            gateway: 'cash',
            instructions: cashConfig[0].cash_instructions,
            contact_email: cashConfig[0].cash_contact_email,
            contact_phone: cashConfig[0].cash_contact_phone
          }
        });
      }

    } catch (error) {
      logger.error('Error creating payment session', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error creating payment session'
      });
    }
  }

  /**
   * Get payment instructions for tenant
   * GET /api/public/payment-instructions
   */
  static async getPaymentInstructions(req, res) {
    try {
      const { tenant } = req.query;

      if (!tenant) {
        return res.status(400).json({
          success: false,
          message: 'Tenant ID is required'
        });
      }

      // Get cash payment configuration
      const [cashConfig] = await pool.execute(
        'SELECT * FROM payment_gateway_settings WHERE gateway_name = ? AND enabled = TRUE',
        ['cash']
      );

      if (cashConfig.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Payment instructions not found'
        });
      }

      return res.json({
        success: true,
        data: {
          instructions: cashConfig[0].cash_instructions,
          contact_email: cashConfig[0].cash_contact_email,
          contact_phone: cashConfig[0].cash_contact_phone
        }
      });

    } catch (error) {
      logger.error('Error getting payment instructions', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error loading payment instructions'
      });
    }
  }

  /**
   * Verify payment after redirect from gateway
   * POST /api/public/verify-payment
   */
  static async verifyPayment(req, res) {
    try {
      const { session_id, order_id, tenant_id, gateway } = req.body;

      if (!tenant_id || !gateway) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields'
        });
      }

      if (gateway === 'stripe' && session_id) {
        // Verify Stripe payment
        const [stripeConfig] = await pool.execute(
          'SELECT * FROM payment_gateway_settings WHERE gateway_name = ? AND enabled = TRUE',
          ['stripe']
        );

        if (stripeConfig.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'Stripe is not configured'
          });
        }

        const stripe = require('stripe')(stripeConfig[0].stripe_secret_key);

        try {
          const session = await stripe.checkout.sessions.retrieve(session_id);

          if (session.payment_status === 'paid') {
            // Update payment status
            await pool.execute(
              'UPDATE payments SET status = ?, updated_at = NOW() WHERE external_id = ? AND tenant_id = ?',
              ['completed', session_id, tenant_id]
            );

            // Update tenant status to active
            await pool.execute(
              'UPDATE tenants SET status = ?, updated_at = NOW() WHERE id = ?',
              ['active', tenant_id]
            );

            // Get plan details
            const [payments] = await pool.execute(
              'SELECT p.*, sp.name as plan_name FROM payments p LEFT JOIN subscription_plans sp ON p.plan_id = sp.id WHERE p.external_id = ? AND p.tenant_id = ?',
              [session_id, tenant_id]
            );

            return res.json({
              success: true,
              data: {
                plan_name: payments[0]?.plan_name,
                amount: payments[0]?.amount,
                currency: payments[0]?.currency,
                status: 'completed'
              }
            });
          } else {
            return res.status(400).json({
              success: false,
              message: 'Payment not completed'
            });
          }
        } catch (stripeError) {
          logger.error('Stripe verification error', { error: stripeError.message });
          return res.status(400).json({
            success: false,
            message: `Stripe error: ${stripeError.message}`
          });
        }

      } else if (gateway === 'paypal' && order_id) {
        // Verify PayPal payment
        const [paypalConfig] = await pool.execute(
          'SELECT * FROM payment_gateway_settings WHERE gateway_name = ? AND enabled = TRUE',
          ['paypal']
        );

        if (paypalConfig.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'PayPal is not configured'
          });
        }

        try {
          const paypal = require('@paypal/checkout-server-sdk');
          
          const environment = paypalConfig[0].paypal_mode === 'live'
            ? new paypal.core.LiveEnvironment(
                paypalConfig[0].paypal_client_id,
                paypalConfig[0].paypal_client_secret
              )
            : new paypal.core.SandboxEnvironment(
                paypalConfig[0].paypal_client_id,
                paypalConfig[0].paypal_client_secret
              );

          const client = new paypal.core.PayPalHttpClient(environment);
          const request = new paypal.orders.OrdersGetRequest(order_id);
          const order = await client.execute(request);

          if (order.result.status === 'COMPLETED' || order.result.status === 'APPROVED') {
            // Update payment status
            await pool.execute(
              'UPDATE payments SET status = ?, updated_at = NOW() WHERE external_id = ? AND tenant_id = ?',
              ['completed', order_id, tenant_id]
            );

            // Update tenant status to active
            await pool.execute(
              'UPDATE tenants SET status = ?, updated_at = NOW() WHERE id = ?',
              ['active', tenant_id]
            );

            // Get plan details
            const [payments] = await pool.execute(
              'SELECT p.*, sp.name as plan_name FROM payments p LEFT JOIN subscription_plans sp ON p.plan_id = sp.id WHERE p.external_id = ? AND p.tenant_id = ?',
              [order_id, tenant_id]
            );

            return res.json({
              success: true,
              data: {
                plan_name: payments[0]?.plan_name,
                amount: payments[0]?.amount,
                currency: payments[0]?.currency,
                status: 'completed'
              }
            });
          } else {
            return res.status(400).json({
              success: false,
              message: 'Payment not completed'
            });
          }
        } catch (paypalError) {
          logger.error('PayPal verification error', { error: paypalError.message });
          return res.status(400).json({
            success: false,
            message: `PayPal error: ${paypalError.message}`
          });
        }

      } else {
        return res.status(400).json({
          success: false,
          message: 'Invalid payment verification request'
        });
      }

    } catch (error) {
      logger.error('Error verifying payment', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error verifying payment'
      });
    }
  }
}

module.exports = PaymentGatewayController;
