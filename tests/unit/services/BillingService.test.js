/**
 * BillingService Unit Tests
 */

const BillingService = require('../../../services/BillingService');

// Mock dependencies
jest.mock('../../../config/database', () => ({
  pool: {
    execute: jest.fn(),
    getConnection: jest.fn()
  }
}));

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    customers: {
      create: jest.fn(),
      retrieve: jest.fn()
    },
    subscriptions: {
      create: jest.fn(),
      update: jest.fn(),
      cancel: jest.fn(),
      retrieve: jest.fn()
    },
    paymentMethods: {
      attach: jest.fn()
    }
  }));
});

const { pool } = require('../../../config/database');

describe('BillingService', () => {
  let mockConnection;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConnection = {
      execute: jest.fn(),
      query: jest.fn(),
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn()
    };

    pool.getConnection.mockResolvedValue(mockConnection);
  });

  describe('getUsageStats', () => {
    it('should return usage statistics for tenant', async () => {
      const mockStats = [
        { month: '2024-12', messages_sent: 100 },
        { month: '2024-11', messages_sent: 80 }
      ];

      pool.execute.mockResolvedValue([mockStats]);

      const result = await BillingService.getUsageStats(1, 6);

      expect(result).toEqual(mockStats);
      expect(pool.execute).toHaveBeenCalled();
    });

    it('should handle empty results', async () => {
      pool.execute.mockResolvedValue([[]]);

      const result = await BillingService.getUsageStats(1, 6);

      expect(result).toEqual([]);
    });
  });

  describe('trackMessageUsage', () => {
    it('should track message usage', async () => {
      pool.execute
        .mockResolvedValueOnce([[{ current_messages_count: 50, max_messages_per_month: 1000 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await BillingService.trackMessageUsage(1, 5);

      expect(result).toEqual(expect.objectContaining({
        current: expect.any(Number),
        max: expect.any(Number)
      }));
    });

    it('should return current usage when increment is 0', async () => {
      pool.execute.mockResolvedValue([[{ 
        current_messages_count: 50, 
        max_messages_per_month: 1000 
      }]]);

      const result = await BillingService.trackMessageUsage(1, 0);

      expect(result.current).toBe(50);
      expect(result.max).toBe(1000);
    });
  });

  describe('createStripeCustomer', () => {
    it('should create Stripe customer', async () => {
      const tenant = {
        id: 1,
        email: 'test@test.com',
        company_name: 'Test Company',
        name: 'Test'
      };

      const mockCustomer = { id: 'cus_123' };
      
      // Mock stripe
      const stripe = require('stripe')();
      stripe.customers.create.mockResolvedValue(mockCustomer);

      const result = await BillingService.createStripeCustomer(tenant);

      expect(result).toEqual(mockCustomer);
    });
  });

  describe('createStripeSubscription', () => {
    it('should create subscription successfully', async () => {
      const mockTenant = {
        id: 1,
        stripe_customer_id: 'cus_123',
        email: 'test@test.com'
      };

      const mockPlan = {
        id: 1,
        stripe_price_id: 'price_123'
      };

      mockConnection.query
        .mockResolvedValueOnce([[mockTenant]])
        .mockResolvedValueOnce([[mockPlan]]);

      const stripe = require('stripe')();
      stripe.subscriptions.create.mockResolvedValue({
        id: 'sub_123',
        status: 'active'
      });

      mockConnection.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await BillingService.createStripeSubscription(1, 1, 'pm_123');

      expect(result).toEqual(expect.objectContaining({
        id: 'sub_123'
      }));
    });
  });

  describe('cancelStripeSubscription', () => {
    it('should cancel subscription immediately', async () => {
      mockConnection.query.mockResolvedValue([[{
        stripe_subscription_id: 'sub_123'
      }]]);

      const stripe = require('stripe')();
      stripe.subscriptions.cancel.mockResolvedValue({ id: 'sub_123', status: 'canceled' });

      mockConnection.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await BillingService.cancelStripeSubscription(1, true);

      expect(result).toEqual(expect.objectContaining({
        status: 'canceled'
      }));
    });

    it('should cancel at period end', async () => {
      mockConnection.query.mockResolvedValue([[{
        stripe_subscription_id: 'sub_123'
      }]]);

      const stripe = require('stripe')();
      stripe.subscriptions.update.mockResolvedValue({ 
        id: 'sub_123', 
        cancel_at_period_end: true 
      });

      mockConnection.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await BillingService.cancelStripeSubscription(1, false);

      expect(result.cancel_at_period_end).toBe(true);
    });
  });

  describe('updateSubscriptionPlan', () => {
    it('should update subscription plan', async () => {
      mockConnection.query
        .mockResolvedValueOnce([[{ stripe_subscription_id: 'sub_123' }]])
        .mockResolvedValueOnce([[{ stripe_price_id: 'price_456' }]]);

      const stripe = require('stripe')();
      stripe.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_123',
        items: { data: [{ id: 'si_123' }] }
      });
      stripe.subscriptions.update.mockResolvedValue({
        id: 'sub_123',
        status: 'active'
      });

      mockConnection.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await BillingService.updateSubscriptionPlan(1, 2);

      expect(result).toEqual(expect.objectContaining({
        id: 'sub_123'
      }));
    });
  });

  describe('handleStripeWebhook', () => {
    it('should handle invoice.paid event', async () => {
      const event = {
        type: 'invoice.paid',
        data: {
          object: {
            customer: 'cus_123',
            subscription: 'sub_123',
            amount_paid: 9999,
            currency: 'usd'
          }
        }
      };

      pool.execute.mockResolvedValue([[{ id: 1 }]]);
      mockConnection.execute.mockResolvedValue([{ affectedRows: 1 }]);

      await BillingService.handleStripeWebhook(event);

      expect(pool.execute).toHaveBeenCalled();
    });

    it('should handle customer.subscription.deleted event', async () => {
      const event = {
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_123',
            customer: 'cus_123'
          }
        }
      };

      pool.execute.mockResolvedValue([[{ id: 1 }]]);
      mockConnection.execute.mockResolvedValue([{ affectedRows: 1 }]);

      await BillingService.handleStripeWebhook(event);

      expect(pool.execute).toHaveBeenCalled();
    });
  });
});
