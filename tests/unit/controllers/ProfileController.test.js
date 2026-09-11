/**
 * ProfileController Unit Tests
 */

const ProfileController = require('../../../controllers/ProfileController');

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

describe('ProfileController', () => {
  let mockReq;
  let mockRes;
  let mockConnection;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConnection = {
      execute: jest.fn(),
      query: jest.fn(),
      release: jest.fn()
    };

    pool.getConnection.mockResolvedValue(mockConnection);

    mockReq = {
      body: {},
      query: {},
      params: {},
      tenantId: 1,
      user: { id: 1, tenantId: 1, role: 'admin' },
      t: jest.fn((key) => key)
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('getProfile', () => {
    it('should return user profile', async () => {
      pool.execute.mockResolvedValue([[{
        id: 1,
        name: 'John Doe',
        email: 'john@test.com',
        username: 'johndoe'
      }]]);

      await ProfileController.getProfile(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            name: 'John Doe'
          })
        })
      );
    });

    it('should return 404 if user not found', async () => {
      pool.execute.mockResolvedValue([[]]);

      await ProfileController.getProfile(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  describe('updateProfile', () => {
    it('should update profile successfully', async () => {
      mockReq.body = {
        name: 'Updated Name',
        email: 'updated@test.com'
      };

      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      await ProfileController.updateProfile(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    it('should reject duplicate email', async () => {
      mockReq.body = { email: 'existing@test.com' };

      pool.execute.mockRejectedValue({ code: 'ER_DUP_ENTRY' });

      await ProfileController.updateProfile(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('changePassword', () => {
    it('should change password successfully', async () => {
      mockReq.body = {
        currentPassword: 'oldPassword',
        newPassword: 'newPassword123'
      };

      pool.execute.mockResolvedValue([[{ password: 'hashedOldPassword' }]]);
      bcrypt.compare.mockResolvedValue(true);
      bcrypt.hash.mockResolvedValue('hashedNewPassword');
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      await ProfileController.changePassword(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    it('should reject if current password is wrong', async () => {
      mockReq.body = {
        currentPassword: 'wrongPassword',
        newPassword: 'newPassword123'
      };

      pool.execute.mockResolvedValue([[{ password: 'hashedPassword' }]]);
      bcrypt.compare.mockResolvedValue(false);

      await ProfileController.changePassword(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should reject if passwords missing', async () => {
      mockReq.body = { currentPassword: 'old' };

      await ProfileController.changePassword(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('getTenantProfile', () => {
    it('should return tenant profile', async () => {
      pool.execute.mockResolvedValue([[{
        id: 1,
        name: 'Test Tenant',
        subdomain: 'test',
        email: 'tenant@test.com'
      }]]);

      await ProfileController.getTenantProfile(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            name: 'Test Tenant'
          })
        })
      );
    });
  });

  describe('updateTenantProfile', () => {
    it('should update tenant profile', async () => {
      mockReq.body = {
        company_name: 'Updated Company',
        phone: '123456789'
      };

      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      await ProfileController.updateTenantProfile(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  describe('getTenantBranding', () => {
    it('should return tenant branding settings', async () => {
      pool.execute.mockResolvedValue([[{
        logo_url: '/uploads/logo.png',
        primary_color: '#667eea'
      }]]);

      await ProfileController.getTenantBranding(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.any(Object)
        })
      );
    });
  });

  describe('updateTenantBranding', () => {
    it('should update tenant branding', async () => {
      mockReq.body = {
        primary_color: '#FF0000',
        accent_color: '#00FF00'
      };

      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      await ProfileController.updateTenantBranding(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  describe('uploadLogo', () => {
    it('should upload logo successfully', async () => {
      mockReq.file = {
        filename: 'logo.png',
        path: '/uploads/logo.png'
      };

      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      await ProfileController.uploadLogo(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            logo_url: expect.any(String)
          })
        })
      );
    });

    it('should reject if no file uploaded', async () => {
      mockReq.file = null;

      await ProfileController.uploadLogo(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });
});
