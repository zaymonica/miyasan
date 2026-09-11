/**
 * csrf Middleware Unit Tests
 */

const csrf = require('../../../middleware/csrf');

describe('csrf Middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    mockReq = {
      method: 'GET',
      headers: {},
      body: {},
      cookies: {},
      session: {},
      path: '/api/test'
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      cookie: jest.fn(),
      locals: {}
    };

    mockNext = jest.fn();
  });

  describe('generateToken', () => {
    it('should generate CSRF token', () => {
      const token = csrf.generateToken();

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    });

    it('should generate unique tokens', () => {
      const token1 = csrf.generateToken();
      const token2 = csrf.generateToken();

      expect(token1).not.toBe(token2);
    });
  });

  describe('setToken', () => {
    it('should set CSRF token in response', () => {
      csrf.setToken(mockReq, mockRes, mockNext);

      expect(mockRes.cookie).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should store token in session', () => {
      csrf.setToken(mockReq, mockRes, mockNext);

      expect(mockReq.session.csrfToken).toBeDefined();
    });
  });

  describe('verifyToken', () => {
    it('should skip verification for GET requests', () => {
      mockReq.method = 'GET';

      csrf.verifyToken(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should skip verification for HEAD requests', () => {
      mockReq.method = 'HEAD';

      csrf.verifyToken(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should skip verification for OPTIONS requests', () => {
      mockReq.method = 'OPTIONS';

      csrf.verifyToken(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should verify token for POST requests', () => {
      mockReq.method = 'POST';
      mockReq.session.csrfToken = 'valid_token';
      mockReq.headers['x-csrf-token'] = 'valid_token';

      csrf.verifyToken(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject invalid token', () => {
      mockReq.method = 'POST';
      mockReq.session.csrfToken = 'valid_token';
      mockReq.headers['x-csrf-token'] = 'invalid_token';

      csrf.verifyToken(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
    });

    it('should reject missing token', () => {
      mockReq.method = 'POST';
      mockReq.session.csrfToken = 'valid_token';

      csrf.verifyToken(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
    });

    it('should accept token from body', () => {
      mockReq.method = 'POST';
      mockReq.session.csrfToken = 'valid_token';
      mockReq.body._csrf = 'valid_token';

      csrf.verifyToken(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('skipPaths', () => {
    it('should skip verification for webhook paths', () => {
      mockReq.method = 'POST';
      mockReq.path = '/api/webhook/stripe';

      csrf.verifyToken(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should skip verification for API paths with Bearer token', () => {
      mockReq.method = 'POST';
      mockReq.headers.authorization = 'Bearer token123';

      csrf.verifyToken(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('doubleSubmitCookie', () => {
    it('should verify double submit cookie pattern', () => {
      mockReq.method = 'POST';
      mockReq.cookies['csrf-token'] = 'cookie_token';
      mockReq.headers['x-csrf-token'] = 'cookie_token';

      csrf.doubleSubmitCookie(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject mismatched tokens', () => {
      mockReq.method = 'POST';
      mockReq.cookies['csrf-token'] = 'cookie_token';
      mockReq.headers['x-csrf-token'] = 'different_token';

      csrf.doubleSubmitCookie(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
    });
  });
});
