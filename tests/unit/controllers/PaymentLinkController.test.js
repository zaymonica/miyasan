/**
 * PaymentLinkController Unit Tests
 */

const PaymentLinkController = require('../../../controllers/PaymentLinkController');

// Mock dependencies
jest.mock('../../../config/database', () => ({
  pool: {
    getConnection: jest.fn()
  }
}));

jest.mock('../../../config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

const { pool } = require('../../../config/database');

describe('PaymentLinkController', () => {
  let mockConnection;
  let mockReq;
  let mockRes;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConnection = {
      execute: jest.fn(),
      query: jest.fn(),
      release: jest.fn()
    };

    pool.getConnection.mockResolvedValue(mockConnection);

    mockReq = {
      user: { tenantId: 1, id: 1 },
      params: {},
      body: {},
      query: {},
      t: jest.fn((key) => key)
    };

    mockRes = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis()
    };
  });

  describe('getLinks', () => {
    it('should return paginated payment links', async () => {
      const mockLinks = [
        { id: 1, title: 'Test Link', amount: 100 }
      ];
      mockConnection.query
        .mockResolvedValueOnce([mockLinks])
        .mockResolvedValueOnce([[{ total: 1 }]]);

      await PaymentLinkController.getLinks(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockLinks,
        pagination: expect.objectContaining({
          page: 1,
          limit: 20,
          total: 1
        })
      });
    });

    it('should filter by status', async () => {
      mockReq.query = { status: 'active' };
      mockConnection.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ total: 0 }]]);

      await PaymentLinkController.getLinks(mockReq, mockRes);

      expect(mockConnection.query).toHaveBeenCalledWith(
        expect.stringContaining('AND status = ?'),
        expect.arrayContaining(['active'])
      );
    });

    it('should handle errors', async () => {
      mockConnection.query.mockRejectedValue(new Error('DB error'));

      await PaymentLinkController.getLinks(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('createLink', () => {
    it('should create payment link', async () => {
      mockReq.body = {
        title: 'Test Payment',
        amount: 100,
        description: 'Test description'
      };

      mockConnection.query.mockResolvedValue([{ insertId: 1 }]);

      await PaymentLinkController.createLink(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'payment_link.created',
        data: expect.objectContaining({ id: 1 })
      });
    });

    it('should validate required fields', async () => {
      mockReq.body = { title: 'Test' };

      await PaymentLinkController.createLink(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'validation.required_fields'
      });
    });

    it('should use default currency', async () => {
      mockReq.body = { title: 'Test', amount: 100 };
      mockConnection.query.mockResolvedValue([{ insertId: 1 }]);

      await PaymentLinkController.createLink(mockReq, mockRes);

      expect(mockConnection.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['USD'])
      );
    });

    it('should handle errors', async () => {
      mockReq.body = { title: 'Test', amount: 100 };
      mockConnection.query.mockRejectedValue(new Error('DB error'));

      await PaymentLinkController.createLink(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('updateLink', () => {
    it('should update payment link', async () => {
      mockReq.params.id = '1';
      mockReq.body = { title: 'Updated Title', amount: 200 };
      mockConnection.query.mockResolvedValue([{ affectedRows: 1 }]);

      await PaymentLinkController.updateLink(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'payment_link.updated'
      });
    });

    it('should return 400 if no fields to update', async () => {
      mockReq.params.id = '1';
      mockReq.body = {};

      await PaymentLinkController.updateLink(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'validation.no_fields_to_update'
      });
    });

    it('should update status', async () => {
      mockReq.params.id = '1';
      mockReq.body = { status: 'inactive' };
      mockConnection.query.mockResolvedValue([{ affectedRows: 1 }]);

      await PaymentLinkController.updateLink(mockReq, mockRes);

      expect(mockConnection.query).toHaveBeenCalledWith(
        expect.stringContaining('status = ?'),
        expect.arrayContaining(['inactive'])
      );
    });

    it('should handle errors', async () => {
      mockReq.params.id = '1';
      mockReq.body = { title: 'Test' };
      mockConnection.query.mockRejectedValue(new Error('DB error'));

      await PaymentLinkController.updateLink(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('deleteLink', () => {
    it('should delete payment link', async () => {
      mockReq.params.id = '1';
      mockConnection.query.mockResolvedValue([{ affectedRows: 1 }]);

      await PaymentLinkController.deleteLink(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'payment_link.deleted'
      });
    });

    it('should handle errors', async () => {
      mockReq.params.id = '1';
      mockConnection.query.mockRejectedValue(new Error('DB error'));

      await PaymentLinkController.deleteLink(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });
});
