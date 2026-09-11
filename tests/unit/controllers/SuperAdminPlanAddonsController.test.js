/**
 * SuperAdminPlanAddonsController Unit Tests
 * Tests for plan add-ons management
 */

const SuperAdminPlanAddonsController = require('../../../controllers/SuperAdminPlanAddonsController');
const { pool } = require('../../../config/database');
const { logger } = require('../../../config/logger');

// Mock dependencies
jest.mock('../../../config/database');
jest.mock('../../../config/logger');

describe('SuperAdminPlanAddonsController', () => {
  let req, res;

  beforeEach(() => {
    req = {
      params: {},
      body: {},
      user: { id: 1, role: 'superadmin' }
    };
    res = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis()
    };
    jest.clearAllMocks();
  });

  describe('getAllAddons', () => {
    it('should return all add-ons', async () => {
      const mockAddons = [
        {
          id: 1,
          resource_key: 'stores',
          resource_name: 'Store',
          unit_price: 0.50,
          currency: 'USD',
          active: true
        },
        {
          id: 2,
          resource_key: 'users',
          resource_name: 'User',
          unit_price: 0.70,
          currency: 'USD',
          active: true
        }
      ];

      pool.execute.mockResolvedValue([mockAddons]);

      await SuperAdminPlanAddonsController.getAllAddons(req, res);

      expect(pool.execute).toHaveBeenCalledWith(
        'SELECT * FROM plan_addons ORDER BY sort_order, resource_name'
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockAddons
      });
    });

    it('should return empty array when no add-ons exist', async () => {
      pool.execute.mockResolvedValue([[]]);

      await SuperAdminPlanAddonsController.getAllAddons(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: []
      });
    });

    it('should handle database errors', async () => {
      pool.execute.mockRejectedValue(new Error('Database error'));

      await SuperAdminPlanAddonsController.getAllAddons(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Error loading plan add-ons'
      });
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('createAddon', () => {
    it('should create a new add-on', async () => {
      req.body = {
        resource_key: 'stores',
        resource_name: 'Store',
        description: 'Additional store',
        unit_price: 0.50,
        currency: 'USD',
        stripe_price_id: 'price_123',
        paypal_plan_id: 'P-123',
        active: true,
        sort_order: 1
      };

      pool.execute
        .mockResolvedValueOnce([[]]) // Check existing
        .mockResolvedValueOnce([{ insertId: 1 }]); // Insert

      await SuperAdminPlanAddonsController.createAddon(req, res);

      expect(pool.execute).toHaveBeenCalledWith(
        'SELECT id FROM plan_addons WHERE resource_key = ?',
        ['stores']
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Add-on created successfully'
      });
    });

    it('should reject missing required fields', async () => {
      req.body = {
        resource_key: 'stores'
        // Missing resource_name and unit_price
      };

      await SuperAdminPlanAddonsController.createAddon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Missing required fields'
      });
    });

    it('should reject duplicate resource_key', async () => {
      req.body = {
        resource_key: 'stores',
        resource_name: 'Store',
        unit_price: 0.50
      };

      pool.execute.mockResolvedValue([[{ id: 1 }]]);

      await SuperAdminPlanAddonsController.createAddon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Resource key already exists'
      });
    });

    it('should handle database errors', async () => {
      req.body = {
        resource_key: 'stores',
        resource_name: 'Store',
        unit_price: 0.50
      };

      pool.execute.mockRejectedValue(new Error('Database error'));

      await SuperAdminPlanAddonsController.createAddon(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Error creating add-on'
      });
    });
  });

  describe('updateAddon', () => {
    it('should update an existing add-on', async () => {
      req.params.id = '1';
      req.body = {
        resource_name: 'Updated Store',
        unit_price: 0.75,
        active: false
      };

      pool.execute
        .mockResolvedValueOnce([[{ id: 1 }]]) // Check existing
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // Update

      await SuperAdminPlanAddonsController.updateAddon(req, res);

      expect(pool.execute).toHaveBeenCalledWith(
        'SELECT id FROM plan_addons WHERE id = ?',
        ['1']
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Add-on updated successfully'
      });
    });

    it('should return 404 if add-on not found', async () => {
      req.params.id = '999';
      req.body = { resource_name: 'Updated' };

      pool.execute.mockResolvedValue([[]]);

      await SuperAdminPlanAddonsController.updateAddon(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Add-on not found'
      });
    });

    it('should handle database errors', async () => {
      req.params.id = '1';
      req.body = { resource_name: 'Updated' };

      pool.execute.mockRejectedValue(new Error('Database error'));

      await SuperAdminPlanAddonsController.updateAddon(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Error updating add-on'
      });
    });
  });

  describe('toggleAddon', () => {
    it('should toggle add-on active status', async () => {
      req.params.id = '1';
      req.body = { active: false };

      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      await SuperAdminPlanAddonsController.toggleAddon(req, res);

      expect(pool.execute).toHaveBeenCalledWith(
        'UPDATE plan_addons SET active = ?, updated_at = NOW() WHERE id = ?',
        [false, '1']
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Add-on deactivated successfully'
      });
    });

    it('should return error for database errors', async () => {
      req.params.id = '999';
      req.body = { active: true };

      pool.execute.mockRejectedValue(new Error('Database error'));

      await SuperAdminPlanAddonsController.toggleAddon(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Error toggling add-on'
      });
    });
  });

  describe('deleteAddon', () => {
    it('should delete an add-on', async () => {
      req.params.id = '1';

      pool.execute
        .mockResolvedValueOnce([[{ count: 0 }]]) // Check usage
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // Delete

      await SuperAdminPlanAddonsController.deleteAddon(req, res);

      expect(pool.execute).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM tenant_addons WHERE addon_id = ? AND status = ?',
        ['1', 'active']
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Add-on deleted successfully'
      });
    });

    it('should return error if add-on has active subscriptions', async () => {
      req.params.id = '999';

      pool.execute.mockResolvedValue([[{ count: 5 }]]);

      await SuperAdminPlanAddonsController.deleteAddon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Cannot delete add-on with active subscriptions'
      });
    });

    it('should handle database errors', async () => {
      req.params.id = '1';

      pool.execute.mockRejectedValue(new Error('Database error'));

      await SuperAdminPlanAddonsController.deleteAddon(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Error deleting add-on'
      });
    });
  });
});
