/**
 * Store Model Unit Tests
 */

const Store = require('../../../models/Store');

// Mock dependencies
jest.mock('../../../config/database', () => ({
  pool: {
    execute: jest.fn(),
    getConnection: jest.fn()
  }
}));

const { pool } = require('../../../config/database');

describe('Store Model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return all stores for tenant', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, name: 'Store 1', address: 'Address 1' },
        { id: 2, name: 'Store 2', address: 'Address 2' }
      ]]);

      const stores = await Store.findAll(1);

      expect(stores).toHaveLength(2);
    });
  });

  describe('findById', () => {
    it('should return store by id', async () => {
      pool.execute.mockResolvedValue([[{
        id: 1,
        name: 'Main Store',
        address: '123 Main St'
      }]]);

      const store = await Store.findById(1, 1);

      expect(store).toEqual(expect.objectContaining({
        id: 1,
        name: 'Main Store'
      }));
    });

    it('should return null if store not found', async () => {
      pool.execute.mockResolvedValue([[]]);

      const store = await Store.findById(1, 999);

      expect(store).toBeNull();
    });
  });

  describe('findByName', () => {
    it('should return store by name', async () => {
      pool.execute.mockResolvedValue([[{
        id: 1,
        name: 'Main Store'
      }]]);

      const store = await Store.findByName(1, 'Main Store');

      expect(store.name).toBe('Main Store');
    });
  });

  describe('create', () => {
    it('should create new store', async () => {
      pool.execute.mockResolvedValue([{ insertId: 1 }]);

      const store = await Store.create(1, {
        name: 'New Store',
        address: '456 New St',
        phone: '123456789'
      });

      expect(store.id).toBe(1);
    });

    it('should handle duplicate name error', async () => {
      pool.execute.mockRejectedValue({ code: 'ER_DUP_ENTRY' });

      await expect(Store.create(1, {
        name: 'Existing Store'
      })).rejects.toThrow();
    });
  });

  describe('update', () => {
    it('should update store', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await Store.update(1, 1, {
        name: 'Updated Store',
        address: 'New Address'
      });

      expect(result).toBe(true);
    });

    it('should return false if store not found', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 0 }]);

      const result = await Store.update(1, 999, { name: 'Test' });

      expect(result).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete store', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await Store.delete(1, 1);

      expect(result).toBe(true);
    });
  });

  describe('count', () => {
    it('should return store count for tenant', async () => {
      pool.execute.mockResolvedValue([[{ count: 5 }]]);

      const count = await Store.count(1);

      expect(count).toBe(5);
    });
  });

  describe('getWithDepartments', () => {
    it('should return store with departments', async () => {
      pool.execute.mockResolvedValue([[{
        id: 1,
        name: 'Main Store',
        departments: '[{"id":1,"name":"Sales"}]'
      }]]);

      const store = await Store.getWithDepartments(1, 1);

      expect(store).toEqual(expect.objectContaining({
        id: 1,
        name: 'Main Store'
      }));
    });
  });
});
