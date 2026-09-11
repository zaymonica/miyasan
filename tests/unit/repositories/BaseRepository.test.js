/**
 * BaseRepository Unit Tests
 */

const BaseRepository = require('../../../repositories/BaseRepository');

// Mock dependencies
jest.mock('../../../config/database', () => ({
  pool: {
    execute: jest.fn(),
    getConnection: jest.fn()
  }
}));

const { pool } = require('../../../config/database');

describe('BaseRepository', () => {
  let mockConnection;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConnection = {
      execute: jest.fn(),
      query: jest.fn(),
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn()
    };

    pool.getConnection.mockResolvedValue(mockConnection);
  });

  describe('findAll', () => {
    it('should return all records', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' }
      ]]);

      const repo = new BaseRepository('test_table');
      const results = await repo.findAll();

      expect(results).toHaveLength(2);
    });

    it('should apply where conditions', async () => {
      pool.execute.mockResolvedValue([[{ id: 1 }]]);

      const repo = new BaseRepository('test_table');
      await repo.findAll({ status: 'active' });

      expect(pool.execute).toHaveBeenCalledWith(
        expect.stringContaining('WHERE'),
        expect.any(Array)
      );
    });

    it('should apply ordering', async () => {
      pool.execute.mockResolvedValue([[]]);

      const repo = new BaseRepository('test_table');
      await repo.findAll({}, { orderBy: 'created_at', order: 'DESC' });

      expect(pool.execute).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY'),
        expect.any(Array)
      );
    });

    it('should apply pagination', async () => {
      pool.execute.mockResolvedValue([[]]);

      const repo = new BaseRepository('test_table');
      await repo.findAll({}, { limit: 10, offset: 20 });

      expect(pool.execute).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT'),
        expect.any(Array)
      );
    });
  });

  describe('findById', () => {
    it('should return record by id', async () => {
      pool.execute.mockResolvedValue([[{ id: 1, name: 'Test' }]]);

      const repo = new BaseRepository('test_table');
      const result = await repo.findById(1);

      expect(result).toEqual({ id: 1, name: 'Test' });
    });

    it('should return null if not found', async () => {
      pool.execute.mockResolvedValue([[]]);

      const repo = new BaseRepository('test_table');
      const result = await repo.findById(999);

      expect(result).toBeNull();
    });
  });

  describe('findOne', () => {
    it('should return first matching record', async () => {
      pool.execute.mockResolvedValue([[{ id: 1, status: 'active' }]]);

      const repo = new BaseRepository('test_table');
      const result = await repo.findOne({ status: 'active' });

      expect(result).toEqual({ id: 1, status: 'active' });
    });
  });

  describe('create', () => {
    it('should insert new record', async () => {
      pool.execute.mockResolvedValue([{ insertId: 1 }]);

      const repo = new BaseRepository('test_table');
      const result = await repo.create({ name: 'New Item' });

      expect(result.id).toBe(1);
    });

    it('should handle multiple fields', async () => {
      pool.execute.mockResolvedValue([{ insertId: 1 }]);

      const repo = new BaseRepository('test_table');
      await repo.create({
        name: 'Item',
        status: 'active',
        value: 100
      });

      expect(pool.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO'),
        expect.any(Array)
      );
    });
  });

  describe('update', () => {
    it('should update record by id', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const repo = new BaseRepository('test_table');
      const result = await repo.update(1, { name: 'Updated' });

      expect(result).toBe(true);
    });

    it('should return false if no rows affected', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 0 }]);

      const repo = new BaseRepository('test_table');
      const result = await repo.update(999, { name: 'Updated' });

      expect(result).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete record by id', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const repo = new BaseRepository('test_table');
      const result = await repo.delete(1);

      expect(result).toBe(true);
    });
  });

  describe('count', () => {
    it('should return total count', async () => {
      pool.execute.mockResolvedValue([[{ count: 50 }]]);

      const repo = new BaseRepository('test_table');
      const count = await repo.count();

      expect(count).toBe(50);
    });

    it('should count with conditions', async () => {
      pool.execute.mockResolvedValue([[{ count: 10 }]]);

      const repo = new BaseRepository('test_table');
      const count = await repo.count({ status: 'active' });

      expect(count).toBe(10);
    });
  });

  describe('exists', () => {
    it('should return true if record exists', async () => {
      pool.execute.mockResolvedValue([[{ count: 1 }]]);

      const repo = new BaseRepository('test_table');
      const exists = await repo.exists({ id: 1 });

      expect(exists).toBe(true);
    });

    it('should return false if record does not exist', async () => {
      pool.execute.mockResolvedValue([[{ count: 0 }]]);

      const repo = new BaseRepository('test_table');
      const exists = await repo.exists({ id: 999 });

      expect(exists).toBe(false);
    });
  });

  describe('transaction', () => {
    it('should execute transaction successfully', async () => {
      mockConnection.execute.mockResolvedValue([{ insertId: 1 }]);

      const repo = new BaseRepository('test_table');
      const result = await repo.transaction(async (conn) => {
        await conn.execute('INSERT INTO test_table (name) VALUES (?)', ['Test']);
        return { success: true };
      });

      expect(mockConnection.beginTransaction).toHaveBeenCalled();
      expect(mockConnection.commit).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('should rollback on error', async () => {
      mockConnection.execute.mockRejectedValue(new Error('DB Error'));

      const repo = new BaseRepository('test_table');

      await expect(repo.transaction(async (conn) => {
        await conn.execute('INVALID SQL');
      })).rejects.toThrow();

      expect(mockConnection.rollback).toHaveBeenCalled();
    });
  });

  describe('bulkInsert', () => {
    it('should insert multiple records', async () => {
      mockConnection.execute.mockResolvedValue([{ affectedRows: 3 }]);

      const repo = new BaseRepository('test_table');
      const result = await repo.bulkInsert([
        { name: 'Item 1' },
        { name: 'Item 2' },
        { name: 'Item 3' }
      ]);

      expect(result.affectedRows).toBe(3);
    });
  });

  describe('softDelete', () => {
    it('should soft delete record', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const repo = new BaseRepository('test_table');
      const result = await repo.softDelete(1);

      expect(result).toBe(true);
      expect(pool.execute).toHaveBeenCalledWith(
        expect.stringContaining('deleted_at'),
        expect.any(Array)
      );
    });
  });
});
