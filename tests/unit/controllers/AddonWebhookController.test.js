/**
 * AddonWebhookController Unit Tests
 * Tests for webhook handling and resource activation
 */

const AddonWebhookController = require('../../../controllers/AddonWebhookController');
const { pool } = require('../../../config/database');
const { logger } = require('../../../config/logger');

// Mock dependencies
jest.mock('../../../config/database');
jest.mock('../../../config/logger');
jest.mock('stripe', () => {
  return jest.fn(() => ({
    webhooks: {
      constructEvent: jest.fn()
    }
  }));
});

describe('AddonWebhookController', () => {
  let req, res, mockConnection;

  beforeEach(() => {
    req = {
      params: {},
      body: {},
      headers: {}
    };
    res = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis()
    };
    mockConnection = {
      execute: jest.fn(),
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn()
    };
    jest.clearAllMocks();
  });

  describe('handleStripeWebhook', () => {
    it('should return error if Stripe not configured', async () => {
      req.headers['stripe-signature'] = 'sig_123';
      pool.execute.mockResolvedValue([[]]);

      await AddonWebhookController.handleStripeWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Stripe not configured'
      });
    });

    it('should handle webhook processing errors', async () => {
      req.headers['stripe-signature'] = 'sig_123';
      pool.execute.mockRejectedValue(new Error('Database error'));

      await AddonWebhookController.handleStripeWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Webhook processing failed'
      });
    });
  });

  describe('handlePayPalWebhook', () => {
    it('should process PAYMENT.CAPTURE.COMPLETED event', async () => {
      req.body = {
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource: {
          supplementary_data: {
            related_ids: {
              order_id: 'order_123'
            }
          }
        }
      };

      pool.execute
        .mockResolvedValueOnce([[{ 
          id: 1, 
          tenant_id: 1,
          items: JSON.stringify([{ addon_id: 1, quantity: 1 }]) 
        }]]) // Get purchase
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // Update purchase

      pool.getConnection = jest.fn().mockResolvedValue(mockConnection);
      mockConnection.execute
        .mockResolvedValueOnce([[{ id: 1, resource_key: 'stores' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      await AddonWebhookController.handlePayPalWebhook(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        received: true
      });
    });

    it('should handle unhandled event types', async () => {
      req.body = {
        event_type: 'UNKNOWN.EVENT',
        resource: {}
      };

      await AddonWebhookController.handlePayPalWebhook(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        received: true
      });
      expect(logger.info).toHaveBeenCalledWith(
        'Unhandled PayPal event type',
        { type: 'UNKNOWN.EVENT' }
      );
    });

    it('should handle webhook processing errors gracefully', async () => {
      req.body = {
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource: {
          supplementary_data: {}  // Missing related_ids
        }
      };

      await AddonWebhookController.handlePayPalWebhook(req, res);

      // Should handle gracefully and return success
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        received: true
      });
    });
  });

  describe('activateAddonResources', () => {
    it('should activate resources for stores', async () => {
      const items = [
        { addon_id: 1, quantity: 2 }
      ];

      pool.getConnection = jest.fn().mockResolvedValue(mockConnection);
      mockConnection.execute
        .mockResolvedValueOnce([[{ id: 1, resource_key: 'stores' }]]) // Get addon
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // Insert tenant_addons
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // Update tenant limits

      await AddonWebhookController.activateAddonResources(1, items);

      expect(mockConnection.beginTransaction).toHaveBeenCalled();
      expect(mockConnection.commit).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();
    });

    it('should activate resources for departments', async () => {
      const items = [
        { addon_id: 2, quantity: 3 }
      ];

      pool.getConnection = jest.fn().mockResolvedValue(mockConnection);
      mockConnection.execute
        .mockResolvedValueOnce([[{ id: 2, resource_key: 'departments' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      await AddonWebhookController.activateAddonResources(1, items);

      expect(mockConnection.commit).toHaveBeenCalled();
    });

    it('should activate resources for users', async () => {
      const items = [
        { addon_id: 3, quantity: 5 }
      ];

      pool.getConnection = jest.fn().mockResolvedValue(mockConnection);
      mockConnection.execute
        .mockResolvedValueOnce([[{ id: 3, resource_key: 'users' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      await AddonWebhookController.activateAddonResources(1, items);

      expect(mockConnection.commit).toHaveBeenCalled();
    });

    it('should activate resources for conversations (100 per unit)', async () => {
      const items = [
        { addon_id: 4, quantity: 2 }
      ];

      pool.getConnection = jest.fn().mockResolvedValue(mockConnection);
      mockConnection.execute
        .mockResolvedValueOnce([[{ id: 4, resource_key: 'conversations' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      await AddonWebhookController.activateAddonResources(1, items);

      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining('max_conversations'),
        [200, 1] // 2 * 100
      );
    });

    it('should activate resources for messages (1000 per unit)', async () => {
      const items = [
        { addon_id: 5, quantity: 3 }
      ];

      pool.getConnection = jest.fn().mockResolvedValue(mockConnection);
      mockConnection.execute
        .mockResolvedValueOnce([[{ id: 5, resource_key: 'messages' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      await AddonWebhookController.activateAddonResources(1, items);

      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining('max_messages_per_month'),
        [3000, 1] // 3 * 1000
      );
    });

    it('should activate resources for contacts (100 per unit)', async () => {
      const items = [
        { addon_id: 6, quantity: 4 }
      ];

      pool.getConnection = jest.fn().mockResolvedValue(mockConnection);
      mockConnection.execute
        .mockResolvedValueOnce([[{ id: 6, resource_key: 'contacts' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      await AddonWebhookController.activateAddonResources(1, items);

      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining('max_contacts'),
        [400, 1] // 4 * 100
      );
    });

    it('should handle unknown resource keys', async () => {
      const items = [
        { addon_id: 99, quantity: 1 }
      ];

      pool.getConnection = jest.fn().mockResolvedValue(mockConnection);
      mockConnection.execute
        .mockResolvedValueOnce([[{ id: 99, resource_key: 'unknown' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      await AddonWebhookController.activateAddonResources(1, items);

      expect(logger.warn).toHaveBeenCalledWith(
        'Unknown resource key',
        { resourceKey: 'unknown' }
      );
      expect(mockConnection.commit).toHaveBeenCalled();
    });

    it('should rollback on error', async () => {
      const items = [
        { addon_id: 1, quantity: 1 }
      ];

      pool.getConnection = jest.fn().mockResolvedValue(mockConnection);
      mockConnection.execute.mockRejectedValue(new Error('Database error'));

      await expect(
        AddonWebhookController.activateAddonResources(1, items)
      ).rejects.toThrow('Database error');

      expect(mockConnection.rollback).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();
    });

    it('should skip addon if not found', async () => {
      const items = [
        { addon_id: 999, quantity: 1 }
      ];

      pool.getConnection = jest.fn().mockResolvedValue(mockConnection);
      mockConnection.execute.mockResolvedValueOnce([[]]); // Addon not found

      await AddonWebhookController.activateAddonResources(1, items);

      expect(logger.error).toHaveBeenCalledWith(
        'Addon not found',
        { addonId: 999 }
      );
      expect(mockConnection.commit).toHaveBeenCalled();
    });
  });

  describe('approveManualPayment', () => {
    it('should approve manual payment and activate resources', async () => {
      req.params.id = '1';

      pool.execute
        .mockResolvedValueOnce([[{ 
          id: 1, 
          tenant_id: 1,
          items: JSON.stringify([{ addon_id: 1, quantity: 1 }]) 
        }]]) // Get purchase
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // Update purchase

      pool.getConnection = jest.fn().mockResolvedValue(mockConnection);
      mockConnection.execute
        .mockResolvedValueOnce([[{ id: 1, resource_key: 'stores' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      await AddonWebhookController.approveManualPayment(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Payment approved and resources activated'
      });
    });

    it('should return error if purchase not found', async () => {
      req.params.id = '999';

      pool.execute.mockResolvedValue([[]]);

      await AddonWebhookController.approveManualPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Purchase not found'
      });
    });

    it('should handle errors', async () => {
      req.params.id = '1';

      pool.execute.mockRejectedValue(new Error('Database error'));

      await AddonWebhookController.approveManualPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Error approving payment'
      });
    });
  });

  describe('getAddonPurchases', () => {
    it('should return paginated purchases', async () => {
      req.query = { page: 1, limit: 20 };

      const mockPurchases = [
        {
          id: 1,
          tenant_id: 1,
          tenant_name: 'Test Tenant',
          tenant_email: 'test@test.com',
          items: JSON.stringify([{ addon_id: 1, quantity: 1 }]),
          total_amount: 0.50,
          status: 'completed'
        }
      ];

      pool.execute
        .mockResolvedValueOnce([mockPurchases]) // Get purchases
        .mockResolvedValueOnce([[{ total: 1 }]]); // Get count

      await AddonWebhookController.getAddonPurchases(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          purchases: expect.arrayContaining([
            expect.objectContaining({
              id: 1,
              items: expect.any(Array)
            })
          ]),
          pagination: {
            page: 1,
            limit: 20,
            total: 1,
            pages: 1
          }
        }
      });
    });

    it('should filter by status', async () => {
      req.query = { page: 1, limit: 20, status: 'pending' };

      pool.execute
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ total: 0 }]]);

      await AddonWebhookController.getAddonPurchases(req, res);

      expect(pool.execute).toHaveBeenCalledWith(
        expect.stringContaining('AND ap.status = ?'),
        expect.arrayContaining(['pending'])
      );
    });

    it('should filter by tenant_id', async () => {
      req.query = { page: 1, limit: 20, tenant_id: '1' };

      pool.execute
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ total: 0 }]]);

      await AddonWebhookController.getAddonPurchases(req, res);

      expect(pool.execute).toHaveBeenCalledWith(
        expect.stringContaining('AND ap.tenant_id = ?'),
        expect.arrayContaining(['1'])
      );
    });

    it('should handle errors', async () => {
      req.query = { page: 1, limit: 20 };

      pool.execute.mockRejectedValue(new Error('Database error'));

      await AddonWebhookController.getAddonPurchases(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Error loading addon purchases'
      });
    });
  });

  describe('Additional Coverage for Webhook Events', () => {
    it('should handle Stripe subscription.created event', async () => {
      req.headers['stripe-signature'] = 'sig_123';
      req.body = { type: 'customer.subscription.created' };

      pool.execute
        .mockResolvedValueOnce([[{ setting_value: 'whsec_123' }]])
        .mockResolvedValueOnce([[{ setting_value: 'sk_test_123' }]]);

      const stripe = require('stripe');
      const mockStripe = stripe();
      mockStripe.webhooks.constructEvent.mockReturnValue({
        type: 'customer.subscription.created',
        data: {
          object: { id: 'sub_123' }
        }
      });

      await AddonWebhookController.handleStripeWebhook(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        received: true
      });
    });

    it('should handle PayPal subscription.created event', async () => {
      req.body = {
        event_type: 'BILLING.SUBSCRIPTION.CREATED',
        resource: { id: 'sub_123' }
      };

      await AddonWebhookController.handlePayPalWebhook(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        received: true
      });
    });

    it('should handle PayPal subscription.cancelled event', async () => {
      req.body = {
        event_type: 'BILLING.SUBSCRIPTION.CANCELLED',
        resource: { id: 'sub_123' }
      };

      await AddonWebhookController.handlePayPalWebhook(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        received: true
      });
    });

    it('should handle multiple items in activation', async () => {
      const items = [
        { addon_id: 1, quantity: 2 },
        { addon_id: 2, quantity: 3 }
      ];

      pool.getConnection = jest.fn().mockResolvedValue(mockConnection);
      mockConnection.execute
        .mockResolvedValueOnce([[{ id: 1, resource_key: 'stores' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[{ id: 2, resource_key: 'users' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      await AddonWebhookController.activateAddonResources(1, items);

      expect(mockConnection.commit).toHaveBeenCalled();
    });
  });
});