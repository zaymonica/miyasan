/**
 * WhatsAppConnection Model Unit Tests
 * Tests for WhatsApp connection model
 */

const WhatsAppConnection = require('../../../models/WhatsAppConnection');

// Mock dependencies
jest.mock('../../../config/database');
jest.mock('../../../config/logger');

describe('WhatsAppConnection Model', () => {
  let mockPool;

  beforeEach(() => {
    // Mock pool with proper array destructuring support
    mockPool = {
      query: jest.fn().mockResolvedValue([[], {}])
    };

    const { pool } = require('../../../config/database');
    Object.assign(pool, mockPool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getByTenantId', () => {
    it('should return connection for valid tenant', async () => {
      const mockConnection = {
        id: 1,
        tenant_id: 1,
        status: 'connected',
        phone_number: '5511999999999'
      };

      mockPool.query.mockResolvedValueOnce([[mockConnection], {}]);

      const result = await WhatsAppConnection.getByTenantId(1);

      expect(result).toEqual(mockConnection);
      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT * FROM whatsapp_connections WHERE tenant_id = ?',
        [1]
      );
    });

    it('should return null if no connection found', async () => {
      mockPool.query.mockResolvedValueOnce([[], {}]);

      const result = await WhatsAppConnection.getByTenantId(999);

      expect(result).toBeNull();
    });

    it('should return null for invalid tenantId', async () => {
      const result = await WhatsAppConnection.getByTenantId(null);

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create new connection', async () => {
      const mockResult = { insertId: 1 };
      const mockConnection = {
        id: 1,
        tenant_id: 1,
        status: 'connecting'
      };

      mockPool.query
        .mockResolvedValueOnce([mockResult, {}])
        .mockResolvedValueOnce([[mockConnection], {}]);

      const data = {
        status: 'connecting',
        phone_number: null
      };

      const result = await WhatsAppConnection.create(1, data);

      expect(result).toEqual(mockConnection);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO whatsapp_connections'),
        expect.arrayContaining([1, null, 'connecting'])
      );
    });

    it('should throw error if tenantId is missing', async () => {
      await expect(WhatsAppConnection.create(null, {}))
        .rejects.toThrow('tenantId is required');
    });
  });

  describe('update', () => {
    it('should update existing connection', async () => {
      const existingConnection = {
        id: 1,
        tenant_id: 1,
        status: 'connecting'
      };

      const updatedConnection = {
        ...existingConnection,
        status: 'connected',
        phone_number: '5511999999999'
      };

      mockPool.query
        .mockResolvedValueOnce([[existingConnection], {}])
        .mockResolvedValueOnce([{ affectedRows: 1 }, {}])
        .mockResolvedValueOnce([[updatedConnection], {}]);

      const data = {
        status: 'connected',
        phone_number: '5511999999999'
      };

      const result = await WhatsAppConnection.update(1, data);

      expect(result).toEqual(updatedConnection);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE whatsapp_connections SET'),
        expect.any(Array)
      );
    });

    it('should create connection if not exists', async () => {
      mockPool.query
        .mockResolvedValueOnce([[], {}])
        .mockResolvedValueOnce([{ insertId: 1 }, {}])
        .mockResolvedValueOnce([[{ id: 1, tenant_id: 1 }], {}]);

      const result = await WhatsAppConnection.update(1, { status: 'connecting' });

      expect(result).toBeDefined();
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO whatsapp_connections'),
        expect.any(Array)
      );
    });

    it('should return existing connection if no updates', async () => {
      const existingConnection = { id: 1, tenant_id: 1 };

      mockPool.query.mockResolvedValue([[existingConnection], {}]);

      const result = await WhatsAppConnection.update(1, {});

      expect(result).toEqual(existingConnection);
    });
  });

  describe('updateStatus', () => {
    it('should update status to connected', async () => {
      const existingConnection = { id: 1, tenant_id: 1, status: 'connecting' };
      const updatedConnection = { ...existingConnection, status: 'connected' };

      mockPool.query
        .mockResolvedValueOnce([[existingConnection], {}])
        .mockResolvedValueOnce([{ affectedRows: 1 }, {}])
        .mockResolvedValueOnce([[updatedConnection], {}]);

      const result = await WhatsAppConnection.updateStatus(1, 'connected');

      expect(result.status).toBe('connected');
    });

    it('should reset error on connected status', async () => {
      mockPool.query
        .mockResolvedValueOnce([[{ id: 1, tenant_id: 1 }], {}])
        .mockResolvedValueOnce([{ affectedRows: 1 }, {}])
        .mockResolvedValueOnce([[{ id: 1, tenant_id: 1, status: 'connected' }], {}]);

      const result = await WhatsAppConnection.updateStatus(1, 'connected', {
        phone_number: '5511999999999'
      });

      expect(result.status).toBe('connected');
    });
  });

  describe('delete', () => {
    it('should delete connection', async () => {
      mockPool.query.mockResolvedValue([{ affectedRows: 1 }, {}]);

      const result = await WhatsAppConnection.delete(1);

      expect(result).toBe(true);
      expect(mockPool.query).toHaveBeenCalledWith(
        'DELETE FROM whatsapp_connections WHERE tenant_id = ?',
        [1]
      );
    });
  });

  describe('isConnected', () => {
    it('should return true if connected', async () => {
      mockPool.query.mockResolvedValue([[{ status: 'connected' }], {}]);

      const result = await WhatsAppConnection.isConnected(1);

      expect(result).toBe(true);
    });

    it('should return false if not connected', async () => {
      mockPool.query.mockResolvedValue([[{ status: 'disconnected' }], {}]);

      const result = await WhatsAppConnection.isConnected(1);

      expect(result).toBe(false);
    });

    it('should return false if no connection', async () => {
      mockPool.query.mockResolvedValue([[], {}]);

      const result = await WhatsAppConnection.isConnected(999);

      expect(result).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return connection statistics', async () => {
      const mockConnection = {
        id: 1,
        tenant_id: 1,
        status: 'connected',
        phone_number: '5511999999999',
        connection_attempts: 0,
        last_connected_at: new Date(),
        created_at: new Date()
      };

      mockPool.query.mockResolvedValue([[mockConnection], {}]);

      const stats = await WhatsAppConnection.getStats(1);

      expect(stats).toMatchObject({
        exists: true,
        status: 'connected',
        phone_number: '5511999999999',
        attempts: 0
      });
    });

    it('should return default stats if no connection', async () => {
      mockPool.query.mockResolvedValue([[], {}]);

      const stats = await WhatsAppConnection.getStats(999);

      expect(stats).toMatchObject({
        exists: false,
        status: 'disconnected',
        uptime: 0,
        attempts: 0
      });
    });
  });
});
