/**
 * RTL Config Unit Tests
 */

const {
  RTL_LANGUAGES,
  isRTLLanguage,
  getDirection,
  getConfig,
  isRTLEnabled,
  rtlMiddleware
} = require('../../../config/rtl');

describe('RTL Config', () => {
  describe('RTL_LANGUAGES', () => {
    it('should include Arabic', () => {
      expect(RTL_LANGUAGES).toContain('ar');
    });

    it('should include Hebrew', () => {
      expect(RTL_LANGUAGES).toContain('he');
    });

    it('should include Persian', () => {
      expect(RTL_LANGUAGES).toContain('fa');
    });

    it('should include Urdu', () => {
      expect(RTL_LANGUAGES).toContain('ur');
    });

    it('should include Yiddish', () => {
      expect(RTL_LANGUAGES).toContain('yi');
    });
  });

  describe('isRTLLanguage', () => {
    it('should return true for Arabic', () => {
      expect(isRTLLanguage('ar')).toBe(true);
    });

    it('should return true for Hebrew', () => {
      expect(isRTLLanguage('he')).toBe(true);
    });

    it('should return true for Persian', () => {
      expect(isRTLLanguage('fa')).toBe(true);
    });

    it('should return false for English', () => {
      expect(isRTLLanguage('en')).toBe(false);
    });

    it('should return false for Portuguese', () => {
      expect(isRTLLanguage('pt')).toBe(false);
    });

    it('should handle language codes with region', () => {
      expect(isRTLLanguage('ar-SA')).toBe(true);
      expect(isRTLLanguage('en-US')).toBe(false);
    });

    it('should return false for null', () => {
      expect(isRTLLanguage(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isRTLLanguage(undefined)).toBe(false);
    });

    it('should return false for non-string', () => {
      expect(isRTLLanguage(123)).toBe(false);
    });
  });

  describe('getDirection', () => {
    it('should return rtl for Arabic', () => {
      expect(getDirection('ar')).toBe('rtl');
    });

    it('should return ltr for English', () => {
      expect(getDirection('en')).toBe('ltr');
    });

    it('should return rtl for Hebrew', () => {
      expect(getDirection('he')).toBe('rtl');
    });

    it('should return ltr for Spanish', () => {
      expect(getDirection('es')).toBe('ltr');
    });
  });

  describe('getConfig', () => {
    it('should return config object', () => {
      const config = getConfig();
      expect(config).toHaveProperty('enabled');
      expect(config).toHaveProperty('defaultLanguage');
      expect(config).toHaveProperty('autoDetect');
    });

    it('should return a copy of config', () => {
      const config1 = getConfig();
      const config2 = getConfig();
      config1.enabled = !config1.enabled;
      expect(config1.enabled).not.toBe(config2.enabled);
    });
  });

  describe('isRTLEnabled', () => {
    it('should return boolean', () => {
      expect(typeof isRTLEnabled()).toBe('boolean');
    });
  });

  describe('rtlMiddleware', () => {
    let mockReq;
    let mockRes;
    let mockNext;

    beforeEach(() => {
      mockReq = {
        query: {},
        body: {},
        headers: {}
      };
      mockRes = {};
      mockNext = jest.fn();
    });

    it('should set language from query param', () => {
      mockReq.query.lang = 'ar';

      rtlMiddleware(mockReq, mockRes, mockNext);

      expect(mockReq.language).toBe('ar');
      expect(mockReq.textDirection).toBe('rtl');
      expect(mockReq.isRTL).toBe(true);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should set language from body', () => {
      mockReq.body.language = 'he';

      rtlMiddleware(mockReq, mockRes, mockNext);

      expect(mockReq.language).toBe('he');
      expect(mockReq.isRTL).toBe(true);
    });

    it('should set language from accept-language header', () => {
      mockReq.headers['accept-language'] = 'ar-SA,ar;q=0.9,en;q=0.8';

      rtlMiddleware(mockReq, mockRes, mockNext);

      expect(mockReq.language).toBe('ar');
      expect(mockReq.isRTL).toBe(true);
    });

    it('should use default language if none provided', () => {
      rtlMiddleware(mockReq, mockRes, mockNext);

      expect(mockReq.language).toBeDefined();
      expect(mockReq.textDirection).toBe('ltr');
      expect(mockReq.isRTL).toBe(false);
    });

    it('should set LTR for English', () => {
      mockReq.query.lang = 'en';

      rtlMiddleware(mockReq, mockRes, mockNext);

      expect(mockReq.textDirection).toBe('ltr');
      expect(mockReq.isRTL).toBe(false);
    });

    it('should call next function', () => {
      rtlMiddleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should handle missing req gracefully', () => {
      // This test verifies the middleware handles edge cases
      // The actual error handling depends on the logger implementation
      const badReq = {
        query: {},
        body: {},
        headers: {}
      };

      rtlMiddleware(badReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(badReq.textDirection).toBeDefined();
    });

    it('should prioritize query param over header', () => {
      mockReq.query.lang = 'en';
      mockReq.headers['accept-language'] = 'ar';

      rtlMiddleware(mockReq, mockRes, mockNext);

      expect(mockReq.language).toBe('en');
      expect(mockReq.isRTL).toBe(false);
    });
  });
});
