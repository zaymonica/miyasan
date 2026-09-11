/**
 * Tenant Middleware Unit Tests
 */

const jwt = require('jsonwebtoken');
const { pool } = require('../../../config/database');
const {
  tenantMiddleware,
  requireTenant
} = require('../../../middleware/tenant');
const GracePeriodService = require('../../../services/GracePeriodService');

jest.mock('jsonwebtoken');
jest.mock('../../../config/database', () => ({
  pool: {
    execute: jest.fn()
  }
}));
jest.mock('../../../services/GracePeriodService');

describe('Tenant Middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    jest.clearAllMocks();

    mockReq = {
      headers: {},
      get: jest.fn(),
      user: null,
      tenantId: null,
      tenant: null
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    mockNext = jest.fn();

    // Default mock for GracePeriodService
    GracePeriodService.shouldAllowAccess.mockResolvedValue(true);
    GracePeriodService.getDisplayStatus.mockImplementation(tenant => ({
      ...tenant,
      display_status: tenant.status === 'grace_period' ? 'active' : tenant.status
    }));
  });

  describe('tenantMiddleware', () => {
    it('should extract tenant from JWT token', async () => {
      const mockUser = { id: 1, tenantId: 5 };
      mockReq.headers.authorization = 'Bearer valid-token';
      jwt.verify.mockReturnValue(mockUser);

      pool.execute.mockResolvedValue([[{
        id: 5,
        name: 'Test Tenant',
        status: 'active'
      }]]);

      await tenantMiddleware(mockReq, mockRes, mockNext);

      expect(mockReq.tenantId).toBe(5);
      expect(mockReq.tenant).toBeDefined();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should extract tenant from X-Tenant-ID header', async () => {
      mockReq.headers['x-tenant-id'] = '3';

      pool.execute.mockResolvedValue([[{
        id: 3,
        name: 'Test Tenant',
        status: 'active'
      }]]);

      await tenantMiddleware(mockReq, mockRes, mockNext);

      expect(mockReq.tenantId).toBe(3);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should extract tenant from subdomain', async () => {
      mockReq.get.mockReturnValue('tenant1.example.com');

      pool.execute.mockResolvedValue([[{
        id: 1,
        name: 'Tenant 1',
        subdomain: 'tenant1',
        status: 'active'
      }]]);

      await tenantMiddleware(mockReq, mockRes, mockNext);

      expect(pool.execute).toHaveBeenCalledWith(
        'SELECT id, name, status, subscription_end_date, grace_period_end FROM tenants WHERE subdomain = ? AND status IN (?, ?, ?)',
        ['tenant1', 'active', 'trial', 'grace_period']
      );
      expect(mockReq.tenantId).toBe(1);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should allow tenant in grace period', async () => {
      mockReq.headers['x-tenant-id'] = '3';

      pool.execute.mockResolvedValue([[{
        id: 3,
        name: 'Grace Period Tenant',
        status: 'grace_period'
      }]]);

      GracePeriodService.shouldAllowAccess.mockResolvedValue(true);

      await tenantMiddleware(mockReq, mockRes, mockNext);

      expect(mockReq.tenantId).toBe(3);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject suspended tenant', async () => {
      mockReq.headers['x-tenant-id'] = '3';

      pool.execute.mockResolvedValue([[{
        id: 3,
        name: 'Suspended Tenant',
        status: 'suspended'
      }]]);

      GracePeriodService.shouldAllowAccess.mockResolvedValue(false);

      await tenantMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Tenant account is suspended or cancelled'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should continue without tenant if not found', async () => {
      await tenantMiddleware(mockReq, mockRes, mockNext);

      expect(mockReq.tenantId).toBeNull();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should ignore www subdomain', async () => {
      mockReq.get.mockReturnValue('www.example.com');

      await tenantMiddleware(mockReq, mockRes, mockNext);

      expect(pool.execute).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should ignore localhost', async () => {
      mockReq.get.mockReturnValue('localhost:3000');

      await tenantMiddleware(mockReq, mockRes, mockNext);

      expect(pool.execute).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('requireTenant', () => {
    it('should allow request with tenant context', () => {
      mockReq.tenantId = 1;

      requireTenant(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject request without tenant context', () => {
      requireTenant(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Tenant context is required'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});
