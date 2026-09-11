/**
 * AuthController Unit Tests
 */

const AuthController = require('../../../controllers/AuthController');
const bcrypt = require('bcryptjs');
const { generateToken } = require('../../../middleware/auth');

// Mock dependencies
jest.mock('bcryptjs');
jest.mock('../../../middleware/auth');
jest.mock('../../../controllers/BaseController');

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

    // Mock BaseController methods
    AuthController.executeQuery = jest.fn();
    AuthController.sendSuccess = jest.fn();
    AuthController.sendError = jest.fn();
  });

  describe('superAdminLogin', () => {
    it('should login super admin successfully', async () => {
      mockReq.body = {
        email: 'admin@test.com',
        password: 'password123'
      };

      const mockAdmin = {
        id: 1,
        email: 'admin@test.com',
        password: 'hashedPassword',
        name: 'Admin',
        active: true
      };

      AuthController.executeQuery.mockResolvedValue([mockAdmin]);
      bcrypt.compare.mockResolvedValue(true);
      generateToken.mockReturnValue('mock-jwt-token');

      await AuthController.superAdminLogin(mockReq, mockRes);

      expect(AuthController.executeQuery).toHaveBeenCalledWith(
        'SELECT * FROM super_admins WHERE email = ? AND active = TRUE',
        ['admin@test.com']
      );
      expect(bcrypt.compare).toHaveBeenCalledWith('password123', 'hashedPassword');
      expect(generateToken).toHaveBeenCalledWith({
        id: 1,
        email: 'admin@test.com',
        role: 'superadmin',
        name: 'Admin'
      });
      expect(AuthController.sendSuccess).toHaveBeenCalled();
    });

    it('should reject login with missing credentials', async () => {
      mockReq.body = { email: 'admin@test.com' };

      await AuthController.superAdminLogin(mockReq, mockRes);

      expect(AuthController.sendError).toHaveBeenCalledWith(
        mockRes,
        'Email and password are required',
        expect.any(Number)
      );
    });

    it('should reject login with invalid credentials', async () => {
      mockReq.body = {
        email: 'admin@test.com',
        password: 'wrongpassword'
      };

      AuthController.executeQuery.mockResolvedValue([]);

      await AuthController.superAdminLogin(mockReq, mockRes);

      expect(AuthController.sendError).toHaveBeenCalledWith(
        mockRes,
        'Invalid credentials',
        expect.any(Number)
      );
    });

    it('should reject login with wrong password', async () => {
      mockReq.body = {
        email: 'admin@test.com',
        password: 'wrongpassword'
      };

      const mockAdmin = {
        id: 1,
        email: 'admin@test.com',
        password: 'hashedPassword'
      };

      AuthController.executeQuery.mockResolvedValue([mockAdmin]);
      bcrypt.compare.mockResolvedValue(false);

      await AuthController.superAdminLogin(mockReq, mockRes);

      expect(AuthController.sendError).toHaveBeenCalledWith(
        mockRes,
        'Invalid credentials',
        expect.any(Number)
      );
    });
  });

  describe('tenantAdminLogin', () => {
    it('should login tenant admin successfully', async () => {
      mockReq.body = {
        email: 'admin@tenant.com',
        password: 'password123'
      };
      mockReq.tenantId = 1;

      const mockAdmin = {
        id: 1,
        tenant_id: 1,
        email: 'admin@tenant.com',
        username: 'admin',
        password: 'hashedPassword',
        name: 'Tenant Admin',
        active: true
      };

      AuthController.executeQuery.mockResolvedValue([mockAdmin]);
      bcrypt.compare.mockResolvedValue(true);
      generateToken.mockReturnValue('mock-jwt-token');

      await AuthController.tenantAdminLogin(mockReq, mockRes);

      expect(AuthController.executeQuery).toHaveBeenCalledWith(
        'SELECT * FROM admins WHERE tenant_id = ? AND email = ? AND active = TRUE',
        [1, 'admin@tenant.com']
      );
      expect(AuthController.sendSuccess).toHaveBeenCalled();
    });

    it('should reject login without tenant context', async () => {
      mockReq.body = {
        email: 'admin@tenant.com',
        password: 'password123'
      };

      await AuthController.tenantAdminLogin(mockReq, mockRes);

      expect(AuthController.sendError).toHaveBeenCalledWith(
        mockRes,
        expect.stringContaining('Tenant'),
        expect.any(Number)
      );
    });
  });

  describe('userLogin', () => {
    it('should login user successfully', async () => {
      mockReq.body = {
        username: 'user1',
        password: 'password123'
      };
      mockReq.tenantId = 1;

      const mockUser = {
        id: 1,
        tenant_id: 1,
        username: 'user1',
        password: 'hashedPassword',
        role: 'user',
        name: 'User One',
        active: true
      };

      AuthController.executeQuery.mockResolvedValue([mockUser]);
      bcrypt.compare.mockResolvedValue(true);
      generateToken.mockReturnValue('mock-jwt-token');

      await AuthController.userLogin(mockReq, mockRes);

      expect(AuthController.executeQuery).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE tenant_id = ? AND username = ? AND active = TRUE',
        [1, 'user1']
      );
      expect(AuthController.sendSuccess).toHaveBeenCalled();
    });

    it('should reject login with missing username', async () => {
      mockReq.body = { password: 'password123' };
      mockReq.tenantId = 1;

      await AuthController.userLogin(mockReq, mockRes);

      expect(AuthController.sendError).toHaveBeenCalledWith(
        mockRes,
        'Username and password are required',
        expect.any(Number)
      );
    });
  });

  describe('verifyToken', () => {
    it('should verify token and return user', async () => {
      mockReq.user = {
        id: 1,
        email: 'admin@test.com',
        role: 'superadmin'
      };

      await AuthController.verifyToken(mockReq, mockRes);

      expect(AuthController.sendSuccess).toHaveBeenCalledWith(
        mockRes,
        { user: mockReq.user }
      );
    });
  });
});
