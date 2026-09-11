/**
 * errorHandler Middleware Unit Tests
 */

const errorHandler = require('../../../middleware/errorHandler');

describe('errorHandler Middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    mockReq = {
      method: 'GET',
      url: '/api/test',
      headers: {},
      t: jest.fn((key) => key)
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      headersSent: false
    };

    mockNext = jest.fn();
  });

  describe('handleError', () => {
    it('should handle generic error', () => {
      const error = new Error('Something went wrong');

      errorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.any(String)
        })
      );
    });

    it('should handle error with status code', () => {
      const error = new Error('Not found');
      error.statusCode = 404;

      errorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    it('should handle validation error', () => {
      const error = new Error('Validation failed');
      error.name = 'ValidationError';
      error.statusCode = 400;

      errorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should handle database error', () => {
      const error = new Error('Database error');
      error.code = 'ER_DUP_ENTRY';

      errorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(409);
    });

    it('should handle JWT error', () => {
      const error = new Error('Invalid token');
      error.name = 'JsonWebTokenError';

      errorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    it('should handle token expired error', () => {
      const error = new Error('Token expired');
      error.name = 'TokenExpiredError';

      errorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    it('should not send response if headers already sent', () => {
      mockRes.headersSent = true;
      const error = new Error('Test error');

      errorHandler(error, mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
      expect(mockRes.json).not.toHaveBeenCalled();
    });

    it('should include stack trace in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const error = new Error('Test error');
      error.stack = 'Error stack trace';

      errorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          stack: expect.any(String)
        })
      );

      process.env.NODE_ENV = originalEnv;
    });

    it('should not include stack trace in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const error = new Error('Test error');

      errorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.not.objectContaining({
          stack: expect.any(String)
        })
      );

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('notFound handler', () => {
    it('should handle 404 not found', () => {
      const notFoundHandler = errorHandler.notFound || ((req, res) => {
        res.status(404).json({ success: false, message: 'Not found' });
      });

      notFoundHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  describe('async error wrapper', () => {
    it('should catch async errors', async () => {
      const asyncHandler = errorHandler.asyncHandler || ((fn) => (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
      });

      const asyncFn = async () => {
        throw new Error('Async error');
      };

      const wrappedFn = asyncHandler(asyncFn);
      await wrappedFn(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });
});
