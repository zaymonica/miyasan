/**
 * planLimits Middleware Unit Tests
 */

const { getTenantPlanLimits, getCurrentResourceCount, checkResourceLimit, checkFeatureEnabled } = require('../../../middleware/planLimits');

// Mock dependencies
jest.mock('../../../config/database', () => ({
  pool: {
    execute: jest.fn()
  }
}));

const { pool } = require('../../../config/database');

describe('planLimits Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getTenantPlanLimits', () => {
    it('should return tenant plan limits', async () => {
      pool.execute.mockResolvedValue([[{
        max_stores: 5,
        max_users: 10,
        max_departments: 5,
        max_contacts: 1000,
        max_devices: 3,
        max_conversations: 500,
        max_messages_per_month: 10000,
        max_faqs: 20,
        max_contact_groups: 10,
        plan_id: 1
      }]]);

      const limits = await getTenantPlanLimits(1);

      expect(limits).toEqual(expect.objectContaining({
        max_stores: 5,
        max_users: 10
      }));
    });

    it('should throw if tenant not found', async () => {
      pool.execute.mockResolvedValue([[]]);

      await expect(getTenantPlanLimits(999)).rejects.toThrow('Tenant not found');
    });

    it('should handle database errors', async () => {
      pool.execute.mockRejectedValue(new Error('DB Error'));

      await expect(getTenantPlanLimits(1)).rejects.toThrow();
    });

    it('should parse settings and enable addon features', async () => {
      const settings = Buffer.from(JSON.stringify({
        widgets_enabled: true,
        api_access: true,
        invoices_enabled: true
      }));

      pool.execute.mockResolvedValue([[{
        tenant_id: 1,
        plan_id: 2,
        settings,
        max_stores: 1,
        max_users: 2,
        max_departments: 1,
        max_contacts: 10,
        max_devices: 1,
        max_conversations: 10,
        max_messages_per_month: 100,
        max_faqs: 5,
        max_contact_groups: 3,
        plan_invoices_enabled: 0,
        max_invoices_per_month: 0,
        plan_quotes_enabled: 0,
        max_quotes_per_month: 0,
        plan_widgets_enabled: 0,
        max_widgets: 0,
        plan_payment_links_enabled: 0,
        plan_api_access_enabled: 0,
        max_payment_links_per_month: 0,
        plan_ai_enabled: 0,
        plan_woocommerce_enabled: 0
      }]]);

      const limits = await getTenantPlanLimits(1);

      expect(limits.widgets_enabled).toBe(true);
      expect(limits.api_access_enabled).toBe(true);
      expect(limits.invoices_enabled).toBe(true);
    });
  });

  describe('getCurrentResourceCount', () => {
    it('should return count for stores', async () => {
      pool.execute.mockResolvedValue([[{ count: 3 }]]);

      const count = await getCurrentResourceCount(1, 'stores');

      expect(count).toBe(3);
    });

    it('should return count for users', async () => {
      pool.execute.mockResolvedValue([[{ count: 5 }]]);

      const count = await getCurrentResourceCount(1, 'users');

      expect(count).toBe(5);
    });

    it('should return count for departments', async () => {
      pool.execute.mockResolvedValue([[{ count: 2 }]]);

      const count = await getCurrentResourceCount(1, 'departments');

      expect(count).toBe(2);
    });

    it('should return count for contacts', async () => {
      pool.execute.mockResolvedValue([[{ count: 100 }]]);

      const count = await getCurrentResourceCount(1, 'contacts');

      expect(count).toBe(100);
    });

    it('should return count for conversations', async () => {
      pool.execute.mockResolvedValue([[{ count: 50 }]]);

      const count = await getCurrentResourceCount(1, 'conversations');

      expect(count).toBe(50);
    });

    it('should return count for faqs', async () => {
      pool.execute.mockResolvedValue([[{ count: 10 }]]);

      const count = await getCurrentResourceCount(1, 'faqs');

      expect(count).toBe(10);
    });

    it('should throw for unknown resource', async () => {
      await expect(getCurrentResourceCount(1, 'unknown')).rejects.toThrow('Unknown resource type');
    });

    it('should return count for contact groups', async () => {
      pool.execute.mockResolvedValue([[{ count: 4 }]]);

      const count = await getCurrentResourceCount(1, 'contact_groups');

      expect(count).toBe(4);
    });

    it('should return count for payment links', async () => {
      pool.execute.mockResolvedValue([[{ count: 1 }]]);

      const count = await getCurrentResourceCount(1, 'payment_links');

      expect(count).toBe(1);
    });
  });

  describe('checkResourceLimit', () => {
    let mockReq;
    let mockRes;
    let mockNext;

    beforeEach(() => {
      mockReq = {
        tenantId: 1,
        t: jest.fn((key) => key)
      };
      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      mockNext = jest.fn();
    });

    it('should allow if under limit', async () => {
      pool.execute
        .mockResolvedValueOnce([[{ max_stores: 5 }]]) // limits
        .mockResolvedValueOnce([[{ count: 2 }]]); // current count

      const middleware = checkResourceLimit('stores');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should block if at limit', async () => {
      pool.execute
        .mockResolvedValueOnce([[{ max_stores: 5 }]]) // limits
        .mockResolvedValueOnce([[{ count: 5 }]]); // current count

      const middleware = checkResourceLimit('stores');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should allow if limit is -1 (unlimited)', async () => {
      pool.execute
        .mockResolvedValueOnce([[{ max_stores: -1 }]]) // unlimited
        .mockResolvedValueOnce([[{ count: 100 }]]);

      const middleware = checkResourceLimit('stores');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle missing tenant context', async () => {
      mockReq.tenantId = null;

      const middleware = checkResourceLimit('stores');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('checkFeatureEnabled', () => {
    let mockReq;
    let mockRes;
    let mockNext;

    beforeEach(() => {
      mockReq = {
        tenantId: 1,
        user: { tenantId: 1 }
      };
      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      mockNext = jest.fn();
    });

    it('should allow when feature enabled', async () => {
      pool.execute.mockResolvedValue([[{
        plan_api_access_enabled: 1,
        settings: null,
        max_stores: 1,
        max_users: 1,
        max_departments: 1,
        max_contacts: 1,
        max_devices: 1,
        max_conversations: 1,
        max_messages_per_month: 1,
        max_faqs: 1,
        max_contact_groups: 1
      }]]);

      const middleware = checkFeatureEnabled('api_access');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should block when feature disabled', async () => {
      pool.execute.mockResolvedValue([[{ api_access_enabled: 0, settings: null }]]);

      const middleware = checkFeatureEnabled('api_access');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
    });

    it('should return 400 when tenant missing', async () => {
      mockReq.tenantId = null;
      mockReq.user = null;

      const middleware = checkFeatureEnabled('api_access');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should call next on errors', async () => {
      pool.execute.mockRejectedValue(new Error('db'));

      const middleware = checkFeatureEnabled('api_access');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });
});
