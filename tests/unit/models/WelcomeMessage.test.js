/**
 * WelcomeMessage Model Unit Tests
 */

const WelcomeMessage = require('../../../models/WelcomeMessage');

// Mock dependencies
jest.mock('../../../config/database', () => ({
  pool: {
    execute: jest.fn(),
    getConnection: jest.fn()
  }
}));

const { pool } = require('../../../config/database');

describe('WelcomeMessage Model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return all welcome messages for tenant', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, message_text: 'Welcome!', order_position: 1 },
        { id: 2, message_text: 'How can we help?', order_position: 2 }
      ]]);

      const messages = await WelcomeMessage.findAll(1);

      expect(messages).toHaveLength(2);
    });

    it('should return only active messages', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, message_text: 'Welcome!', active: true }
      ]]);

      const messages = await WelcomeMessage.findAll(1, { activeOnly: true });

      expect(messages).toHaveLength(1);
    });
  });

  describe('findById', () => {
    it('should return welcome message by id', async () => {
      pool.execute.mockResolvedValue([[{
        id: 1,
        message_text: 'Welcome!',
        order_position: 1,
        active: true
      }]]);

      const message = await WelcomeMessage.findById(1, 1);

      expect(message).toEqual(expect.objectContaining({
        id: 1,
        message_text: 'Welcome!'
      }));
    });

    it('should return null if message not found', async () => {
      pool.execute.mockResolvedValue([[]]);

      const message = await WelcomeMessage.findById(1, 999);

      expect(message).toBeNull();
    });
  });

  describe('create', () => {
    it('should create new welcome message', async () => {
      pool.execute.mockResolvedValue([{ insertId: 1 }]);

      const message = await WelcomeMessage.create(1, {
        message_text: 'New welcome message',
        order_position: 1
      });

      expect(message.id).toBe(1);
    });
  });

  describe('update', () => {
    it('should update welcome message', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await WelcomeMessage.update(1, 1, {
        message_text: 'Updated message'
      });

      expect(result).toBe(true);
    });
  });

  describe('delete', () => {
    it('should delete welcome message', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await WelcomeMessage.delete(1, 1);

      expect(result).toBe(true);
    });
  });

  describe('reorder', () => {
    it('should reorder welcome messages', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await WelcomeMessage.reorder(1, [3, 1, 2]);

      expect(result).toBe(true);
    });
  });

  describe('toggle', () => {
    it('should toggle message active status', async () => {
      pool.execute
        .mockResolvedValueOnce([[{ id: 1, active: true }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await WelcomeMessage.toggle(1, 1);

      expect(result).toBe(true);
    });
  });

  describe('getActive', () => {
    it('should return active welcome messages in order', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, message_text: 'First', order_position: 1 },
        { id: 2, message_text: 'Second', order_position: 2 }
      ]]);

      const messages = await WelcomeMessage.getActive(1);

      expect(messages).toHaveLength(2);
      expect(messages[0].order_position).toBe(1);
    });
  });
});
