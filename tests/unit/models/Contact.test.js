/**
 * Contact Model Unit Tests
 */

const Contact = require('../../../models/Contact');

// Mock dependencies
jest.mock('../../../config/database', () => ({
  pool: {
    execute: jest.fn(),
    getConnection: jest.fn()
  }
}));

const { pool } = require('../../../config/database');

describe('Contact Model', () => {
  let mockConnection;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConnection = {
      execute: jest.fn(),
      query: jest.fn(),
      release: jest.fn()
    };

    pool.getConnection.mockResolvedValue(mockConnection);
  });

  describe('findAll', () => {
    it('should return all contacts for tenant', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, name: 'John', phone: '123456789' },
        { id: 2, name: 'Jane', phone: '987654321' }
      ]]);

      const contacts = await Contact.findAll(1);

      expect(contacts).toHaveLength(2);
      expect(pool.execute).toHaveBeenCalledWith(
        expect.stringContaining('tenant_id'),
        [1]
      );
    });

    it('should return empty array if no contacts', async () => {
      pool.execute.mockResolvedValue([[]]);

      const contacts = await Contact.findAll(1);

      expect(contacts).toEqual([]);
    });
  });

  describe('findById', () => {
    it('should return contact by id', async () => {
      pool.execute.mockResolvedValue([[{
        id: 1,
        name: 'John Doe',
        phone: '123456789',
        email: 'john@test.com'
      }]]);

      const contact = await Contact.findById(1, 1);

      expect(contact).toEqual(expect.objectContaining({
        id: 1,
        name: 'John Doe'
      }));
    });

    it('should return null if contact not found', async () => {
      pool.execute.mockResolvedValue([[]]);

      const contact = await Contact.findById(1, 999);

      expect(contact).toBeNull();
    });
  });

  describe('findByPhone', () => {
    it('should return contact by phone number', async () => {
      pool.execute.mockResolvedValue([[{
        id: 1,
        name: 'John',
        phone: '123456789'
      }]]);

      const contact = await Contact.findByPhone(1, '123456789');

      expect(contact).toEqual(expect.objectContaining({
        phone: '123456789'
      }));
    });
  });

  describe('create', () => {
    it('should create new contact', async () => {
      pool.execute.mockResolvedValue([{ insertId: 1 }]);

      const contact = await Contact.create(1, {
        name: 'New Contact',
        phone: '123456789',
        email: 'new@test.com'
      });

      expect(contact.id).toBe(1);
    });

    it('should handle duplicate phone error', async () => {
      pool.execute.mockRejectedValue({ code: 'ER_DUP_ENTRY' });

      await expect(Contact.create(1, {
        name: 'Duplicate',
        phone: '123456789'
      })).rejects.toThrow();
    });
  });

  describe('update', () => {
    it('should update contact', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await Contact.update(1, 1, {
        name: 'Updated Name'
      });

      expect(result).toBe(true);
    });

    it('should return false if contact not found', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 0 }]);

      const result = await Contact.update(1, 999, {
        name: 'Updated'
      });

      expect(result).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete contact', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await Contact.delete(1, 1);

      expect(result).toBe(true);
    });
  });

  describe('search', () => {
    it('should search contacts by name', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, name: 'John Doe', phone: '123' }
      ]]);

      const contacts = await Contact.search(1, 'John');

      expect(contacts).toHaveLength(1);
    });

    it('should search contacts by phone', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, name: 'John', phone: '123456789' }
      ]]);

      const contacts = await Contact.search(1, '123');

      expect(contacts).toHaveLength(1);
    });
  });

  describe('findByGroup', () => {
    it('should return contacts by group', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, name: 'John', group_id: 1 },
        { id: 2, name: 'Jane', group_id: 1 }
      ]]);

      const contacts = await Contact.findByGroup(1, 1);

      expect(contacts).toHaveLength(2);
    });
  });

  describe('count', () => {
    it('should return contact count for tenant', async () => {
      pool.execute.mockResolvedValue([[{ count: 50 }]]);

      const count = await Contact.count(1);

      expect(count).toBe(50);
    });
  });

  describe('bulkCreate', () => {
    it('should create multiple contacts', async () => {
      mockConnection.execute.mockResolvedValue([{ affectedRows: 3 }]);

      const contacts = [
        { name: 'Contact 1', phone: '111' },
        { name: 'Contact 2', phone: '222' },
        { name: 'Contact 3', phone: '333' }
      ];

      const result = await Contact.bulkCreate(1, contacts);

      expect(result.created).toBe(3);
    });
  });

  describe('addToGroup', () => {
    it('should add contact to group', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await Contact.addToGroup(1, 1);

      expect(result).toBe(true);
    });
  });

  describe('removeFromGroup', () => {
    it('should remove contact from group', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await Contact.removeFromGroup(1, 1);

      expect(result).toBe(true);
    });
  });
});
