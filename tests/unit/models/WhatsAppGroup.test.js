/**
 * WhatsAppGroup Model Unit Tests
 */

const WhatsAppGroup = require('../../../models/WhatsAppGroup');

// Mock dependencies
jest.mock('../../../config/database', () => ({
  pool: {
    execute: jest.fn(),
    getConnection: jest.fn()
  }
}));

const { pool } = require('../../../config/database');

describe('WhatsAppGroup Model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return all groups for tenant', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, group_jid: 'group1@g.us', group_name: 'Group 1' },
        { id: 2, group_jid: 'group2@g.us', group_name: 'Group 2' }
      ]]);

      const groups = await WhatsAppGroup.findAll(1);

      expect(groups).toHaveLength(2);
    });
  });

  describe('findById', () => {
    it('should return group by id', async () => {
      pool.execute.mockResolvedValue([[{
        id: 1,
        group_jid: 'group1@g.us',
        group_name: 'Test Group',
        participant_count: 10
      }]]);

      const group = await WhatsAppGroup.findById(1, 1);

      expect(group).toEqual(expect.objectContaining({
        id: 1,
        group_name: 'Test Group'
      }));
    });

    it('should return null if not found', async () => {
      pool.execute.mockResolvedValue([[]]);

      const group = await WhatsAppGroup.findById(1, 999);

      expect(group).toBeNull();
    });
  });

  describe('findByJid', () => {
    it('should return group by JID', async () => {
      pool.execute.mockResolvedValue([[{
        id: 1,
        group_jid: 'group1@g.us',
        group_name: 'Test Group'
      }]]);

      const group = await WhatsAppGroup.findByJid(1, 'group1@g.us');

      expect(group.group_jid).toBe('group1@g.us');
    });
  });

  describe('create', () => {
    it('should create new group', async () => {
      pool.execute.mockResolvedValue([{ insertId: 1 }]);

      const group = await WhatsAppGroup.create(1, {
        group_jid: 'newgroup@g.us',
        group_name: 'New Group',
        participant_count: 5
      });

      expect(group.id).toBe(1);
    });
  });

  describe('upsert', () => {
    it('should update existing group', async () => {
      pool.execute
        .mockResolvedValueOnce([[{ id: 1 }]]) // findByJid
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // update

      const result = await WhatsAppGroup.upsert(1, {
        group_jid: 'group1@g.us',
        group_name: 'Updated Name'
      });

      expect(result.updated).toBe(true);
    });

    it('should create new group if not exists', async () => {
      pool.execute
        .mockResolvedValueOnce([[]]) // findByJid
        .mockResolvedValueOnce([{ insertId: 1 }]); // create

      const result = await WhatsAppGroup.upsert(1, {
        group_jid: 'newgroup@g.us',
        group_name: 'New Group'
      });

      expect(result.created).toBe(true);
    });
  });

  describe('update', () => {
    it('should update group', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await WhatsAppGroup.update(1, 1, {
        group_name: 'Updated Group',
        group_description: 'New description'
      });

      expect(result).toBe(true);
    });
  });

  describe('delete', () => {
    it('should delete group', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await WhatsAppGroup.delete(1, 1);

      expect(result).toBe(true);
    });
  });

  describe('updateParticipantCount', () => {
    it('should update participant count', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await WhatsAppGroup.updateParticipantCount(1, 'group1@g.us', 15);

      expect(result).toBe(true);
    });
  });

  describe('setAdmin', () => {
    it('should set admin status', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await WhatsAppGroup.setAdmin(1, 'group1@g.us', true);

      expect(result).toBe(true);
    });
  });

  describe('getAdminGroups', () => {
    it('should return groups where user is admin', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, group_jid: 'group1@g.us', is_admin: true }
      ]]);

      const groups = await WhatsAppGroup.getAdminGroups(1);

      expect(groups).toHaveLength(1);
    });
  });

  describe('search', () => {
    it('should search groups by name', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, group_name: 'Sales Team' }
      ]]);

      const groups = await WhatsAppGroup.search(1, 'Sales');

      expect(groups).toHaveLength(1);
    });
  });

  describe('count', () => {
    it('should return group count', async () => {
      pool.execute.mockResolvedValue([[{ count: 10 }]]);

      const count = await WhatsAppGroup.count(1);

      expect(count).toBe(10);
    });
  });

  describe('syncFromWhatsApp', () => {
    it('should sync groups from WhatsApp data', async () => {
      const whatsappGroups = [
        { id: 'group1@g.us', subject: 'Group 1', participants: [] },
        { id: 'group2@g.us', subject: 'Group 2', participants: [] }
      ];

      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await WhatsAppGroup.syncFromWhatsApp(1, whatsappGroups);

      expect(result.synced).toBe(2);
    });
  });
});
