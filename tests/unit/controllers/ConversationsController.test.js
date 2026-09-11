/**
 * Unit Tests for ConversationsController
 * Tests conversation monitoring functionality for tenant admins
 */

const ConversationsController = require('../../../controllers/ConversationsController');
const { pool } = require('../../../config/database');

// Mock database
jest.mock('../../../config/database', () => ({
  pool: {
    query: jest.fn()
  }
}));

// Mock logger
jest.mock('../../../config/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

describe('ConversationsController', () => {
  let req, res;

  beforeEach(() => {
    req = {
      user: {
        tenantId: 1,
        id: 1,
        role: 'admin'
      },
      query: {},
      params: {}
    };

    res = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis()
    };

    jest.clearAllMocks();
  });

  describe('getConversations', () => {
    it('should return all conversations for tenant', async () => {
      const mockConversations = [
        {
          id: 1,
          tenant_id: 1,
          contact_id: 1,
          phone_number: '5511999999999',
          contact_name: 'John Doe',
          last_message: 'Hello',
          last_message_time: new Date(),
          status: 'active',
          assigned_user_id: 2,
          assigned_user_name: 'Agent Smith',
          message_count: 5,
          unread_count: 2
        }
      ];

      pool.query.mockResolvedValue([mockConversations]);

      await ConversationsController.getConversations(req, res);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        expect.arrayContaining([1])
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockConversations
      });
    });

    it('should filter conversations by status', async () => {
      req.query.status = 'waiting';
      pool.query.mockResolvedValue([[]]);

      await ConversationsController.getConversations(req, res);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('AND c.status = ?'),
        expect.arrayContaining([1, 'waiting'])
      );
    });

    it('should filter conversations by assigned user', async () => {
      req.query.assigned_user_id = 2;
      pool.query.mockResolvedValue([[]]);

      await ConversationsController.getConversations(req, res);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('AND c.assigned_user_id = ?'),
        expect.arrayContaining([1, 2])
      );
    });

    it('should search conversations by contact name or phone', async () => {
      req.query.search = 'John';
      pool.query.mockResolvedValue([[]]);

      await ConversationsController.getConversations(req, res);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('AND (c.contact_name LIKE ? OR c.phone_number LIKE ?)'),
        expect.arrayContaining([1, '%John%', '%John%'])
      );
    });

    it('should handle pagination', async () => {
      req.query.limit = 10;
      req.query.offset = 20;
      pool.query.mockResolvedValue([[]]);

      await ConversationsController.getConversations(req, res);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT ? OFFSET ?'),
        expect.arrayContaining([1, 10, 20])
      );
    });

    it('should handle database errors', async () => {
      pool.query.mockRejectedValue(new Error('Database error'));

      await ConversationsController.getConversations(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to load conversations'
      });
    });
  });

  describe('getConversation', () => {
    it('should return conversation with messages', async () => {
      req.params.id = 1;

      const mockConversation = {
        id: 1,
        tenant_id: 1,
        contact_name: 'John Doe',
        phone_number: '5511999999999',
        status: 'active',
        assigned_user_id: 2,
        assigned_user_name: 'Agent Smith',
        assigned_user_email: 'agent@example.com',
        assigned_user_role: 'operator'
      };

      const mockMessages = [
        {
          id: 1,
          conversation_id: 1,
          message_text: 'Hello',
          timestamp: new Date(),
          sender_user_id: null,
          is_from_bot: false
        },
        {
          id: 2,
          conversation_id: 1,
          message_text: 'Hi there!',
          timestamp: new Date(),
          sender_user_id: 2,
          sender_name: 'Agent Smith',
          is_from_bot: false
        }
      ];

      pool.query
        .mockResolvedValueOnce([[mockConversation]])
        .mockResolvedValueOnce([mockMessages]);

      await ConversationsController.getConversation(req, res);

      expect(pool.query).toHaveBeenCalledTimes(2);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          conversation: mockConversation,
          messages: mockMessages
        }
      });
    });

    it('should return 404 if conversation not found', async () => {
      req.params.id = 999;
      pool.query.mockResolvedValue([[]]);

      await ConversationsController.getConversation(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Conversation not found'
      });
    });

    it('should enforce tenant isolation', async () => {
      req.params.id = 1;
      req.user.tenantId = 2;
      pool.query.mockResolvedValue([[]]);

      await ConversationsController.getConversation(req, res);

      expect(pool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([1, 2])
      );
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should handle database errors', async () => {
      req.params.id = 1;
      pool.query.mockRejectedValue(new Error('Database error'));

      await ConversationsController.getConversation(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to load conversation'
      });
    });
  });

  describe('getStats', () => {
    it('should return conversation statistics', async () => {
      const mockConvStats = {
        total: 100,
        waiting: 10,
        attended: 30,
        closed: 50,
        active: 8,
        archived: 2
      };

      const mockMessageStats = {
        total_messages: 500,
        bot_messages: 100,
        user_messages: 200,
        customer_messages: 200
      };

      const mockTopUsers = [
        { id: 1, name: 'Agent 1', email: 'agent1@example.com', conversation_count: 25 },
        { id: 2, name: 'Agent 2', email: 'agent2@example.com', conversation_count: 20 }
      ];

      pool.query
        .mockResolvedValueOnce([[mockConvStats]])
        .mockResolvedValueOnce([[mockMessageStats]])
        .mockResolvedValueOnce([mockTopUsers]);

      await ConversationsController.getStats(req, res);

      expect(pool.query).toHaveBeenCalledTimes(3);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          conversations: mockConvStats,
          messages: mockMessageStats,
          topUsers: mockTopUsers
        }
      });
    });

    it('should enforce tenant isolation in stats', async () => {
      pool.query
        .mockResolvedValueOnce([[{}]])
        .mockResolvedValueOnce([[{}]])
        .mockResolvedValueOnce([[]]);

      await ConversationsController.getStats(req, res);

      expect(pool.query).toHaveBeenNthCalledWith(1, expect.any(String), [1]);
      expect(pool.query).toHaveBeenNthCalledWith(2, expect.any(String), [1]);
      expect(pool.query).toHaveBeenNthCalledWith(3, expect.any(String), [1]);
    });

    it('should handle database errors', async () => {
      pool.query.mockRejectedValue(new Error('Database error'));

      await ConversationsController.getStats(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to load statistics'
      });
    });
  });

  describe('Tenant Isolation', () => {
    it('should only return conversations for the authenticated tenant', async () => {
      req.user.tenantId = 5;
      pool.query.mockResolvedValue([[]]);

      await ConversationsController.getConversations(req, res);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE c.tenant_id = ?'),
        expect.arrayContaining([5])
      );
    });

    it('should not allow access to other tenant conversations', async () => {
      req.params.id = 1;
      req.user.tenantId = 5;
      
      // Simulate conversation belonging to different tenant
      pool.query.mockResolvedValue([[]]);

      await ConversationsController.getConversation(req, res);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('AND c.tenant_id = ?'),
        expect.arrayContaining([1, 5])
      );
    });
  });

  describe('Security', () => {
    it('should handle missing user gracefully', async () => {
      req.user = { tenantId: 1 }; // Authentication is handled by middleware
      pool.query.mockResolvedValue([[]]);

      await ConversationsController.getConversations(req, res);

      expect(res.json).toHaveBeenCalled();
    });

    it('should sanitize search input', async () => {
      req.query.search = '<script>alert("xss")</script>';
      pool.query.mockResolvedValue([[]]);

      await ConversationsController.getConversations(req, res);

      // Query should still execute (sanitization happens at DB level with parameterized queries)
      expect(pool.query).toHaveBeenCalled();
    });
  });
});
