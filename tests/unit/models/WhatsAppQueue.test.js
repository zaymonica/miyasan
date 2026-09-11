/**
 * WhatsAppQueue Model Unit Tests
 */

const WhatsAppQueue = require('../../../models/WhatsAppQueue');

// Mock dependencies
jest.mock('../../../config/database', () => ({
  pool: {
    execute: jest.fn(),
    getConnection: jest.fn()
  }
}));

const { pool } = require('../../../config/database');

describe('WhatsAppQueue Model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return all queued messages for tenant', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, phone_number: '123', status: 'pending' },
        { id: 2, phone_number: '456', status: 'pending' }
      ]]);

      const queue = await WhatsAppQueue.findAll(1);

      expect(queue).toHaveLength(2);
    });

    it('should filter by status', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, status: 'pending' }
      ]]);

      const queue = await WhatsAppQueue.findAll(1, { status: 'pending' });

      expect(queue).toHaveLength(1);
    });
  });

  describe('findById', () => {
    it('should return queued message by id', async () => {
      pool.execute.mockResolvedValue([[{
        id: 1,
        phone_number: '123456789',
        content: 'Test message',
        status: 'pending'
      }]]);

      const item = await WhatsAppQueue.findById(1, 1);

      expect(item).toEqual(expect.objectContaining({
        id: 1,
        status: 'pending'
      }));
    });

    it('should return null if not found', async () => {
      pool.execute.mockResolvedValue([[]]);

      const item = await WhatsAppQueue.findById(1, 999);

      expect(item).toBeNull();
    });
  });

  describe('create', () => {
    it('should create new queue item', async () => {
      pool.execute.mockResolvedValue([{ insertId: 1 }]);

      const item = await WhatsAppQueue.create(1, {
        phone_number: '123456789',
        content: 'New message',
        message_type: 'text'
      });

      expect(item.id).toBe(1);
    });
  });

  describe('bulkCreate', () => {
    it('should create multiple queue items', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 3 }]);

      const items = [
        { phone_number: '111', content: 'Message 1' },
        { phone_number: '222', content: 'Message 2' },
        { phone_number: '333', content: 'Message 3' }
      ];

      const result = await WhatsAppQueue.bulkCreate(1, items);

      expect(result.created).toBe(3);
    });
  });

  describe('updateStatus', () => {
    it('should update queue item status', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await WhatsAppQueue.updateStatus(1, 1, 'sent');

      expect(result).toBe(true);
    });
  });

  describe('markAsProcessing', () => {
    it('should mark item as processing', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await WhatsAppQueue.markAsProcessing(1, 1);

      expect(result).toBe(true);
    });
  });

  describe('markAsSent', () => {
    it('should mark item as sent', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await WhatsAppQueue.markAsSent(1, 1);

      expect(result).toBe(true);
    });
  });

  describe('markAsFailed', () => {
    it('should mark item as failed with error', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await WhatsAppQueue.markAsFailed(1, 1, 'Connection error');

      expect(result).toBe(true);
    });
  });

  describe('incrementAttempts', () => {
    it('should increment attempt count', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await WhatsAppQueue.incrementAttempts(1, 1);

      expect(result).toBe(true);
    });
  });

  describe('delete', () => {
    it('should delete queue item', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await WhatsAppQueue.delete(1, 1);

      expect(result).toBe(true);
    });
  });

  describe('getNext', () => {
    it('should return next pending item', async () => {
      pool.execute.mockResolvedValue([[{
        id: 1,
        phone_number: '123',
        status: 'pending',
        priority: 0
      }]]);

      const item = await WhatsAppQueue.getNext(1);

      expect(item.status).toBe('pending');
    });

    it('should return null if queue empty', async () => {
      pool.execute.mockResolvedValue([[]]);

      const item = await WhatsAppQueue.getNext(1);

      expect(item).toBeNull();
    });
  });

  describe('getPending', () => {
    it('should return all pending items', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, status: 'pending' },
        { id: 2, status: 'pending' }
      ]]);

      const items = await WhatsAppQueue.getPending(1);

      expect(items).toHaveLength(2);
    });
  });

  describe('getScheduled', () => {
    it('should return scheduled items', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, scheduled_at: new Date() }
      ]]);

      const items = await WhatsAppQueue.getScheduled(1);

      expect(items).toHaveLength(1);
    });
  });

  describe('getDueForSending', () => {
    it('should return items due for sending', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, status: 'pending', scheduled_at: null },
        { id: 2, status: 'pending', scheduled_at: new Date(Date.now() - 1000) }
      ]]);

      const items = await WhatsAppQueue.getDueForSending(1);

      expect(items).toHaveLength(2);
    });
  });

  describe('clearOld', () => {
    it('should clear old processed items', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 10 }]);

      const result = await WhatsAppQueue.clearOld(1, 7);

      expect(result.deleted).toBe(10);
    });
  });

  describe('getStats', () => {
    it('should return queue statistics', async () => {
      pool.execute.mockResolvedValue([[{
        total: 100,
        pending: 50,
        processing: 10,
        sent: 35,
        failed: 5
      }]]);

      const stats = await WhatsAppQueue.getStats(1);

      expect(stats).toEqual(expect.objectContaining({
        total: 100,
        pending: 50
      }));
    });
  });

  describe('count', () => {
    it('should return queue count', async () => {
      pool.execute.mockResolvedValue([[{ count: 25 }]]);

      const count = await WhatsAppQueue.count(1);

      expect(count).toBe(25);
    });

    it('should count by status', async () => {
      pool.execute.mockResolvedValue([[{ count: 10 }]]);

      const count = await WhatsAppQueue.count(1, { status: 'pending' });

      expect(count).toBe(10);
    });
  });
});
