/**
 * Contact Controller Unit Tests
 */

const ContactController = require('../../../controllers/ContactController');
const { pool } = require('../../../config/database');

// Mock dependencies
jest.mock('../../../config/database');
jest.mock('../../../config/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

// Mock asyncHandler to execute function directly
jest.mock('../../../middleware/errorHandler', () => ({
  asyncHandler: (fn) => fn,
  errorHandler: jest.fn(),
  notFoundHandler: jest.fn()
}));

describe('ContactController', () => {
  let req, res;

  beforeEach(() => {
    req = {
      user: { tenantId: 1, id: 1 },
      query: {},
      params: {},
      body: {}
    };
    res = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis()
    };
    jest.clearAllMocks();
  });

  describe('getContacts', () => {
    it('should return contacts list', async () => {
      const mockContacts = [
        { id: 1, name: 'John Doe', phone: '5511999999999', email: 'john@example.com', group_name: 'Default' }
      ];
      pool.query = jest.fn()
        .mockResolvedValueOnce([mockContacts])
        .mockResolvedValueOnce([[{ total: 1 }]]);

      await ContactController.getContacts(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockContacts,
        total: 1
      });
    });

    it('should filter by group_id', async () => {
      req.query.group_id = 2;
      pool.query = jest.fn()
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ total: 0 }]]);

      await ContactController.getContacts(req, res);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('AND c.group_id = ?'),
        expect.arrayContaining([1, 2])
      );
    });

    it('should filter by search term', async () => {
      req.query.search = 'John';
      pool.query = jest.fn()
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ total: 0 }]]);

      await ContactController.getContacts(req, res);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('AND (c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?)'),
        expect.arrayContaining(['%John%', '%John%', '%John%'])
      );
    });

    it('should handle errors', async () => {
      pool.query = jest.fn().mockRejectedValue(new Error('Database error'));

      await ContactController.getContacts(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to load contacts'
      });
    });
  });

  describe('getContact', () => {
    it('should return single contact', async () => {
      const mockContact = { id: 1, name: 'John Doe', phone: '5511999999999' };
      req.params.id = 1;
      pool.query = jest.fn().mockResolvedValue([[mockContact]]);

      await ContactController.getContact(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockContact
      });
    });

    it('should return 404 if contact not found', async () => {
      req.params.id = 999;
      pool.query = jest.fn().mockResolvedValue([[]]);

      await ContactController.getContact(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Contact not found'
      });
    });
  });

  describe('createContact', () => {
    it('should create contact successfully', async () => {
      req.body = { name: 'John Doe', phone: '5511999999999', email: 'john@example.com' };
      pool.query = jest.fn()
        .mockResolvedValueOnce([[{ max_contacts: 1000 }]])
        .mockResolvedValueOnce([[{ count: 10 }]])
        .mockResolvedValueOnce([{ insertId: 1 }]);

      await ContactController.createContact(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Contact created successfully',
        data: { id: 1 }
      });
    });

    it('should return 400 if name or phone missing', async () => {
      req.body = { name: 'John Doe' };

      await ContactController.createContact(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Name and phone are required'
      });
    });

    it('should return 403 if contact limit reached', async () => {
      req.body = { name: 'John Doe', phone: '5511999999999' };
      pool.query = jest.fn()
        .mockResolvedValueOnce([[{ max_contacts: 10 }]])
        .mockResolvedValueOnce([[{ count: 10 }]]);

      await ContactController.createContact(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Contact limit reached for your plan'
      });
    });

    it('should handle duplicate phone error', async () => {
      req.body = { name: 'John Doe', phone: '5511999999999' };
      pool.query = jest.fn()
        .mockResolvedValueOnce([[{ max_contacts: 1000 }]])
        .mockResolvedValueOnce([[{ count: 10 }]])
        .mockRejectedValueOnce({ code: 'ER_DUP_ENTRY' });

      await ContactController.createContact(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Phone number already exists'
      });
    });
  });

  describe('updateContact', () => {
    it('should update contact successfully', async () => {
      req.params.id = 1;
      req.body = { name: 'John Updated', phone: '5511999999999' };
      pool.query = jest.fn().mockResolvedValue([{ affectedRows: 1 }]);

      await ContactController.updateContact(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Contact updated successfully'
      });
    });

    it('should return 404 if contact not found', async () => {
      req.params.id = 999;
      req.body = { name: 'John Updated', phone: '5511999999999' };
      pool.query = jest.fn().mockResolvedValue([{ affectedRows: 0 }]);

      await ContactController.updateContact(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Contact not found'
      });
    });
  });

  describe('deleteContact', () => {
    it('should delete contact successfully', async () => {
      req.params.id = 1;
      pool.query = jest.fn().mockResolvedValue([{ affectedRows: 1 }]);

      await ContactController.deleteContact(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Contact deleted successfully'
      });
    });

    it('should return 404 if contact not found', async () => {
      req.params.id = 999;
      pool.query = jest.fn().mockResolvedValue([{ affectedRows: 0 }]);

      await ContactController.deleteContact(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('importContacts', () => {
    it('should import contacts successfully', async () => {
      req.body = {
        contacts: [
          { name: 'John Doe', phone: '5511999999999', email: 'john@example.com' },
          { name: 'Jane Smith', phone: '5511888888888' }
        ]
      };
      pool.query = jest.fn()
        .mockResolvedValueOnce([[{ max_contacts: 1000 }]])
        .mockResolvedValueOnce([[{ count: 10 }]])
        .mockResolvedValue([{ insertId: 1 }]);

      await ContactController.importContacts(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Imported 2 contacts, 0 failed',
        data: { imported: 2, failed: 0, errors: [] }
      });
    });

    it('should return 400 if contacts array is empty', async () => {
      req.body = { contacts: [] };

      await ContactController.importContacts(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Contacts array is required'
      });
    });

    it('should return 403 if import exceeds limit', async () => {
      req.body = {
        contacts: [
          { name: 'John Doe', phone: '5511999999999' },
          { name: 'Jane Smith', phone: '5511888888888' }
        ]
      };
      pool.query = jest.fn()
        .mockResolvedValueOnce([[{ max_contacts: 10 }]])
        .mockResolvedValueOnce([[{ count: 9 }]]);

      await ContactController.importContacts(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Cannot import 2 contacts. Limit: 10, Current: 9'
      });
    });
  });

  describe('getGroups', () => {
    it('should return groups list with contact counts', async () => {
      const mockGroups = [
        { id: 1, group_name: 'Default', description: null, contact_count: 5 },
        { id: 2, group_name: 'VIP', description: 'VIP customers', contact_count: 3 }
      ];
      pool.query = jest.fn().mockResolvedValue([mockGroups]);

      await ContactController.getGroups(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockGroups
      });
    });
  });

  describe('createGroup', () => {
    it('should create group successfully', async () => {
      req.body = { group_name: 'VIP', description: 'VIP customers' };
      pool.query = jest.fn()
        .mockResolvedValueOnce([[{ max_contact_groups: 10 }]])
        .mockResolvedValueOnce([[{ count: 2 }]])
        .mockResolvedValueOnce([{ insertId: 3 }]);

      await ContactController.createGroup(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Group created successfully',
        data: { id: 3 }
      });
    });

    it('should return 400 if group_name missing', async () => {
      req.body = {};

      await ContactController.createGroup(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Group name is required'
      });
    });

    it('should return 403 if group limit reached', async () => {
      req.body = { group_name: 'VIP' };
      pool.query = jest.fn()
        .mockResolvedValueOnce([[{ max_contact_groups: 5 }]])
        .mockResolvedValueOnce([[{ count: 5 }]]);

      await ContactController.createGroup(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Contact group limit reached for your plan'
      });
    });
  });

  describe('updateGroup', () => {
    it('should update group successfully', async () => {
      req.params.id = 2;
      req.body = { group_name: 'VIP Updated', description: 'Updated description' };
      pool.query = jest.fn().mockResolvedValue([{ affectedRows: 1 }]);

      await ContactController.updateGroup(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Group updated successfully'
      });
    });

    it('should return 404 if group not found', async () => {
      req.params.id = 999;
      req.body = { group_name: 'VIP Updated' };
      pool.query = jest.fn().mockResolvedValue([{ affectedRows: 0 }]);

      await ContactController.updateGroup(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('deleteGroup', () => {
    it('should delete group successfully', async () => {
      req.params.id = 2;
      pool.query = jest.fn()
        .mockResolvedValueOnce([[{ group_name: 'VIP' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      await ContactController.deleteGroup(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Group deleted successfully'
      });
    });

    it('should return 400 if trying to delete default group', async () => {
      req.params.id = 1;
      pool.query = jest.fn().mockResolvedValueOnce([[{ group_name: 'Default' }]]);

      await ContactController.deleteGroup(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Cannot delete default group'
      });
    });

    it('should return 404 if group not found', async () => {
      req.params.id = 999;
      pool.query = jest.fn().mockResolvedValueOnce([[]]);

      await ContactController.deleteGroup(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });
});
