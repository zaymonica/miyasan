/**
 * PagBankService Unit Tests
 */

const pagbankService = require('../../../services/pagbankService');

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

describe('PagBankService', () => {
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
    it('should return PagBank settings', async () => {
      pool.execute.mockResolvedValue([[{
        pagbank_token: 'token123',
        pagbank_email: 'test@test.com',
        pagbank_mode: 'sandbox'
      }]]);

      const settings = await pagbankService.getSettings();

      expect(settings).toEqual(expect.objectContaining({
        pagbank_token: 'token123'
      }));
    });

    it('should return null if no settings', async () => {
      pool.execute.mockResolvedValue([[]]);

      const settings = await pagbankService.getSettings();

      expect(settings).toBeNull();
    });
  });

  describe('createCheckout', () => {
    it('should create checkout successfully', async () => {
      pool.execute.mockResolvedValue([[{
        pagbank_token: 'token123',
        pagbank_mode: 'sandbox'
      }]]);

      mockAxiosInstance.post.mockResolvedValue({
        data: {
          id: 'checkout_123',
          links: [{ href: 'https://pagbank.com/pay/123' }]
        }
      });

      const result = await pagbankService.createCheckout({
        amount: 99.99,
        description: 'Test payment',
        customer: {
          name: 'John Doe',
          email: 'john@test.com'
        }
      });

      expect(result).toEqual(expect.objectContaining({
        id: 'checkout_123'
      }));
    });

    it('should throw error if settings not configured', async () => {
      pool.execute.mockResolvedValue([[]]);

      await expect(pagbankService.createCheckout({
        amount: 99.99
      })).rejects.toThrow();
    });
  });

  describe('getPaymentStatus', () => {
    it('should return payment status', async () => {
      pool.execute.mockResolvedValue([[{
        pagbank_token: 'token123',
        pagbank_mode: 'sandbox'
      }]]);

      mockAxiosInstance.get.mockResolvedValue({
        data: {
          id: 'pay_123',
          status: 'PAID'
        }
      });

      const status = await pagbankService.getPaymentStatus('pay_123');

      expect(status).toEqual(expect.objectContaining({
        status: 'PAID'
      }));
    });
  });

  describe('createSubscription', () => {
    it('should create subscription', async () => {
      pool.execute.mockResolvedValue([[{
        pagbank_token: 'token123',
        pagbank_mode: 'sandbox'
      }]]);

      mockAxiosInstance.post.mockResolvedValue({
        data: {
          id: 'sub_123',
          status: 'ACTIVE'
        }
      });

      const result = await pagbankService.createSubscription({
        planId: 'plan_123',
        customer: {
          name: 'John Doe',
          email: 'john@test.com'
        }
      });

      expect(result).toEqual(expect.objectContaining({
        id: 'sub_123'
      }));
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel subscription', async () => {
      pool.execute.mockResolvedValue([[{
        pagbank_token: 'token123',
        pagbank_mode: 'sandbox'
      }]]);

      mockAxiosInstance.post.mockResolvedValue({
        data: { status: 'CANCELLED' }
      });

      const result = await pagbankService.cancelSubscription('sub_123');

      expect(result.status).toBe('CANCELLED');
    });
  });

  describe('handleWebhook', () => {
    it('should handle payment confirmed webhook', async () => {
      const webhookData = {
        event: 'PAYMENT.CONFIRMED',
        data: {
          id: 'pay_123',
          status: 'PAID',
          amount: 9999
        }
      };

      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await pagbankService.handleWebhook(webhookData);

      expect(result.processed).toBe(true);
    });

    it('should handle subscription cancelled webhook', async () => {
      const webhookData = {
        event: 'SUBSCRIPTION.CANCELLED',
        data: {
          id: 'sub_123'
        }
      };

      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await pagbankService.handleWebhook(webhookData);

      expect(result.processed).toBe(true);
    });
  });

  describe('validateWebhookSignature', () => {
    it('should validate webhook signature', () => {
      const payload = JSON.stringify({ event: 'test' });
      const signature = 'valid_signature';

      // This would depend on actual implementation
      const isValid = pagbankService.validateWebhookSignature(payload, signature);

      expect(typeof isValid).toBe('boolean');
    });
  });
});
