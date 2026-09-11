/**
 * FAQ Model Unit Tests
 * Tests for FAQ model
 */

const FAQ = require('../../../models/FAQ');

// Mock dependencies
jest.mock('../../../config/database');
jest.mock('../../../config/logger');

describe('FAQ Model', () => {
  let mockPool;

  beforeEach(() => {
    // Mock pool with proper array destructuring support
    mockPool = {
      query: jest.fn().mockResolvedValue([[], {}]),
      getConnection: jest.fn().mockResolvedValue({
        beginTransaction: jest.fn(),
        commit: jest.fn(),
        rollback: jest.fn(),
        query: jest.fn().mockResolvedValue([[], {}]),
        release: jest.fn()
      })
    };

    const { pool } = require('../../../config/database');
    Object.assign(pool, mockPool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getByTenantId', () => {
    it('should return FAQs for valid tenant', async () => {
      const mockFAQs = [
        {
          id: 1,
          tenant_id: 1,
          question: 'What is your return policy?',
          answer: 'We accept returns within 30 days',
          active: true
        }
      ];

      mockPool.query.mockResolvedValueOnce([mockFAQs, {}]);

      const result = await FAQ.getByTenantId(1);

      expect(result).toEqual(mockFAQs);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM faqs WHERE tenant_id = ?'),
        [1]
      );
    });

    it('should filter by active status', async () => {
      mockPool.query.mockResolvedValueOnce([[], {}]);

      await FAQ.getByTenantId(1, true);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('AND active = TRUE'),
        [1]
      );
    });
  });

  describe('getById', () => {
    it('should return FAQ for valid ID and tenant', async () => {
      const mockFAQ = {
        id: 1,
        tenant_id: 1,
        question: 'Test question',
        answer: 'Test answer'
      };

      mockPool.query.mockResolvedValueOnce([[mockFAQ], {}]);

      const result = await FAQ.getById(1, 1);

      expect(result).toEqual(mockFAQ);
    });

    it('should return null if FAQ not found', async () => {
      mockPool.query.mockResolvedValueOnce([[], {}]);

      const result = await FAQ.getById(999, 1);

      expect(result).toBeNull();
    });
  });

  describe('search', () => {
    it('should search FAQs by term', async () => {
      const mockFAQs = [
        { id: 1, question: 'Shipping policy', answer: 'We ship worldwide' }
      ];

      mockPool.query.mockResolvedValueOnce([mockFAQs, {}]);

      const result = await FAQ.search(1, 'shipping');

      expect(result).toEqual(mockFAQs);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('LIKE ?'),
        [1, '%shipping%', '%shipping%']
      );
    });
  });

  describe('create', () => {
    it('should create new FAQ', async () => {
      const mockResult = { insertId: 1 };
      const mockFAQ = {
        id: 1,
        tenant_id: 1,
        question: 'New question',
        answer: 'New answer',
        active: true
      };

      mockPool.query
        .mockResolvedValueOnce([mockResult, {}])
        .mockResolvedValueOnce([[mockFAQ], {}]);

      const data = {
        question: 'New question',
        answer: 'New answer',
        active: true
      };

      const result = await FAQ.create(1, data);

      expect(result).toEqual(mockFAQ);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO faqs'),
        expect.arrayContaining([1, 'New question', 'New answer'])
      );
    });
  });

  describe('update', () => {
    it('should update existing FAQ', async () => {
      const mockFAQ = {
        id: 1,
        tenant_id: 1,
        question: 'Updated question',
        answer: 'Updated answer'
      };

      mockPool.query
        .mockResolvedValueOnce([{ affectedRows: 1 }, {}])
        .mockResolvedValueOnce([[mockFAQ], {}]);

      const data = {
        question: 'Updated question',
        answer: 'Updated answer'
      };

      const result = await FAQ.update(1, 1, data);

      expect(result).toEqual(mockFAQ);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE faqs SET'),
        expect.any(Array)
      );
    });

    it('should return existing FAQ if no updates', async () => {
      const mockFAQ = { id: 1, tenant_id: 1 };

      mockPool.query.mockResolvedValueOnce([[mockFAQ], {}]);

      const result = await FAQ.update(1, 1, {});

      expect(result).toEqual(mockFAQ);
    });
  });

  describe('delete', () => {
    it('should delete FAQ', async () => {
      mockPool.query.mockResolvedValueOnce([{ affectedRows: 1 }, {}]);

      const result = await FAQ.delete(1, 1);

      expect(result).toBe(true);
      expect(mockPool.query).toHaveBeenCalledWith(
        'DELETE FROM faqs WHERE id = ? AND tenant_id = ?',
        [1, 1]
      );
    });

    it('should return false if FAQ not found', async () => {
      mockPool.query.mockResolvedValueOnce([{ affectedRows: 0 }, {}]);

      const result = await FAQ.delete(999, 1);

      expect(result).toBe(false);
    });
  });

  describe('toggleActive', () => {
    it('should toggle FAQ active status', async () => {
      const mockFAQ = { id: 1, tenant_id: 1, active: true };
      const updatedFAQ = { ...mockFAQ, active: false };

      mockPool.query
        .mockResolvedValueOnce([[mockFAQ], {}])
        .mockResolvedValueOnce([{ affectedRows: 1 }, {}])
        .mockResolvedValueOnce([[updatedFAQ], {}]);

      const result = await FAQ.toggleActive(1, 1);

      expect(result.active).toBe(false);
    });
  });

  describe('reorder', () => {
    it('should reorder FAQs', async () => {
      const mockConnection = await mockPool.getConnection();

      const result = await FAQ.reorder(1, [3, 1, 2]);

      expect(result).toBe(true);
      expect(mockConnection.beginTransaction).toHaveBeenCalled();
      expect(mockConnection.commit).toHaveBeenCalled();
    });
  });

  describe('getStatistics', () => {
    it('should return FAQ statistics', async () => {
      const mockStats = {
        total: 10,
        active: 7,
        inactive: 3
      };

      mockPool.query.mockResolvedValueOnce([[mockStats], {}]);

      const stats = await FAQ.getStatistics(1);

      expect(stats).toMatchObject({
        total: 10,
        active: 7,
        inactive: 3
      });
    });

    it('should return zero stats if no FAQs', async () => {
      mockPool.query.mockResolvedValueOnce([[{ total: 0, active: 0, inactive: 0 }], {}]);

      const stats = await FAQ.getStatistics(999);

      expect(stats).toMatchObject({
        total: 0,
        active: 0,
        inactive: 0
      });
    });
  });
});
