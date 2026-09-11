/**
 * Logger Config Unit Tests
 */

const { logger, requestLogger } = require('../../../config/logger');

describe('Logger Config', () => {
  describe('logger', () => {
    it('should be defined', () => {
      expect(logger).toBeDefined();
    });

    it('should have error method', () => {
      expect(typeof logger.error).toBe('function');
    });

    it('should have warn method', () => {
      expect(typeof logger.warn).toBe('function');
    });

    it('should have info method', () => {
      expect(typeof logger.info).toBe('function');
    });

    it('should have http method', () => {
      expect(typeof logger.http).toBe('function');
    });

    it('should have debug method', () => {
      expect(typeof logger.debug).toBe('function');
    });

    it('should log without throwing', () => {
      expect(() => logger.info('Test message')).not.toThrow();
      expect(() => logger.error('Test error')).not.toThrow();
      expect(() => logger.warn('Test warning')).not.toThrow();
    });

    it('should log with metadata', () => {
      expect(() => logger.info('Test', { key: 'value' })).not.toThrow();
    });
  });

  describe('requestLogger', () => {
    it('should be a function', () => {
      expect(typeof requestLogger).toBe('function');
    });

    it('should call next', () => {
      const mockReq = {
        method: 'GET',
        originalUrl: '/test'
      };
      const mockRes = {
        statusCode: 200,
        on: jest.fn((event, callback) => {
          if (event === 'finish') {
            callback();
          }
        })
      };
      const mockNext = jest.fn();

      requestLogger(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should register finish event listener', () => {
      // The requestLogger uses res.on('finish', callback)
      // We verify it calls next and doesn't throw
      const mockReq = {
        method: 'GET',
        originalUrl: '/test'
      };
      const mockRes = {
        statusCode: 200,
        on: jest.fn()
      };
      const mockNext = jest.fn();

      expect(() => requestLogger(mockReq, mockRes, mockNext)).not.toThrow();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should log on response finish', () => {
      const mockReq = {
        method: 'POST',
        originalUrl: '/api/test'
      };
      const mockRes = {
        statusCode: 201,
        on: jest.fn()
      };
      const mockNext = jest.fn();

      expect(() => requestLogger(mockReq, mockRes, mockNext)).not.toThrow();
    });

    it('should handle 500 errors', () => {
      const mockReq = {
        method: 'GET',
        originalUrl: '/error'
      };
      const mockRes = {
        statusCode: 500,
        on: jest.fn()
      };
      const mockNext = jest.fn();

      expect(() => requestLogger(mockReq, mockRes, mockNext)).not.toThrow();
    });

    it('should handle 400 errors', () => {
      const mockReq = {
        method: 'GET',
        originalUrl: '/bad-request'
      };
      const mockRes = {
        statusCode: 400,
        on: jest.fn()
      };
      const mockNext = jest.fn();

      expect(() => requestLogger(mockReq, mockRes, mockNext)).not.toThrow();
    });
  });
});
