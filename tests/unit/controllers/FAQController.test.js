/**
 * FAQ Controller Unit Tests
 * Tests for FAQ controller
 */

const FAQController = require('../../../controllers/FAQController');
const FAQ = require('../../../models/FAQ');

// Mock dependencies
jest.mock('../../../models/FAQ');
jest.mock('../../../config/logger');
jest.mock('../../../utils/sanitizer');

describe('FAQController', () => {
  let req, res;

  beforeEach(() => {
    req = {
      user: { id: 1, tenantId: 1 },
      params: {},
      query: {},
      body: {}
    };

    res = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis()
    };

    jest.clearAllMocks();
  });

  describe('list', () => {
    it('should list all FAQs for tenant', async () => {
      const mockFAQs = [
        { id: 1, question: 'Q1', answer: 'A1' },
        { id: 2, question: 'Q2', answer: 'A2' }
      ];

      FAQ.getByTenantId.mockResolvedValue(mockFAQs);

      await FAQController.list(req, res);

      expect(FAQ.getByTenantId).toHaveBeenCalledWith(1, false);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockFAQs
      });
    });

    it('should filter by active status', async () => {
      req.query.active = 'true';
      FAQ.getByTenantId.mockResolvedValue([]);

      await FAQController.list(req, res);

      expect(FAQ.getByTenantId).toHaveBeenCalledWith(1, true);
    });

    it('should handle errors', async () => {
      FAQ.getByTenantId.mockRejectedValue(new Error('Database error'));

      await FAQController.list(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to load FAQs'
      });
    });
  });

  describe('getById', () => {
    it('should return FAQ by ID', async () => {
      const mockFAQ = { id: 1, question: 'Q1', answer: 'A1' };
      req.params.id = '1';

      FAQ.getById.mockResolvedValue(mockFAQ);

      await FAQController.getById(req, res);

      expect(FAQ.getById).toHaveBeenCalledWith('1', 1);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockFAQ
      });
    });

    it('should return 404 if FAQ not found', async () => {
      req.params.id = '999';
      FAQ.getById.mockResolvedValue(null);

      await FAQController.getById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'FAQ not found'
      });
    });
  });

  describe('search', () => {
    it('should search FAQs', async () => {
      req.query.q = 'shipping';
      const mockFAQs = [{ id: 1, question: 'Shipping policy' }];

      const { sanitizeInput } = require('../../../utils/sanitizer');
      sanitizeInput.mockReturnValue('shipping');

      FAQ.search.mockResolvedValue(mockFAQs);

      await FAQController.search(req, res);

      expect(FAQ.search).toHaveBeenCalledWith(1, 'shipping');
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockFAQs
      });
    });

    it('should return 400 if query missing', async () => {
      await FAQController.search(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Search query is required'
      });
    });
  });

  describe('create', () => {
    it('should create new FAQ', async () => {
      req.body = {
        question: 'New question',
        answer: 'New answer',
        active: true
      };

      const mockFAQ = { id: 1, ...req.body };
      FAQ.create.mockResolvedValue(mockFAQ);

      await FAQController.create(req, res);

      expect(FAQ.create).toHaveBeenCalledWith(1, expect.any(Object));
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'FAQ created successfully',
        data: mockFAQ
      });
    });

    it('should validate required fields', async () => {
      req.body = { question: 'Q' };

      await FAQController.create(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Question and answer are required'
      });
    });

    it('should validate question length', async () => {
      req.body = {
        question: 'Q',
        answer: 'Valid answer'
      };

      await FAQController.create(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Question must be between 5 and 500 characters'
      });
    });

    it('should validate answer length', async () => {
      req.body = {
        question: 'Valid question',
        answer: 'Short'
      };

      await FAQController.create(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Answer must be at least 10 characters'
      });
    });
  });

  describe('update', () => {
    it('should update existing FAQ', async () => {
      req.params.id = '1';
      req.body = {
        question: 'Updated question',
        answer: 'Updated answer'
      };

      const mockFAQ = { id: 1, ...req.body };
      FAQ.getById.mockResolvedValue({ id: 1 });
      FAQ.update.mockResolvedValue(mockFAQ);

      await FAQController.update(req, res);

      expect(FAQ.update).toHaveBeenCalledWith('1', 1, expect.any(Object));
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'FAQ updated successfully',
        data: mockFAQ
      });
    });

    it('should return 404 if FAQ not found', async () => {
      req.params.id = '999';
      FAQ.getById.mockResolvedValue(null);

      await FAQController.update(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'FAQ not found'
      });
    });
  });

  describe('delete', () => {
    it('should delete FAQ', async () => {
      req.params.id = '1';
      FAQ.delete.mockResolvedValue(true);

      await FAQController.delete(req, res);

      expect(FAQ.delete).toHaveBeenCalledWith('1', 1);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'FAQ deleted successfully'
      });
    });

    it('should return 404 if FAQ not found', async () => {
      req.params.id = '999';
      FAQ.delete.mockResolvedValue(false);

      await FAQController.delete(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('toggleActive', () => {
    it('should toggle FAQ status', async () => {
      req.params.id = '1';
      const mockFAQ = { id: 1, active: false };
      FAQ.toggleActive.mockResolvedValue(mockFAQ);

      await FAQController.toggleActive(req, res);

      expect(FAQ.toggleActive).toHaveBeenCalledWith('1', 1);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'FAQ status updated successfully',
        data: mockFAQ
      });
    });
  });

  describe('reorder', () => {
    it('should reorder FAQs', async () => {
      req.body.order = [3, 1, 2];
      FAQ.reorder.mockResolvedValue(true);

      await FAQController.reorder(req, res);

      expect(FAQ.reorder).toHaveBeenCalledWith(1, [3, 1, 2]);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'FAQs reordered successfully'
      });
    });

    it('should validate order array', async () => {
      req.body.order = 'not an array';

      await FAQController.reorder(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Order must be an array'
      });
    });
  });

  describe('getStatistics', () => {
    it('should return FAQ statistics', async () => {
      const mockStats = { total: 10, active: 7, inactive: 3 };
      FAQ.getStatistics.mockResolvedValue(mockStats);

      await FAQController.getStatistics(req, res);

      expect(FAQ.getStatistics).toHaveBeenCalledWith(1);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockStats
      });
    });
  });
});
