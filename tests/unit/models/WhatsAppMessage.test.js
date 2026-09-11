/**
 * WhatsAppMessage Model Unit Tests
 */

const WhatsAppMessage = require('../../../models/WhatsAppMessage');

// Mock dependencies
jest.mock('../../../config/database', () => ({
  pool: {
    execute: jest.fn(),
    getConnection: jest.fn()
  }
}));

const { pool } = require('../../../config/database');

describe('WhatsAppMessage Model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return all messages for tenant', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, content: 'Hello', direction: 'incoming' },
        { id: 2, content: 'Hi there', direction: 'outgoing' }
      ]]);

      const messages = await WhatsAppMessage.findAll(1);

      expect(messages).toHaveLength(2);
    });

    it('should filter by direction', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, content: 'Hello', direction: 'incoming' }
      ]]);

      const messages = await WhatsAppMessage.findAll(1, { direction: 'incoming' });

      expect(messages).toHaveLength(1);
    });
  });

  describe('findById', () => {
    it('should return message by id', async () => {
      pool.execute.mockResolvedValue([[{
        id: 1,
        content: 'Test message',
        phone_number: '123456789',
        direction: 'incoming'
      }]]);

      const message = await WhatsAppMessage.findById(1, 1);

      expect(message).toEqual(expect.objectContaining({
        id: 1,
        content: 'Test message'
      }));
    });

    it('should return null if not found', async () => {
      pool.execute.mockResolvedValue([[]]);

      const message = await WhatsAppMessage.findById(1, 999);

      expect(message).toBeNull();
    });
  });

  describe('findByConversation', () => {
    it('should return messages for conversation', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, conversation_id: 1, content: 'Message 1' },
        { id: 2, conversation_id: 1, content: 'Message 2' }
      ]]);

      const messages = await WhatsAppMessage.findByConversation(1, 1);

      expect(messages).toHaveLength(2);
    });

    it('should paginate results', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, content: 'Message 1' }
      ]]);

      const messages = await WhatsAppMessage.findByConversation(1, 1, { limit: 1, offset: 0 });

      expect(messages).toHaveLength(1);
    });
  });

  describe('findByPhone', () => {
    it('should return messages for phone number', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, phone_number: '123456789', content: 'Hello' }
      ]]);

      const messages = await WhatsAppMessage.findByPhone(1, '123456789');

      expect(messages).toHaveLength(1);
    });
  });

  describe('create', () => {
    it('should create new message', async () => {
      pool.execute.mockResolvedValue([{ insertId: 1 }]);

      const message = await WhatsAppMessage.create(1, {
        phone_number: '123456789',
        content: 'New message',
        direction: 'outgoing',
        message_type: 'text'
      });

      expect(message.id).toBe(1);
    });
  });

  describe('updateStatus', () => {
    it('should update message status', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await WhatsAppMessage.updateStatus(1, 1, 'delivered');

      expect(result).toBe(true);
    });
  });

  describe('updateStatusByWhatsAppId', () => {
    it('should update status by WhatsApp message ID', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await WhatsAppMessage.updateStatusByWhatsAppId(1, 'wa_msg_123', 'read');

      expect(result).toBe(true);
    });
  });

  describe('markAsRead', () => {
    it('should mark messages as read', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 5 }]);

      const result = await WhatsAppMessage.markAsRead(1, 1);

      expect(result).toBe(true);
    });
  });

  describe('delete', () => {
    it('should delete message', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await WhatsAppMessage.delete(1, 1);

      expect(result).toBe(true);
    });
  });

  describe('getUnreadCount', () => {
    it('should return unread message count', async () => {
      pool.execute.mockResolvedValue([[{ count: 10 }]]);

      const count = await WhatsAppMessage.getUnreadCount(1, 1);

      expect(count).toBe(10);
    });
  });

  describe('getLastMessage', () => {
    it('should return last message for conversation', async () => {
      pool.execute.mockResolvedValue([[{
        id: 5,
        content: 'Last message',
        created_at: new Date()
      }]]);

      const message = await WhatsAppMessage.getLastMessage(1, 1);

      expect(message.content).toBe('Last message');
    });
  });

  describe('search', () => {
    it('should search messages by content', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, content: 'Hello world' }
      ]]);

      const messages = await WhatsAppMessage.search(1, 'Hello');

      expect(messages).toHaveLength(1);
    });
  });

  describe('getStats', () => {
    it('should return message statistics', async () => {
      pool.execute.mockResolvedValue([[{
        total: 100,
        incoming: 60,
        outgoing: 40,
        delivered: 35,
        read: 30
      }]]);

      const stats = await WhatsAppMessage.getStats(1);

      expect(stats).toEqual(expect.objectContaining({
        total: 100,
        incoming: 60
      }));
    });
  });

  describe('getByDateRange', () => {
    it('should return messages in date range', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, created_at: '2024-12-01' },
        { id: 2, created_at: '2024-12-15' }
      ]]);

      const messages = await WhatsAppMessage.getByDateRange(1, '2024-12-01', '2024-12-31');

      expect(messages).toHaveLength(2);
    });
  });

  describe('count', () => {
    it('should return message count', async () => {
      pool.execute.mockResolvedValue([[{ count: 500 }]]);

      const count = await WhatsAppMessage.count(1);

      expect(count).toBe(500);
    });
  });
});
