/**
 * Stripe Service - Payment Integration
 * Handles Stripe payment link creation and status checking
 * 
 * @see https://stripe.com/docs/api
 */

const Stripe = require('stripe');
const { logger } = require('../config/logger');

class StripeService {
  constructor(secretKey) {
    if (!secretKey || secretKey.trim() === '') {
      throw new Error('Stripe secret key is required');
    }

    this.stripe = new Stripe(secretKey);
    
    logger.info('StripeService initialized:', {
      hasKey: !!secretKey,
      keyPrefix: secretKey.substring(0, 7)
    });
  }

  async createPayment(data) {
    try {
      // Create payment link
      const currency = (data.currency || 'brl').toString().toLowerCase();
      const paymentLink = await this.stripe.paymentLinks.create({
        line_items: [
          {
            price_data: {
              currency,
              product_data: {
                name: data.description || 'Payment via WhatsApp',
              },
              unit_amount: Math.round(data.amount * 100), // Amount in cents
            },
            quantity: 1,
          },
        ],
        after_completion: {
          type: 'redirect',
          redirect: {
            url: `${process.env.BASE_URL || 'http://localhost:3000'}/payments/success`,
          },
        },
        metadata: {
          reference_id: data.reference_id || `REF-${Date.now()}`,
          customer_name: data.customer_name || 'N/A',
          customer_phone: data.customer_phone || 'N/A',
        },
      });

      logger.info('Stripe payment link created:', {
        id: paymentLink.id,
        url: paymentLink.url,
        amount: data.amount
      });

      return {
        success: true,
        payment_id: paymentLink.id,
        payment_url: paymentLink.url,
        status: 'pending'
      };
    } catch (error) {
      logger.error('Error creating Stripe payment:', error);

      let errorMessage = 'Error creating Stripe payment';

      if (error.type === 'StripeAuthenticationError') {
        errorMessage = 'Stripe authentication failed. Please verify your API key.';
      } else if (error.message) {
        errorMessage = error.message;
      }

      return {
        success: false,
        error: errorMessage,
        details: error
      };
    }
  }

  async getPaymentStatus(paymentLinkId) {
    try {
      // Get payment link
      const paymentLink = await this.stripe.paymentLinks.retrieve(paymentLinkId);

      // Check if there are any successful payments
      const sessions = await this.stripe.checkout.sessions.list({
        payment_link: paymentLinkId,
        limit: 1,
      });

      let status = 'pending';
      let paid_at = null;

      if (sessions.data.length > 0) {
        const session = sessions.data[0];
        
        if (session.payment_status === 'paid') {
          status = 'paid';
          paid_at = new Date(session.created * 1000);
        } else if (session.status === 'expired') {
          status = 'cancelled';
        }
      }

      return {
        success: true,
        status: status,
        paid_at: paid_at,
        stripe_status: paymentLink.active ? 'active' : 'inactive'
      };
    } catch (error) {
      logger.error('Error checking Stripe status:', error);
      return {
        success: false,
        error: error.message || 'Error checking status',
        status: 'pending',
        paid_at: null
      };
    }
  }
}

module.exports = StripeService;
