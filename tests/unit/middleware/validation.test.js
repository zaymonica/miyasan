/**
 * validation Middleware Unit Tests
 */

const validation = require('../../../middleware/validation');

describe('validation Middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    mockReq = {
      body: {},
      params: {},
      query: {},
      t: jest.fn((key) => key)
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    mockNext = jest.fn();
  });

  describe('validateEmail', () => {
    it('should pass valid email', () => {
      mockReq.body.email = 'test@example.com';

      validation.validateEmail(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject invalid email', () => {
      mockReq.body.email = 'invalid-email';

      validation.validateEmail(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should reject empty email', () => {
      mockReq.body.email = '';

      validation.validateEmail(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('validatePhone', () => {
    it('should pass valid phone number', () => {
      mockReq.body.phone = '+5511999999999';

      validation.validatePhone(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should pass phone without country code', () => {
      mockReq.body.phone = '11999999999';

      validation.validatePhone(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject invalid phone', () => {
      mockReq.body.phone = 'abc';

      validation.validatePhone(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('validatePassword', () => {
    it('should pass strong password', () => {
      mockReq.body.password = 'StrongPass123!';

      validation.validatePassword(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject short password', () => {
      mockReq.body.password = '123';

      validation.validatePassword(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should reject empty password', () => {
      mockReq.body.password = '';

      validation.validatePassword(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('validateSubdomain', () => {
    it('should pass valid subdomain', () => {
      mockReq.body.subdomain = 'mycompany';

      validation.validateSubdomain(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should pass subdomain with numbers', () => {
      mockReq.body.subdomain = 'company123';

      validation.validateSubdomain(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject subdomain with special chars', () => {
      mockReq.body.subdomain = 'my-company!';

      validation.validateSubdomain(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should reject reserved subdomains', () => {
      mockReq.body.subdomain = 'admin';

      validation.validateSubdomain(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('validatePagination', () => {
    it('should set default pagination values', () => {
      validation.validatePagination(mockReq, mockRes, mockNext);

      expect(mockReq.pagination).toEqual(expect.objectContaining({
        page: 1,
        limit: expect.any(Number)
      }));
      expect(mockNext).toHaveBeenCalled();
    });

    it('should use provided pagination values', () => {
      mockReq.query = { page: '2', limit: '50' };

      validation.validatePagination(mockReq, mockRes, mockNext);

      expect(mockReq.pagination.page).toBe(2);
      expect(mockReq.pagination.limit).toBe(50);
    });

    it('should cap limit at maximum', () => {
      mockReq.query = { limit: '1000' };

      validation.validatePagination(mockReq, mockRes, mockNext);

      expect(mockReq.pagination.limit).toBeLessThanOrEqual(100);
    });

    it('should handle invalid page number', () => {
      mockReq.query = { page: '-1' };

      validation.validatePagination(mockReq, mockRes, mockNext);

      expect(mockReq.pagination.page).toBe(1);
    });
  });

  describe('validateId', () => {
    it('should pass valid numeric id', () => {
      mockReq.params.id = '123';

      validation.validateId(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject non-numeric id', () => {
      mockReq.params.id = 'abc';

      validation.validateId(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should reject negative id', () => {
      mockReq.params.id = '-1';

      validation.validateId(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('sanitizeInput', () => {
    it('should trim whitespace', () => {
      mockReq.body = { name: '  John  ', email: ' test@test.com ' };

      validation.sanitizeInput(mockReq, mockRes, mockNext);

      expect(mockReq.body.name).toBe('John');
      expect(mockReq.body.email).toBe('test@test.com');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle nested objects', () => {
      mockReq.body = { 
        user: { name: '  John  ' },
        tags: ['  tag1  ', '  tag2  ']
      };

      validation.sanitizeInput(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('validateRequired', () => {
    it('should pass when all required fields present', () => {
      mockReq.body = { name: 'John', email: 'john@test.com' };

      const middleware = validation.validateRequired(['name', 'email']);
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject when required field missing', () => {
      mockReq.body = { name: 'John' };

      const middleware = validation.validateRequired(['name', 'email']);
      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should reject when required field is empty', () => {
      mockReq.body = { name: 'John', email: '' };

      const middleware = validation.validateRequired(['name', 'email']);
      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });
});
