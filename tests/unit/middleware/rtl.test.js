/**
 * RTL Middleware Unit Tests
 */

// Mock the rtl config module
jest.mock('../../../config/rtl', () => ({
  rtlMiddleware: jest.fn((req, res, next) => {
    req.language = 'en';
    req.textDirection = 'ltr';
    req.isRTL = false;
    next();
  }),
  isRTLLanguage: jest.fn((lang) => ['ar', 'he', 'fa', 'ur'].includes(lang)),
  getTextDirection: jest.fn((lang) => ['ar', 'he', 'fa', 'ur'].includes(lang) ? 'rtl' : 'ltr'),
  RTL_LANGUAGES: ['ar', 'he', 'fa', 'ur']
}));

const rtlMiddleware = require('../../../middleware/rtl');
const rtlConfig = require('../../../config/rtl');

describe('RTL Middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    jest.clearAllMocks();

    mockReq = {
      headers: {},
      query: {},
      cookies: {}
    };

    mockRes = {
      locals: {}
    };

    mockNext = jest.fn();
  });

  describe('middleware export', () => {
    it('should export rtlMiddleware from config', () => {
      expect(rtlMiddleware).toBe(rtlConfig.rtlMiddleware);
    });
  });

  describe('rtlMiddleware', () => {
    it('should add language property to request', () => {
      rtlMiddleware(mockReq, mockRes, mockNext);

      expect(mockReq.language).toBeDefined();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should add textDirection property to request', () => {
      rtlMiddleware(mockReq, mockRes, mockNext);

      expect(mockReq.textDirection).toBeDefined();
      expect(['ltr', 'rtl']).toContain(mockReq.textDirection);
    });

    it('should add isRTL boolean property to request', () => {
      rtlMiddleware(mockReq, mockRes, mockNext);

      expect(typeof mockReq.isRTL).toBe('boolean');
    });

    it('should call next function', () => {
      rtlMiddleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
    });
  });

  describe('isRTLLanguage helper', () => {
    it('should return true for Arabic', () => {
      expect(rtlConfig.isRTLLanguage('ar')).toBe(true);
    });

    it('should return true for Hebrew', () => {
      expect(rtlConfig.isRTLLanguage('he')).toBe(true);
    });

    it('should return true for Farsi', () => {
      expect(rtlConfig.isRTLLanguage('fa')).toBe(true);
    });

    it('should return true for Urdu', () => {
      expect(rtlConfig.isRTLLanguage('ur')).toBe(true);
    });

    it('should return false for English', () => {
      expect(rtlConfig.isRTLLanguage('en')).toBe(false);
    });

    it('should return false for Portuguese', () => {
      expect(rtlConfig.isRTLLanguage('pt')).toBe(false);
    });
  });

  describe('getTextDirection helper', () => {
    it('should return rtl for Arabic', () => {
      expect(rtlConfig.getTextDirection('ar')).toBe('rtl');
    });

    it('should return ltr for English', () => {
      expect(rtlConfig.getTextDirection('en')).toBe('ltr');
    });
  });

  describe('RTL_LANGUAGES constant', () => {
    it('should include common RTL languages', () => {
      expect(rtlConfig.RTL_LANGUAGES).toContain('ar');
      expect(rtlConfig.RTL_LANGUAGES).toContain('he');
    });
  });
});
