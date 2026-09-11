/**
 * Super Admin Plan Controller Unit Tests
 * Tests for subscription plan management
 */

const SuperAdminPlanController = require('../../../controllers/SuperAdminPlanController');
const { pool } = require('../../../config/database');
const { logger } = require('../../../config/logger');

// Mock dependencies
jest.mock('../../../config/database');
jest.mock('../../../config/logger');

describe('SuperAdminPlanController', () => {
  let req, res;

  beforeEach(() => {
    req = {
      params: {},
      body: {},
      user: { id: 1 }
    };
    res = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis()
    };
    jest.clearAllMocks();
  });

  describe('getAllPlans', () => {
    it('should return all subscription plans ordered by sort_order and price', async () => {
      const mockPlans = [
        { id: 1, name: 'Free', price: 0, sort_order: 1 },
        { id: 2, name: 'Basic', price: 29.90, sort_order: 2 },
        { id: 3, name: 'Pro', price: 79.90, sort_order: 3 }
      ];

      pool.execute.mockResolvedValue([mockPlans]);

      await SuperAdminPlanController.getAllPlans(req, res);

      expect(pool.execute).toHaveBeenCalledWith(
        'SELECT * FROM subscription_plans ORDER BY sort_order, price'
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockPlans
      });
    });

    it('should return empty array when no plans exist', async () => {
      pool.execute.mockResolvedValue([[]]);

      await SuperAdminPlanController.getAllPlans(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: []
      });
    });

    it('should handle database errors', async () => {
      pool.execute.mockRejectedValue(new Error('Database error'));

      await SuperAdminPlanController.getAllPlans(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Error loading plans'
      });
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('getPlanById', () => {
    it('should return plan by ID', async () => {
      const mockPlan = { 
        id: 1, 
        name: 'Basic', 
        price: 29.90,
        max_stores: 5,
        max_users: 10
      };

      req.params.id = '1';
      pool.execute.mockResolvedValue([[mockPlan]]);

      await SuperAdminPlanController.getPlanById(req, res);

      expect(pool.execute).toHaveBeenCalledWith(
        'SELECT * FROM subscription_plans WHERE id = ?',
        ['1']
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockPlan
      });
    });

    it('should return 404 when plan not found', async () => {
      req.params.id = '999';
      pool.execute.mockResolvedValue([[]]);

      await SuperAdminPlanController.getPlanById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Plan not found'
      });
    });

    it('should handle database errors', async () => {
      req.params.id = '1';
      pool.execute.mockRejectedValue(new Error('Database error'));

      await SuperAdminPlanController.getPlanById(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Error loading plan'
      });
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('createPlan', () => {
    it('should create a new plan with required fields', async () => {
      req.body = {
        name: 'New Plan',
        price: 49.90
      };

      pool.execute.mockResolvedValue([{ insertId: 5 }]);

      await SuperAdminPlanController.createPlan(req, res);

      expect(pool.execute).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Plan created successfully',
        data: { id: 5 }
      });
      expect(logger.info).toHaveBeenCalledWith('Plan created', { 
        planId: 5, 
        name: 'New Plan' 
      });
    });

    it('should create a plan with all optional fields', async () => {
      req.body = {
        name: 'Enterprise',
        description: 'Enterprise plan',
        price: 199.90,
        currency: 'BRL',
        billing_period: 'yearly',
        max_stores: 50,
        max_users: 100,
        max_departments: 50,
        max_contacts: 50000,
        max_devices: 10,
        max_conversations: 50000,
        max_messages_per_month: 500000,
        max_faqs: 200,
        whatsapp_enabled: true,
        ai_enabled: true,
        woocommerce_enabled: true,
        analytics_enabled: true,
        priority_support_enabled: true,
        api_access_enabled: true,
        custom_branding_enabled: true,
        invoices_enabled: true,
        max_invoices_per_month: 1000,
        quotes_enabled: true,
        max_quotes_per_month: 1000,
        widgets_enabled: true,
        max_widgets: 20,
        payment_links_enabled: true,
        max_payment_links_per_month: 500,
        is_trial: false,
        trial_days: 0,
        is_free: false,
        stripe_price_id: 'price_123',
        paypal_plan_id: 'plan_456',
        sort_order: 4
      };

      pool.execute.mockResolvedValue([{ insertId: 6 }]);

      await SuperAdminPlanController.createPlan(req, res);

      expect(pool.execute).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Plan created successfully',
        data: { id: 6 }
      });
    });

    it('should reject plan without name', async () => {
      req.body = {
        price: 29.90
      };

      await SuperAdminPlanController.createPlan(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Name and price are required'
      });
    });

    it('should reject plan without price', async () => {
      req.body = {
        name: 'Test Plan'
      };

      await SuperAdminPlanController.createPlan(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Name and price are required'
      });
    });

    it('should reject second free plan', async () => {
      req.body = {
        name: 'Free Plan 2',
        price: 0,
        is_free: true
      };

      pool.execute.mockResolvedValue([[{ id: 1 }]]); // Existing free plan

      await SuperAdminPlanController.createPlan(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Only one free plan is allowed'
      });
    });

    it('should allow creating free plan when none exists', async () => {
      req.body = {
        name: 'Free Plan',
        price: 0,
        is_free: true
      };

      pool.execute
        .mockResolvedValueOnce([[]]) // No existing free plan
        .mockResolvedValueOnce([{ insertId: 1 }]); // Insert

      await SuperAdminPlanController.createPlan(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Plan created successfully',
        data: { id: 1 }
      });
    });

    it('should handle database errors', async () => {
      req.body = {
        name: 'Test Plan',
        price: 29.90
      };

      pool.execute.mockRejectedValue(new Error('Database error'));

      await SuperAdminPlanController.createPlan(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Error creating plan'
      });
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('updatePlan', () => {
    it('should update plan with valid fields', async () => {
      req.params.id = '1';
      req.body = {
        name: 'Updated Plan',
        price: 39.90,
        max_stores: 10
      };

      pool.execute
        .mockResolvedValueOnce([[{ id: 1, is_free: false }]]) // Check if exists
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // Update

      await SuperAdminPlanController.updatePlan(req, res);

      expect(pool.execute).toHaveBeenCalledTimes(2);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Plan updated successfully'
      });
      expect(logger.info).toHaveBeenCalledWith('Plan updated', { planId: '1' });
    });

    it('should return 404 when plan not found', async () => {
      req.params.id = '999';
      req.body = { name: 'Updated' };

      pool.execute.mockResolvedValue([[]]);

      await SuperAdminPlanController.updatePlan(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Plan not found'
      });
    });

    it('should reject making plan free when another free plan exists', async () => {
      req.params.id = '2';
      req.body = { is_free: true };

      pool.execute
        .mockResolvedValueOnce([[{ id: 2, is_free: false }]]) // Current plan
        .mockResolvedValueOnce([[{ id: 1 }]]); // Another free plan exists

      await SuperAdminPlanController.updatePlan(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Only one free plan is allowed'
      });
    });

    it('should allow updating already free plan', async () => {
      req.params.id = '1';
      req.body = { 
        is_free: true,
        name: 'Updated Free Plan'
      };

      pool.execute
        .mockResolvedValueOnce([[{ id: 1, is_free: true }]]) // Already free
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // Update

      await SuperAdminPlanController.updatePlan(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Plan updated successfully'
      });
    });

    it('should return 400 when no fields to update', async () => {
      req.params.id = '1';
      req.body = {};

      pool.execute.mockResolvedValue([[{ id: 1 }]]);

      await SuperAdminPlanController.updatePlan(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'No fields to update'
      });
    });

    it('should update multiple fields at once', async () => {
      req.params.id = '1';
      req.body = {
        name: 'Pro Plan',
        price: 99.90,
        max_stores: 20,
        max_users: 50,
        ai_enabled: true,
        analytics_enabled: true
      };

      pool.execute
        .mockResolvedValueOnce([[{ id: 1, is_free: false }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      await SuperAdminPlanController.updatePlan(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Plan updated successfully'
      });
    });

    it('should handle database errors', async () => {
      req.params.id = '1';
      req.body = { name: 'Updated' };

      pool.execute.mockRejectedValue(new Error('Database error'));

      await SuperAdminPlanController.updatePlan(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Error updating plan'
      });
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('deletePlan', () => {
    it('should delete plan without active subscriptions', async () => {
      req.params.id = '1';

      pool.execute
        .mockResolvedValueOnce([[{ count: 0 }]]) // No active subscriptions
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // Delete

      await SuperAdminPlanController.deletePlan(req, res);

      expect(pool.execute).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM tenants WHERE plan_id = ? AND status = ?',
        ['1', 'active']
      );
      expect(pool.execute).toHaveBeenCalledWith(
        'DELETE FROM subscription_plans WHERE id = ?',
        ['1']
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Plan deleted successfully'
      });
      expect(logger.info).toHaveBeenCalledWith('Plan deleted', { planId: '1' });
    });

    it('should reject deleting plan with active subscriptions', async () => {
      req.params.id = '1';

      pool.execute.mockResolvedValue([[{ count: 5 }]]); // 5 active subscriptions

      await SuperAdminPlanController.deletePlan(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Cannot delete plan with active subscriptions'
      });
    });

    it('should handle database errors', async () => {
      req.params.id = '1';

      pool.execute.mockRejectedValue(new Error('Database error'));

      await SuperAdminPlanController.deletePlan(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Error deleting plan'
      });
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('togglePlanStatus', () => {
    it('should activate inactive plan', async () => {
      req.params.id = '1';

      pool.execute
        .mockResolvedValueOnce([[{ active: false }]]) // Current status
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // Update

      await SuperAdminPlanController.togglePlanStatus(req, res);

      expect(pool.execute).toHaveBeenCalledWith(
        'UPDATE subscription_plans SET active = ? WHERE id = ?',
        [true, '1']
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Plan activated successfully',
        data: { active: true }
      });
      expect(logger.info).toHaveBeenCalledWith('Plan status toggled', { 
        planId: '1', 
        newStatus: true 
      });
    });

    it('should deactivate active plan', async () => {
      req.params.id = '2';

      pool.execute
        .mockResolvedValueOnce([[{ active: true }]]) // Current status
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // Update

      await SuperAdminPlanController.togglePlanStatus(req, res);

      expect(pool.execute).toHaveBeenCalledWith(
        'UPDATE subscription_plans SET active = ? WHERE id = ?',
        [false, '2']
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Plan deactivated successfully',
        data: { active: false }
      });
      expect(logger.info).toHaveBeenCalledWith('Plan status toggled', { 
        planId: '2', 
        newStatus: false 
      });
    });

    it('should return 404 when plan not found', async () => {
      req.params.id = '999';

      pool.execute.mockResolvedValue([[]]);

      await SuperAdminPlanController.togglePlanStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Plan not found'
      });
    });

    it('should handle database errors', async () => {
      req.params.id = '1';

      pool.execute.mockRejectedValue(new Error('Database error'));

      await SuperAdminPlanController.togglePlanStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Error updating plan status'
      });
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
