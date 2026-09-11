/**
 * PlanManagementController Unit Tests
 * Tests for tenant plan and add-on management
 */

const PlanManagementController = require('../../../controllers/PlanManagementController');
const { pool } = require('../../../config/database');
const { logger } = require('../../../config/logger');

// Mock dependencies
jest.mock('../../../config/database');
jest.mock('../../../config/logger');
jest.mock('stripe', () => {
  return jest.fn(() => ({
    checkout: {
      sessions: {
        create: jest.fn()
      }
    }
  }));
});
jest.mock('@paypal/checkout-server-sdk');

describe('PlanManagementController', () => {
  let req, res;

  beforeEach(() => {
    req = {
      params: {},
      body: {},
      query: {},
      tenantId: 1,
      user: { id: 1 },
      protocol: 'https',
      get: jest.fn().mockReturnValue('example.com')
    };
    res = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis()
    };
    jest.clearAllMocks();
  });

  describe('getCurrentPlan', () => {
    it('should return current plan information', async () => {
      const mockTenant = {
        id: 1,
        name: 'Test Tenant',
        plan_id: 1,
        plan_name: 'Basic Plan',
        price: 29.99,
        currency: 'USD',
        status: 'active',
        max_users: 5,
        max_conversations: 100,
        max_messages_per_month: 1000
      };

      pool.execute.mockResolvedValue([[mockTenant]]);

      await PlanManagementController.getCurrentPlan(req, res);

      expect(pool.execute).toHaveBeenCalledWith(
        expect.stringContaining('SELECT t.*, sp.name as plan_name'),
        [1]
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          plan_name: 'Basic Plan',
          price: 29.99,
          currency: 'USD',
          status: 'active'
        })
      });
    });

    it('should return 404 if tenant not found', async () => {
      pool.execute.mockResolvedValue([[]]);

      await PlanManagementController.getCurrentPlan(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Tenant not found'
      });
    });

    it('should handle database errors', async () => {
      pool.execute.mockRejectedValue(new Error('Database error'));

      await PlanManagementController.getCurrentPlan(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Error loading plan information'
      });
    });
  });

  describe('getResourcesUsage', () => {
    it('should return resources usage statistics', async () => {
      const mockTenant = {
        id: 1,
        max_stores: 3,
        max_departments: 5,
        max_users: 10,
        max_conversations: 100,
        max_contacts: 500
      };

      pool.execute
        .mockResolvedValueOnce([[mockTenant]]) // Tenant
        .mockResolvedValueOnce([[{ count: 2 }]]) // Stores
        .mockResolvedValueOnce([[{ count: 3 }]]) // Departments
        .mockResolvedValueOnce([[{ count: 5 }]]) // Users
        .mockResolvedValueOnce([[{ count: 50 }]]) // Conversations
        .mockResolvedValueOnce([[{ count: 200 }]]); // Contacts

      await PlanManagementController.getResourcesUsage(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          stores: expect.objectContaining({
            used: 2,
            limit: 3,
            percentage: expect.any(Number)
          }),
          departments: expect.objectContaining({
            used: 3,
            limit: 5
          })
        })
      });
    });

    it('should return 404 if tenant not found', async () => {
      pool.execute.mockResolvedValue([[]]);

      await PlanManagementController.getResourcesUsage(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Tenant not found'
      });
    });

    it('should handle database errors', async () => {
      pool.execute.mockRejectedValue(new Error('Database error'));

      await PlanManagementController.getResourcesUsage(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Error loading resources usage'
      });
    });
  });

  describe('getAvailableAddons', () => {
    it('should return available add-ons', async () => {
      const mockAddons = [
        {
          id: 1,
          resource_key: 'stores',
          resource_name: 'Store',
          unit_price: 0.50,
          active: true
        },
        {
          id: 2,
          resource_key: 'users',
          resource_name: 'User',
          unit_price: 0.70,
          active: true
        }
      ];

      pool.execute.mockResolvedValue([mockAddons]);

      await PlanManagementController.getAvailableAddons(req, res);

      expect(pool.execute).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM plan_addons')
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockAddons
      });
    });

    it('should handle database errors', async () => {
      pool.execute.mockRejectedValue(new Error('Database error'));

      await PlanManagementController.getAvailableAddons(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Error loading add-ons'
      });
    });
  });

  describe('checkoutAddons', () => {
    it('should reject empty cart', async () => {
      req.body = { items: [], gateway: 'stripe' };

      await PlanManagementController.checkoutAddons(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'No items in cart'
      });
    });

    it('should reject missing gateway', async () => {
      req.body = {
        items: [{ addon_id: 1, quantity: 1, unit_price: 0.50 }]
      };

      await PlanManagementController.checkoutAddons(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Payment gateway is required'
      });
    });

    it('should create purchase record for cash payment', async () => {
      req.body = {
        items: [
          { addon_id: 1, quantity: 2, unit_price: 0.50 }
        ],
        gateway: 'cash'
      };

      const mockTenant = { id: 1, name: 'Test', email: 'test@test.com' };
      pool.execute
        .mockResolvedValueOnce([[mockTenant]]) // Get tenant
        .mockResolvedValueOnce([{ insertId: 1 }]); // Insert purchase

      await PlanManagementController.checkoutAddons(req, res);

      expect(pool.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO addon_purchases'),
        expect.arrayContaining([1, expect.any(String), 1.00, 'cash'])
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          purchase_id: 1,
          redirect_url: expect.stringContaining('/payment-instructions')
        })
      });
    });

    it('should reject invalid gateway', async () => {
      req.body = {
        items: [{ addon_id: 1, quantity: 1, unit_price: 0.50 }],
        gateway: 'invalid'
      };

      const mockTenant = { id: 1, name: 'Test', email: 'test@test.com' };
      pool.execute
        .mockResolvedValueOnce([[mockTenant]])
        .mockResolvedValueOnce([{ insertId: 1 }]);

      await PlanManagementController.checkoutAddons(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid payment gateway'
      });
    });

    it('should handle database errors', async () => {
      req.body = {
        items: [{ addon_id: 1, quantity: 1, unit_price: 0.50 }],
        gateway: 'stripe'
      };

      pool.execute.mockRejectedValue(new Error('Database error'));

      await PlanManagementController.checkoutAddons(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Error processing checkout'
      });
    });
  });

  describe('createStripeAddonCheckout', () => {
    it('should return error if Stripe not configured', async () => {
      pool.execute.mockResolvedValue([[]]);

      const items = [{ addon_id: 1, quantity: 1, unit_price: 0.50, currency: 'USD', resource_name: 'Store' }];
      const tenant = { id: 1, email: 'test@test.com' };

      await PlanManagementController.createStripeAddonCheckout(req, res, 1, items, 0.50, tenant);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Stripe is not configured'
      });
    });
  });

  describe('createPayPalAddonOrder', () => {
    it('should return error if PayPal not configured', async () => {
      pool.execute.mockResolvedValue([[]]);

      const items = [{ addon_id: 1, quantity: 1, unit_price: 0.50, currency: 'USD', resource_name: 'Store' }];
      const tenant = { id: 1, email: 'test@test.com' };

      await PlanManagementController.createPayPalAddonOrder(req, res, 1, items, 0.50, tenant);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'PayPal is not configured'
      });
    });
  });

  describe('Edge Cases and Additional Coverage', () => {
    it('should handle tenant with unlimited resources', async () => {
      const mockTenant = {
        id: 1,
        max_stores: -1,
        max_departments: -1,
        max_users: -1,
        max_conversations: -1,
        max_contacts: -1
      };

      pool.execute
        .mockResolvedValueOnce([[mockTenant]])
        .mockResolvedValueOnce([[{ count: 10 }]])
        .mockResolvedValueOnce([[{ count: 10 }]])
        .mockResolvedValueOnce([[{ count: 10 }]])
        .mockResolvedValueOnce([[{ count: 10 }]])
        .mockResolvedValueOnce([[{ count: 10 }]]);

      await PlanManagementController.getResourcesUsage(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          stores: expect.objectContaining({
            limit: -1,
            percentage: 0
          })
        })
      });
    });

    it('should handle checkout with multiple items', async () => {
      req.body = {
        items: [
          { addon_id: 1, quantity: 2, unit_price: 0.50 },
          { addon_id: 2, quantity: 3, unit_price: 0.70 }
        ],
        gateway: 'cash'
      };

      const mockTenant = { id: 1, name: 'Test', email: 'test@test.com' };
      pool.execute
        .mockResolvedValueOnce([[mockTenant]])
        .mockResolvedValueOnce([{ insertId: 1 }]);

      await PlanManagementController.checkoutAddons(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          purchase_id: 1
        })
      });
    });

    it('should return 404 if tenant not found during checkout', async () => {
      req.body = {
        items: [{ addon_id: 1, quantity: 1, unit_price: 0.50 }],
        gateway: 'stripe'
      };
      pool.execute.mockResolvedValue([[]]);

      await PlanManagementController.checkoutAddons(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Tenant not found'
      });
    });
  });
});