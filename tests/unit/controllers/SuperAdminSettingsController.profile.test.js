/**
 * SuperAdminSettingsController Profile Unit Tests
 */

const SuperAdminSettingsController = require('../../../controllers/SuperAdminSettingsController');
const bcrypt = require('bcryptjs');

// Mock dependencies
jest.mock('../../../config/database', () => ({
  pool: {
    execute: jest.fn()
  }
}));

jest.mock('../../../config/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn()
}));

const { pool } = require('../../../config/database');

describe('SuperAdminSettingsController - Profile', () => {
  let mockReq;
  let mockRes;

  beforeEach(() => {
    jest.clearAllMocks();

    mockReq = {
      user: { id: 1 },
      body: {}
    };

    mockRes = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis()
    };
  });

  describe('getProfile', () => {
    it('should return super admin profile', async () => {
      const mockAdmin = { id: 1, email: 'admin@test.com', name: 'Admin' };
      pool.execute.mockResolvedValue([[mockAdmin]]);

      await SuperAdminSettingsController.getProfile(mockReq, mockRes);

      expect(pool.execute).toHaveBeenCalledWith(
        'SELECT id, email, name FROM super_admins WHERE id = ?',
        [1]
      );
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockAdmin
      });
    });

    it('should return 404 if admin not found', async () => {
      pool.execute.mockResolvedValue([[]]);

      await SuperAdminSettingsController.getProfile(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  describe('updateProfile', () => {
    it('should update email successfully', async () => {
      mockReq.body = { email: 'new@test.com' };
      
      // Mock password fetch (triggered by email change)
      pool.execute.mockResolvedValueOnce([[{ password: 'hash' }]]); 
      // Mock existing email check (no conflict)
      pool.execute.mockResolvedValueOnce([[]]); 
      // Update query
      pool.execute.mockResolvedValueOnce([{ affectedRows: 1 }]); 

      await SuperAdminSettingsController.updateProfile(mockReq, mockRes);

      expect(pool.execute).toHaveBeenCalledTimes(3);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Profile updated successfully'
      });
    });

    it('should prevent duplicate email', async () => {
      mockReq.body = { email: 'existing@test.com' };
      
      // Mock password fetch
      pool.execute.mockResolvedValueOnce([[{ password: 'hash' }]]); 
      // Mock existing email check (conflict found)
      pool.execute.mockResolvedValueOnce([[{ id: 2 }]]);

      await SuperAdminSettingsController.updateProfile(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Email already in use'
      }));
    });

    it('should update password successfully', async () => {
      mockReq.body = { 
        current_password: 'oldpass', 
        new_password: 'newpass' 
      };
      
      // Mock getting current password
      pool.execute.mockResolvedValueOnce([[{ password: 'hashed_old' }]]);
      // Mock password verification
      bcrypt.compare.mockResolvedValue(true);
      // Mock hashing new password
      bcrypt.hash.mockResolvedValue('hashed_new');
      // Mock update
      pool.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);

      await SuperAdminSettingsController.updateProfile(mockReq, mockRes);

      expect(bcrypt.compare).toHaveBeenCalledWith('oldpass', 'hashed_old');
      expect(bcrypt.hash).toHaveBeenCalledWith('newpass', 10);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Profile updated successfully'
      });
    });

    it('should require current password when setting new password', async () => {
      mockReq.body = { new_password: 'newpass' };
      
      // Mock getting user
      pool.execute.mockResolvedValueOnce([[{ password: 'hashed_old' }]]);

      await SuperAdminSettingsController.updateProfile(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Current password is required to set a new password'
      }));
    });

    it('should reject invalid current password', async () => {
      mockReq.body = { 
        current_password: 'wrongpass', 
        new_password: 'newpass' 
      };
      
      // Mock getting user
      pool.execute.mockResolvedValueOnce([[{ password: 'hashed_old' }]]);
      // Mock password verification failure
      bcrypt.compare.mockResolvedValue(false);

      await SuperAdminSettingsController.updateProfile(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
    });
  });
});
