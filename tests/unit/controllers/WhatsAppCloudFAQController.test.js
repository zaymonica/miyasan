/**
 * WhatsAppCloudFAQController Unit Tests
 * Tests for WhatsApp Cloud FAQ management
 */

const WhatsAppCloudFAQController = require('../../../controllers/WhatsAppCloudFAQController');
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

describe('WhatsAppCloudFAQController', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();
    
    req = {
      body: {},
      params: {},
      query: {},
      user: { id: 1, tenantId: 1, role: 'admin' },
      tenantId: 1
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    pool.execute = jest.fn();
  });

  describe('list', () => {
    it('should list all FAQs for tenant and account', async () => {
      req.query.accountId = '123';

      const mockFAQs = [
        {
          id: 1,
          question: 'What are your hours?',
          answer: 'We are open 9-5',
          category: 'general',
          keywords: 'hours,time,open',
          is_active: true,
          usage_count: 10
        }
      ];

      pool.execute.mockResolvedValueOnce([mockFAQs]);

      await WhatsAppCloudFAQController.list(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({
            question: 'What are your hours?',
            answer: 'We are open 9-5'
          })
        ])
      });
    });

    it('should filter by category if provided', async () => {
      req.query.accountId = '123';
      req.query.category = 'billing';

      pool.execute.mockResolvedValueOnce([[]]);

      await WhatsAppCloudFAQController.list(req, res);

      expect(pool.execute).toHaveBeenCalledWith(
        expect.stringContaining('category = ?'),
        expect.arrayContaining([1, '123', 'billing'])
      );
    });

    it('should return error if account ID missing', async () => {
      req.query = {};

      await WhatsAppCloudFAQController.list(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: expect.stringContaining('Account ID')
      });
    });
  });

  describe('get', () => {
    it('should get FAQ by ID', async () => {
      req.params.id = '1';

      const mockFAQ = {
        id: 1,
        question: 'Test question?',
        answer: 'Test answer',
        category: 'general',
        keywords: 'test',
        is_active: true
      };

      pool.execute.mockResolvedValueOnce([[mockFAQ]]);

      await WhatsAppCloudFAQController.get(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          question: 'Test question?'
        })
      });
    });

    it('should return 404 if FAQ not found', async () => {
      req.params.id = '999';
      pool.execute.mockResolvedValueOnce([[]]);

      await WhatsAppCloudFAQController.get(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'FAQ not found'
      });
    });
  });

  describe('create', () => {
    it('should create new FAQ', async () => {
      req.body = {
        accountId: '123',
        question: 'New question?',
        answer: 'New answer',
        category: 'general',
        keywords: 'new,test'
      };

      pool.execute.mockResolvedValueOnce([{ insertId: 1 }]);

      await WhatsAppCloudFAQController.create(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'FAQ created successfully',
        data: { id: 1 }
      });
    });

    it('should return error if required fields missing', async () => {
      req.body = {
        accountId: '123',
        question: 'Question?'
        // Missing answer
      };

      await WhatsAppCloudFAQController.create(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: expect.stringContaining('required')
      });
    });

    it('should set default category if not provided', async () => {
      req.body = {
        accountId: '123',
        question: 'Test?',
        answer: 'Answer'
      };

      pool.execute.mockResolvedValueOnce([{ insertId: 1 }]);

      await WhatsAppCloudFAQController.create(req, res);

      expect(pool.execute).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          1,
          '123',
          'Test?',
          'Answer',
          'general', // default category
          expect.any(String),
          true
        ])
      );
    });
  });

  describe('update', () => {
    it('should update existing FAQ', async () => {
      req.params.id = '1';
      req.body = {
        question: 'Updated question?',
        answer: 'Updated answer',
        is_active: false
      };

      pool.execute
        .mockResolvedValueOnce([[{ id: 1 }]]) // Check exists
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // Update

      await WhatsAppCloudFAQController.update(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'FAQ updated successfully'
      });
    });

    it('should return 404 if FAQ not found', async () => {
      req.params.id = '999';
      req.body = { question: 'Test?' };

      pool.execute.mockResolvedValueOnce([[]]);

      await WhatsAppCloudFAQController.update(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'FAQ not found'
      });
    });
  });

  describe('delete', () => {
    it('should delete FAQ', async () => {
      req.params.id = '1';

      pool.execute
        .mockResolvedValueOnce([[{ id: 1 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      await WhatsAppCloudFAQController.delete(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'FAQ deleted successfully'
      });
    });

    it('should return 404 if FAQ not found', async () => {
      req.params.id = '999';
      pool.execute.mockResolvedValueOnce([[]]);

      await WhatsAppCloudFAQController.delete(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('search', () => {
    it('should search FAQs by query', async () => {
      req.query.accountId = '123';
      req.query.q = 'hours';

      const mockResults = [
        {
          id: 1,
          question: 'What are your hours?',
          answer: 'We are open 9-5',
          relevance_score: 0.95
        }
      ];

      pool.execute.mockResolvedValueOnce([mockResults]);

      await WhatsAppCloudFAQController.search(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({
            question: expect.stringContaining('hours')
          })
        ])
      });
    });

    it('should return error if search query missing', async () => {
      req.query.accountId = '123';
      req.query.q = '';

      await WhatsAppCloudFAQController.search(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: expect.stringContaining('Search query')
      });
    });

    it('should limit results by query parameter', async () => {
      req.query.accountId = '123';
      req.query.q = 'test';
      req.query.limit = '5';

      pool.execute.mockResolvedValueOnce([[]]);

      await WhatsAppCloudFAQController.search(req, res);

      expect(pool.execute).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT ?'),
        expect.arrayContaining([5])
      );
    });
  });

  describe('getStats', () => {
    it('should get FAQ statistics', async () => {
      req.query.accountId = '123';

      const mockStats = {
        total_faqs: 50,
        active_faqs: 45,
        total_usage: 1000,
        avg_usage: 20,
        top_faqs: []
      };

      pool.execute.mockResolvedValueOnce([[mockStats]]);

      await WhatsAppCloudFAQController.getStats(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          total_faqs: 50,
          active_faqs: 45
        })
      });
    });
  });

  describe('bulkImport', () => {
    it('should import multiple FAQs', async () => {
      req.body = {
        accountId: '123',
        faqs: [
          { question: 'Q1?', answer: 'A1', category: 'general' },
          { question: 'Q2?', answer: 'A2', category: 'billing' }
        ]
      };

      pool.execute
        .mockResolvedValueOnce([{ insertId: 1 }])
        .mockResolvedValueOnce([{ insertId: 2 }]);

      await WhatsAppCloudFAQController.bulkImport(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: expect.stringContaining('2 FAQs imported'),
        data: { imported: 2, failed: 0 }
      });
    });

    it('should handle partial import failures', async () => {
      req.body = {
        accountId: '123',
        faqs: [
          { question: 'Q1?', answer: 'A1' },
          { question: 'Q2?', answer: 'A2' }
        ]
      };

      pool.execute
        .mockResolvedValueOnce([{ insertId: 1 }])
        .mockRejectedValueOnce(new Error('Duplicate'));

      await WhatsAppCloudFAQController.bulkImport(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: expect.any(String),
        data: { imported: 1, failed: 1 }
      });
    });

    it('should return error if FAQs array empty', async () => {
      req.body = {
        accountId: '123',
        faqs: []
      };

      await WhatsAppCloudFAQController.bulkImport(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: expect.stringContaining('FAQs array')
      });
    });
  });

  describe('reorder', () => {
    it('should reorder FAQs', async () => {
      req.body = {
        accountId: '123',
        order: [3, 1, 2] // New order of FAQ IDs
      };

      pool.execute
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      await WhatsAppCloudFAQController.reorder(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'FAQs reordered successfully'
      });
    });

    it('should return error if order array invalid', async () => {
      req.body = {
        accountId: '123',
        order: []
      };

      await WhatsAppCloudFAQController.reorder(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: expect.stringContaining('Order array')
      });
    });
  });
});
