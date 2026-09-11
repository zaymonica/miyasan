/**
 * WhatsAppCloudUserController Unit Tests
 * Tests for user-facing WhatsApp Cloud operations
 */

const WhatsAppCloudUserController = require('../../../controllers/WhatsAppCloudUserController');
const { pool } = require('../../../config/database');
const axios = require('axios');

// Mock dependencies
jest.mock('../../../config/database');
jest.mock('axios');
jest.mock('../../../config/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));
jest.mock('../../../services/WhatsAppService', () => ({
  getWhatsAppService: jest.fn()
}));

describe('WhatsAppCloudUserController', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();
    
    req = {
      body: {},
      params: {},
      query: {},
      user: { 
        id: 1, 
        tenantId: 1, 
        role: 'user',
        store_id: 1,
        department_id: 1,
        store: 'Store 1',
        department: 'Sales'
      },
      tenantId: 1,
      app: {
        get: jest.fn()
      }
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    pool.execute = jest.fn();
  });

  describe('getConversations', () => {
    it('should get WhatsApp Cloud conversations for user', async () => {
      const mockConversations = [
        {
          id: 1,
          contact_name: 'John Doe',
          phone_number: '+1234567890',
          last_message_text: 'Hello',
          last_message_time: new Date(),
          unread_count: 2,
          claimed_by_user_id: null,
          account_name: 'Test Account',
          stage_name: 'New',
          stage_color: '#00a149'
        }
      ];

      pool.execute.mockResolvedValueOnce([mockConversations]);

      await WhatsAppCloudUserController.getConversations(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({
            contact_name: 'John Doe',
            phone_number: '+1234567890'
          })
        ])
      });
    });

    it('should return error if no tenant ID', async () => {
      req.tenantId = null;
      req.user.tenantId = null;

      await WhatsAppCloudUserController.getConversations(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Tenant ID not found'
      });
    });

    it('should filter by account ID if provided', async () => {
      req.query.accountId = '123';
      pool.execute.mockResolvedValueOnce([[]]);

      await WhatsAppCloudUserController.getConversations(req, res);

      expect(pool.execute).toHaveBeenCalledWith(
        expect.stringContaining('account_id = ?'),
        expect.arrayContaining([1, 'whatsapp_cloud', 1, '123'])
      );
    });

    it('should only show unclaimed or user-claimed conversations', async () => {
      pool.execute.mockResolvedValueOnce([[]]);

      await WhatsAppCloudUserController.getConversations(req, res);

      expect(pool.execute).toHaveBeenCalledWith(
        expect.stringContaining('claimed_by_user_id IS NULL OR claimed_by_user_id = ?'),
        expect.any(Array)
      );
    });
  });

  describe('getMessages', () => {
    it('should get messages for a conversation', async () => {
      req.params.conversationId = '1';
      
      const mockMessages = [
        {
          id: 1,
          message_text: 'Hello',
          message_type: 'text',
          is_from_me: false,
          timestamp: new Date(),
          sender_name: 'John Doe'
        },
        {
          id: 2,
          message_text: 'Hi there',
          message_type: 'text',
          is_from_me: true,
          timestamp: new Date(),
          sender_name: 'Agent'
        }
      ];

      pool.execute.mockResolvedValueOnce([mockMessages]);

      await WhatsAppCloudUserController.getMessages(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({
            message_text: 'Hello',
            is_from_me: false
          })
        ])
      });
    });

    it('should return error if conversation ID missing', async () => {
      req.params.conversationId = null;

      await WhatsAppCloudUserController.getMessages(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: expect.stringContaining('Conversation ID')
      });
    });

    it('should limit messages by query parameter', async () => {
      req.params.conversationId = '1';
      req.query.limit = '50';

      pool.execute.mockResolvedValueOnce([[]]);

      await WhatsAppCloudUserController.getMessages(req, res);

      expect(pool.execute).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT ?'),
        expect.arrayContaining([1, '1', 50])
      );
    });
  });

  describe('sendMessage', () => {
    it('should send text message successfully', async () => {
      req.body = {
        conversationId: '1',
        message: 'Hello World',
        accountId: '123'
      };

      // Mock conversation lookup
      pool.execute
        .mockResolvedValueOnce([[{
          id: 1,
          phone_number: '+1234567890',
          account_id: '123',
          claimed_by_user_id: 1
        }]])
        // Mock account lookup
        .mockResolvedValueOnce([[{
          phone_number_id: 'phone_123',
          access_token: 'token_123'
        }]])
        // Mock message insert
        .mockResolvedValueOnce([{ insertId: 1 }]);

      // Mock WhatsApp API call
      axios.post.mockResolvedValueOnce({
        data: {
          messages: [{ id: 'wamid_123' }]
        }
      });

      await WhatsAppCloudUserController.sendMessage(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Message sent successfully',
        data: expect.objectContaining({
          messageId: expect.any(Number)
        })
      });
    });

    it('should return error if conversation not claimed by user', async () => {
      req.body = {
        conversationId: '1',
        message: 'Hello',
        accountId: '123'
      };

      pool.execute.mockResolvedValueOnce([[{
        id: 1,
        claimed_by_user_id: 999 // Different user
      }]]);

      await WhatsAppCloudUserController.sendMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: expect.stringContaining('not claimed')
      });
    });

    it('should return error if message is empty', async () => {
      req.body = {
        conversationId: '1',
        message: '',
        accountId: '123'
      };

      await WhatsAppCloudUserController.sendMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: expect.stringContaining('Message')
      });
    });
  });

  describe('claimConversation', () => {
    it('should claim unclaimed conversation', async () => {
      req.body = {
        conversationId: '1'
      };

      // Mock conversation lookup
      pool.execute
        .mockResolvedValueOnce([[{
          id: 1,
          claimed_by_user_id: null,
          is_claimed: false
        }]])
        // Mock claim update
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      await WhatsAppCloudUserController.claimConversation(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Conversation claimed successfully'
      });
    });

    it('should return error if conversation already claimed', async () => {
      req.body = {
        conversationId: '1'
      };

      pool.execute.mockResolvedValueOnce([[{
        id: 1,
        claimed_by_user_id: 999,
        is_claimed: true
      }]]);

      await WhatsAppCloudUserController.claimConversation(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: expect.stringContaining('already claimed')
      });
    });

    it('should allow re-claiming own conversation', async () => {
      req.body = {
        conversationId: '1'
      };

      pool.execute
        .mockResolvedValueOnce([[{
          id: 1,
          claimed_by_user_id: 1, // Same user
          is_claimed: true
        }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      await WhatsAppCloudUserController.claimConversation(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Conversation claimed successfully'
      });
    });
  });

  describe('releaseConversation', () => {
    it('should release claimed conversation', async () => {
      req.body = {
        conversationId: '1'
      };

      // Mock conversation lookup
      pool.execute
        .mockResolvedValueOnce([[{
          id: 1,
          claimed_by_user_id: 1
        }]])
        // Mock release update
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      await WhatsAppCloudUserController.releaseConversation(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Conversation released successfully'
      });
    });

    it('should return error if conversation not claimed by user', async () => {
      req.body = {
        conversationId: '1'
      };

      pool.execute.mockResolvedValueOnce([[{
        id: 1,
        claimed_by_user_id: 999
      }]]);

      await WhatsAppCloudUserController.releaseConversation(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: expect.stringContaining('not claimed by you')
      });
    });
  });

  describe('updatePipelineStage', () => {
    it('should update conversation pipeline stage', async () => {
      req.body = {
        conversationId: '1',
        stageKey: 'qualified'
      };

      // Mock conversation lookup
      pool.execute
        .mockResolvedValueOnce([[{
          id: 1,
          claimed_by_user_id: 1
        }]])
        // Mock stage update
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      await WhatsAppCloudUserController.updatePipelineStage(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Pipeline stage updated successfully'
      });
    });

    it('should return error if stage key missing', async () => {
      req.body = {
        conversationId: '1'
      };

      await WhatsAppCloudUserController.updatePipelineStage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: expect.stringContaining('Stage key')
      });
    });
  });

  describe('addTags', () => {
    it('should add tags to conversation', async () => {
      req.body = {
        conversationId: '1',
        tags: ['important', 'follow-up']
      };

      pool.execute
        .mockResolvedValueOnce([[{ id: 1 }]]) // Conversation exists
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // Tags added

      await WhatsAppCloudUserController.addTags(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Tags added successfully'
      });
    });

    it('should return error if tags array is empty', async () => {
      req.body = {
        conversationId: '1',
        tags: []
      };

      await WhatsAppCloudUserController.addTags(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: expect.stringContaining('Tags')
      });
    });
  });

  describe('removeTags', () => {
    it('should remove tags from conversation', async () => {
      req.body = {
        conversationId: '1',
        tags: ['important']
      };

      pool.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);

      await WhatsAppCloudUserController.removeTags(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Tags removed successfully'
      });
    });
  });

  describe('transferConversation', () => {
    it('should transfer conversation to another user', async () => {
      req.body = {
        conversationId: '1',
        targetUserId: 2
      };

      // Mock conversation lookup
      pool.execute
        .mockResolvedValueOnce([[{
          id: 1,
          claimed_by_user_id: 1
        }]])
        // Mock target user lookup
        .mockResolvedValueOnce([[{
          id: 2,
          name: 'Target User'
        }]])
        // Mock transfer update
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      await WhatsAppCloudUserController.transferConversation(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Conversation transferred successfully'
      });
    });

    it('should return error if target user not found', async () => {
      req.body = {
        conversationId: '1',
        targetUserId: 999
      };

      pool.execute
        .mockResolvedValueOnce([[{ id: 1, claimed_by_user_id: 1 }]])
        .mockResolvedValueOnce([[]]); // No target user

      await WhatsAppCloudUserController.transferConversation(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: expect.stringContaining('Target user not found')
      });
    });
  });
});
