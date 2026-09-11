/**
 * BaseController Unit Tests
 */

const BaseController = require('../../../controllers/BaseController');
const { pool } = require('../../../config/database');

// Mock database
jest.mock('../../../config/database', () => ({
  pool: {
    getConnection: jest.fn(),
    execute: jest.fn()
  }
}));

describe('BaseController', () => {
  let mockConnection;
  let mockRes;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock connection
    mockConnection = {
      execute: jest.fn(),
      release: jest.fn()
    };

    pool.getConnection.mockResolvedValue(mockConnection);

    // Mock response object
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('getConnection', () => {
    it('should get database connection from pool', async () => {
      const connection = await BaseController.getConnection();
      
      expect(pool.getConnection).toHaveBeenCalled();
      expect(connection).toBe(mockConnection);
    });

    it('should throw DatabaseError on connection failure', async () => {
      pool.getConnection.mockRejectedValue(new Error('Connection failed'));
      
      await expect(BaseController.getConnection()).rejects.toThrow('Failed to get database connection');
    });
  });

  describe('executeQuery', () => {
    it('should execute query and return results', async () => {
      const mockResult = [{ id: 1, name: 'Test' }];
      mockConnection.execute.mockResolvedValue([mockResult]);

      const result = await BaseController.executeQuery('SELECT * FROM users');

      expect(mockConnection.execute).toHaveBeenCalledWith('SELECT * FROM users', []);
      expect(result).toEqual(mockResult);
      expect(mockConnection.release).toHaveBeenCalled();
    });

    it('should execute query with parameters', async () => {
      const mockResult = [{ id: 1 }];
      mockConnection.execute.mockResolvedValue([mockResult]);

      const result = await BaseController.executeQuery(
        'SELECT * FROM users WHERE id = ?',
        [1]
      );

      expect(mockConnection.execute).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE id = ?',
        [1]
      );
      expect(result).toEqual(mockResult);
    });

    it('should use provided connection and not release it', async () => {
      const mockResult = [{ id: 1 }];
      mockConnection.execute.mockResolvedValue([mockResult]);

      await BaseController.executeQuery('SELECT * FROM users', [], mockConnection);

      expect(pool.getConnection).not.toHaveBeenCalled();
      expect(mockConnection.release).not.toHaveBeenCalled();
    });

    it('should throw DatabaseError on query failure', async () => {
      mockConnection.execute.mockRejectedValue(new Error('Query failed'));

      await expect(
        BaseController.executeQuery('SELECT * FROM users')
      ).rejects.toThrow('Database query failed');

      expect(mockConnection.release).toHaveBeenCalled();
    });
  });

  describe('sendSuccess', () => {
    it('should send success response with data', () => {
      const data = { user: { id: 1, name: 'Test' } };
      
      BaseController.sendSuccess(mockRes, data);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data
      });
    });

    it('should send success response with custom status code', () => {
      const data = { id: 1 };
      
      BaseController.sendSuccess(mockRes, data, 201);

      expect(mockRes.status).toHaveBeenCalledWith(201);
    });

    it('should send success response with message', () => {
      const data = { id: 1 };
      const message = 'Created successfully';
      
      BaseController.sendSuccess(mockRes, data, 201, message);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message,
        data
      });
    });

    it('should send success response without data', () => {
      BaseController.sendSuccess(mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true
      });
    });
  });

  describe('sendError', () => {
    it('should send error response', () => {
      const message = 'Something went wrong';
      
      BaseController.sendError(mockRes, message);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: message
      });
    });

    it('should send error response with custom status code', () => {
      const message = 'Not found';
      
      BaseController.sendError(mockRes, message, 404);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  describe('paginate', () => {
    it('should paginate data correctly', () => {
      const data = Array.from({ length: 25 }, (_, i) => ({ id: i + 1 }));
      
      const result = BaseController.paginate(data, 1, 10);

      expect(result.data).toHaveLength(10);
      expect(result.data[0].id).toBe(1);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 25,
        totalPages: 3
      });
    });

    it('should return second page correctly', () => {
      const data = Array.from({ length: 25 }, (_, i) => ({ id: i + 1 }));
      
      const result = BaseController.paginate(data, 2, 10);

      expect(result.data).toHaveLength(10);
      expect(result.data[0].id).toBe(11);
      expect(result.pagination.page).toBe(2);
    });

    it('should handle last page with fewer items', () => {
      const data = Array.from({ length: 25 }, (_, i) => ({ id: i + 1 }));
      
      const result = BaseController.paginate(data, 3, 10);

      expect(result.data).toHaveLength(5);
      expect(result.data[0].id).toBe(21);
    });
  });

  describe('validatePagination', () => {
    it('should validate and return pagination params', () => {
      const result = BaseController.validatePagination(2, 20);

      expect(result).toEqual({
        page: 2,
        limit: 20,
        offset: 20
      });
    });

    it('should default to page 1 if invalid', () => {
      const result = BaseController.validatePagination(0, 10);

      expect(result.page).toBe(1);
      expect(result.offset).toBe(0);
    });

    it('should default to limit 10 if not provided', () => {
      const result = BaseController.validatePagination(1);

      expect(result.limit).toBe(10);
    });

    it('should cap limit at 100', () => {
      const result = BaseController.validatePagination(1, 200);

      expect(result.limit).toBe(100);
    });

    it('should handle string inputs', () => {
      const result = BaseController.validatePagination('2', '15');

      expect(result).toEqual({
        page: 2,
        limit: 15,
        offset: 15
      });
    });
  });
});
