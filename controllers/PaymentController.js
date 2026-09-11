/**
 * Payment Controller - Multi-tenant Payment Management
 * Handles PayPal and Stripe payment methods with tenant isolation
 */

const crypto = require('crypto');
const { pool } = require('../config/database');
const { logger } = require('../config/logger');
const PayPalService = require('../services/paypalService');
const PagBankService = require('../services/pagbankService');

class PaymentController {
  /**
   * Get payment methods for tenant
   * GET /api/tenant/payments/methods
   */
  async getPaymentMethods(req, res) {
    let connection;
    try {
      const tenantId = req.user.tenantId;

      connection = await pool.getConnection();
      const [methods] = await connection.execute(
        `SELECT id, method_name, sandbox_mode, active, created_at, updated_at
         FROM tenant_payment_methods 
         WHERE tenant_id = ?
         ORDER BY method_name ASC`,
        [tenantId]
      );

      // Get credentials separately (decrypted)
      const methodsWithCredentials = await Promise.all(
        methods.map(async (method) => {
          const [credentials] = await connection.execute(
            `SELECT api_key, api_secret 
             FROM tenant_payment_methods 
             WHERE id = ? AND tenant_id = ?`,
            [method.id, tenantId]
          );

          if (credentials.length > 0) {
            try {
              return {
                ...method,
                api_key: credentials[0].api_key ? this.decryptData(credentials[0].api_key) : null,
                api_secret: credentials[0].api_secret ? this.decryptData(credentials[0].api_secret) : null,
                has_credentials: !!(credentials[0].api_key && credentials[0].api_secret)
              };
            } catch (error) {
              this.logger.error('Error decrypting credentials:', error);
              return {
                ...method,
                api_key: null,
                api_secret: null,
                has_credentials: false
              };
            }
          }

          return {
            ...method,
            api_key: null,
            api_secret: null,
            has_credentials: false
          };
        })
      );

      res.json(methodsWithCredentials);
    } catch (error) {
      logger.error('Error fetching payment methods:', error);
      res.status(500).json({ error: 'Error fetching payment methods' });
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * Configure payment method for tenant
   * POST /api/tenant/payments/methods
   */
  async configurePaymentMethod(req, res) {
    let connection;
    try {
      const tenantId = req.user.tenantId;
      const { method_name, api_key, api_secret, sandbox_mode = true } = req.body;

      // Validation
      if (!method_name || !api_key || !api_secret) {
        return res.status(400).json({ 
          error: 'Method name, API key and API secret are required' 
        });
      }

      if (!['paypal', 'stripe'].includes(method_name)) {
        return res.status(400).json({ 
          error: 'Payment method not supported. Use: paypal, stripe' 
        });
      }

      // Encrypt credentials
      const encryptedApiKey = this.encryptData(api_key);
      const encryptedApiSecret = this.encryptData(api_secret);

      connection = await pool.getConnection();

      // Check if method already exists for this tenant
      const [existing] = await connection.execute(
        `SELECT id FROM tenant_payment_methods 
         WHERE tenant_id = ? AND method_name = ?`,
        [tenantId, method_name]
      );

      if (existing.length > 0) {
        // Update existing
        await connection.execute(
          `UPDATE tenant_payment_methods 
           SET api_key = ?, api_secret = ?, sandbox_mode = ?, updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = ? AND method_name = ?`,
          [encryptedApiKey, encryptedApiSecret, sandbox_mode, tenantId, method_name]
        );
      } else {
        // Create new
        await connection.execute(
          `INSERT INTO tenant_payment_methods 
           (tenant_id, method_name, api_key, api_secret, sandbox_mode) 
           VALUES (?, ?, ?, ?, ?)`,
          [tenantId, method_name, encryptedApiKey, encryptedApiSecret, sandbox_mode]
        );
      }

      res.json({
        success: true,
        message: `${method_name.toUpperCase()} configured successfully`
      });
    } catch (error) {
      logger.error('Error configuring payment method:', error);
      res.status(500).json({ error: 'Error configuring payment method' });
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * Toggle payment method active status
   * PATCH /api/tenant/payments/methods/:id/toggle
   */
  async togglePaymentMethod(req, res) {
    let connection;
    try {
      const tenantId = req.user.tenantId;
      const { id } = req.params;
      const { active } = req.body;

      if (typeof active !== 'boolean') {
        return res.status(400).json({ error: 'Active status must be boolean' });
      }

      connection = await pool.getConnection();

      // Verify ownership
      const [method] = await connection.execute(
        `SELECT id FROM tenant_payment_methods 
         WHERE id = ? AND tenant_id = ?`,
        [id, tenantId]
      );

      if (method.length === 0) {
        return res.status(404).json({ error: 'Payment method not found' });
      }

      await connection.execute(
        `UPDATE tenant_payment_methods 
         SET active = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE id = ? AND tenant_id = ?`,
        [active, id, tenantId]
      );

      res.json({
        success: true,
        message: `Payment method ${active ? 'activated' : 'deactivated'} successfully`
      });
    } catch (error) {
      logger.error('Error toggling payment method:', error);
      res.status(500).json({ error: 'Error toggling payment method' });
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * Create payment link
   * POST /api/tenant/payments/create-link
   */
  async createPaymentLink(req, res) {
    let connection;
    try {
      const tenantId = req.user.tenantId;
      const userId = req.user.id;
      let {
        payment_method,
        amount,
        description,
        customer_phone,
        customer_name
      } = req.body;

      // Validate and sanitize customer_name for PagBank requirements
      // PagBank requires: full name (first and last), 5-50 characters, letters and spaces only
      if (!customer_name || 
          customer_name.trim() === '' || 
          /^\d+$/.test(customer_name.trim()) ||
          customer_name.length > 50 ||
          customer_name.length < 5) {
        customer_name = 'Cliente Padrao';
      } else {
        // Remove special characters and numbers, keep only letters and spaces
        // Also normalize multiple spaces to single space
        customer_name = customer_name.trim()
          .replace(/[^a-zA-ZÀ-ÿ\s]/g, '')
          .replace(/\s+/g, ' ')
          .substring(0, 50);
        
        // Ensure it has at least 2 words (first and last name) and minimum 5 characters
        const words = customer_name.split(' ').filter(w => w.length > 0);
        if (words.length < 2 || customer_name.length < 5) {
          customer_name = 'Cliente Padrao';
        }
      }

      // Validation
      if (!payment_method || !amount || !customer_phone) {
        return res.status(400).json({
          error: 'Payment method, amount and customer phone are required'
        });
      }

      if (!['paypal', 'stripe'].includes(payment_method)) {
        return res.status(400).json({ error: 'Payment method not supported' });
      }

      if (amount <= 0) {
        return res.status(400).json({ error: 'Amount must be greater than zero' });
      }

      connection = await pool.getConnection();

      // Get payment method configuration
      const [methods] = await connection.execute(
        `SELECT * FROM tenant_payment_methods 
         WHERE tenant_id = ? AND method_name = ? AND active = TRUE`,
        [tenantId, payment_method]
      );

      if (methods.length === 0) {
        return res.status(400).json({
          error: `${payment_method.toUpperCase()} is not configured or active`
        });
      }

      const methodConfig = methods[0];

      // Decrypt credentials
      let apiKey, apiSecret;
      try {
        apiKey = this.decryptData(methodConfig.api_key);
        apiSecret = this.decryptData(methodConfig.api_secret);
      } catch (error) {
        logger.error('Error decrypting credentials:', error);
        return res.status(500).json({ 
          error: 'Error decrypting payment credentials. Please reconfigure the payment method.' 
        });
      }

      // Validate credentials
      if (!apiKey || !apiSecret) {
        return res.status(400).json({ 
          error: 'Payment credentials are missing. Please configure the payment method.' 
        });
      }

      // Generate payment link
      let paymentResult;
      const referenceId = `${tenantId}_${Date.now()}`;

      try {
        if (payment_method === 'paypal') {
          // PayPal expects clientId and clientSecret
          const paypalService = new PayPalService(apiKey, apiSecret, methodConfig.sandbox_mode);
          paymentResult = await paypalService.createPayment({
            amount,
            description: description || 'Payment via WhatsApp',
            customer_name,
            customer_phone,
            reference_id: referenceId
          });
        } else if (payment_method === 'stripe') {
          // Stripe expects secret key only
          const StripeService = require('../services/stripeService');
          const stripeService = new StripeService(apiSecret);
          paymentResult = await stripeService.createPayment({
            amount,
            description: description || 'Payment via WhatsApp',
            customer_name,
            customer_phone,
            reference_id: referenceId
          });
        }
      } catch (error) {
        logger.error(`Error calling ${payment_method} service:`, error);
        return res.status(500).json({ 
          error: `Error communicating with ${payment_method.toUpperCase()} service`,
          details: error.message 
        });
      }

      if (!paymentResult.success) {
        return res.status(400).json({ error: paymentResult.error });
      }

      // Save to database
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours expiration

      const [result] = await connection.execute(
        `INSERT INTO tenant_payment_links 
         (tenant_id, payment_method, amount, description, customer_phone, 
          customer_name, payment_url, payment_id, created_by, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tenantId, payment_method, amount, description, customer_phone,
          customer_name, paymentResult.payment_url, paymentResult.payment_id,
          userId, expiresAt
        ]
      );

      res.json({
        success: true,
        payment_link: {
          id: result.insertId,
          payment_url: paymentResult.payment_url,
          payment_id: paymentResult.payment_id,
          amount: amount,
          expires_at: expiresAt
        }
      });
    } catch (error) {
      logger.error('Error creating payment link:', error);
      logger.error('Error stack:', error.stack);
      res.status(500).json({ 
        error: 'Error creating payment link',
        details: error.message 
      });
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * List payment links
   * GET /api/tenant/payments/links
   */
  async listPaymentLinks(req, res) {
    let connection;
    try {
      const tenantId = req.user.tenantId;
      const { page = 1, limit = 20, status, method } = req.query;
      const offset = (page - 1) * limit;

      connection = await pool.getConnection();

      let query = `
        SELECT p.*, u.username as created_by_name
        FROM tenant_payment_links p
        LEFT JOIN users u ON p.created_by = u.id
        WHERE p.tenant_id = ?
      `;
      let params = [tenantId];

      if (status) {
        query += ' AND p.status = ?';
        params.push(status);
      }

      if (method) {
        query += ' AND p.payment_method = ?';
        params.push(method);
      }

      query += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit), parseInt(offset));

      const [links] = await connection.execute(query, params);

      // Count total
      let countQuery = `
        SELECT COUNT(*) as total 
        FROM tenant_payment_links 
        WHERE tenant_id = ?
      `;
      let countParams = [tenantId];

      if (status) {
        countQuery += ' AND status = ?';
        countParams.push(status);
      }

      if (method) {
        countQuery += ' AND payment_method = ?';
        countParams.push(method);
      }

      const [countResult] = await connection.execute(countQuery, countParams);

      res.json({
        links,
        total: countResult[0].total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(countResult[0].total / limit)
      });
    } catch (error) {
      logger.error('Error fetching payment links:', error);
      res.status(500).json({ error: 'Error fetching payment links' });
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * Check payment status
   * GET /api/tenant/payments/links/:id/status
   */
  async checkPaymentStatus(req, res) {
    let connection;
    try {
      const tenantId = req.user.tenantId;
      const { id } = req.params;

      connection = await pool.getConnection();

      const [links] = await connection.execute(
        `SELECT * FROM tenant_payment_links 
         WHERE id = ? AND tenant_id = ?`,
        [id, tenantId]
      );

      if (links.length === 0) {
        return res.status(404).json({ error: 'Payment link not found' });
      }

      const link = links[0];

      // Get payment method configuration
      const [methods] = await connection.execute(
        `SELECT * FROM tenant_payment_methods 
         WHERE tenant_id = ? AND method_name = ? AND active = TRUE`,
        [tenantId, link.payment_method]
      );

      if (methods.length === 0) {
        return res.status(400).json({
          error: `${link.payment_method.toUpperCase()} is not configured or active`
        });
      }

      const methodConfig = methods[0];
      
      let apiKey, apiSecret;
      try {
        apiKey = this.decryptData(methodConfig.api_key);
        apiSecret = this.decryptData(methodConfig.api_secret);
      } catch (error) {
        logger.error('Error decrypting credentials:', error);
        return res.status(500).json({ 
          error: 'Error decrypting payment credentials' 
        });
      }

      // Check status with provider
      let statusResult;

      try {
        if (link.payment_method === 'paypal') {
          const paypalService = new PayPalService(apiKey, apiSecret, methodConfig.sandbox_mode);
          statusResult = await paypalService.getPaymentStatus(link.payment_id);
        } else if (link.payment_method === 'stripe') {
          const StripeService = require('../services/stripeService');
          const stripeService = new StripeService(apiSecret);
          statusResult = await stripeService.getPaymentStatus(link.payment_id);
        }
      } catch (error) {
        logger.error(`Error checking ${link.payment_method} status:`, error);
        return res.status(500).json({ 
          error: `Error checking payment status with ${link.payment_method.toUpperCase()}`,
          details: error.message 
        });
      }

      // Update status if changed
      if (statusResult && statusResult.status !== link.status) {
        await connection.execute(
          `UPDATE tenant_payment_links 
           SET status = ?, paid_at = ?, updated_at = CURRENT_TIMESTAMP 
           WHERE id = ? AND tenant_id = ?`,
          [statusResult.status, statusResult.paid_at, id, tenantId]
        );

        link.status = statusResult.status;
        link.paid_at = statusResult.paid_at;
      }

      res.json({
        id: link.id,
        status: link.status,
        amount: link.amount,
        paid_at: link.paid_at,
        expires_at: link.expires_at
      });
    } catch (error) {
      logger.error('Error checking payment status:', error);
      res.status(500).json({ error: 'Error checking payment status' });
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * Get payment statistics
   * GET /api/tenant/payments/stats
   */
  async getPaymentStats(req, res) {
    let connection;
    try {
      const tenantId = req.user.tenantId;

      connection = await pool.getConnection();

      // Today's payments
      const [todayStats] = await connection.execute(
        `SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total
         FROM tenant_payment_links
         WHERE tenant_id = ? AND DATE(created_at) = CURDATE()`,
        [tenantId]
      );

      // Pending payments
      const [pendingStats] = await connection.execute(
        `SELECT COUNT(*) as count
         FROM tenant_payment_links
         WHERE tenant_id = ? AND status = 'pending'`,
        [tenantId]
      );

      // Success rate (last 30 days)
      const [successStats] = await connection.execute(
        `SELECT 
           COUNT(*) as total,
           SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as paid
         FROM tenant_payment_links
         WHERE tenant_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
        [tenantId]
      );

      const successRate = successStats[0].total > 0
        ? ((successStats[0].paid / successStats[0].total) * 100).toFixed(1)
        : 0;

      res.json({
        today: {
          count: todayStats[0].count,
          total: parseFloat(todayStats[0].total)
        },
        pending: pendingStats[0].count,
        success_rate: parseFloat(successRate)
      });
    } catch (error) {
      logger.error('Error fetching payment statistics:', error);
      res.status(500).json({ error: 'Error fetching payment statistics' });
    } finally {
      if (connection) connection.release();
    }
  }

  // Helper methods for encryption/decryption
  encryptData(text) {
    const keyString = process.env.ENCRYPTION_KEY || 'default-key-change-in-production-32';
    const key = crypto.createHash('sha256').update(keyString).digest();
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return iv.toString('hex') + ':' + encrypted;
  }

  decryptData(encryptedText) {
    const keyString = process.env.ENCRYPTION_KEY || 'default-key-change-in-production-32';
    const key = crypto.createHash('sha256').update(keyString).digest();

    const textParts = encryptedText.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encrypted = textParts.join(':');

    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}

const paymentController = new PaymentController();

module.exports = {
  getPaymentMethods: (req, res) => paymentController.getPaymentMethods(req, res),
  configurePaymentMethod: (req, res) => paymentController.configurePaymentMethod(req, res),
  togglePaymentMethod: (req, res) => paymentController.togglePaymentMethod(req, res),
  createPaymentLink: (req, res) => paymentController.createPaymentLink(req, res),
  listPaymentLinks: (req, res) => paymentController.listPaymentLinks(req, res),
  checkPaymentStatus: (req, res) => paymentController.checkPaymentStatus(req, res),
  getPaymentStats: (req, res) => paymentController.getPaymentStats(req, res)
};
