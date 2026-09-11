/**
 * PayPal Service - Payment Integration
 * Handles PayPal payment creation and status checking
 */

const paypal = require('@paypal/checkout-server-sdk');
const { logger } = require('../config/logger');

class PayPalService {
  constructor(clientId, clientSecret, sandbox = true) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.sandbox = sandbox;

    // Configure environment
    const environment = sandbox
      ? new paypal.core.SandboxEnvironment(clientId, clientSecret)
      : new paypal.core.LiveEnvironment(clientId, clientSecret);

    this.client = new paypal.core.PayPalHttpClient(environment);
  }

  async createPayment(data) {
    try {
      const request = new paypal.orders.OrdersCreateRequest();
      request.prefer('return=representation');
      const currency = (data.currency || 'USD').toString().toUpperCase();
      request.requestBody({
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: data.reference_id || Date.now().toString(),
            amount: {
              currency_code: currency,
              value: data.amount.toFixed(2)
            },
            description: data.description || 'Payment via WhatsApp'
          }
        ],
        payer: {
          name: {
            given_name: data.customer_name?.split(' ')[0] || 'Customer',
            surname: data.customer_name?.split(' ').slice(1).join(' ') || ''
          }
        },
        application_context: {
          return_url: `${process.env.BASE_URL || 'http://localhost:3000'}/payments/success`,
          cancel_url: `${process.env.BASE_URL || 'http://localhost:3000'}/payments/cancel`,
          brand_name: process.env.APP_NAME || 'Payment System',
          locale: 'en-US',
          landing_page: 'BILLING',
          shipping_preference: 'NO_SHIPPING',
          user_action: 'PAY_NOW'
        }
      });

      const order = await this.client.execute(request);

      // Find approval link
      const approvalUrl = order.result.links.find((link) => link.rel === 'approve')?.href;

      if (!approvalUrl) {
        throw new Error('Approval URL not found in PayPal response');
      }

      return {
        success: true,
        payment_id: order.result.id,
        payment_url: approvalUrl,
        status: order.result.status.toLowerCase()
      };
    } catch (error) {
      logger.error('Error creating PayPal payment:', error);
      
      // Check for authentication errors
      if (error.statusCode === 401 || error.message?.includes('Authentication')) {
        logger.error('PayPal authentication failed. Check Client ID and Secret.');
        return {
          success: false,
          error: 'PayPal authentication failed. Please verify your Client ID and Secret are correct.',
          details: error.message
        };
      }

      return {
        success: false,
        error: error.message || 'Error creating PayPal payment',
        details: error.response?.data || error.details || null
      };
    }
  }

  async capturePayment(orderId) {
    try {
      const request = new paypal.orders.OrdersCaptureRequest(orderId);
      request.requestBody({});

      const capture = await this.client.execute(request);

      return {
        success: true,
        status: capture.result.status,
        capture_id: capture.result.purchase_units[0].payments.captures[0].id,
        amount: capture.result.purchase_units[0].payments.captures[0].amount
      };
    } catch (error) {
      logger.error('Error capturing PayPal payment:', error);
      return {
        success: false,
        error: error.message || 'Error capturing payment'
      };
    }
  }

  async getPaymentStatus(orderId) {
    try {
      const request = new paypal.orders.OrdersGetRequest(orderId);
      const order = await this.client.execute(request);

      let status = 'pending';
      let paid_at = null;

      if (order.result.status === 'COMPLETED') {
        status = 'paid';
        paid_at = new Date();
      } else if (order.result.status === 'CANCELLED') {
        status = 'cancelled';
      } else if (order.result.status === 'APPROVED') {
        status = 'pending';
      }

      return {
        success: true,
        status: status,
        paid_at: paid_at,
        paypal_status: order.result.status
      };
    } catch (error) {
      logger.error('Error checking PayPal status:', error);
      return {
        success: false,
        error: error.message || 'Error checking status',
        status: 'pending',
        paid_at: null
      };
    }
  }

  validateWebhook(_headers, _body, _webhookId) {
    // Basic webhook validation
    // For production, implement full PayPal webhook signature verification
    // https://developer.paypal.com/api/rest/webhooks/

    if (process.env.NODE_ENV === 'development') {
      logger.info('PayPal webhook validation skipped (development mode)');
      return true;
    }

    logger.warn('PayPal webhook validation not fully configured');
    return true;
  }
}

module.exports = PayPalService;
