/**
 * PagBank Service - Payment Integration (API v4)
 * Handles PagBank payment creation and status checking using the modern REST API
 * 
 * Features:
 * - Creates payment checkouts with shortened URLs (pag.ae/XXXXX)
 * - JSON-based REST API (no more XML)
 * - Simplified authentication (Bearer token)
 * - Real-time status checking
 * 
 * @see https://dev.pagseguro.uol.com.br/reference/checkout-api
 */

const axios = require('axios');
const { logger } = require('../config/logger');

class PagBankService {
  constructor(email, token, sandbox = true) {
    this.email = email;
    this.token = token;
    this.sandbox = sandbox;

    // Validate token
    if (!token || token.trim() === '') {
      throw new Error('PagBank token is required');
    }

    // PagBank API v4
    this.baseUrl = sandbox
      ? 'https://sandbox.api.pagseguro.com'
      : 'https://api.pagseguro.com';
    
    logger.info('PagBankService initialized:', {
      hasEmail: !!email,
      hasToken: !!token,
      tokenLength: token?.length,
      sandbox: sandbox,
      baseUrl: this.baseUrl
    });
  }

  async createPayment(data) {
    try {
      // Sanitize and validate customer name
      let customerName = 'Default Customer';
      if (data.customer_name && data.customer_name.trim()) {
        customerName = data.customer_name.trim()
          .replace(/[^a-zA-ZÀ-ÿ\s]/g, '')
          .replace(/\s+/g, ' ')
          .substring(0, 50);
        
        const words = customerName.split(' ').filter(w => w.length > 0);
        if (words.length < 2 || customerName.length < 5) {
          customerName = 'Default Customer';
        }
      }

      // Format phone for API
      const areaCode = this.getAreaCode(data.customer_phone);
      const phoneNumber = this.formatPhone(data.customer_phone);

      // Checkout payload (generates shortened pag.ae link)
      const paymentData = {
        reference_id: data.reference_id || `REF-${Date.now()}`,
        expiration_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
        customer: {
          name: customerName,
          email: data.customer_email || 'customer@example.com',
          tax_id: '12345678909', // Dummy CPF - can be customized
          phones: [
            {
              country: '55',
              area: areaCode,
              number: phoneNumber,
              type: 'MOBILE'
            }
          ]
        },
        items: [
          {
            reference_id: 'item-1',
            name: (data.description || 'Payment via WhatsApp').substring(0, 100),
            quantity: 1,
            unit_amount: Math.round(data.amount * 100) // Amount in cents
          }
        ],
        notification_urls: [
          `${process.env.BASE_URL || 'http://localhost:3000'}/api/payments/webhook/pagbank`
        ],
        redirect_url: `${process.env.BASE_URL || 'http://localhost:3000'}/payments/success`,
        payment_methods: [
          {
            type: 'CREDIT_CARD'
          },
          {
            type: 'DEBIT_CARD'
          },
          {
            type: 'BOLETO'
          },
          {
            type: 'PIX'
          }
        ],
        payment_methods_configs: [
          {
            type: 'CREDIT_CARD',
            config_options: [
              {
                option: 'INSTALLMENTS_LIMIT',
                value: '12'
              }
            ]
          }
        ]
      };

      logger.info('PagBank order data (v4 API):', {
        reference_id: paymentData.reference_id,
        customer_name: customerName,
        amount: data.amount,
        phone: `${areaCode}${phoneNumber}`,
        endpoint: `${this.baseUrl}/orders`,
        hasToken: !!this.token,
        tokenPrefix: this.token ? this.token.substring(0, 8) : 'NO_TOKEN'
      });

      const response = await axios.post(
        `${this.baseUrl}/orders`,
        paymentData,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`
          }
        }
      );

      // Orders API returns payment links
      if (response.data && response.data.id) {
        // Find payment link
        const paymentLink = response.data.links?.find(link => 
          link.rel === 'PAY' || link.rel === 'SELF'
        );

        return {
          success: true,
          payment_id: response.data.id,
          payment_url: paymentLink?.href || response.data.links?.[0]?.href,
          status: 'pending',
          qr_codes: response.data.qr_codes || []
        };
      } else {
        throw new Error('Order ID not found in response');
      }
    } catch (error) {
      logger.error('Error creating PagBank payment:', error);
      logger.error('PagBank error details:', error.response?.data);
      logger.error('Request details:', {
        url: `${this.baseUrl}/orders`,
        hasToken: !!this.token,
        tokenLength: this.token?.length,
        authHeader: this.token ? `Bearer ${this.token.substring(0, 10)}...` : 'NO_TOKEN',
        sandbox: this.sandbox
      });

      let errorMessage = 'Error creating PagBank payment';

      // Check for authentication errors
      if (error.response?.status === 401 || error.response?.status === 403) {
        logger.error('PagBank authentication failed. Check token.');
        logger.error('Token info:', {
          hasToken: !!this.token,
          tokenLength: this.token?.length,
          tokenPrefix: this.token ? this.token.substring(0, 8) : 'NO_TOKEN',
          sandbox: this.sandbox,
          baseUrl: this.baseUrl
        });
        return {
          success: false,
          error: 'PagBank authentication failed. Please verify your token is correct.',
          details: error.response?.data
        };
      }

      if (error.response?.data) {
        // New API returns JSON with error messages
        if (error.response.data.error_messages) {
          errorMessage = error.response.data.error_messages.map(e => e.description).join(', ');
        } else if (error.response.data.message) {
          errorMessage = error.response.data.message;
        }
        
        logger.error('PagBank API response:', error.response.data);
      } else if (error.message) {
        errorMessage = error.message;
      }

      return {
        success: false,
        error: errorMessage,
        details: error.response?.data || null
      };
    }
  }

  async getPaymentStatus(orderId) {
    try {
      // Query order status
      const response = await axios.get(
        `${this.baseUrl}/orders/${orderId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.token}`
          }
        }
      );

      // Orders API returns JSON
      const orderStatus = response.data.status;
      const charges = response.data.charges || [];
      
      let status = 'pending';
      let paid_at = null;

      // Map order status
      if (orderStatus === 'PAID') {
        status = 'paid';
        const paidCharge = charges.find(c => c.status === 'PAID');
        if (paidCharge && paidCharge.paid_at) {
          paid_at = new Date(paidCharge.paid_at);
        }
      } else if (orderStatus === 'CANCELED' || orderStatus === 'DECLINED' || orderStatus === 'EXPIRED') {
        status = 'cancelled';
      } else if (orderStatus === 'WAITING' || orderStatus === 'IN_ANALYSIS') {
        status = 'pending';
      } else {
        status = 'pending';
      }

      return {
        success: true,
        status: status,
        paid_at: paid_at,
        pagbank_status: orderStatus
      };
    } catch (error) {
      logger.error('Error checking PagBank status:', error);
      return {
        success: false,
        error: error.message || 'Error checking status',
        status: 'pending',
        paid_at: null
      };
    }
  }

  async getTransactionByNotification(notificationCode) {
    try {
      // Orders API uses webhooks with direct JSON payload
      const response = await axios.get(
        `${this.baseUrl}/orders/${notificationCode}`,
        {
          headers: {
            'Authorization': `Bearer ${this.token}`
          }
        }
      );

      return {
        success: true,
        transaction: response.data
      };
    } catch (error) {
      logger.error('Error fetching PagBank transaction:', error);
      return {
        success: false,
        error: error.message || 'Error fetching transaction'
      };
    }
  }

  formatPhone(phone) {
    if (!phone) return '999999999';
    const cleanPhone = phone.replace(/\D/g, '');

    // New API expects only the number without area code (8-9 digits)
    if (cleanPhone.length === 11) {
      return cleanPhone.substring(2);
    } else if (cleanPhone.length === 10) {
      return cleanPhone.substring(2);
    } else if (cleanPhone.length === 13 && cleanPhone.startsWith('55')) {
      return cleanPhone.substring(4);
    } else if (cleanPhone.length === 12 && cleanPhone.startsWith('55')) {
      return cleanPhone.substring(4);
    } else if (cleanPhone.length > 13) {
      return cleanPhone.slice(-9);
    } else if (cleanPhone.length >= 8 && cleanPhone.length <= 9) {
      return cleanPhone;
    }

    return cleanPhone.length > 9 ? cleanPhone.slice(-9) : cleanPhone;
  }

  getAreaCode(phone) {
    if (!phone) return '11';
    const cleanPhone = phone.replace(/\D/g, '');

    if (cleanPhone.length === 11) {
      return cleanPhone.substring(0, 2);
    } else if (cleanPhone.length === 10) {
      return cleanPhone.substring(0, 2);
    } else if (cleanPhone.length === 13 && cleanPhone.startsWith('55')) {
      return cleanPhone.substring(2, 4);
    } else if (cleanPhone.length === 12 && cleanPhone.startsWith('55')) {
      return cleanPhone.substring(2, 4);
    } else if (cleanPhone.length > 13) {
      if (cleanPhone.startsWith('55')) {
        return cleanPhone.substring(2, 4);
      }
      return cleanPhone.substring(0, 2);
    }

    return '11';
  }
}

module.exports = PagBankService;
