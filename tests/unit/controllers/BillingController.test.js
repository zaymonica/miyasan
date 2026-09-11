/**
 * BillingController Unit Tests
 */

const BillingController = require('../../../controllers/BillingController');

// Mock dependencies
jest.mock('../../../config/database', () => ({
  pool: {
    getConnection: jest.fn(),
    execute: jest.fn()
  }
}));

jest.mock('../../../services/BillingService', () => ({
  createStripeSubscription: jest.fn(),
  cancelStripeSubscription: jest.fn(),
  updateSubscriptionPlan: jest.fn(),
  getUsageStats: jest.fn(),
  trackMessageUsage: jest.fn(),
  createStripeCustomer: jest.fn(),
  handleStripeWebhook: jest.fn()
}));

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    setupIntents: {
      create: jest.fn()
    },
    webhooks: {
      constructEvent: jest.fn()
    }
  }));
});

const { pool } = require('../../../config/database');
const BillingService = require('../../../services/BillingService');

describe('BillingController', () => {
  let mockReq;
  let mockRes;
  let mockConnection;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConnection = {
      query: jest.fn(),
      release: jest.fn()
    };

    pool.getConnection.mockResolvedValue(mockConnection);

    mockReq = {
      body: {},
      query: {},
      params: {},
      user: { tenantId: 1 },
      t: jest.fn((key) => key)
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('subscribe', () => {
    it('should create subscription successfully', async () => {
      mockReq.body = {
        planId: 1,
        paymentMethodId: 'pm_123',
        paymentGateway: 'stripe'
      };

      mockConnection.query.mockResolvedValue([[]]);
      BillingService.createStripeSubscription.mockResolvedValue({ id: 'sub_123' });

      await BillingController.subscribe(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    it('should reject if missing required fields', async () => {
      mockReq.body = { planId: 1 };

      await BillingController.subscribe(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should reject if already subscribed', async () => {
      mockReq.body = {
        planId: 1,
        paymentMethodId: 'pm_123'
      };

      mockConnection.query.mockResolvedValue([[{ id: 1 }]]);

      await BillingController.subscribe(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should reject invalid payment gateway', async () => {
      mockReq.body = {
        planId: 1,
        paymentMethodId: 'pm_123',
        paymentGateway: 'invalid'
      };

      mockConnection.query.mockResolvedValue([[]]);

      await BillingController.subscribe(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel subscription successfully', async () => {
      mockReq.body = { immediately: false };
      BillingService.cancelStripeSubscription.mockResolvedValue({ canceled: true });

      await BillingController.cancelSubscription(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    it('should handle cancellation error', async () => {
      BillingService.cancelStripeSubscription.mockRejectedValue(new Error('Cancel failed'));

      await BillingController.cancelSubscription(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('updatePlan', () => {
    it('should update plan successfully', async () => {
      mockReq.body = { planId: 2 };
      BillingService.updateSubscriptionPlan.mockResolvedValue({ updated: true });

      await BillingController.updatePlan(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    it('should reject if planId missing', async () => {
      mockReq.body = {};

      await BillingController.updatePlan(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('getSubscription', () => {
    it('should return subscription details', async () => {
      const mockSubscription = {
        id: 1,
        plan_name: 'Pro',
        price: 99.99,
        features: '{"ai": true}'
      };

      mockConnection.query.mockResolvedValue([[mockSubscription]]);

      await BillingController.getSubscription(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    it('should return 404 if no subscription', async () => {
      mockConnection.query.mockResolvedValue([[]]);

      await BillingController.getSubscription(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  describe('getUsage', () => {
    it('should return usage statistics', async () => {
      BillingService.getUsageStats.mockResolvedValue([{ month: '2024-12', messages: 100 }]);
      BillingService.trackMessageUsage.mockResolvedValue({ current: 50, max: 1000 });

      await BillingController.getUsage(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            current: expect.any(Object),
            history: expect.any(Array)
          })
        })
      );
    });
  });

  describe('getPayments', () => {
    it('should return payment history with pagination', async () => {
      mockReq.query = { page: 1, limit: 20 };
      mockConnection.query
        .mockResolvedValueOnce([[{ id: 1, amount: 99.99 }]])
        .mockResolvedValueOnce([[{ total: 1 }]]);

      await BillingController.getPayments(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          pagination: expect.any(Object)
        })
      );
    });
  });

  describe('getPlans', () => {
    it('should return available plans', async () => {
      const mockPlans = [
        { id: 1, name: 'Basic', price: 29.99, features: '{}' },
        { id: 2, name: 'Pro', price: 99.99, features: '{"ai": true}' }
      ];

      mockConnection.query.mockResolvedValue([mockPlans]);

      await BillingController.getPlans(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  describe('getInvoice', () => {
    it('should return invoice by id', async () => {
      mockReq.params = { id: 1 };
      mockConnection.query.mockResolvedValue([[{ id: 1, amount: 99.99 }]]);

      await BillingController.getInvoice(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    it('should return 404 if invoice not found', async () => {
      mockReq.params = { id: 999 };
      mockConnection.query.mockResolvedValue([[]]);

      await BillingController.getInvoice(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });
});
