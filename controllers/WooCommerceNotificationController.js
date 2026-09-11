/**
 * WooCommerce Notification Controller - Multi-tenant
 * 
 * Handles WooCommerce webhook notifications and WhatsApp message sending with tenant isolation
 * Supports: New Order, Customer Registration, Password Reset, Product Comments
 * 
 * @module controllers/WooCommerceNotificationController
 */

const { pool } = require('../config/database');
const { logger } = require('../config/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const crypto = require('crypto');

class WooCommerceNotificationController {
  /**
   * Get notification settings
   * GET /api/tenant/woocommerce/notifications/settings
   */
  static getSettings = asyncHandler(async (req, res) => {
    const tenantId = req.user.tenantId;

    try {
      const [settings] = await pool.query(
        'SELECT * FROM woocommerce_notification_settings WHERE tenant_id = ? AND is_active = TRUE LIMIT 1',
        [tenantId]
      );

      if (settings.length === 0) {
        return res.json({
          success: true,
          data: {
            configured: false,
            settings: WooCommerceNotificationController.getDefaultSettings()
          }
        });
      }

      return res.json({
        success: true,
        data: {
          configured: true,
          settings: settings[0]
        }
      });
    } catch (error) {
      logger.error('Error getting notification settings', { tenantId, error: error.message });
      return res.status(500).json({
        success: false,
        error: 'Failed to load notification settings'
      });
    }
  });

  /**
   * Save notification settings
   * POST /api/tenant/woocommerce/notifications/settings
   */
  static saveSettings = asyncHandler(async (req, res) => {
    const tenantId = req.user.tenantId;
    const {
      webhook_secret,
      new_order_enabled,
      new_order_template,
      customer_registration_enabled,
      customer_registration_template,
      password_reset_enabled,
      password_reset_template,
      product_comment_enabled,
      product_comment_template,
      admin_phone
    } = req.body;

    try {
      // Deactivate existing settings
      await pool.query(
        'UPDATE woocommerce_notification_settings SET is_active = FALSE WHERE tenant_id = ?',
        [tenantId]
      );

      // Insert new settings
      await pool.query(`
        INSERT INTO woocommerce_notification_settings (
          tenant_id,
          webhook_secret,
          new_order_enabled,
          new_order_template,
          customer_registration_enabled,
          customer_registration_template,
          password_reset_enabled,
          password_reset_template,
          product_comment_enabled,
          product_comment_template,
          admin_phone,
          is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)
      `, [
        tenantId,
        webhook_secret || crypto.randomBytes(32).toString('hex'),
        new_order_enabled || false,
        new_order_template || WooCommerceNotificationController.getDefaultTemplates().new_order,
        customer_registration_enabled || false,
        customer_registration_template || WooCommerceNotificationController.getDefaultTemplates().customer_registration,
        password_reset_enabled || false,
        password_reset_template || WooCommerceNotificationController.getDefaultTemplates().password_reset,
        product_comment_enabled || false,
        product_comment_template || WooCommerceNotificationController.getDefaultTemplates().product_comment,
        admin_phone || null
      ]);

      logger.info('Notification settings saved', { tenantId });

      return res.json({
        success: true,
        message: 'Notification settings saved successfully'
      });
    } catch (error) {
      logger.error('Error saving notification settings', { tenantId, error: error.message });
      return res.status(500).json({
        success: false,
        error: 'Failed to save notification settings'
      });
    }
  });

  /**
   * Generate webhook secret
   * POST /api/tenant/woocommerce/notifications/generate-secret
   */
  static generateSecret = asyncHandler(async (req, res) => {
    const secret = crypto.randomBytes(32).toString('hex');
    
    return res.json({
      success: true,
      data: { secret }
    });
  });

  /**
   * Handle webhook from WooCommerce
   * POST /api/woocommerce/webhook/:tenantId
   */
  static handleWebhook = asyncHandler(async (req, res) => {
    const signature = req.headers['x-wc-webhook-signature'];
    const topic = req.headers['x-wc-webhook-topic'];
    const webhookId = req.headers['x-wc-webhook-id'];
    const { tenantId } = req.params;
    
    logger.info('WooCommerce webhook received', { tenantId, topic, webhookId });

    try {
      // Get settings for this tenant
      const [settings] = await pool.query(
        'SELECT * FROM woocommerce_notification_settings WHERE tenant_id = ? AND is_active = TRUE LIMIT 1',
        [tenantId]
      );

      if (settings.length === 0) {
        logger.warn('Webhook received but notifications not configured', { tenantId });
        return res.status(200).json({ message: 'Notifications not configured' });
      }

      const config = settings[0];

      // Verify signature if secret is set
      if (config.webhook_secret && signature) {
        const expectedSignature = crypto
          .createHmac('sha256', config.webhook_secret)
          .update(JSON.stringify(req.body))
          .digest('base64');

        if (signature !== expectedSignature) {
          logger.error('Invalid webhook signature', { tenantId });
          return res.status(401).json({ error: 'Invalid signature' });
        }
      }

      // Process webhook based on topic
      await WooCommerceNotificationController.processWebhook(tenantId, topic, req.body, config);

      return res.status(200).json({ message: 'Webhook processed successfully' });
    } catch (error) {
      logger.error('Error processing webhook', { tenantId, error: error.message });
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Process webhook based on topic
   */
  static async processWebhook(tenantId, topic, data, config) {
    switch (topic) {
      case 'order.created':
        if (config.new_order_enabled) {
          await WooCommerceNotificationController.sendNewOrderNotification(tenantId, data, config);
        }
        break;

      case 'customer.created':
        if (config.customer_registration_enabled) {
          await WooCommerceNotificationController.sendCustomerRegistrationNotification(tenantId, data, config);
        }
        break;

      case 'customer.password_reset':
        if (config.password_reset_enabled) {
          await WooCommerceNotificationController.sendPasswordResetNotification(tenantId, data, config);
        }
        break;

      case 'product_review.created':
      case 'comment.created':
        if (config.product_comment_enabled) {
          await WooCommerceNotificationController.sendProductCommentNotification(tenantId, data, config);
        }
        break;

      default:
        logger.info('Unhandled webhook topic', { tenantId, topic });
    }
  }

  /**
   * Send new order notification to CUSTOMER
   */
  static async sendNewOrderNotification(tenantId, order, config) {
    try {
      const customerPhone = order.billing.phone;
      
      if (!customerPhone) {
        logger.warn('No customer phone in order', { tenantId, order_id: order.id });
        return;
      }

      const message = WooCommerceNotificationController.replacePlaceholders(
        config.new_order_template,
        {
          order_id: order.id,
          order_number: order.number,
          customer_name: `${order.billing.first_name} ${order.billing.last_name}`,
          customer_email: order.billing.email,
          customer_phone: order.billing.phone,
          total: order.total,
          currency: order.currency,
          payment_method: order.payment_method_title,
          items_count: order.line_items.length,
          order_status: order.status,
          order_date: new Date(order.date_created).toLocaleString()
        }
      );

      await WooCommerceNotificationController.sendWhatsAppMessage(tenantId, customerPhone, message);
      
      logger.info('New order notification sent to customer', { tenantId, order_id: order.id, customer_phone: customerPhone });
    } catch (error) {
      logger.error('Error sending new order notification', { tenantId, error: error.message });
    }
  }

  /**
   * Send customer registration notification to CUSTOMER (welcome message)
   */
  static async sendCustomerRegistrationNotification(tenantId, customer, config) {
    try {
      const customerPhone = customer.billing?.phone || customer.phone;
      
      if (!customerPhone) {
        logger.warn('No customer phone for registration', { tenantId, customer_id: customer.id });
        return;
      }

      const message = WooCommerceNotificationController.replacePlaceholders(
        config.customer_registration_template,
        {
          customer_id: customer.id,
          customer_name: `${customer.first_name} ${customer.last_name}`,
          customer_email: customer.email,
          customer_username: customer.username,
          registration_date: new Date(customer.date_created).toLocaleString()
        }
      );

      await WooCommerceNotificationController.sendWhatsAppMessage(tenantId, customerPhone, message);
      
      logger.info('Welcome message sent to new customer', { tenantId, customer_id: customer.id, customer_phone: customerPhone });
    } catch (error) {
      logger.error('Error sending customer registration notification', { tenantId, error: error.message });
    }
  }

  /**
   * Send password reset notification to CUSTOMER
   */
  static async sendPasswordResetNotification(tenantId, data, config) {
    try {
      const customerPhone = data.phone || data.billing_phone;
      
      if (!customerPhone) {
        logger.warn('No customer phone for password reset', { tenantId, email: data.user_email || data.email });
        return;
      }

      const message = WooCommerceNotificationController.replacePlaceholders(
        config.password_reset_template,
        {
          customer_email: data.user_email || data.email,
          reset_link: data.reset_link || 'N/A',
          request_time: new Date().toLocaleString()
        }
      );

      await WooCommerceNotificationController.sendWhatsAppMessage(tenantId, customerPhone, message);
      
      logger.info('Password reset link sent to customer', { tenantId, customer_phone: customerPhone });
    } catch (error) {
      logger.error('Error sending password reset notification', { tenantId, error: error.message });
    }
  }

  /**
   * Send product comment confirmation to CUSTOMER
   */
  static async sendProductCommentNotification(tenantId, comment, config) {
    try {
      const customerPhone = comment.author_phone || comment.reviewer_phone;
      
      if (!customerPhone) {
        logger.warn('No customer phone for comment notification', { tenantId, comment_id: comment.id });
        return;
      }

      const message = WooCommerceNotificationController.replacePlaceholders(
        config.product_comment_template,
        {
          comment_id: comment.id,
          product_name: comment.product_name || 'Unknown Product',
          customer_name: comment.reviewer || comment.author_name,
          customer_email: comment.reviewer_email || comment.author_email,
          comment_text: comment.review || comment.content,
          rating: comment.rating || 'N/A',
          comment_date: new Date(comment.date_created || comment.date).toLocaleString()
        }
      );

      await WooCommerceNotificationController.sendWhatsAppMessage(tenantId, customerPhone, message);
      
      logger.info('Comment confirmation sent to customer', { tenantId, comment_id: comment.id, customer_phone: customerPhone });
    } catch (error) {
      logger.error('Error sending product comment notification', { tenantId, error: error.message });
    }
  }

  /**
   * Send WhatsApp message (tenant-isolated)
   * Uses WhatsAppService directly instead of queueing
   */
  static async sendWhatsAppMessage(tenantId, phone, message) {
    try {
      logger.info('sendWhatsAppMessage called', { tenantId, phone, messageLength: message.length });
      
      // Get WhatsAppService instance
      const { getWhatsAppService } = require('../services/WhatsAppService');
      const whatsappService = getWhatsAppService();
      
      logger.info('WhatsAppService retrieved', { hasService: !!whatsappService });
      
      if (!whatsappService) {
        throw new Error('WhatsApp service not initialized');
      }

      // Sanitize phone number
      const sanitizedPhone = phone.replace(/[^\d+]/g, '');
      
      logger.info('Phone sanitized', { original: phone, sanitized: sanitizedPhone });
      
      if (!sanitizedPhone || sanitizedPhone.length < 10) {
        throw new Error('Invalid phone number format');
      }

      // Send message directly using WhatsAppService
      logger.info('Calling whatsappService.sendMessage', { tenantId, phone: sanitizedPhone });
      
      const result = await whatsappService.sendMessage(tenantId, sanitizedPhone, message);
      
      logger.info('sendMessage result', { result });
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to send message');
      }

      logger.info('WhatsApp message sent successfully', { tenantId, phone: sanitizedPhone });
      
      return true;
    } catch (error) {
      logger.error('Error sending WhatsApp message', { 
        tenantId, 
        phone, 
        error: error.message,
        stack: error.stack 
      });
      throw error;
    }
  }

  /**
   * Replace placeholders in template
   */
  static replacePlaceholders(template, data) {
    let result = template;
    
    for (const [key, value] of Object.entries(data)) {
      const placeholder = `{{${key}}}`;
      result = result.replace(new RegExp(placeholder, 'g'), value);
    }
    
    return result;
  }

  /**
   * Get default settings
   */
  static getDefaultSettings() {
    return {
      webhook_secret: '',
      new_order_enabled: false,
      new_order_template: WooCommerceNotificationController.getDefaultTemplates().new_order,
      customer_registration_enabled: false,
      customer_registration_template: WooCommerceNotificationController.getDefaultTemplates().customer_registration,
      password_reset_enabled: false,
      password_reset_template: WooCommerceNotificationController.getDefaultTemplates().password_reset,
      product_comment_enabled: false,
      product_comment_template: WooCommerceNotificationController.getDefaultTemplates().product_comment,
      admin_phone: ''
    };
  }

  /**
   * Get default templates (messages sent TO CUSTOMERS)
   */
  static getDefaultTemplates() {
    return {
      new_order: `🛒 *Order Confirmation*

Hello {{customer_name}}!

Thank you for your order #{{order_number}}

*Order Details:*
Total: {{currency}} {{total}}
Payment: {{payment_method}}
Items: {{items_count}}
Status: {{order_status}}

Date: {{order_date}}

We'll process your order shortly!`,

      customer_registration: `👋 *Welcome to Our Store!*

Hello {{customer_name}}!

Thank you for registering with us!

*Your Account Details:*
Email: {{customer_email}}
Username: {{customer_username}}

You can now enjoy exclusive benefits and track your orders.

Happy shopping! 🛍️`,

      password_reset: `🔐 *Password Reset Request*

Hello!

We received a request to reset your password for: {{customer_email}}

Click the link below to reset your password:
{{reset_link}}

If you didn't request this, please ignore this message.

Request time: {{request_time}}`,

      product_comment: `💬 *Thank You for Your Review!*

Hello {{customer_name}}!

Thank you for reviewing *{{product_name}}*!

Your rating: {{rating}} ⭐

Your comment:
"{{comment_text}}"

We appreciate your feedback!

Date: {{comment_date}}`
    };
  }

  /**
   * Test notification
   * POST /api/tenant/woocommerce/notifications/test
   */
  static testNotification = asyncHandler(async (req, res) => {
    const tenantId = req.user.tenantId;
    const { type, phone, template } = req.body;

    logger.info('Test notification request', { tenantId, type, phone });

    if (!phone || !template) {
      return res.status(400).json({
        success: false,
        error: 'Phone and template are required'
      });
    }

    // Validate phone format
    const sanitizedPhone = phone.replace(/[^\d+]/g, '');
    if (!sanitizedPhone || sanitizedPhone.length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone number format. Use international format (e.g., +1234567890)'
      });
    }

    try {
      // Create test data based on type
      let testData = {};
      
      switch (type) {
        case 'new_order':
          testData = {
            order_id: '12345',
            order_number: '12345',
            customer_name: 'John Doe',
            customer_email: 'john@example.com',
            customer_phone: '+1234567890',
            total: '99.99',
            currency: 'USD',
            payment_method: 'Credit Card',
            items_count: '3',
            order_status: 'processing',
            order_date: new Date().toLocaleString()
          };
          break;

        case 'customer_registration':
          testData = {
            customer_id: '123',
            customer_name: 'Jane Smith',
            customer_email: 'jane@example.com',
            customer_username: 'janesmith',
            registration_date: new Date().toLocaleString()
          };
          break;

        case 'password_reset':
          testData = {
            customer_email: 'customer@example.com',
            reset_link: 'https://yourstore.com/reset-password',
            request_time: new Date().toLocaleString()
          };
          break;

        case 'product_comment':
          testData = {
            comment_id: '456',
            product_name: 'Sample Product',
            customer_name: 'Bob Johnson',
            customer_email: 'bob@example.com',
            comment_text: 'Great product! Highly recommended.',
            rating: '5',
            comment_date: new Date().toLocaleString()
          };
          break;

        default:
          return res.status(400).json({
            success: false,
            error: 'Invalid notification type'
          });
      }

      const message = WooCommerceNotificationController.replacePlaceholders(template, testData);
      
      logger.info('Sending test notification', { tenantId, type, phone: sanitizedPhone, messageLength: message.length });
      
      // Send message using WhatsAppService
      await WooCommerceNotificationController.sendWhatsAppMessage(tenantId, sanitizedPhone, message);

      logger.info('Test notification sent successfully', { tenantId, type, phone: sanitizedPhone });

      return res.json({
        success: true,
        message: 'Test notification sent successfully! The message was sent via WhatsApp. Note: If you sent to your own number, you won\'t see it in conversations (messages from self are ignored to prevent loops).'
      });
    } catch (error) {
      logger.error('Error sending test notification', { 
        tenantId, 
        type,
        phone,
        error: error.message, 
        stack: error.stack 
      });
      
      let errorMessage = 'Failed to send test notification';
      
      if (error.message.includes('WhatsApp not connected') || error.message.includes('not initialized')) {
        errorMessage = 'WhatsApp is not connected. Please connect WhatsApp first in the WhatsApp Settings page.';
      } else if (error.message.includes('phone')) {
        errorMessage = 'Invalid phone number format. Use international format (e.g., +1234567890)';
      } else if (error.message.includes('ER_NO_SUCH_TABLE')) {
        errorMessage = 'Database table not found. Please run migrations.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      return res.status(500).json({
        success: false,
        error: errorMessage
      });
    }
  });
}

module.exports = WooCommerceNotificationController;
