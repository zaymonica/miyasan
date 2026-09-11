/**
 * AuthController Complete Unit Tests
 * Tests for all authentication methods
 */

const AuthController = require('../../../controllers/AuthController');
const { pool } = require('../../../config/database');
const bcrypt = require('bcryptjs');
const { generateToken } = require('../../../middleware/auth');

// Mock dependencies
jest.mock('../../../config/database');
jest.mock('bcryptjs');
jest.mock('../../../middleware/auth');

describe('AuthController', () => {
  let mockReq;
  let mockRes;

  beforeEach(() => {
    jest.clearAllMocks();

    mockReq = {
      body: {},
      tenantId: null
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    // Mock pool.execute
    pool.execute = jest.fn();
  });

  describe('superAdminLogin', () => {
    it('should login super admin successfully', async () => {
      mockReq.body = {
        email: 'admin@example.com',
        password: 'password123'
      };

      const mockAdmin = {
        id: 1,
        email: 'admin@example.com',
        password: 'hashed_password',
        name: 'Super Admin',
        active: true
      };

      pool.execute.mockResolvedValue([[mockAdmin]]);
      bcrypt.compare.mockResolvedValue(true);
      generateToken.mockReturnValue('mock_token');

      await AuthController.superAdminLogin(mockReq, mockRes);

      expect(pool.execute).toHaveBeenCalledWith(
        'SELECT * FROM super_admins WHERE email = ? AND active = TRUE',
        ['admin@example.com']
      );
      expect(bcrypt.compare).toHaveBeenCalledWith('password123', 'hashed_password');
      expect(generateToken).toHaveBeenCalledWith({
        id: 1,
        email: 'admin@example.com',
        role: 'superadmin',
        name: 'Super Admin'
      });
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          token: 'mock_token',
          user: {
            id: 1,
            email: 'admin@example.com',
            name: 'Super Admin',
            role: 'superadmin'
          }
        }
      });
    });

    it('should return 401 if email not found', async () => {
      mockReq.body = {
        email: 'notfound@example.com',
        password: 'password123'
      };

      pool.execute.mockResolvedValue([[]]);

      await AuthController.superAdminLogin(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid credentials'
      });
    });

    it('should return 401 if password is invalid', async () => {
      mockReq.body = {
        email: 'admin@example.com',
        password: 'wrongpassword'
      };

      const mockAdmin = {
        id: 1,
        email: 'admin@example.com',
        password: 'hashed_password',
        active: true
      };

      pool.execute.mockResolvedValue([[mockAdmin]]);
      bcrypt.compare.mockResolvedValue(false);

      await AuthController.superAdminLogin(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid credentials'
      });
    });

    it('should return 500 if email is missing', async () => {
      mockReq.body = {
        password: 'password123'
      };

      await AuthController.superAdminLogin(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Email and password are required'
      });
    });

    it('should return 500 if password is missing', async () => {
      mockReq.body = {
        email: 'admin@example.com'
      };

      await AuthController.superAdminLogin(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Email and password are required'
      });
    });

    it('should handle database errors', async () => {
      mockReq.body = {
        email: 'admin@example.com',
        password: 'password123'
      };

      pool.execute.mockRejectedValue(new Error('Database error'));

      await AuthController.superAdminLogin(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('tenantAdminLogin', () => {
    it('should login tenant admin successfully', async () => {
      mockReq.body = {
        email: 'tenant@example.com',
        password: 'password123'
      };
      mockReq.tenantId = 1;

      const mockAdmin = {
        id: 1,
        email: 'tenant@example.com',
        username: 'tenantadmin',
        password: 'hashed_password',
        name: 'Tenant Admin',
        tenant_id: 1,
        active: true
      };

      pool.execute.mockResolvedValue([[mockAdmin]]);
      bcrypt.compare.mockResolvedValue(true);
      generateToken.mockReturnValue('mock_token');

      await AuthController.tenantAdminLogin(mockReq, mockRes);

      expect(bcrypt.compare).toHaveBeenCalledWith('password123', 'hashed_password');
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          token: 'mock_token',
          user: expect.objectContaining({
            id: 1,
            email: 'tenant@example.com',
            role: 'admin',
            tenantId: 1
          })
        }
      });
    });

    it('should find tenant by subdomain if tenantId not provided', async () => {
      mockReq.body = {
        email: 'tenant@example.com',
        password: 'password123',
        subdomain: 'test-tenant'
      };
      mockReq.tenantId = null;

      const mockTenant = { id: 1, status: 'active' };
      const mockAdmin = {
        id: 1,
        email: 'tenant@example.com',
        password: 'hashed_password',
        tenant_id: 1,
        active: true
      };

      pool.execute
        .mockResolvedValueOnce([[mockTenant]]) // Get tenant
        .mockResolvedValueOnce([[mockAdmin]]); // Get admin

      bcrypt.compare.mockResolvedValue(true);
      generateToken.mockReturnValue('mock_token');

      await AuthController.tenantAdminLogin(mockReq, mockRes);

      expect(pool.execute).toHaveBeenCalledWith(
        'SELECT id, status FROM tenants WHERE subdomain = ?',
        ['test-tenant']
      );
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    it('should return error if tenant not found', async () => {
      mockReq.body = {
        email: 'tenant@example.com',
        password: 'password123',
        subdomain: 'nonexistent'
      };
      mockReq.tenantId = null;

      pool.execute.mockResolvedValue([[]]);

      await AuthController.tenantAdminLogin(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Tenant not found'
      });
    });

    it('should return error if tenant is suspended', async () => {
      mockReq.body = {
        email: 'tenant@example.com',
        password: 'password123',
        subdomain: 'suspended-tenant'
      };
      mockReq.tenantId = null;

      const mockTenant = { id: 1, status: 'suspended' };
      pool.execute.mockResolvedValue([[mockTenant]]);

      await AuthController.tenantAdminLogin(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Tenant account is suspended'
      });
    });

    it('should return 401 if credentials are invalid', async () => {
      mockReq.body = {
        email: 'tenant@example.com',
        password: 'wrongpassword'
      };
      mockReq.tenantId = 1;

      const mockAdmin = {
        id: 1,
        email: 'tenant@example.com',
        password: 'hashed_password',
        tenant_id: 1,
        active: true
      };

      pool.execute.mockResolvedValue([[mockAdmin]]);
      bcrypt.compare.mockResolvedValue(false);

      await AuthController.tenantAdminLogin(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid credentials'
      });
    });
  });

  describe('userLogin', () => {
    it('should login user successfully', async () => {
      mockReq.body = {
        username: 'testuser',
        password: 'password123'
      };
      mockReq.tenantId = 1;

      const mockUser = {
        id: 1,
        username: 'testuser',
        password: 'hashed_password',
        name: 'Test User',
        role: 'user',
        tenant_id: 1,
        store: 'Store A',
        department: null,
        active: true
      };

      pool.execute.mockResolvedValue([[mockUser]]);
      bcrypt.compare.mockResolvedValue(true);
      generateToken.mockReturnValue('mock_token');

      await AuthController.userLogin(mockReq, mockRes);

      expect(pool.execute).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE tenant_id = ? AND username = ? AND active = TRUE',
        [1, 'testuser']
      );
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          token: 'mock_token',
          user: expect.objectContaining({
            id: 1,
            username: 'testuser',
            role: 'user',
            tenantId: 1
          })
        }
      });
    });

    it('should return error if username is missing', async () => {
      mockReq.body = {
        password: 'password123'
      };
      mockReq.tenantId = 1;

      await AuthController.userLogin(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Username and password are required'
      });
    });

    it('should return error if tenantId is missing', async () => {
      mockReq.body = {
        username: 'testuser',
        password: 'password123'
      };
      mockReq.tenantId = null;

      await AuthController.userLogin(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Tenant context is required'
      });
    });

    it('should return 401 if user not found', async () => {
      mockReq.body = {
        username: 'nonexistent',
        password: 'password123'
      };
      mockReq.tenantId = 1;

      pool.execute.mockResolvedValue([[]]);

      await AuthController.userLogin(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid credentials'
      });
    });

    it('should return 401 if password is invalid', async () => {
      mockReq.body = {
        username: 'testuser',
        password: 'wrongpassword'
      };
      mockReq.tenantId = 1;

      const mockUser = {
        id: 1,
        username: 'testuser',
        password: 'hashed_password',
        tenant_id: 1,
        active: true
      };

      pool.execute.mockResolvedValue([[mockUser]]);
      bcrypt.compare.mockResolvedValue(false);

      await AuthController.userLogin(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid credentials'
      });
    });
  });

  describe('genericLogin', () => {
    it('should login as super admin when email matches', async () => {
      mockReq.body = {
        email: 'superadmin@example.com',
        password: 'password123'
      };

      const mockSuperAdmin = {
        id: 1,
        email: 'superadmin@example.com',
        password: 'hashed_password',
        name: 'Super Admin',
        active: true
      };

      pool.execute.mockResolvedValue([[mockSuperAdmin]]);
      bcrypt.compare.mockResolvedValue(true);
      generateToken.mockReturnValue('mock_token');

      await AuthController.genericLogin(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          token: 'mock_token',
          user: expect.objectContaining({
            role: 'superadmin'
          })
        }
      });
    });

    it('should login as tenant admin when email matches', async () => {
      mockReq.body = {
        email: 'tenant@example.com',
        password: 'password123'
      };

      const mockAdmin = {
        id: 1,
        email: 'tenant@example.com',
        password: 'hashed_password',
        tenant_id: 1,
        tenant_status: 'active',
        active: true
      };

      pool.execute
        .mockResolvedValueOnce([[]]) // No super admin
        .mockResolvedValueOnce([[mockAdmin]]); // Tenant admin found

      bcrypt.compare.mockResolvedValue(true);
      generateToken.mockReturnValue('mock_token');

      await AuthController.genericLogin(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          token: 'mock_token',
          user: expect.objectContaining({
            role: 'admin',
            tenantId: 1
          })
        }
      });
    });

    it('should login as user when username matches', async () => {
      mockReq.body = {
        email: 'testuser',
        password: 'password123'
      };

      const mockUser = {
        id: 1,
        username: 'testuser',
        password: 'hashed_password',
        tenant_id: 1,
        tenant_status: 'active',
        role: 'user',
        active: true
      };

      pool.execute
        .mockResolvedValueOnce([[]]) // No super admin
        .mockResolvedValueOnce([[]]) // No tenant admin
        .mockResolvedValueOnce([[mockUser]]); // User found

      bcrypt.compare.mockResolvedValue(true);
      generateToken.mockReturnValue('mock_token');

      await AuthController.genericLogin(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          token: 'mock_token',
          user: expect.objectContaining({
            role: 'user',
            tenantId: 1
          })
        }
      });
    });

    it('should return 401 if no match found', async () => {
      mockReq.body = {
        email: 'nonexistent@example.com',
        password: 'password123'
      };

      pool.execute
        .mockResolvedValueOnce([[]]) // No super admin
        .mockResolvedValueOnce([[]]) // No tenant admin
        .mockResolvedValueOnce([[]]); // No user

      await AuthController.genericLogin(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid credentials'
      });
    });

    it('should return error if email is missing', async () => {
      mockReq.body = {
        password: 'password123'
      };

      await AuthController.genericLogin(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Email and password are required'
      });
    });
  });

  describe('verifyToken', () => {
    it('should return user data from token', async () => {
      mockReq.user = {
        id: 1,
        email: 'test@example.com',
        role: 'admin'
      };

      await AuthController.verifyToken(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          user: mockReq.user
        }
      });
    });

    it('should handle errors gracefully', async () => {
      mockReq.user = null;
      
      // Mock json to throw error
      const originalJson = mockRes.json;
      mockRes.json = jest.fn(() => {
        throw new Error('User not found');
      });

      try {
        await AuthController.verifyToken(mockReq, mockRes);
      } catch (error) {
        // Expected to throw
      }

      expect(mockRes.json).toHaveBeenCalled();
    });
  });
});
