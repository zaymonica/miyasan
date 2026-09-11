/**
 * WhatsAppSession Model Unit Tests
 */

const WhatsAppSession = require('../../../models/WhatsAppSession');

// Mock dependencies
jest.mock('../../../config/database', () => ({
  pool: {
    execute: jest.fn(),
    getConnection: jest.fn()
  }
}));

const { pool } = require('../../../config/database');

describe('WhatsAppSession Model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return all sessions for tenant', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, session_id: 'session1', is_active: true },
        { id: 2, session_id: 'session2', is_active: false }
      ]]);

      const sessions = await WhatsAppSession.findAll(1);

      expect(sessions).toHaveLength(2);
    });

    it('should filter by active status', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, session_id: 'session1', is_active: true }
      ]]);

      const sessions = await WhatsAppSession.findAll(1, { activeOnly: true });

      expect(sessions).toHaveLength(1);
    });
  });

  describe('findById', () => {
    it('should return session by id', async () => {
      pool.execute.mockResolvedValue([[{
        id: 1,
        session_id: 'session1',
        phone_number: '123456789',
        is_active: true
      }]]);

      const session = await WhatsAppSession.findById(1, 1);

      expect(session).toEqual(expect.objectContaining({
        id: 1,
        session_id: 'session1'
      }));
    });

    it('should return null if not found', async () => {
      pool.execute.mockResolvedValue([[]]);

      const session = await WhatsAppSession.findById(1, 999);

      expect(session).toBeNull();
    });
  });

  describe('findBySessionId', () => {
    it('should return session by session_id', async () => {
      pool.execute.mockResolvedValue([[{
        id: 1,
        session_id: 'session1',
        is_active: true
      }]]);

      const session = await WhatsAppSession.findBySessionId(1, 'session1');

      expect(session.session_id).toBe('session1');
    });
  });

  describe('getActive', () => {
    it('should return active session', async () => {
      pool.execute.mockResolvedValue([[{
        id: 1,
        session_id: 'active_session',
        is_active: true
      }]]);

      const session = await WhatsAppSession.getActive(1);

      expect(session.is_active).toBe(true);
    });

    it('should return null if no active session', async () => {
      pool.execute.mockResolvedValue([[]]);

      const session = await WhatsAppSession.getActive(1);

      expect(session).toBeNull();
    });
  });

  describe('create', () => {
    it('should create new session', async () => {
      pool.execute.mockResolvedValue([{ insertId: 1 }]);

      const session = await WhatsAppSession.create(1, {
        session_id: 'new_session',
        phone_number: '123456789'
      });

      expect(session.id).toBe(1);
    });
  });

  describe('update', () => {
    it('should update session', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await WhatsAppSession.update(1, 1, {
        phone_number: '987654321'
      });

      expect(result).toBe(true);
    });
  });

  describe('updateSessionData', () => {
    it('should update session data', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const sessionData = JSON.stringify({ key: 'value' });
      const result = await WhatsAppSession.updateSessionData(1, 'session1', sessionData);

      expect(result).toBe(true);
    });
  });

  describe('activate', () => {
    it('should activate session', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await WhatsAppSession.activate(1, 1);

      expect(result).toBe(true);
    });
  });

  describe('deactivate', () => {
    it('should deactivate session', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await WhatsAppSession.deactivate(1, 1);

      expect(result).toBe(true);
    });
  });

  describe('deactivateAll', () => {
    it('should deactivate all sessions for tenant', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 3 }]);

      const result = await WhatsAppSession.deactivateAll(1);

      expect(result.deactivated).toBe(3);
    });
  });

  describe('delete', () => {
    it('should delete session', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await WhatsAppSession.delete(1, 1);

      expect(result).toBe(true);
    });
  });

  describe('deleteBySessionId', () => {
    it('should delete session by session_id', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await WhatsAppSession.deleteBySessionId(1, 'session1');

      expect(result).toBe(true);
    });
  });

  describe('updateLastActivity', () => {
    it('should update last activity timestamp', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await WhatsAppSession.updateLastActivity(1, 'session1');

      expect(result).toBe(true);
    });
  });

  describe('setExpiry', () => {
    it('should set session expiry', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const expiryDate = new Date(Date.now() + 86400000);
      const result = await WhatsAppSession.setExpiry(1, 'session1', expiryDate);

      expect(result).toBe(true);
    });
  });

  describe('getExpired', () => {
    it('should return expired sessions', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, session_id: 'expired1', expires_at: new Date(Date.now() - 1000) }
      ]]);

      const sessions = await WhatsAppSession.getExpired(1);

      expect(sessions).toHaveLength(1);
    });
  });

  describe('cleanupExpired', () => {
    it('should cleanup expired sessions', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 5 }]);

      const result = await WhatsAppSession.cleanupExpired(1);

      expect(result.deleted).toBe(5);
    });
  });

  describe('count', () => {
    it('should return session count', async () => {
      pool.execute.mockResolvedValue([[{ count: 3 }]]);

      const count = await WhatsAppSession.count(1);

      expect(count).toBe(3);
    });
  });
});
