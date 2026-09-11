/**
 * ChatController Unit Tests
 */

const ChatController = require('../../../controllers/ChatController');

// Mock dependencies
jest.mock('../../../config/database', () => ({
  pool: {
    getConnection: jest.fn()
  }
}));

jest.mock('../../../config/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

jest.mock('../../../services/BillingService', () => ({
  checkUsageLimits: jest.fn()
}));

const { pool } = require('../../../config/database');
const BillingService = require('../../../services/BillingService');

describe('ChatController', () => {
  let mockConnection;
  let mockReq;
  let mockRes;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConnection = {
      execute: jest.fn(),
      query: jest.fn(),
      release: jest.fn(),
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn()
    };

    pool.getConnection.mockResolvedValue(mockConnection);

    mockReq = {
      user: { tenantId: 1, id: 1 },
      params: {},
      body: {},
      query: {},
      t: jest.fn((key) => key),
      app: { get: jest.fn() }
    };

    mockRes = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis()
    };
  });

  describe('getConversations', () => {
    it('should return paginated conversations', async () => {
      const mockConversations = [
        { id: 1, contact_name: 'John', phone_number: '123456' }
      ];
      mockConnection.query
        .mockResolvedValueOnce([mockConversations])
        .mockResolvedValueOnce([[{ total: 1 }]]);

      await ChatController.getConversations(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockConversations,
        pagination: expect.objectContaining({
          page: 1,
          limit: 20,
          total: 1
        })
      });
    });

    it('should filter by status', async () => {
      mockReq.query = { status: 'active' };
      mockConnection.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ total: 0 }]]);

      await ChatController.getConversations(mockReq, mockRes);

      expect(mockConnection.query).toHaveBeenCalledWith(
        expect.stringContaining('AND c.status = ?'),
        expect.arrayContaining(['active'])
      );
    });

    it('should filter by search term', async () => {
      mockReq.query = { search: 'john' };
      mockConnection.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ total: 0 }]]);

      await ChatController.getConversations(mockReq, mockRes);

      expect(mockConnection.query).toHaveBeenCalledWith(
        expect.stringContaining('AND (c.contact_name LIKE ? OR c.phone_number LIKE ?)'),
        expect.arrayContaining(['%john%', '%john%'])
      );
    });

    it('should handle errors', async () => {
      mockConnection.query.mockRejectedValue(new Error('DB error'));

      await ChatController.getConversations(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getConversation', () => {
    it('should return conversation with messages', async () => {
      const mockConversation = { id: 1, contact_name: 'John' };
      const mockMessages = [{ id: 1, content: 'Hello' }];

      mockConnection.query
        .mockResolvedValueOnce([[mockConversation]])
        .mockResolvedValueOnce([mockMessages])
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      mockReq.params.id = '1';

      await ChatController.getConversation(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          conversation: mockConversation,
          messages: mockMessages
        })
      });
    });

    it('should return 404 if conversation not found', async () => {
      mockConnection.query.mockResolvedValue([[]]);
      mockReq.params.id = '999';

      await ChatController.getConversation(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  describe('sendMessage', () => {
    it('should validate message is required', async () => {
      mockReq.params.id = '1';
      mockReq.body = {};

      await ChatController.sendMessage(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should check usage limits', async () => {
      mockReq.params.id = '1';
      mockReq.body = { message: 'Hello' };
      BillingService.checkUsageLimits.mockResolvedValue(false);

      await ChatController.sendMessage(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(403);
    });

    it('should return 404 if conversation not found', async () => {
      mockReq.params.id = '999';
      mockReq.body = { message: 'Hello' };
      BillingService.checkUsageLimits.mockResolvedValue(true);
      mockConnection.query.mockResolvedValue([[]]);

      await ChatController.sendMessage(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  describe('updateStatus', () => {
    it('should update conversation status', async () => {
      mockReq.params.id = '1';
      mockReq.body = { status: 'archived' };
      mockConnection.query.mockResolvedValue([{ affectedRows: 1 }]);

      await ChatController.updateStatus(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'chat.status_updated'
      });
    });

    it('should validate status value', async () => {
      mockReq.params.id = '1';
      mockReq.body = { status: 'invalid' };

      await ChatController.updateStatus(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('deleteConversation', () => {
    it('should delete conversation and messages', async () => {
      mockReq.params.id = '1';
      mockConnection.query.mockResolvedValue([{ affectedRows: 1 }]);

      await ChatController.deleteConversation(mockReq, mockRes);

      expect(mockConnection.beginTransaction).toHaveBeenCalled();
      expect(mockConnection.commit).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'chat.conversation_deleted'
      });
    });

    it('should rollback on error', async () => {
      mockReq.params.id = '1';
      mockConnection.query.mockRejectedValue(new Error('DB error'));

      await ChatController.deleteConversation(mockReq, mockRes);

      expect(mockConnection.rollback).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('markAsRead', () => {
    it('should mark messages as read', async () => {
      mockReq.params.id = '1';
      mockConnection.query.mockResolvedValue([{ affectedRows: 5 }]);

      await ChatController.markAsRead(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'chat.marked_as_read'
      });
    });
  });

  describe('getMessages', () => {
    it('should return paginated messages', async () => {
      const mockMessages = [{ id: 1, content: 'Hello' }];
      mockReq.params.id = '1';

      mockConnection.query
        .mockResolvedValueOnce([[{ id: 1 }]]) // verify conversation
        .mockResolvedValueOnce([mockMessages])
        .mockResolvedValueOnce([[{ total: 1 }]]);

      await ChatController.getMessages(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockMessages,
        pagination: expect.objectContaining({ total: 1 })
      });
    });

    it('should return 404 if conversation not found', async () => {
      mockReq.params.id = '999';
      mockConnection.query.mockResolvedValue([[]]);

      await ChatController.getMessages(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  describe('transferConversation', () => {
    it('should transfer to store', async () => {
      mockReq.params.id = '1';
      mockReq.body = { targetStore: 2 };
      mockReq.app.get.mockReturnValue(null);

      mockConnection.query
        .mockResolvedValueOnce([[{ id: 1 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      await ChatController.transferConversation(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Conversation transferred successfully'
      });
    });

    it('should require target store or department', async () => {
      mockReq.params.id = '1';
      mockReq.body = {};

      await ChatController.transferConversation(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });
});
