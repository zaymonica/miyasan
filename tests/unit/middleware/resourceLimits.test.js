/**
 * resourceLimits Middleware Unit Tests
 */

const resourceLimits = require('../../../middleware/resourceLimits');

// Mock dependencies
jest.mock('../../../config/database', () => ({
  pool: {
    execute: jest.fn()
  }
}));

const { pool } = require('../../../config/database');

describe('resourceLimits Middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    jest.clearAllMocks();

    mockReq = {
      tenantId: 1,
      user: { tenantId: 1 },
      t: jest.fn((key) => key)
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    mockNext = jest.fn();
  });

  describe('checkStoreLimit', () => {
    it('should allow creating store if under limit', async () => {
      pool.execute
        .mockResolvedValueOnce([[{ max_stores: 5 }]])
        .mockResolvedValueOnce([[{ count: 2 }]]);

      await resourceLimits.checkStoreLimit(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should block if at store limit', async () => {
      pool.execute
        .mockResolvedValueOnce([[{ max_stores: 3 }]])
        .mockResolvedValueOnce([[{ count: 3 }]]);

      await resourceLimits.checkStoreLimit(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
    });
  });

  describe('checkUserLimit', () => {
    it('should allow creating user if under limit', async () => {
      pool.execute
        .mockResolvedValueOnce([[{ max_users: 10 }]])
        .mockResolvedValueOnce([[{ count: 5 }]]);

      await resourceLimits.checkUserLimit(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should block if at user limit', async () => {
      pool.execute
        .mockResolvedValueOnce([[{ max_users: 5 }]])
        .mockResolvedValueOnce([[{ count: 5 }]]);

      await resourceLimits.checkUserLimit(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
    });
  });

  describe('checkDepartmentLimit', () => {
    it('should allow creating department if under limit', async () => {
      pool.execute
        .mockResolvedValueOnce([[{ max_departments: 5 }]])
        .mockResolvedValueOnce([[{ count: 2 }]]);

      await resourceLimits.checkDepartmentLimit(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('checkContactLimit', () => {
    it('should allow creating contact if under limit', async () => {
      pool.execute
        .mockResolvedValueOnce([[{ max_contacts: 1000 }]])
        .mockResolvedValueOnce([[{ count: 500 }]]);

      await resourceLimits.checkContactLimit(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('checkFAQLimit', () => {
    it('should allow creating FAQ if under limit', async () => {
      pool.execute
        .mockResolvedValueOnce([[{ max_faqs: 20 }]])
        .mockResolvedValueOnce([[{ count: 10 }]]);

      await resourceLimits.checkFAQLimit(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('checkWidgetLimit', () => {
    it('should allow creating widget if under limit', async () => {
      pool.execute
        .mockResolvedValueOnce([[{ max_widgets: 3 }]])
        .mockResolvedValueOnce([[{ count: 1 }]]);

      await resourceLimits.checkWidgetLimit(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('checkMessageLimit', () => {
    it('should allow sending message if under limit', async () => {
      pool.execute.mockResolvedValue([[{
        current_messages_count: 500,
        max_messages_per_month: 10000
      }]]);

      await resourceLimits.checkMessageLimit(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should block if at message limit', async () => {
      pool.execute.mockResolvedValue([[{
        current_messages_count: 10000,
        max_messages_per_month: 10000
      }]]);

      await resourceLimits.checkMessageLimit(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
    });
  });

  describe('unlimited resources', () => {
    it('should allow if limit is -1 (unlimited)', async () => {
      pool.execute
        .mockResolvedValueOnce([[{ max_stores: -1 }]])
        .mockResolvedValueOnce([[{ count: 100 }]]);

      await resourceLimits.checkStoreLimit(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      pool.execute.mockRejectedValue(new Error('DB Error'));

      await resourceLimits.checkStoreLimit(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });

    it('should handle missing tenant context', async () => {
      mockReq.tenantId = null;
      mockReq.user = null;

      await resourceLimits.checkStoreLimit(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });
});
