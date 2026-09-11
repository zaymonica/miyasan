/**
 * Plan Management Controller
 * Handles tenant plan and add-on resources management
 */

const BaseController = require('./BaseController');
const { pool } = require('../config/database');
const { logger } = require('../config/logger');

class PlanManagementController extends BaseController {
  /**
   * Get current plan information
   * GET /api/tenant/plan/current
   */
  static async getCurrentPlan(req, res) {
    try {
      const tenantId = req.tenantId;

      const [tenants] = await pool.execute(
        `SELECT t.*, sp.name as plan_name, sp.price, sp.currency, sp.description, c.symbol as currency_symbol
         FROM tenants t
         LEFT JOIN subscription_plans sp ON t.plan_id = sp.id
         LEFT JOIN currencies c ON c.code = sp.currency
         WHERE t.id = ?`,
        [tenantId]
      );

      if (tenants.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Tenant not found'
        });
      }

      const tenant = tenants[0];

      // Get plan features (you can customize this based on your plan structure)
      const features = [];
      if (tenant.max_users > 0) features.push(`Up to ${tenant.max_users} users`);
      if (tenant.max_conversations > 0) features.push(`Up to ${tenant.max_conversations} conversations`);
      if (tenant.max_messages_per_month > 0) features.push(`${tenant.max_messages_per_month} messages/month`);

      return res.json({
        success: true,
        data: {
          plan_name: tenant.plan_name,
          price: tenant.price,
          currency: tenant.currency,
          currency_symbol: tenant.currency_symbol,
          status: tenant.status,
          trial_ends_at: tenant.trial_ends_at,
          features: features
        }
      });
    } catch (error) {
      logger.error('Error getting current plan', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error loading plan information'
      });
    }
  }

  /**
   * Get resources usage
   * GET /api/tenant/plan/resources-usage
   */
  static async getResourcesUsage(req, res) {
    try {
      const tenantId = req.tenantId;

      // Get tenant limits
      const [tenants] = await pool.execute(
        'SELECT * FROM tenants WHERE id = ?',
        [tenantId]
      );

      if (tenants.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Tenant not found'
        });
      }

      const tenant = tenants[0];

      // Get current usage
      const [stores] = await pool.execute(
        'SELECT COUNT(*) as count FROM stores WHERE tenant_id = ?',
        [tenantId]
      );

      const [departments] = await pool.execute(
        'SELECT COUNT(*) as count FROM departments WHERE tenant_id = ?',
        [tenantId]
      );

      const [users] = await pool.execute(
        'SELECT COUNT(*) as count FROM admins WHERE tenant_id = ?',
        [tenantId]
      );

      const [conversations] = await pool.execute(
        'SELECT COUNT(*) as count FROM conversations WHERE tenant_id = ?',
        [tenantId]
      );

      const [contacts] = await pool.execute(
        'SELECT COUNT(*) as count FROM contacts WHERE tenant_id = ?',
        [tenantId]
      );

      // Calculate usage
      const usage = {
        stores: {
          used: stores[0].count,
          limit: tenant.max_stores || -1,
          percentage: tenant.max_stores > 0 ? (stores[0].count / tenant.max_stores) * 100 : 0
        },
        departments: {
          used: departments[0].count,
          limit: tenant.max_departments || -1,
          percentage: tenant.max_departments > 0 ? (departments[0].count / tenant.max_departments) * 100 : 0
        },
        users: {
          used: users[0].count,
          limit: tenant.max_users || -1,
          percentage: tenant.max_users > 0 ? (users[0].count / tenant.max_users) * 100 : 0
        },
        conversations: {
          used: conversations[0].count,
          limit: tenant.max_conversations || -1,
          percentage: tenant.max_conversations > 0 ? (conversations[0].count / tenant.max_conversations) * 100 : 0
        },
        contacts: {
          used: contacts[0].count,
          limit: tenant.max_contacts || -1,
          percentage: tenant.max_contacts > 0 ? (contacts[0].count / tenant.max_contacts) * 100 : 0
        }
      };

      return res.json({
        success: true,
        data: usage
      });
    } catch (error) {
      logger.error('Error getting resources usage', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error loading resources usage'
      });
    }
  }

  /**
   * Get purchased addons for tenant (grouped by resource type with usage)
   * GET /api/tenant/plan/purchased-addons
   */
  static async getPurchasedAddons(req, res) {
    try {
      const tenantId = req.tenantId;

      // Get tenant addons grouped by resource_key with total quantity
      const [tenantAddons] = await pool.execute(
        `SELECT 
          pa.resource_key,
          pa.resource_name,
          pa.currency,
          pa.description,
          SUM(ta.quantity) as total_quantity,
          MIN(ta.started_at) as first_purchase_date
        FROM tenant_addons ta
        JOIN plan_addons pa ON ta.addon_id = pa.id
        WHERE ta.tenant_id = ? AND ta.status = 'active'
        GROUP BY pa.resource_key, pa.resource_name, pa.currency, pa.description
        ORDER BY first_purchase_date DESC`,
        [tenantId]
      );

      // Get current usage for each addon type
      const usageQueries = {
        widget: 'SELECT COUNT(*) as count FROM chat_widgets WHERE tenant_id = ?',
        widgets: 'SELECT COUNT(*) as count FROM chat_widgets WHERE tenant_id = ?',
        invoice: `SELECT COUNT(*) as count FROM invoices WHERE tenant_id = ? AND MONTH(created_at) = MONTH(CURRENT_DATE()) AND YEAR(created_at) = YEAR(CURRENT_DATE())`,
        invoices: `SELECT COUNT(*) as count FROM invoices WHERE tenant_id = ? AND MONTH(created_at) = MONTH(CURRENT_DATE()) AND YEAR(created_at) = YEAR(CURRENT_DATE())`,
        quotes: `SELECT COUNT(*) as count FROM quotes WHERE tenant_id = ? AND MONTH(created_at) = MONTH(CURRENT_DATE()) AND YEAR(created_at) = YEAR(CURRENT_DATE())`,
        payment_links: `SELECT COUNT(*) as count FROM payment_links WHERE tenant_id = ? AND MONTH(created_at) = MONTH(CURRENT_DATE()) AND YEAR(created_at) = YEAR(CURRENT_DATE())`,
        stores: 'SELECT COUNT(*) as count FROM stores WHERE tenant_id = ?',
        departments: 'SELECT COUNT(*) as count FROM departments WHERE tenant_id = ?',
        users: 'SELECT COUNT(*) as count FROM admins WHERE tenant_id = ?',
        contacts: 'SELECT COUNT(*) as count FROM contacts WHERE tenant_id = ?',
        faq: 'SELECT COUNT(*) as count FROM faqs WHERE tenant_id = ?',
        faqs: 'SELECT COUNT(*) as count FROM faqs WHERE tenant_id = ?'
      };

      // Get tenant limits for addon resources
      const [tenants] = await pool.execute(
        `SELECT max_widgets, max_invoices_per_month, max_quotes_per_month, max_payment_links_per_month
         FROM tenants WHERE id = ?`,
        [tenantId]
      );

      const tenant = tenants[0] || {};

      // Add usage info to each addon
      const addonsWithUsage = await Promise.all(tenantAddons.map(async (addon) => {
        let used = 0;
        let limit = addon.total_quantity;

        // Get usage based on resource type
        const query = usageQueries[addon.resource_key];
        if (query) {
          try {
            const [result] = await pool.execute(query, [tenantId]);
            used = result[0]?.count || 0;
          } catch (e) {
            // Table might not exist, ignore
          }
        }

        // For some resources, the limit comes from tenant table
        if (addon.resource_key === 'widget' || addon.resource_key === 'widgets') {
          limit = tenant.max_widgets || addon.total_quantity;
        } else if (addon.resource_key === 'invoice' || addon.resource_key === 'invoices') {
          limit = tenant.max_invoices_per_month || addon.total_quantity;
        } else if (addon.resource_key === 'quotes') {
          limit = tenant.max_quotes_per_month || addon.total_quantity;
        } else if (addon.resource_key === 'payment_links') {
          limit = tenant.max_payment_links_per_month || addon.total_quantity;
        }

        return {
          ...addon,
          used,
          limit,
          percentage: limit > 0 ? Math.min((used / limit) * 100, 100) : 0
        };
      }));

      return res.json({
        success: true,
        data: {
          addons: addonsWithUsage
        }
      });
    } catch (error) {
      logger.error('Error getting purchased addons', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error loading purchased addons'
      });
    }
  }

  /**
   * Get available add-ons
   * GET /api/tenant/plan/available-addons
   */
  static async getAvailableAddons(req, res) {
    try {
      const [addons] = await pool.execute(
        `SELECT * FROM plan_addons 
         WHERE active = TRUE 
         ORDER BY sort_order, resource_name`
      );

      return res.json({
        success: true,
        data: addons
      });
    } catch (error) {
      logger.error('Error getting available add-ons', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error loading add-ons'
      });
    }
  }

  /**
   * Checkout add-ons
   * POST /api/tenant/plan/checkout-addons
   */
  static async checkoutAddons(req, res) {
    try {
      const tenantId = req.tenantId;
      const { items, gateway } = req.body;

      console.log('Checkout addons request:', { tenantId, items, gateway });

      if (!items || items.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No items in cart'
        });
      }

      if (!gateway) {
        return res.status(400).json({
          success: false,
          message: 'Payment gateway is required'
        });
      }

      // Get tenant info
      const [tenants] = await pool.execute(
        'SELECT * FROM tenants WHERE id = ?',
        [tenantId]
      );

      if (tenants.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Tenant not found'
        });
      }

      const tenant = tenants[0];

      // Fetch full addon details from database (including price_ids)
      const addonIds = items.map(item => item.addon_id);
      const [addons] = await pool.execute(
        `SELECT * FROM plan_addons WHERE id IN (${addonIds.map(() => '?').join(',')})`,
        addonIds
      );

      // Create a map for quick lookup
      const addonMap = {};
      addons.forEach(addon => {
        addonMap[addon.id] = addon;
      });

      // Process items with full addon data
      let total = 0;
      const processedItems = items.map(item => {
        const addon = addonMap[item.addon_id];
        if (!addon) {
          throw new Error(`Addon ${item.addon_id} not found`);
        }

        const quantity = parseInt(item.quantity) || 0;
        const unitPrice = parseFloat(addon.unit_price) || 0;
        const subtotal = quantity * unitPrice;
        total += subtotal;
        
        return {
          addon_id: addon.id,
          resource_key: addon.resource_key,
          resource_name: addon.resource_name,
          quantity,
          unit_price: unitPrice,
          currency: addon.currency,
          stripe_price_id: addon.stripe_price_id,
          paypal_plan_id: addon.paypal_plan_id,
          subtotal
        };
      });

      // VERIFY GATEWAY CONFIGURATION
      // STRIPE AND PAYPAL DISABLED FOR ADDONS - ONLY CASH PAYMENT ALLOWED
      if (gateway === 'stripe') {
        return res.status(400).json({
          success: false,
          message: 'Stripe payment for addons is temporarily disabled. Please use Cash/Transfer payment method.'
        });
        
        /* COMMENTED OUT - FOR FUTURE REACTIVATION
        // Check if all items have stripe_price_id
        const missingPriceIds = processedItems.filter(item => !item.stripe_price_id);
        if (missingPriceIds.length > 0) {
          return res.status(400).json({
            success: false,
            message: 'Some addons are not configured for Stripe. Please configure Stripe Price IDs in addon settings.'
          });
        }
        
        // Check if Stripe is configured
        const stripeKey = await PlanManagementController.getSettingValue('stripe_secret_key');
        if (!stripeKey) {
          return res.status(400).json({
            success: false,
            message: 'Stripe is not configured. Please configure Stripe API key in system settings.'
          });
        }
        */
      } else if (gateway === 'paypal') {
        return res.status(400).json({
          success: false,
          message: 'PayPal payment for addons is temporarily disabled. Please use Cash/Transfer payment method.'
        });
        
        /* COMMENTED OUT - FOR FUTURE REACTIVATION
        // Check if all items have paypal_plan_id
        const missingPlanIds = processedItems.filter(item => !item.paypal_plan_id);
        if (missingPlanIds.length > 0) {
          return res.status(400).json({
            success: false,
            message: 'Some addons are not configured for PayPal. Please configure PayPal Plan IDs in addon settings.'
          });
        }
        
        // Check if PayPal is configured
        const paypalClientId = await PlanManagementController.getSettingValue('paypal_client_id');
        const paypalSecret = await PlanManagementController.getSettingValue('paypal_client_secret');
        if (!paypalClientId || !paypalSecret) {
          return res.status(400).json({
            success: false,
            message: 'PayPal is not configured. Please configure PayPal credentials in system settings.'
          });
        }
        */
      }

      console.log('Creating addon purchase:', { tenantId, total, gateway, processedItems });

      // Check if addon_purchases table exists, create if not
      try {
        await pool.execute(`
          CREATE TABLE IF NOT EXISTS addon_purchases (
            id INT AUTO_INCREMENT PRIMARY KEY,
            tenant_id INT NOT NULL,
            items JSON NOT NULL,
            total_amount DECIMAL(10, 2) NOT NULL,
            currency VARCHAR(3) DEFAULT 'USD',
            status ENUM('pending', 'completed', 'failed', 'cancelled') DEFAULT 'pending',
            payment_method VARCHAR(50),
            payment_id VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_tenant_id (tenant_id),
            INDEX idx_status (status)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
      } catch (tableError) {
        console.log('Table check/create:', tableError.message);
      }

      // Create addon purchase record
      const [result] = await pool.execute(
        `INSERT INTO addon_purchases (tenant_id, items, total_amount, status, payment_method, created_at)
         VALUES (?, ?, ?, 'pending', ?, NOW())`,
        [tenantId, JSON.stringify(processedItems), total, gateway]
      );

      const purchaseId = result.insertId;

      console.log('Purchase created:', purchaseId);

      // Handle different payment gateways
      // STRIPE AND PAYPAL DISABLED FOR ADDONS
      if (gateway === 'stripe') {
        // DISABLED - Uncomment to reactivate
        // return await PlanManagementController.createStripeAddonCheckout(req, res, purchaseId, processedItems, total, tenant);
        return res.status(400).json({
          success: false,
          message: 'Stripe payment for addons is temporarily disabled. Please use Cash/Transfer.'
        });
      } else if (gateway === 'paypal') {
        // DISABLED - Uncomment to reactivate
        // return await PlanManagementController.createPayPalAddonOrder(req, res, purchaseId, processedItems, total, tenant);
        return res.status(400).json({
          success: false,
          message: 'PayPal payment for addons is temporarily disabled. Please use Cash/Transfer.'
        });
      } else if (gateway === 'cash') {
        // For cash/transfer, return payment instructions directly
        const instructions = await PlanManagementController.getSettingValue('cash_payment_instructions') 
          || 'Please contact support for payment instructions.';

        return res.json({
          success: true,
          data: {
            purchase_id: purchaseId,
            payment_method: 'cash',
            total_amount: total,
            currency: processedItems[0]?.currency || 'USD',
            instructions: instructions,
            items: processedItems
          }
        });
      } else {
        return res.status(400).json({
          success: false,
          message: 'Invalid payment gateway'
        });
      }
    } catch (error) {
      console.error('Error processing addon checkout:', error);
      logger.error('Error processing addon checkout', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        message: 'Error processing checkout: ' + error.message
      });
    }
  }

  /**
   * Helper to get setting value from payment_gateway_settings or system_settings
   */
  static async getSettingValue(key) {
    try {
      // Map of keys to their gateway and field names
      const gatewayMap = {
        'stripe_secret_key': { gateway: 'stripe', field: 'stripe_secret_key' },
        'stripe_publishable_key': { gateway: 'stripe', field: 'stripe_publishable_key' },
        'paypal_client_id': { gateway: 'paypal', field: 'paypal_client_id' },
        'paypal_client_secret': { gateway: 'paypal', field: 'paypal_client_secret' },
        'paypal_mode': { gateway: 'paypal', field: 'paypal_mode' }
      };

      // Check if it's a payment gateway setting
      if (gatewayMap[key]) {
        const { gateway, field } = gatewayMap[key];
        const [result] = await pool.execute(
          `SELECT ${field} FROM payment_gateway_settings WHERE gateway_name = ?`,
          [gateway]
        );
        return result.length > 0 ? result[0][field] : null;
      }

      // Otherwise, try system_settings
      const [result] = await pool.execute(
        "SELECT setting_value FROM system_settings WHERE setting_key = ?",
        [key]
      );
      return result.length > 0 ? result[0].setting_value : null;
    } catch (e) {
      console.log(`Could not fetch setting ${key}:`, e.message);
      return null;
    }
  }

  /**
   * Create Stripe checkout session for add-ons
   */
  static async createStripeAddonCheckout(req, res, purchaseId, items, total, tenant) {
    try {
      const stripeSecretKey = await PlanManagementController.getSettingValue('stripe_secret_key');
      const stripe = require('stripe')(stripeSecretKey);

      console.log('🔵 Creating Stripe checkout:', { purchaseId, total, itemsCount: items.length });
      console.log('🔵 Items:', JSON.stringify(items, null, 2));

      // Use configured price IDs instead of creating prices dynamically
      const lineItems = items.map(item => ({
        price: item.stripe_price_id, // Use the configured price ID
        quantity: parseInt(item.quantity) || 1
      }));

      console.log('🔵 Line items for Stripe:', JSON.stringify(lineItems, null, 2));

      // Create checkout session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: lineItems,
        mode: 'subscription',
        success_url: `${req.protocol}://${req.get('host')}/payment-success?purchase=${purchaseId}&type=addon`,
        cancel_url: `${req.protocol}://${req.get('host')}/admin/plan-management`,
        client_reference_id: `addon_${purchaseId}`,
        customer_email: tenant.email,
        metadata: {
          tenant_id: String(tenant.id),
          purchase_id: String(purchaseId),
          type: 'addon'
        }
      });

      console.log('✅ Stripe session created:', { sessionId: session.id, url: session.url });

      // Update purchase with payment ID
      await pool.execute(
        'UPDATE addon_purchases SET payment_id = ? WHERE id = ?',
        [session.id, purchaseId]
      );

      return res.json({
        success: true,
        data: {
          purchase_id: purchaseId,
          checkout_url: session.url
        }
      });
    } catch (error) {
      console.error('❌ Stripe addon checkout error:', error);
      logger.error('Stripe addon checkout error', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        message: 'Error creating Stripe checkout: ' + error.message
      });
    }
  }

  /**
   * Create PayPal subscription for add-ons
   */
  static async createPayPalAddonOrder(req, res, purchaseId, items, total, tenant) {
    try {
      const clientId = await PlanManagementController.getSettingValue('paypal_client_id');
      const clientSecret = await PlanManagementController.getSettingValue('paypal_client_secret');
      const mode = await PlanManagementController.getSettingValue('paypal_mode') || 'sandbox';

      // For PayPal subscriptions with multiple items, we need to create a custom plan
      // or use the billing agreements API
      // For now, we'll use a one-time payment approach
      
      const paypal = require('@paypal/checkout-server-sdk');
      const environment = mode === 'live'
        ? new paypal.core.LiveEnvironment(clientId, clientSecret)
        : new paypal.core.SandboxEnvironment(clientId, clientSecret);
      const client = new paypal.core.PayPalHttpClient(environment);

      // Ensure total is a valid number
      const totalAmount = parseFloat(total) || 0;
      const currency = (items[0]?.currency || 'USD').toUpperCase();

      // Create order (one-time payment for now)
      // TODO: Implement proper subscription handling with PayPal Plan IDs
      const request = new paypal.orders.OrdersCreateRequest();
      request.prefer('return=representation');
      request.requestBody({
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: `addon_${purchaseId}`,
          description: `Add-on purchase for ${tenant.name}`,
          amount: {
            currency_code: currency,
            value: totalAmount.toFixed(2),
            breakdown: {
              item_total: {
                currency_code: currency,
                value: totalAmount.toFixed(2)
              }
            }
          },
          items: items.map(item => ({
            name: item.resource_name,
            description: `${item.quantity}x ${item.resource_name}`,
            unit_amount: {
              currency_code: currency,
              value: parseFloat(item.unit_price).toFixed(2)
            },
            quantity: String(parseInt(item.quantity) || 1)
          }))
        }],
        application_context: {
          return_url: `${req.protocol}://${req.get('host')}/payment-success?purchase=${purchaseId}&type=addon`,
          cancel_url: `${req.protocol}://${req.get('host')}/admin/plan-management`,
          brand_name: 'Your SaaS Platform',
          user_action: 'PAY_NOW'
        }
      });

      const order = await client.execute(request);

      // Update purchase with payment ID
      await pool.execute(
        'UPDATE addon_purchases SET payment_id = ? WHERE id = ?',
        [order.result.id, purchaseId]
      );

      // Get approval URL
      const approvalUrl = order.result.links.find(link => link.rel === 'approve').href;

      return res.json({
        success: true,
        data: {
          purchase_id: purchaseId,
          checkout_url: approvalUrl
        }
      });
    } catch (error) {
      logger.error('PayPal addon order error', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        message: 'Error creating PayPal order: ' + error.message
      });
    }
  }

  /**
   * Get system add-ons (Bio Link, etc.)
   * GET /api/tenant/plan/system-addons
   */
  static async getSystemAddons(req, res) {
    try {
      const tenantId = req.tenantId;

      // Get tenant's plan to check which system addons are enabled
      const [tenants] = await pool.execute(
        `SELECT t.*, sp.biolink_enabled, sp.max_bio_pages, sp.max_short_links, 
                sp.max_file_transfers, sp.max_vcards, sp.max_event_links, 
                sp.max_html_pages, sp.max_qr_codes
         FROM tenants t
         LEFT JOIN subscription_plans sp ON t.plan_id = sp.id
         WHERE t.id = ?`,
        [tenantId]
      );

      if (tenants.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Tenant not found'
        });
      }

      const tenant = tenants[0];
      const systemAddons = {};

      // Check if Bio Link addon is enabled
      if (tenant.biolink_enabled) {
        // Get usage counts for Bio Link resources
        let bioPageCount = 0, shortLinkCount = 0, qrCodeCount = 0;
        let fileTransferCount = 0, vcardCount = 0, eventLinkCount = 0, htmlPageCount = 0;

        try {
          // Count bio pages
          const [bioPages] = await pool.execute(
            `SELECT COUNT(*) as count FROM biolink_projects WHERE tenant_id = ? AND type = 'biopage'`,
            [tenantId]
          );
          bioPageCount = bioPages[0]?.count || 0;

          // Count short links
          const [shortLinks] = await pool.execute(
            `SELECT COUNT(*) as count FROM biolink_projects WHERE tenant_id = ? AND type = 'shortlink'`,
            [tenantId]
          );
          shortLinkCount = shortLinks[0]?.count || 0;

          // Count QR codes
          const [qrCodes] = await pool.execute(
            `SELECT COUNT(*) as count FROM biolink_projects WHERE tenant_id = ? AND type = 'qrcode'`,
            [tenantId]
          );
          qrCodeCount = qrCodes[0]?.count || 0;

          // Count file transfers
          const [fileTransfers] = await pool.execute(
            `SELECT COUNT(*) as count FROM biolink_projects WHERE tenant_id = ? AND type = 'file'`,
            [tenantId]
          );
          fileTransferCount = fileTransfers[0]?.count || 0;

          // Count vCards
          const [vcards] = await pool.execute(
            `SELECT COUNT(*) as count FROM biolink_projects WHERE tenant_id = ? AND type = 'vcard'`,
            [tenantId]
          );
          vcardCount = vcards[0]?.count || 0;

          // Count event links
          const [eventLinks] = await pool.execute(
            `SELECT COUNT(*) as count FROM biolink_projects WHERE tenant_id = ? AND type = 'event'`,
            [tenantId]
          );
          eventLinkCount = eventLinks[0]?.count || 0;

          // Count HTML pages
          const [htmlPages] = await pool.execute(
            `SELECT COUNT(*) as count FROM biolink_projects WHERE tenant_id = ? AND type = 'html'`,
            [tenantId]
          );
          htmlPageCount = htmlPages[0]?.count || 0;
        } catch (e) {
          // Tables might not exist yet if addon was just activated
          logger.warn('Bio Link tables not found, using zero counts');
        }

        systemAddons.biolink = {
          enabled: true,
          name: 'Bio Link',
          description: 'Create bio pages, short links, QR codes, and more',
          resources: [
            { key: 'bio_pages', name: 'Bio Pages', used: bioPageCount, limit: tenant.max_bio_pages || 0 },
            { key: 'short_links', name: 'Short Links', used: shortLinkCount, limit: tenant.max_short_links || 0 },
            { key: 'qr_codes', name: 'QR Codes', used: qrCodeCount, limit: tenant.max_qr_codes || 0 },
            { key: 'file_transfers', name: 'File Transfers', used: fileTransferCount, limit: tenant.max_file_transfers || 0 },
            { key: 'vcards', name: 'vCards', used: vcardCount, limit: tenant.max_vcards || 0 },
            { key: 'event_links', name: 'Event Links', used: eventLinkCount, limit: tenant.max_event_links || 0 },
            { key: 'html_pages', name: 'HTML Pages', used: htmlPageCount, limit: tenant.max_html_pages || 0 }
          ]
        };
      }

      return res.json({
        success: true,
        data: systemAddons
      });
    } catch (error) {
      logger.error('Error getting system add-ons', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error loading system add-ons'
      });
    }
  }
}

module.exports = PlanManagementController;
