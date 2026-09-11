/**
 * PlanLimitsController Unit Tests
 */

const PlanLimitsController = require('../../../controllers/PlanLimitsController');

// Mock dependencies
jest.mock('../../../config/database', () => ({
  pool: {
    execute: jest.fn()
  }
}));

jest.mock('../../../middleware/planLimits', () => ({
  getTenantPlanLimits: jest.fn(),
  getCurrentResourceCount: jest.fn()
}));

const { pool } = require('../../../config/database');
const { getTenantPlanLimits, getCurrentResourceCount } = require('../../../middleware/planLimits');

describe('PlanLimitsController', () => {
  let mockReq;
  let mockRes;

  beforeEach(() => {
    jest.clearAllMocks();

    mockReq = {
      tenantId: 1,
      user: { tenantId: 1 },
      params: {}
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('getLimits', () => {
    it('should return plan limits and usage', async () => {
      getTenantPlanLimits.mockResolvedValue({
        plan_id: 1,
        max_stores: 5,
        max_users: 10,
        max_departments: 5,
        max_contacts: 1000,
        max_devices: 3,
        max_conversations: 500,
        max_faqs: 20,
        max_contact_groups: 10,
        max_messages_per_month: 10000,
        max_invoices_per_month: 50,
        max_quotes_per_month: 50,
        max_widgets: 3,
        max_payment_links_per_month: 50,
        invoices_enabled: true,
        quotes_enabled: true,
        widgets_enabled: true,
        payment_links_enabled: true
      });

      getCurrentResourceCount.mockResolvedValue(2);
      pool.execute.mockResolvedValue([[{ name: 'Pro Plan' }]]);

      await PlanLimitsController.getLimits(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            plan: expect.any(Object),
            limits: expect.any(Object),
            usage: expect.any(Object),
            percentages: expect.any(Object),
            features: expect.any(Object)
          })
        })
      );
    });

    it('should return 400 if no tenant context', async () => {
      mockReq.tenantId = null;
      mockReq.user = null;

      await PlanLimitsController.getLimits(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Tenant context is required'
        })
      );
    });

    it('should handle errors gracefully', async () => {
      getTenantPlanLimits.mockRejectedValue(new Error('Database error'));

      await PlanLimitsController.getLimits(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });

    it('should use default plan name if plan not found', async () => {
      getTenantPlanLimits.mockResolvedValue({
        plan_id: null,
        max_stores: 1
      });

      getCurrentResourceCount.mockResolvedValue(0);

      await PlanLimitsController.getLimits(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            plan: expect.objectContaining({
              name: 'Plano Personalizado'
            })
          })
        })
      );
    });
  });

  describe('getResourceUsage', () => {
    it('should return specific resource usage', async () => {
      mockReq.params = { resource: 'stores' };

      getTenantPlanLimits.mockResolvedValue({ max_stores: 5 });
      getCurrentResourceCount.mockResolvedValue(2);

      await PlanLimitsController.getResourceUsage(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            resource: 'stores',
            current: 2,
            max: 5,
            remaining: 3,
            percentage: 40,
            canCreate: true
          })
        })
      );
    });

    it('should return 400 for invalid resource', async () => {
      mockReq.params = { resource: 'invalid_resource' };

      await PlanLimitsController.getResourceUsage(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Invalid resource'
        })
      );
    });

    it('should return 400 if no tenant context', async () => {
      mockReq.tenantId = null;
      mockReq.user = null;
      mockReq.params = { resource: 'stores' };

      await PlanLimitsController.getResourceUsage(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should return canCreate false when at limit', async () => {
      mockReq.params = { resource: 'users' };

      getTenantPlanLimits.mockResolvedValue({ max_users: 5 });
      getCurrentResourceCount.mockResolvedValue(5);

      await PlanLimitsController.getResourceUsage(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            canCreate: false,
            remaining: 0,
            percentage: 100
          })
        })
      );
    });

    it('should handle all valid resources', async () => {
      const validResources = [
        'stores', 'users', 'departments', 'contacts',
        'devices', 'conversations', 'faqs', 'contact_groups',
        'invoices', 'quotes', 'widgets', 'payment_links'
      ];

      getTenantPlanLimits.mockResolvedValue({ max_stores: 5 });
      getCurrentResourceCount.mockResolvedValue(1);

      for (const resource of validResources) {
        mockReq.params = { resource };
        await PlanLimitsController.getResourceUsage(mockReq, mockRes);
        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({ success: true })
        );
      }
    });
  });

  describe('getFeatureStatus', () => {
    it('should return 400 for invalid feature', async () => {
      mockReq.params = { feature: 'invalid' };

      await PlanLimitsController.getFeatureStatus(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Invalid feature'
        })
      );
    });

    it('should return disabled data when limits fail', async () => {
      mockReq.params = { feature: 'ai' };
      getTenantPlanLimits.mockRejectedValue(new Error('db'));

      await PlanLimitsController.getFeatureStatus(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            feature: 'ai',
            enabled: false,
            canPurchase: false
          })
        })
      );
    });

    it('should return feature status when enabled', async () => {
      mockReq.params = { feature: 'api_access' };
      getTenantPlanLimits.mockResolvedValue({
        plan_id: 1,
        api_access_enabled: true
      });
      pool.execute.mockResolvedValue([[{ name: 'Admin' }]]);

      await PlanLimitsController.getFeatureStatus(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            feature: 'api_access',
            enabled: true
          })
        })
      );
    });
  });
});
