/**
 * TenantUserController Unit Tests
 * Tests for tenant user management operations
 */

const TenantUserController = require('../../../controllers/TenantUserController');
const { pool } = require('../../../config/database');
const bcrypt = require('bcryptjs');

// Mock dependencies
jest.mock('../../../config/database');
jest.mock('bcryptjs');

describe('TenantUserController', () => {
  let mockReq;
  let mockRes;
  let mockConnection;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock request
    mockReq = {
      user: {
        id: 1,
        tenantId: 1,
        role: 'admin'
      },
      tenantId: 1,
      params: {},
      query: {},
      body: {}
    };

    // Mock response
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    // Mock database connection
    mockConnection = {
      query: jest.fn(),
      execute: jest.fn(),
      release: jest.fn()
    };

    pool.getConnection = jest.fn().mockResolvedValue(mockConnection);
  });

  describe('getUsers', () => {
    it('should return all users for tenant', async () => {
      const mockUsers = [
        { id: 1, name: 'User 1', email: 'user1@test.com', role: 'user' },
        { id: 2, name: 'User 2', email: 'user2@test.com', role: 'user' }
      ];

      mockConnection.query.mockResolvedValue([mockUsers]);

      await TenantUserController.getUsers(mockReq, mockRes);

      expect(mockConnection.query).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockUsers
      });
      expect(mockConnection.release).toHaveBeenCalled();
    });

    it('should filter users by role', async () => {
      mockReq.query.role = 'admin';
      const mockUsers = [
        { id: 1, name: 'Admin User', email: 'admin@test.com', role: 'admin' }
      ];

      mockConnection.query.mockResolvedValue([mockUsers]);

      await TenantUserController.getUsers(mockReq, mockRes);

      expect(mockConnection.query).toHaveBeenCalled();
      const queryCall = mockConnection.query.mock.calls[0];
      expect(queryCall[0]).toContain('u.role = ?');
      expect(queryCall[1]).toContain('admin');
    });

    it('should filter users by store', async () => {
      mockReq.query.store = 'Store A';
      mockConnection.query.mockResolvedValue([[]]);

      await TenantUserController.getUsers(mockReq, mockRes);

      const queryCall = mockConnection.query.mock.calls[0];
      expect(queryCall[0]).toContain('u.store = ?');
      expect(queryCall[1]).toContain('Store A');
    });

    it('should search users by name or email', async () => {
      mockReq.query.search = 'john';
      mockConnection.query.mockResolvedValue([[]]);

      await TenantUserController.getUsers(mockReq, mockRes);

      const queryCall = mockConnection.query.mock.calls[0];
      expect(queryCall[0]).toContain('u.name LIKE ? OR u.email LIKE ?');
      expect(queryCall[1]).toContain('%john%');
    });

    it('should return 400 if tenant ID is missing', async () => {
      mockReq.tenantId = null;
      mockReq.user.tenantId = null;

      await TenantUserController.getUsers(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Tenant ID is required'
      });
    });

    it('should handle database errors', async () => {
      mockConnection.query.mockRejectedValue(new Error('Database error'));

      await TenantUserController.getUsers(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Failed to fetch users',
        error: 'Database error'
      });
      expect(mockConnection.release).toHaveBeenCalled();
    });
  });

  describe('getUser', () => {
    it('should return single user by ID', async () => {
      mockReq.params.id = '2';
      const mockUser = {
        id: 2,
        name: 'Test User',
        email: 'test@example.com',
        role: 'user'
      };

      mockConnection.query.mockResolvedValue([[mockUser]]);

      await TenantUserController.getUser(mockReq, mockRes);

      expect(mockConnection.query).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockUser
      });
    });

    it('should return 404 if user not found', async () => {
      mockReq.params.id = '999';
      mockConnection.query.mockResolvedValue([[]]);

      await TenantUserController.getUser(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'User not found'
      });
    });

    it('should handle database errors', async () => {
      mockReq.params.id = '2';
      mockConnection.query.mockRejectedValue(new Error('Database error'));

      await TenantUserController.getUser(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockConnection.release).toHaveBeenCalled();
    });
  });

  describe('createUser', () => {
    it('should create new user successfully', async () => {
      mockReq.body = {
        username: 'newuser',
        password: 'password123',
        store: 'Store A'
      };

      const hashedPassword = 'hashed_password';
      bcrypt.hash.mockResolvedValue(hashedPassword);

      mockConnection.query
        .mockResolvedValueOnce([[]]) // Check existing user
        .mockResolvedValueOnce([{ insertId: 3 }]) // Insert user
        .mockResolvedValueOnce([[{ 
          id: 3, 
          username: 'newuser', 
          role: 'user',
          store: 'Store A'
        }]]); // Fetch created user

      await TenantUserController.createUser(mockReq, mockRes);

      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10);
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'User created successfully',
        data: expect.objectContaining({
          id: 3,
          username: 'newuser'
        })
      });
    });

    it('should return 400 if username is missing', async () => {
      mockReq.body = {
        password: 'password123',
        store: 'Store A'
      };

      await TenantUserController.createUser(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Username and password are required'
      });
    });

    it('should return 400 if password is missing', async () => {
      mockReq.body = {
        username: 'newuser',
        store: 'Store A'
      };

      await TenantUserController.createUser(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Username and password are required'
      });
    });

    it('should return 400 if neither store nor department provided', async () => {
      mockReq.body = {
        username: 'newuser',
        password: 'password123'
      };

      await TenantUserController.createUser(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Store or department is required'
      });
    });

    it('should return 400 if username already exists', async () => {
      mockReq.body = {
        username: 'existinguser',
        password: 'password123',
        store: 'Store A'
      };

      mockConnection.query.mockResolvedValueOnce([[{ id: 1 }]]);

      await TenantUserController.createUser(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Username already exists'
      });
    });

    it('should handle database errors', async () => {
      mockReq.body = {
        username: 'newuser',
        password: 'password123',
        store: 'Store A'
      };

      mockConnection.query.mockRejectedValue(new Error('Database error'));

      await TenantUserController.createUser(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockConnection.release).toHaveBeenCalled();
    });
  });

  describe('deleteUser', () => {
    it('should delete user successfully', async () => {
      mockReq.params.id = '2';
      mockConnection.query
        .mockResolvedValueOnce([[{ id: 2 }]]) // Check user exists
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // Delete user

      await TenantUserController.deleteUser(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'User deleted successfully'
      });
    });

    it('should return 400 when trying to delete self', async () => {
      mockReq.params.id = '1'; // Same as mockReq.user.id

      await TenantUserController.deleteUser(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Cannot delete your own account'
      });
    });

    it('should return 404 if user not found', async () => {
      mockReq.params.id = '999';
      mockConnection.query.mockResolvedValueOnce([[]]);

      await TenantUserController.deleteUser(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'User not found'
      });
    });

    it('should handle database errors', async () => {
      mockReq.params.id = '2';
      mockConnection.query.mockRejectedValue(new Error('Database error'));

      await TenantUserController.deleteUser(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockConnection.release).toHaveBeenCalled();
    });
  });

  describe('toggleActive', () => {
    it('should toggle user active status', async () => {
      mockReq.params.id = '2';
      mockConnection.query
        .mockResolvedValueOnce([[{ id: 2, active: 1 }]]) // Check user exists
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // Toggle status

      await TenantUserController.toggleActive(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'User status updated successfully'
      });
    });

    it('should return 400 when trying to toggle self', async () => {
      mockReq.params.id = '1'; // Same as mockReq.user.id

      await TenantUserController.toggleActive(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Cannot toggle your own account status'
      });
    });

    it('should return 404 if user not found', async () => {
      mockReq.params.id = '999';
      mockConnection.query.mockResolvedValueOnce([[]]);

      await TenantUserController.toggleActive(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'User not found'
      });
    });

    it('should handle database errors', async () => {
      mockReq.params.id = '2';
      mockConnection.query.mockRejectedValue(new Error('Database error'));

      await TenantUserController.toggleActive(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockConnection.release).toHaveBeenCalled();
    });
  });
});
