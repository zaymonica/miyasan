/**
 * Auth Middleware Unit Tests
 */

const jwt = require('jsonwebtoken');
const {
  requireAuth,
  requireSuperAdmin,
  requireAdmin,
  requireUser,
  optionalAuth,
  generateToken,
  verifyToken
} = require('../../../middleware/auth');

jest.mock('jsonwebtoken');

describe('Auth Middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    jest.clearAllMocks();

    mockReq = {
      headers: {},
      user: null
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    mockNext = jest.fn();

    process.env.JWT_SECRET = 'test-secret';
  });

  describe('requireAuth', () => {
    it('should authenticate valid token', () => {
      const mockUser = { id: 1, email: 'test@test.com', role: 'admin' };
      mockReq.headers.authorization = 'Bearer valid-token';
      jwt.verify.mockReturnValue(mockUser);

      requireAuth(mockReq, mockRes, mockNext);

      expect(jwt.verify).toHaveBeenCalledWith('valid-token', 'test-secret');
      expect(mockReq.user).toEqual(mockUser);
      expect(mockReq.userId).toBe(1);
      expect(mockReq.userRole).toBe('admin');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject request without token', () => {
      requireAuth(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Access denied. Token not provided.'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject invalid token', () => {
      mockReq.headers.authorization = 'Bearer invalid-token';
      jwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      requireAuth(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid or expired token.'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should set tenantId if present in token', () => {
      const mockUser = { id: 1, role: 'admin', tenantId: 5 };
      mockReq.headers.authorization = 'Bearer valid-token';
      jwt.verify.mockReturnValue(mockUser);

      requireAuth(mockReq, mockRes, mockNext);

      expect(mockReq.tenantId).toBe(5);
    });
  });

  describe('requireSuperAdmin', () => {
    it('should allow super admin', () => {
      mockReq.user = { id: 1, role: 'superadmin' };

      requireSuperAdmin(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject non-super admin', () => {
      mockReq.user = { id: 1, role: 'admin' };

      requireSuperAdmin(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject without user', () => {
      requireSuperAdmin(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
    });
  });

  describe('requireAdmin', () => {
    it('should allow admin', () => {
      mockReq.user = { id: 1, role: 'admin' };

      requireAdmin(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should allow super admin', () => {
      mockReq.user = { id: 1, role: 'superadmin' };

      requireAdmin(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject regular user', () => {
      mockReq.user = { id: 1, role: 'user' };

      requireAdmin(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('requireUser', () => {
    it('should allow any authenticated user', () => {
      mockReq.user = { id: 1, role: 'user' };

      requireUser(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject unauthenticated request', () => {
      requireUser(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('optionalAuth', () => {
    it('should attach user if token is valid', () => {
      const mockUser = { id: 1, email: 'test@test.com' };
      mockReq.headers.authorization = 'Bearer valid-token';
      jwt.verify.mockReturnValue(mockUser);

      optionalAuth(mockReq, mockRes, mockNext);

      expect(mockReq.user).toEqual(mockUser);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should continue without user if no token', () => {
      optionalAuth(mockReq, mockRes, mockNext);

      expect(mockReq.user).toBeFalsy();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should continue without user if token is invalid', () => {
      mockReq.headers.authorization = 'Bearer invalid-token';
      jwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      optionalAuth(mockReq, mockRes, mockNext);

      expect(mockReq.user).toBeFalsy();
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('generateToken', () => {
    it('should generate JWT token', () => {
      const payload = { id: 1, email: 'test@test.com' };
      jwt.sign.mockReturnValue('generated-token');

      const token = generateToken(payload);

      expect(jwt.sign).toHaveBeenCalledWith(
        payload,
        'test-secret',
        { expiresIn: '24h' }
      );
      expect(token).toBe('generated-token');
    });

    it('should generate token with custom expiration', () => {
      const payload = { id: 1 };
      jwt.sign.mockReturnValue('token');

      generateToken(payload, '7d');

      expect(jwt.sign).toHaveBeenCalledWith(
        payload,
        'test-secret',
        { expiresIn: '7d' }
      );
    });
  });

  describe('verifyToken', () => {
    it('should verify and return decoded token', () => {
      const mockDecoded = { id: 1, email: 'test@test.com' };
      jwt.verify.mockReturnValue(mockDecoded);

      const result = verifyToken('valid-token');

      expect(jwt.verify).toHaveBeenCalledWith('valid-token', 'test-secret');
      expect(result).toEqual(mockDecoded);
    });

    it('should return null for invalid token', () => {
      jwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const result = verifyToken('invalid-token');

      expect(result).toBeNull();
    });
  });
});
