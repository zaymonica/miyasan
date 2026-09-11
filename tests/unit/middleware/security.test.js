/**
 * Security Middleware Unit Tests
 */

const {
  sanitizeInput,
  isValidEmail,
  isValidPhone,
  isValidURL
} = require('../../../middleware/security');

describe('Security Middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    mockReq = {
      body: {},
      query: {},
      params: {}
    };

    mockRes = {};
    mockNext = jest.fn();
  });

  describe('sanitizeInput', () => {
    it('should sanitize body strings', () => {
      mockReq.body = {
        name: '<script>alert("xss")</script>John',
        email: 'test@test.com  '
      };

      sanitizeInput(mockReq, mockRes, mockNext);

      expect(mockReq.body.name).not.toContain('<script>');
      expect(mockReq.body.email).toBe('test@test.com');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should sanitize query parameters', () => {
      mockReq.query = {
        search: '<img src=x onerror=alert(1)>',
        page: '1'
      };

      sanitizeInput(mockReq, mockRes, mockNext);

      expect(mockReq.query.search).not.toContain('<img');
      expect(mockReq.query.page).toBe('1');
    });

    it('should sanitize URL parameters', () => {
      mockReq.params = {
        id: '123',
        name: '<b>test</b>'
      };

      sanitizeInput(mockReq, mockRes, mockNext);

      expect(mockReq.params.id).toBe('123');
      expect(mockReq.params.name).not.toContain('<b>');
    });

    it('should handle nested objects', () => {
      mockReq.body = {
        user: {
          name: '<script>xss</script>',
          profile: {
            bio: '<img src=x>'
          }
        }
      };

      sanitizeInput(mockReq, mockRes, mockNext);

      expect(mockReq.body.user.name).not.toContain('<script>');
      expect(mockReq.body.user.profile.bio).not.toContain('<img');
    });

    it('should handle arrays', () => {
      mockReq.body = {
        tags: ['<script>xss</script>', 'normal', '<b>bold</b>']
      };

      sanitizeInput(mockReq, mockRes, mockNext);

      expect(mockReq.body.tags[0]).not.toContain('<script>');
      expect(mockReq.body.tags[1]).toBe('normal');
      expect(mockReq.body.tags[2]).not.toContain('<b>');
    });

    it('should preserve non-string values', () => {
      mockReq.body = {
        count: 123,
        active: true,
        data: null,
        items: [1, 2, 3]
      };

      sanitizeInput(mockReq, mockRes, mockNext);

      expect(mockReq.body.count).toBe(123);
      expect(mockReq.body.active).toBe(true);
      expect(mockReq.body.data).toBeNull();
      expect(mockReq.body.items).toEqual([1, 2, 3]);
    });
  });

  describe('isValidEmail', () => {
    it('should validate correct email addresses', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
      expect(isValidEmail('user.name@domain.co.uk')).toBe(true);
      expect(isValidEmail('user+tag@example.com')).toBe(true);
    });

    it('should reject invalid email addresses', () => {
      expect(isValidEmail('invalid')).toBe(false);
      expect(isValidEmail('invalid@')).toBe(false);
      expect(isValidEmail('@invalid.com')).toBe(false);
      expect(isValidEmail('invalid@.com')).toBe(false);
      expect(isValidEmail('')).toBe(false);
    });
  });

  describe('isValidPhone', () => {
    it('should validate phone numbers', () => {
      expect(isValidPhone('+1234567890')).toBe(true);
      expect(isValidPhone('1234567890')).toBe(true);
      expect(isValidPhone('+55 11 98765-4321')).toBe(true);
    });

    it('should reject invalid phone numbers', () => {
      expect(isValidPhone('abc')).toBe(false);
      expect(isValidPhone('123')).toBe(false);
      expect(isValidPhone('')).toBe(false);
    });
  });

  describe('isValidURL', () => {
    it('should validate URLs', () => {
      expect(isValidURL('https://example.com')).toBe(true);
      expect(isValidURL('http://example.com')).toBe(true);
      expect(isValidURL('https://sub.example.com/path')).toBe(true);
    });

    it('should reject invalid URLs', () => {
      expect(isValidURL('not-a-url')).toBe(false);
      expect(isValidURL('ftp://example.com')).toBe(false);
      expect(isValidURL('')).toBe(false);
    });
  });
});
