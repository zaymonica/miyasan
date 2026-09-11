/**
 * MessagePlaceholder Model Unit Tests
 */

const MessagePlaceholder = require('../../../models/MessagePlaceholder');

// Mock dependencies
jest.mock('../../../config/database', () => ({
  pool: {
    execute: jest.fn(),
    getConnection: jest.fn()
  }
}));

const { pool } = require('../../../config/database');

describe('MessagePlaceholder Model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return all placeholders for tenant', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, placeholder_key: '{{name}}', placeholder_value: 'Customer Name' },
        { id: 2, placeholder_key: '{{phone}}', placeholder_value: 'Phone Number' }
      ]]);

      const placeholders = await MessagePlaceholder.findAll(1);

      expect(placeholders).toHaveLength(2);
    });

    it('should return only active placeholders', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, placeholder_key: '{{name}}', active: true }
      ]]);

      const placeholders = await MessagePlaceholder.findAll(1, { activeOnly: true });

      expect(placeholders).toHaveLength(1);
    });
  });

  describe('findById', () => {
    it('should return placeholder by id', async () => {
      pool.execute.mockResolvedValue([[{
        id: 1,
        placeholder_key: '{{name}}',
        placeholder_value: 'Customer Name',
        description: 'Name of the customer'
      }]]);

      const placeholder = await MessagePlaceholder.findById(1, 1);

      expect(placeholder).toEqual(expect.objectContaining({
        id: 1,
        placeholder_key: '{{name}}'
      }));
    });

    it('should return null if not found', async () => {
      pool.execute.mockResolvedValue([[]]);

      const placeholder = await MessagePlaceholder.findById(1, 999);

      expect(placeholder).toBeNull();
    });
  });

  describe('findByKey', () => {
    it('should return placeholder by key', async () => {
      pool.execute.mockResolvedValue([[{
        id: 1,
        placeholder_key: '{{name}}',
        placeholder_value: 'Customer Name'
      }]]);

      const placeholder = await MessagePlaceholder.findByKey(1, '{{name}}');

      expect(placeholder.placeholder_key).toBe('{{name}}');
    });
  });

  describe('create', () => {
    it('should create new placeholder', async () => {
      pool.execute.mockResolvedValue([{ insertId: 1 }]);

      const placeholder = await MessagePlaceholder.create(1, {
        placeholder_key: '{{new_key}}',
        placeholder_value: 'New Value',
        description: 'New placeholder'
      });

      expect(placeholder.id).toBe(1);
    });

    it('should handle duplicate key error', async () => {
      pool.execute.mockRejectedValue({ code: 'ER_DUP_ENTRY' });

      await expect(MessagePlaceholder.create(1, {
        placeholder_key: '{{existing}}'
      })).rejects.toThrow();
    });
  });

  describe('update', () => {
    it('should update placeholder', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await MessagePlaceholder.update(1, 1, {
        placeholder_value: 'Updated Value'
      });

      expect(result).toBe(true);
    });

    it('should return false if not found', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 0 }]);

      const result = await MessagePlaceholder.update(1, 999, {
        placeholder_value: 'Test'
      });

      expect(result).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete placeholder', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await MessagePlaceholder.delete(1, 1);

      expect(result).toBe(true);
    });
  });

  describe('replacePlaceholders', () => {
    it('should replace placeholders in message', async () => {
      pool.execute.mockResolvedValue([[
        { placeholder_key: '{{name}}', placeholder_value: 'John' },
        { placeholder_key: '{{company}}', placeholder_value: 'Acme Inc' }
      ]]);

      const message = 'Hello {{name}} from {{company}}!';
      const result = await MessagePlaceholder.replacePlaceholders(1, message);

      expect(result).toBe('Hello John from Acme Inc!');
    });

    it('should handle custom data', async () => {
      pool.execute.mockResolvedValue([[
        { placeholder_key: '{{name}}', placeholder_value: 'Default Name' }
      ]]);

      const message = 'Hello {{name}}!';
      const customData = { name: 'Custom Name' };
      const result = await MessagePlaceholder.replacePlaceholders(1, message, customData);

      expect(result).toBe('Hello Custom Name!');
    });

    it('should keep unmatched placeholders', async () => {
      pool.execute.mockResolvedValue([[]]);

      const message = 'Hello {{unknown}}!';
      const result = await MessagePlaceholder.replacePlaceholders(1, message);

      expect(result).toBe('Hello {{unknown}}!');
    });
  });

  describe('getSystemPlaceholders', () => {
    it('should return system placeholders', async () => {
      const placeholders = MessagePlaceholder.getSystemPlaceholders();

      expect(placeholders).toEqual(expect.arrayContaining([
        expect.objectContaining({ key: '{{current_date}}' }),
        expect.objectContaining({ key: '{{current_time}}' })
      ]));
    });
  });

  describe('toggle', () => {
    it('should toggle placeholder active status', async () => {
      pool.execute
        .mockResolvedValueOnce([[{ id: 1, active: true }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await MessagePlaceholder.toggle(1, 1);

      expect(result).toBe(true);
    });
  });
});
