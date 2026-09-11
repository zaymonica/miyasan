/**
 * Department Model Unit Tests
 */

const Department = require('../../../models/Department');

// Mock dependencies
jest.mock('../../../config/database', () => ({
  pool: {
    execute: jest.fn(),
    getConnection: jest.fn()
  }
}));

const { pool } = require('../../../config/database');

describe('Department Model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return all departments for tenant', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, name: 'Sales', description: 'Sales department' },
        { id: 2, name: 'Support', description: 'Support department' }
      ]]);

      const departments = await Department.findAll(1);

      expect(departments).toHaveLength(2);
    });
  });

  describe('findById', () => {
    it('should return department by id', async () => {
      pool.execute.mockResolvedValue([[{
        id: 1,
        name: 'Sales',
        description: 'Sales department'
      }]]);

      const department = await Department.findById(1, 1);

      expect(department).toEqual(expect.objectContaining({
        id: 1,
        name: 'Sales'
      }));
    });

    it('should return null if department not found', async () => {
      pool.execute.mockResolvedValue([[]]);

      const department = await Department.findById(1, 999);

      expect(department).toBeNull();
    });
  });

  describe('findByName', () => {
    it('should return department by name', async () => {
      pool.execute.mockResolvedValue([[{
        id: 1,
        name: 'Sales'
      }]]);

      const department = await Department.findByName(1, 'Sales');

      expect(department.name).toBe('Sales');
    });
  });

  describe('create', () => {
    it('should create new department', async () => {
      pool.execute.mockResolvedValue([{ insertId: 1 }]);

      const department = await Department.create(1, {
        name: 'New Department',
        description: 'New department description'
      });

      expect(department.id).toBe(1);
    });

    it('should handle duplicate name error', async () => {
      pool.execute.mockRejectedValue({ code: 'ER_DUP_ENTRY' });

      await expect(Department.create(1, {
        name: 'Existing Department'
      })).rejects.toThrow();
    });
  });

  describe('update', () => {
    it('should update department', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await Department.update(1, 1, {
        name: 'Updated Department',
        description: 'Updated description'
      });

      expect(result).toBe(true);
    });

    it('should return false if department not found', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 0 }]);

      const result = await Department.update(1, 999, { name: 'Test' });

      expect(result).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete department', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await Department.delete(1, 1);

      expect(result).toBe(true);
    });
  });

  describe('count', () => {
    it('should return department count for tenant', async () => {
      pool.execute.mockResolvedValue([[{ count: 3 }]]);

      const count = await Department.count(1);

      expect(count).toBe(3);
    });
  });

  describe('getUsers', () => {
    it('should return users in department', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, name: 'User 1', department: 'Sales' },
        { id: 2, name: 'User 2', department: 'Sales' }
      ]]);

      const users = await Department.getUsers(1, 1);

      expect(users).toHaveLength(2);
    });
  });
});
