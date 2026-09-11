/**
 * Invoice Controller
 * Multi-tenant invoice and quote operations
 * 
 * @module controllers/InvoiceController
 */

const InvoiceRepository = require('../repositories/InvoiceRepository');
const { logger } = require('../config/logger');
const PayPalService = require('../services/paypalService');
const StripeService = require('../services/stripeService');

class InvoiceController {
  /**
   * Create new invoice or quote (Admin only)
   * @route POST /api/invoices/admin
   */
  async create(req, res) {
    try {
      const { client, items, ...invoiceData } = req.body;
      const tenantId = req.tenantId;
      const adminId = req.user?.id || null;

      if (!items || items.length === 0) {
        return res.status(400).json({ success: false, error: 'At least one item is required' });
      }

      const invoice = await InvoiceRepository.createInvoice(tenantId, { ...invoiceData, client }, items, adminId);
      logger.info(`Invoice created: ${invoice.invoice_number}`, { tenant_id: tenantId, admin_id: adminId, invoice_id: invoice.id });
      res.status(201).json({ success: true, invoice });
    } catch (error) {
      logger.error('Error creating invoice:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to create invoice' });
    }
  }

  /**
   * List invoices with filters (Admin only)
   * @route GET /api/invoices/admin
   */
  async list(req, res) {
    try {
      const tenantId = req.tenantId;
      const filters = {
        type: req.query.type,
        status: req.query.status,
        client_id: req.query.client_id,
        search: req.query.search,
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20,
        sort_by: req.query.sort_by || 'created_at',
        sort_order: req.query.sort_order || 'DESC',
        tab: req.query.tab || 'active'
      };

      const result = await InvoiceRepository.listInvoices(tenantId, filters);
      const tabCounts = await InvoiceRepository.getTabCounts(tenantId);
      res.json({ success: true, ...result, tabCounts });
    } catch (error) {
      logger.error('Error listing invoices:', error);
      res.status(500).json({ success: false, error: 'Failed to list invoices' });
    }
  }

  /**
   * Get invoice by ID (Admin only)
   * @route GET /api/invoices/admin/:id
   */
  async getById(req, res) {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      const invoice = await InvoiceRepository.getInvoiceById(tenantId, id);

      if (!invoice) {
        return res.status(404).json({ success: false, error: 'Invoice not found' });
      }
      res.json({ success: true, invoice });
    } catch (error) {
      logger.error('Error getting invoice:', error);
      res.status(500).json({ success: false, error: 'Failed to get invoice' });
    }
  }

  /**
   * Update invoice status (Admin only)
   * @route PUT /api/invoices/admin/:id/status
   */
  async updateStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const tenantId = req.tenantId;

      const actorInfo = {
        actor_type: 'admin',
        actor_id: req.user.id,
        ip_address: req.ip,
        user_agent: req.get('user-agent')
      };

      await InvoiceRepository.updateStatus(tenantId, id, status, actorInfo);
      logger.info(`Invoice status updated: ${id} -> ${status}`, { tenant_id: tenantId, admin_id: req.user.id });
      res.json({ success: true, message: 'Status updated successfully' });
    } catch (error) {
      logger.error('Error updating invoice status:', error);
      res.status(500).json({ success: false, error: 'Failed to update status' });
    }
  }

  /**
   * Toggle invoice active status (Admin only)
   * @route PUT /api/invoices/admin/:id/toggle-active
   */
  async toggleActive(req, res) {
    try {
      const { id } = req.params;
      const { is_active } = req.body;
      const tenantId = req.tenantId;

      await InvoiceRepository.toggleActive(tenantId, id, is_active, {
        actor_type: 'admin',
        actor_id: req.user.id,
        ip_address: req.ip,
        user_agent: req.get('user-agent')
      });

      logger.info(`Invoice ${is_active ? 'enabled' : 'disabled'}: ${id}`, { tenant_id: tenantId });
      res.json({ success: true, message: is_active ? 'Invoice enabled' : 'Invoice disabled' });
    } catch (error) {
      logger.error('Error toggling invoice active status:', error);
      res.status(500).json({ success: false, error: 'Failed to toggle invoice status' });
    }
  }

  /**
   * Archive invoice (Admin only)
   * @route POST /api/invoices/admin/:id/archive
   */
  async archive(req, res) {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;

      await InvoiceRepository.updateStatus(tenantId, id, 'archived', {
        actor_type: 'admin',
        actor_id: req.user.id,
        details: 'Invoice archived',
        ip_address: req.ip,
        user_agent: req.get('user-agent')
      });

      res.json({ success: true, message: 'Invoice archived successfully' });
    } catch (error) {
      logger.error('Error archiving invoice:', error);
      res.status(500).json({ success: false, error: 'Failed to archive invoice' });
    }
  }

  /**
   * Delete invoice permanently (Admin only)
   * @route DELETE /api/invoices/admin/:id
   */
  async delete(req, res) {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;

      await InvoiceRepository.deleteInvoice(tenantId, id);
      logger.info(`Invoice deleted: ${id}`, { tenant_id: tenantId, admin_id: req.user.id });
      res.json({ success: true, message: 'Invoice deleted successfully' });
    } catch (error) {
      logger.error('Error deleting invoice:', error);
      res.status(500).json({ success: false, error: 'Failed to delete invoice' });
    }
  }

  /**
   * Respond to rejection (Admin only)
   * @route POST /api/invoices/admin/:id/respond
   */
  async respondToRejection(req, res) {
    try {
      const { id } = req.params;
      const { response } = req.body;
      const tenantId = req.tenantId;

      if (!response || response.trim().length < 10) {
        return res.status(400).json({ success: false, error: 'Response must be at least 10 characters' });
      }

      await InvoiceRepository.respondToRejection(tenantId, id, response, {
        actor_type: 'admin',
        actor_id: req.user.id,
        ip_address: req.ip,
        user_agent: req.get('user-agent')
      });

      logger.info(`Admin responded to rejection: ${id}`, { tenant_id: tenantId });
      res.json({ success: true, message: 'Response sent successfully' });
    } catch (error) {
      logger.error('Error responding to rejection:', error);
      res.status(500).json({ success: false, error: 'Failed to send response' });
    }
  }

  /**
   * Send invoice to client via WhatsApp (Admin only)
   * @route POST /api/invoices/admin/:id/send-whatsapp
   */
  async sendViaWhatsApp(req, res) {
    try {
      const { id } = req.params;
      const { phone, use_client_phone } = req.body;
      const tenantId = req.tenantId;

      const invoice = await InvoiceRepository.getInvoiceById(tenantId, id);
      if (!invoice) {
        return res.status(404).json({ success: false, error: 'Invoice not found' });
      }

      const targetPhone = use_client_phone ? invoice.client_phone : phone;
      if (!targetPhone) {
        return res.status(400).json({ success: false, error: 'Phone number is required' });
      }

      const cleanPhone = targetPhone.replace(/\D/g, '');
      const baseUrl = process.env.APP_URL || process.env.BASE_URL || 'http://localhost:7000';
      const publicLink = `${baseUrl}/invoice/${invoice.invoice_number}`;

      const invoiceType = invoice.type === 'quote' ? 'Quote' : 'Invoice';
      const message = `Hello ${invoice.client_name}! 👋\n\n` +
        `Your ${invoiceType} *${invoice.invoice_number}* is ready.\n\n` +
        `📋 *${invoice.title}*\n` +
        `💰 Total: ${this.formatCurrency(invoice.total_amount, invoice.currency)}\n\n` +
        `🔗 Access: ${publicLink}\n` +
        `🔐 Use your email to access.\n\n` +
        `Thank you for your business! 🙏`;

      const whatsappService = req.app.get('whatsappService');
      if (!whatsappService || typeof whatsappService.sendMessage !== 'function') {
        return res.status(500).json({ success: false, error: 'WhatsApp service not available' });
      }

      const sendResult = await whatsappService.sendMessage(tenantId, cleanPhone, message);
      if (!sendResult || sendResult.success === false) {
        throw new Error(sendResult?.error || 'Failed to send message');
      }

      if (invoice.status === 'draft') {
        await InvoiceRepository.updateStatus(tenantId, id, 'sent', {
          actor_type: 'admin',
          actor_id: req.user.id,
          details: 'Invoice sent via WhatsApp',
          ip_address: req.ip,
          user_agent: req.get('user-agent')
        });
      }

      logger.info(`Invoice sent via WhatsApp: ${invoice.invoice_number}`, { tenant_id: tenantId, phone: cleanPhone });
      res.json({ success: true, message: 'Invoice sent successfully via WhatsApp' });
    } catch (error) {
      logger.error('Error sending invoice via WhatsApp:', error);
      res.status(500).json({ success: false, error: 'Failed to send invoice' });
    }
  }

  /**
   * Convert quote to invoice (Admin only)
   * @route POST /api/invoices/admin/:id/convert-to-invoice
   */
  async convertToInvoice(req, res) {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      const adminId = req.user.id;

      const invoice = await InvoiceRepository.convertQuoteToInvoice(tenantId, id, adminId);
      logger.info(`Quote converted to invoice: ${id} -> ${invoice.id}`, { tenant_id: tenantId, admin_id: adminId });
      res.json({ success: true, invoice });
    } catch (error) {
      logger.error('Error converting quote to invoice:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to convert quote' });
    }
  }

  /**
   * Finalize rejection (Admin only)
   * @route POST /api/invoices/admin/:id/finalize-rejection
   */
  async finalizeRejection(req, res) {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;

      await InvoiceRepository.updateStatus(tenantId, id, 'archived', {
        actor_type: 'admin',
        actor_id: req.user.id,
        details: 'Rejection finalized and archived',
        ip_address: req.ip,
        user_agent: req.get('user-agent')
      });

      res.json({ success: true, message: 'Invoice archived successfully' });
    } catch (error) {
      logger.error('Error finalizing rejection:', error);
      res.status(500).json({ success: false, error: 'Failed to finalize rejection' });
    }
  }

  /**
   * Reactivate invoice (Admin only)
   * @route POST /api/invoices/admin/:id/reactivate
   */
  async reactivate(req, res) {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;

      await InvoiceRepository.updateStatus(tenantId, id, 'sent', {
        actor_type: 'admin',
        actor_id: req.user.id,
        details: 'Invoice reactivated',
        ip_address: req.ip,
        user_agent: req.get('user-agent')
      });

      res.json({ success: true, message: 'Invoice reactivated successfully' });
    } catch (error) {
      logger.error('Error reactivating invoice:', error);
      res.status(500).json({ success: false, error: 'Failed to reactivate invoice' });
    }
  }

  /**
   * Get dashboard statistics (Admin only)
   * @route GET /api/invoices/admin/statistics
   */
  async getStatistics(req, res) {
    try {
      const tenantId = req.tenantId;
      const stats = await InvoiceRepository.getStatistics(tenantId);
      res.json({ success: true, statistics: stats });
    } catch (error) {
      logger.error('Error getting statistics:', error);
      res.status(500).json({ success: false, error: 'Failed to get statistics' });
    }
  }


  /**
   * Get invoice by number (Public - requires email authentication)
   * @route GET /api/invoices/public/:invoice_number
   */
  async publicGetInvoice(req, res) {
    try {
      const { invoice_number } = req.params;
      const { email } = req.query;

      if (!email) {
        return res.status(400).json({ success: false, error: 'Email is required' });
      }

      const invoice = await InvoiceRepository.getInvoiceByNumberPublic(invoice_number);
      if (!invoice) {
        return res.status(404).json({ success: false, error: 'Invoice not found' });
      }

      if (email.toLowerCase() !== invoice.client_email.toLowerCase()) {
        return res.status(401).json({ success: false, error: 'Invalid email' });
      }

      // Check if invoice is disabled
      if (invoice.is_active === false || invoice.is_active === 0) {
        return res.status(403).json({ success: false, error: 'This invoice is no longer available' });
      }

      // Mark as viewed if first time (for draft or sent status)
      if (!invoice.viewed_at && ['draft', 'sent'].includes(invoice.status)) {
        await InvoiceRepository.updateStatus(invoice.tenant_id, invoice.id, 'viewed', {
          actor_type: 'client',
          details: 'Invoice viewed by client',
          ip_address: req.ip,
          user_agent: req.get('user-agent')
        });
        invoice.status = 'viewed';
      }

      res.json({ success: true, invoice });
    } catch (error) {
      logger.error('Error getting public invoice:', error);
      res.status(500).json({ success: false, error: 'Failed to load invoice' });
    }
  }

  /**
   * Accept invoice/quote (Public)
   * @route POST /api/invoices/public/:invoice_number/accept
   */
  async publicAccept(req, res) {
    try {
      const { invoice_number } = req.params;
      const { email, payment_method } = req.body;

      const invoice = await InvoiceRepository.getInvoiceByNumberPublic(invoice_number);
      if (!invoice) {
        return res.status(404).json({ success: false, error: 'Invoice not found' });
      }

      if (email.toLowerCase() !== invoice.client_email.toLowerCase()) {
        return res.status(401).json({ success: false, error: 'Invalid email' });
      }

      const tenantId = invoice.tenant_id;

      // Update status to accepted
      await InvoiceRepository.updateStatus(tenantId, invoice.id, 'accepted', {
        actor_type: 'client',
        details: 'Invoice accepted by client',
        ip_address: req.ip,
        user_agent: req.get('user-agent')
      });

      // Generate payment link if invoice type
      let paymentLink = null;
      if (invoice.type === 'invoice') {
        paymentLink = await this.generatePaymentLink(tenantId, invoice, payment_method);
      }

      res.json({
        success: true,
        message: 'Invoice accepted successfully',
        payment_link: paymentLink
      });
    } catch (error) {
      logger.error('Error accepting invoice:', error);
      res.status(500).json({ success: false, error: 'Failed to accept invoice' });
    }
  }

  /**
   * Reject invoice/quote (Public)
   * @route POST /api/invoices/public/:invoice_number/reject
   */
  async publicReject(req, res) {
    try {
      const { invoice_number } = req.params;
      const { email, reason } = req.body;

      if (!reason || reason.trim().length < 7) {
        return res.status(400).json({ success: false, error: 'Rejection reason must be at least 7 characters' });
      }

      const invoice = await InvoiceRepository.getInvoiceByNumberPublic(invoice_number);
      if (!invoice) {
        return res.status(404).json({ success: false, error: 'Invoice not found' });
      }

      if (email.toLowerCase() !== invoice.client_email.toLowerCase()) {
        return res.status(401).json({ success: false, error: 'Invalid email' });
      }

      await InvoiceRepository.rejectInvoice(invoice.tenant_id, invoice.id, reason, {
        actor_type: 'client',
        ip_address: req.ip,
        user_agent: req.get('user-agent')
      });

      res.json({ success: true, message: 'Rejection submitted. Waiting for review.' });
    } catch (error) {
      logger.error('Error rejecting invoice:', error);
      res.status(500).json({ success: false, error: 'Failed to reject invoice' });
    }
  }

  /**
   * Get available payment methods for invoice (Public)
   * @route GET /api/invoices/public/:invoice_number/payment-methods
   */
  async publicGetPaymentMethods(req, res) {
    try {
      const { invoice_number } = req.params;
      const { email } = req.query;

      if (!email) {
        return res.status(400).json({ success: false, error: 'Email is required' });
      }

      const invoice = await InvoiceRepository.getInvoiceByNumberPublic(invoice_number);
      if (!invoice) {
        return res.status(404).json({ success: false, error: 'Invoice not found' });
      }

      if (email.toLowerCase() !== invoice.client_email.toLowerCase()) {
        return res.status(401).json({ success: false, error: 'Invalid email' });
      }

      // Get allowed payment methods from invoice (set by admin)
      let allowedMethods = [];
      try {
        allowedMethods = invoice.allowed_payment_methods 
          ? (typeof invoice.allowed_payment_methods === 'string' 
              ? JSON.parse(invoice.allowed_payment_methods) 
              : invoice.allowed_payment_methods)
          : ['stripe']; // Default to stripe if not set
      } catch (e) {
        allowedMethods = ['stripe'];
      }

      // Get available payment methods for this tenant that are also allowed by admin
      const tenantMethods = await InvoiceRepository.getTenantPaymentMethods(invoice.tenant_id);
      
      // Filter to only include methods that are both enabled by tenant AND allowed by admin
      const availableMethods = tenantMethods.filter(m => allowedMethods.includes(m.method_name));

      // Also include manual methods (bank_transfer, cash, pix) if allowed by admin
      const manualMethods = ['bank_transfer', 'cash', 'pix'];
      const manualMethodsAllowed = allowedMethods.filter(m => manualMethods.includes(m));

      const methodDisplayNames = {
        stripe: { name: 'stripe', display_name: 'Stripe (Card)', icon: '💳' },
        paypal: { name: 'paypal', display_name: 'PayPal', icon: '🅿️' },
        bank_transfer: { name: 'bank_transfer', display_name: 'Bank Transfer', icon: '🏦' },
        cash: { name: 'cash', display_name: 'Cash', icon: '💵' },
        pix: { name: 'pix', display_name: 'PIX', icon: '📱' }
      };

      const paymentMethods = [
        ...availableMethods.map(m => methodDisplayNames[m.method_name] || { name: m.method_name, display_name: m.method_name }),
        ...manualMethodsAllowed.map(m => methodDisplayNames[m])
      ];

      res.json({ 
        success: true, 
        payment_methods: paymentMethods
      });
    } catch (error) {
      logger.error('Error getting payment methods:', error);
      res.status(500).json({ success: false, error: 'Failed to get payment methods' });
    }
  }

  /**
   * Get payment link for accepted invoice (Public)
   * @route GET /api/invoices/public/:invoice_number/payment-link
   */
  async publicGetPaymentLink(req, res) {
    try {
      const { invoice_number } = req.params;
      const { email, payment_method } = req.query;

      if (!email) {
        return res.status(400).json({ success: false, error: 'Email is required' });
      }

      const invoice = await InvoiceRepository.getInvoiceByNumberPublic(invoice_number);
      if (!invoice) {
        return res.status(404).json({ success: false, error: 'Invoice not found' });
      }

      if (email.toLowerCase() !== invoice.client_email.toLowerCase()) {
        return res.status(401).json({ success: false, error: 'Invalid email' });
      }

      if (invoice.status !== 'accepted') {
        return res.status(400).json({ success: false, error: 'Invoice must be accepted before payment' });
      }

      // Return existing payment link if available and no specific method requested
      if (invoice.payment_link && !payment_method) {
        return res.json({ success: true, payment_link: invoice.payment_link });
      }

      // Try to generate a new payment link with the specified method
      const paymentLink = await this.generatePaymentLink(invoice.tenant_id, invoice, payment_method);
      
      if (paymentLink) {
        return res.json({ success: true, payment_link: paymentLink });
      }

      // No payment link could be generated
      logger.warn(`Could not generate payment link for invoice ${invoice_number}`);
      res.status(400).json({ 
        success: false, 
        error: 'Payment link could not be generated. Please contact the seller to configure payment methods.' 
      });
    } catch (error) {
      logger.error('Error getting payment link:', error);
      res.status(500).json({ success: false, error: 'Failed to get payment link' });
    }
  }

  /**
   * Mark as paid (Public)
   * @route POST /api/invoices/public/:invoice_number/mark-paid
   */
  async publicMarkPaid(req, res) {
    try {
      const { invoice_number } = req.params;
      const { email } = req.body;

      const invoice = await InvoiceRepository.getInvoiceByNumberPublic(invoice_number);
      if (!invoice) {
        return res.status(404).json({ success: false, error: 'Invoice not found' });
      }

      if (email.toLowerCase() !== invoice.client_email.toLowerCase()) {
        return res.status(401).json({ success: false, error: 'Invalid email' });
      }

      await InvoiceRepository.updateStatus(invoice.tenant_id, invoice.id, 'paid', {
        actor_type: 'client',
        details: 'Marked as paid by client - pending admin verification',
        ip_address: req.ip,
        user_agent: req.get('user-agent')
      });

      res.json({ success: true, message: 'Payment confirmation received' });
    } catch (error) {
      logger.error('Error marking as paid:', error);
      res.status(500).json({ success: false, error: 'Failed to mark as paid' });
    }
  }

  /**
   * Generate payment link using tenant's payment gateway
   * @private
   * @param {number} tenantId - Tenant ID
   * @param {object} invoice - Invoice data
   * @param {string} paymentMethod - Optional specific payment method (paypal, stripe)
   */
  async generatePaymentLink(tenantId, invoice, paymentMethod = null) {
    try {
      logger.info(`generatePaymentLink called: tenantId=${tenantId}, invoiceNumber=${invoice.invoice_number}, requestedMethod=${paymentMethod || 'any'}`);
      
      const gateway = await InvoiceRepository.getTenantPaymentGateway(tenantId, paymentMethod);
      if (!gateway) {
        logger.warn(`No payment gateway configured for tenant ${tenantId}${paymentMethod ? ` with method ${paymentMethod}` : ''}`);
        return null;
      }

      // Build receipt description from items
      const itemsDescription = invoice.items.map(item => 
        `${item.description} (${item.quantity}x ${this.formatCurrency(item.unit_price, invoice.currency)})`
      ).join('\n');

      const description = `${invoice.title}\n\n${itemsDescription}\n\nTotal: ${this.formatCurrency(invoice.total_amount, invoice.currency)}`;

      // Determine gateway type from method_name or gateway_name
      const gatewayName = (gateway.method_name || gateway.gateway_name || '').toLowerCase();
      logger.info(`Found gateway: ${gatewayName} for invoice ${invoice.invoice_number}, sandbox_mode=${gateway.sandbox_mode}`);

      // Get the API keys - handle different field names
      const stripeKey = gateway.stripe_secret_key || gateway.api_key;
      const paypalClientId = gateway.paypal_client_id || gateway.api_key;
      const paypalSecret = gateway.paypal_client_secret || gateway.api_secret;

      logger.info(`Gateway credentials check: stripe_key=${!!stripeKey}, paypal_id=${!!paypalClientId}, paypal_secret=${!!paypalSecret}`);

      if (gatewayName === 'stripe' && stripeKey) {
        logger.info(`Creating Stripe payment link for invoice ${invoice.invoice_number}`);
        return await this.createStripePaymentLink({ ...gateway, stripe_secret_key: stripeKey }, invoice, description);
      } else if (gatewayName === 'paypal' && paypalClientId && paypalSecret) {
        logger.info(`Creating PayPal payment link for invoice ${invoice.invoice_number}`);
        return await this.createPayPalPaymentLink({ 
          ...gateway, 
          paypal_client_id: paypalClientId,
          paypal_client_secret: paypalSecret 
        }, invoice, description);
      }

      logger.warn(`Gateway ${gatewayName} not supported or missing credentials. stripeKey=${!!stripeKey}, paypalId=${!!paypalClientId}, paypalSecret=${!!paypalSecret}`);
      return null;
    } catch (error) {
      logger.error('Error generating payment link:', error);
      return null;
    }
  }

  /**
   * Create Stripe payment link using StripeService
   * @private
   */
  async createStripePaymentLink(gateway, invoice, description) {
    try {
      const secretKey = gateway.stripe_secret_key || gateway.api_key;
      
      if (!secretKey) {
        logger.error('Stripe secret key is missing');
        return null;
      }

      const stripeService = new StripeService(secretKey);
      const totalAmount = parseFloat(invoice.total_amount) || 0;

      const result = await stripeService.createPayment({
        amount: totalAmount,
        description: `${invoice.title} - ${description.substring(0, 200)}`,
        customer_name: invoice.client_name || 'Customer',
        customer_phone: invoice.client_phone || '',
        reference_id: invoice.invoice_number
      });

      if (!result.success) {
        logger.error('Stripe payment creation failed:', result.error);
        return null;
      }

      // Save payment link
      await InvoiceRepository.updatePaymentInfo(invoice.tenant_id, invoice.id, {
        payment_link: result.payment_url,
        payment_id: result.payment_id,
        gateway_response: { payment_id: result.payment_id }
      });

      logger.info(`Stripe payment link created for invoice ${invoice.invoice_number}: ${result.payment_url}`);
      return result.payment_url;
    } catch (error) {
      logger.error('Error creating Stripe payment link:', error);
      return null;
    }
  }

  /**
   * Create PayPal payment link using PayPalService
   * @private
   */
  async createPayPalPaymentLink(gateway, invoice, description) {
    try {
      const clientId = gateway.paypal_client_id || gateway.api_key;
      const clientSecret = gateway.paypal_client_secret || gateway.api_secret;
      const sandboxMode = gateway.sandbox_mode !== false && gateway.sandbox_mode !== 0;

      if (!clientId || !clientSecret) {
        logger.error('PayPal credentials are missing');
        return null;
      }

      const paypalService = new PayPalService(clientId, clientSecret, sandboxMode);
      const totalAmount = parseFloat(invoice.total_amount) || 0;

      const result = await paypalService.createPayment({
        amount: totalAmount,
        description: `${invoice.title} - ${description.substring(0, 100)}`,
        customer_name: invoice.client_name || 'Customer',
        customer_phone: invoice.client_phone || '',
        reference_id: invoice.invoice_number
      });

      if (!result.success) {
        logger.error('PayPal payment creation failed:', result.error);
        return null;
      }

      // Save payment link
      await InvoiceRepository.updatePaymentInfo(invoice.tenant_id, invoice.id, {
        payment_link: result.payment_url,
        payment_id: result.payment_id,
        gateway_response: { order_id: result.payment_id }
      });

      logger.info(`PayPal payment link created for invoice ${invoice.invoice_number}: ${result.payment_url}`);
      return result.payment_url;
    } catch (error) {
      logger.error('Error creating PayPal payment link:', error);
      return null;
    }
  }

  /**
   * Helper: Format currency
   */
  formatCurrency(amount, currency) {
    const symbols = { USD: '$', BRL: 'R$', EUR: '€', GBP: '£' };
    return `${symbols[currency] || currency} ${parseFloat(amount).toFixed(2)}`;
  }
}

module.exports = InvoiceController;
