/**
 * SuperAdminController Unit Tests
 */

const SuperAdminController = require('../../../controllers/SuperAdminController');

// Mock dependencies
jest.mock('../../../config/database', () => ({
  pool: {
    execute: jest.fn(),
    getConnection: jest.fn()
  }
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
  compare: jest.fn()
}));

const { pool } = require('../../../config/database');
const bcrypt = require('bcryptjs');

describe('SuperAdminController', () => {
  let mockReq;
  let mockRes;
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

    mockReq = {
      body: {},
      query: {},
      params: {},
      user: { id: 1, role: 'superadmin' },
      t: jest.fn((key) => key)
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('getDashboard', () => {
    it('should return dashboard statistics', async () => {
      pool.execute
        .mockResolvedValueOnce([[{ total: 10 }]]) // tenants
        .mockResolvedValueOnce([[{ total: 5 }]]) // active
        .mockResolvedValueOnce([[{ total: 2 }]]) // trial
        .mockResolvedValueOnce([[{ revenue: 1000 }]]) // revenue
        .mockResolvedValueOnce([[{ id: 1, name: 'Tenant 1' }]]); // recent

      await SuperAdminController.getDashboard(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            totalTenants: expect.any(Number),
            activeTenants: expect.any(Number)
          })
        })
      );
    });
  });

  describe('getTenants', () => {
    it('should return paginated tenants list', async () => {
      mockReq.query = { page: 1, limit: 10 };

      pool.execute
        .mockResolvedValueOnce([[
          { id: 1, name: 'Tenant 1', status: 'active' },
          { id: 2, name: 'Tenant 2', status: 'trial' }
        ]])
        .mockResolvedValueOnce([[{ total: 2 }]]);

      await SuperAdminController.getTenants(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.any(Array),
          pagination: expect.any(Object)
        })
      );
    });

    it('should filter by status', async () => {
      mockReq.query = { status: 'active' };

      pool.execute
        .mockResolvedValueOnce([[{ id: 1, status: 'active' }]])
        .mockResolvedValueOnce([[{ total: 1 }]]);

      await SuperAdminController.getTenants(mockReq, mockRes);

      expect(pool.execute).toHaveBeenCalledWith(
        expect.stringContaining('status = ?'),
        expect.arrayContaining(['active'])
      );
    });

    it('should search by name or email', async () => {
      mockReq.query = { search: 'test' };

      pool.execute
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ total: 0 }]]);

      await SuperAdminController.getTenants(mockReq, mockRes);

      expect(pool.execute).toHaveBeenCalledWith(
        expect.stringContaining('LIKE'),
        expect.any(Array)
      );
    });
  });

  describe('getTenantById', () => {
    it('should return tenant details', async () => {
      mockReq.params = { id: 1 };

      pool.execute.mockResolvedValue([[{
        id: 1,
        name: 'Test Tenant',
        email: 'test@test.com',
        status: 'active'
      }]]);

      await SuperAdminController.getTenantById(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ id: 1 })
        })
      );
    });

    it('should return 404 if tenant not found', async () => {
      mockReq.params = { id: 999 };
      pool.execute.mockResolvedValue([[]]);

      await SuperAdminController.getTenantById(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  describe('createTenant', () => {
    it('should create new tenant', async () => {
      mockReq.body = {
        name: 'New Tenant',
        subdomain: 'newtenant',
        email: 'new@test.com',
        password: 'password123',
        planId: 1
      };

      bcrypt.hash.mockResolvedValue('hashedPassword');
      
      mockConnection.execute
        .mockResolvedValueOnce([[]]) // Check subdomain
        .mockResolvedValueOnce([{ insertId: 1 }]) // Insert tenant
        .mockResolvedValueOnce([{ insertId: 1 }]); // Insert admin

      await SuperAdminController.createTenant(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    it('should reject duplicate subdomain', async () => {
      mockReq.body = {
        name: 'New Tenant',
        subdomain: 'existing',
        email: 'new@test.com'
      };

      mockConnection.execute.mockResolvedValue([[{ id: 1 }]]);

      await SuperAdminController.createTenant(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('updateTenant', () => {
    it('should update tenant', async () => {
      mockReq.params = { id: 1 };
      mockReq.body = { name: 'Updated Name', status: 'active' };

      mockConnection.execute.mockResolvedValue([{ affectedRows: 1 }]);

      await SuperAdminController.updateTenant(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  describe('suspendTenant', () => {
    it('should suspend tenant', async () => {
      mockReq.params = { id: 1 };

      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      await SuperAdminController.suspendTenant(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  describe('activateTenant', () => {
    it('should activate tenant', async () => {
      mockReq.params = { id: 1 };

      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      await SuperAdminController.activateTenant(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  describe('deleteTenant', () => {
    it('should delete tenant', async () => {
      mockReq.params = { id: 1 };

      mockConnection.execute.mockResolvedValue([{ affectedRows: 1 }]);

      await SuperAdminController.deleteTenant(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  describe('getSystemStats', () => {
    it('should return system statistics', async () => {
      pool.execute
        .mockResolvedValueOnce([[{ total_messages: 10000 }]])
        .mockResolvedValueOnce([[{ total_conversations: 500 }]])
        .mockResolvedValueOnce([[{ total_contacts: 5000 }]]);

      await SuperAdminController.getSystemStats(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  describe('getActivityLog', () => {
    it('should return activity log', async () => {
      mockReq.query = { page: 1, limit: 50 };

      pool.execute
        .mockResolvedValueOnce([[
          { id: 1, action: 'login', created_at: new Date() }
        ]])
        .mockResolvedValueOnce([[{ total: 1 }]]);

      await SuperAdminController.getActivityLog(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.any(Array)
        })
      );
    });
  });
});
