/**
 * paypalService Unit Tests
 */

const paypalService = require('../../../services/paypalService');

// Mock dependencies
jest.mock('../../../config/database', () => ({
  pool: {
    execute: jest.fn()
  }
}));

jest.mock('axios', () => ({
  create: jest.fn().mockReturnValue({
    post: jest.fn(),
    get: jest.fn()
  })
}));

const { pool } = require('../../../config/database');
const axios = require('axios');

describe('paypalService', () => {
  let mockAxiosInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    mockAxiosInstance = {
      post: jest.fn(),
      get: jest.fn()
    };
    axios.create.mockReturnValue(mockAxiosInstance);
  });

  describe('getSettings', () => {
    it('should return PayPal settings', async () => {
      pool.execute.mockResolvedValue([[{
        paypal_client_id: 'client_123',
        paypal_client_secret: 'secret_123',
        paypal_mode: 'sandbox',
        enabled: true
      }]]);

      const settings = await paypalService.getSettings();

      expect(settings).toEqual(expect.objectContaining({
        paypal_client_id: 'client_123'
      }));
    });

    it('should return null if no settings', async () => {
      pool.execute.mockResolvedValue([[]]);

      const settings = await paypalService.getSettings();

      expect(settings).toBeNull();
    });
  });

  describe('getAccessToken', () => {
    it('should get access token', async () => {
      pool.execute.mockResolvedValue([[{
        paypal_client_id: 'client_123',
        paypal_client_secret: 'secret_123',
        paypal_mode: 'sandbox'
      }]]);

      mockAxiosInstance.post.mockResolvedValue({
        data: {
          access_token: 'token_123',
          expires_in: 3600
        }
      });

      const token = await paypalService.getAccessToken();

      expect(token).toBe('token_123');
    });
  });

  describe('createOrder', () => {
    it('should create PayPal order', async () => {
      pool.execute.mockResolvedValue([[{
        paypal_client_id: 'client_123',
        paypal_client_secret: 'secret_123',
        paypal_mode: 'sandbox'
      }]]);

      mockAxiosInstance.post
        .mockResolvedValueOnce({ data: { access_token: 'token_123' } })
        .mockResolvedValueOnce({
          data: {
            id: 'order_123',
            status: 'CREATED',
            links: [{ rel: 'approve', href: 'https://paypal.com/approve' }]
          }
        });

      const order = await paypalService.createOrder({
        amount: 99.99,
        currency: 'USD',
        description: 'Test order'
      });

      expect(order.id).toBe('order_123');
    });
  });

  describe('captureOrder', () => {
    it('should capture PayPal order', async () => {
      pool.execute.mockResolvedValue([[{
        paypal_client_id: 'client_123',
        paypal_client_secret: 'secret_123',
        paypal_mode: 'sandbox'
      }]]);

      mockAxiosInstance.post
        .mockResolvedValueOnce({ data: { access_token: 'token_123' } })
        .mockResolvedValueOnce({
          data: {
            id: 'order_123',
            status: 'COMPLETED'
          }
        });

      const result = await paypalService.captureOrder('order_123');

      expect(result.status).toBe('COMPLETED');
    });
  });

  describe('getOrderDetails', () => {
    it('should get order details', async () => {
      pool.execute.mockResolvedValue([[{
        paypal_client_id: 'client_123',
        paypal_client_secret: 'secret_123',
        paypal_mode: 'sandbox'
      }]]);

      mockAxiosInstance.post.mockResolvedValue({ data: { access_token: 'token_123' } });
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          id: 'order_123',
          status: 'COMPLETED',
          purchase_units: []
        }
      });

      const order = await paypalService.getOrderDetails('order_123');

      expect(order.id).toBe('order_123');
    });
  });

  describe('createSubscription', () => {
    it('should create subscription', async () => {
      pool.execute.mockResolvedValue([[{
        paypal_client_id: 'client_123',
        paypal_client_secret: 'secret_123',
        paypal_mode: 'sandbox'
      }]]);

      mockAxiosInstance.post
        .mockResolvedValueOnce({ data: { access_token: 'token_123' } })
        .mockResolvedValueOnce({
          data: {
            id: 'sub_123',
            status: 'ACTIVE',
            links: [{ rel: 'approve', href: 'https://paypal.com/approve' }]
          }
        });

      const subscription = await paypalService.createSubscription({
        planId: 'plan_123',
        subscriber: {
          name: { given_name: 'John', surname: 'Doe' },
          email_address: 'john@test.com'
        }
      });

      expect(subscription.id).toBe('sub_123');
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel subscription', async () => {
      pool.execute.mockResolvedValue([[{
        paypal_client_id: 'client_123',
        paypal_client_secret: 'secret_123',
        paypal_mode: 'sandbox'
      }]]);

      mockAxiosInstance.post
        .mockResolvedValueOnce({ data: { access_token: 'token_123' } })
        .mockResolvedValueOnce({ data: {} });

      const result = await paypalService.cancelSubscription('sub_123', 'User requested');

      expect(result.cancelled).toBe(true);
    });
  });

  describe('getSubscriptionDetails', () => {
    it('should get subscription details', async () => {
      pool.execute.mockResolvedValue([[{
        paypal_client_id: 'client_123',
        paypal_client_secret: 'secret_123',
        paypal_mode: 'sandbox'
      }]]);

      mockAxiosInstance.post.mockResolvedValue({ data: { access_token: 'token_123' } });
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          id: 'sub_123',
          status: 'ACTIVE',
          plan_id: 'plan_123'
        }
      });

      const subscription = await paypalService.getSubscriptionDetails('sub_123');

      expect(subscription.id).toBe('sub_123');
    });
  });

  describe('handleWebhook', () => {
    it('should handle PAYMENT.CAPTURE.COMPLETED', async () => {
      const webhookData = {
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource: {
          id: 'capture_123',
          amount: { value: '99.99', currency_code: 'USD' }
        }
      };

      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await paypalService.handleWebhook(webhookData);

      expect(result.processed).toBe(true);
    });

    it('should handle BILLING.SUBSCRIPTION.ACTIVATED', async () => {
      const webhookData = {
        event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
        resource: {
          id: 'sub_123',
          plan_id: 'plan_123'
        }
      };

      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await paypalService.handleWebhook(webhookData);

      expect(result.processed).toBe(true);
    });

    it('should handle BILLING.SUBSCRIPTION.CANCELLED', async () => {
      const webhookData = {
        event_type: 'BILLING.SUBSCRIPTION.CANCELLED',
        resource: {
          id: 'sub_123'
        }
      };

      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await paypalService.handleWebhook(webhookData);

      expect(result.processed).toBe(true);
    });
  });

  describe('verifyWebhookSignature', () => {
    it('should verify webhook signature', async () => {
      pool.execute.mockResolvedValue([[{
        paypal_client_id: 'client_123',
        paypal_client_secret: 'secret_123',
        paypal_mode: 'sandbox'
      }]]);

      mockAxiosInstance.post
        .mockResolvedValueOnce({ data: { access_token: 'token_123' } })
        .mockResolvedValueOnce({
          data: { verification_status: 'SUCCESS' }
        });

      const isValid = await paypalService.verifyWebhookSignature({
        headers: {},
        body: {}
      });

      expect(isValid).toBe(true);
    });
  });
});
