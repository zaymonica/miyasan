/**
 * WhatsAppContact Model Unit Tests
 */

const WhatsAppContact = require('../../../models/WhatsAppContact');

// Mock dependencies
jest.mock('../../../config/database', () => ({
  pool: {
    execute: jest.fn(),
    getConnection: jest.fn()
  }
}));

const { pool } = require('../../../config/database');

describe('WhatsAppContact Model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return all WhatsApp contacts for tenant', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, phone_number: '123456789', name: 'John' },
        { id: 2, phone_number: '987654321', name: 'Jane' }
      ]]);

      const contacts = await WhatsAppContact.findAll(1);

      expect(contacts).toHaveLength(2);
    });

    it('should filter by is_blocked', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, phone_number: '123', is_blocked: false }
      ]]);

      const contacts = await WhatsAppContact.findAll(1, { blocked: false });

      expect(contacts).toHaveLength(1);
    });
  });

  describe('findById', () => {
    it('should return contact by id', async () => {
      pool.execute.mockResolvedValue([[{
        id: 1,
        phone_number: '123456789',
        name: 'John Doe',
        profile_picture_url: 'https://example.com/pic.jpg'
      }]]);

      const contact = await WhatsAppContact.findById(1, 1);

      expect(contact).toEqual(expect.objectContaining({
        id: 1,
        phone_number: '123456789'
      }));
    });

    it('should return null if not found', async () => {
      pool.execute.mockResolvedValue([[]]);

      const contact = await WhatsAppContact.findById(1, 999);

      expect(contact).toBeNull();
    });
  });

  describe('findByPhone', () => {
    it('should return contact by phone number', async () => {
      pool.execute.mockResolvedValue([[{
        id: 1,
        phone_number: '123456789',
        name: 'John'
      }]]);

      const contact = await WhatsAppContact.findByPhone(1, '123456789');

      expect(contact.phone_number).toBe('123456789');
    });
  });

  describe('create', () => {
    it('should create new WhatsApp contact', async () => {
      pool.execute.mockResolvedValue([{ insertId: 1 }]);

      const contact = await WhatsAppContact.create(1, {
        phone_number: '123456789',
        name: 'New Contact'
      });

      expect(contact.id).toBe(1);
    });
  });

  describe('upsert', () => {
    it('should update existing contact', async () => {
      pool.execute
        .mockResolvedValueOnce([[{ id: 1 }]]) // findByPhone
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // update

      const result = await WhatsAppContact.upsert(1, {
        phone_number: '123456789',
        name: 'Updated Name'
      });

      expect(result.updated).toBe(true);
    });

    it('should create new contact if not exists', async () => {
      pool.execute
        .mockResolvedValueOnce([[]]) // findByPhone
        .mockResolvedValueOnce([{ insertId: 1 }]); // create

      const result = await WhatsAppContact.upsert(1, {
        phone_number: '123456789',
        name: 'New Contact'
      });

      expect(result.created).toBe(true);
    });
  });

  describe('update', () => {
    it('should update contact', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await WhatsAppContact.update(1, 1, {
        name: 'Updated Name',
        status_message: 'New status'
      });

      expect(result).toBe(true);
    });
  });

  describe('delete', () => {
    it('should delete contact', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await WhatsAppContact.delete(1, 1);

      expect(result).toBe(true);
    });
  });

  describe('block', () => {
    it('should block contact', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await WhatsAppContact.block(1, 1);

      expect(result).toBe(true);
    });
  });

  describe('unblock', () => {
    it('should unblock contact', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await WhatsAppContact.unblock(1, 1);

      expect(result).toBe(true);
    });
  });

  describe('updateLastMessage', () => {
    it('should update last message timestamp', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await WhatsAppContact.updateLastMessage(1, '123456789');

      expect(result).toBe(true);
    });
  });

  describe('incrementMessageCount', () => {
    it('should increment message count', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await WhatsAppContact.incrementMessageCount(1, '123456789');

      expect(result).toBe(true);
    });
  });

  describe('search', () => {
    it('should search contacts by name or phone', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, phone_number: '123', name: 'John' }
      ]]);

      const contacts = await WhatsAppContact.search(1, 'John');

      expect(contacts).toHaveLength(1);
    });
  });

  describe('getRecent', () => {
    it('should return recent contacts', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, last_message_at: new Date() },
        { id: 2, last_message_at: new Date() }
      ]]);

      const contacts = await WhatsAppContact.getRecent(1, 10);

      expect(contacts).toHaveLength(2);
    });
  });

  describe('count', () => {
    it('should return contact count', async () => {
      pool.execute.mockResolvedValue([[{ count: 50 }]]);

      const count = await WhatsAppContact.count(1);

      expect(count).toBe(50);
    });
  });
});
