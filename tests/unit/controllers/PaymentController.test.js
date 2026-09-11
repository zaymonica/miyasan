/**
 * Payment Controller Tests
 * Unit tests for payment management functionality
 */

const PaymentController = require('../../../controllers/PaymentController');
const { pool } = require('../../../config/database');

// Mock dependencies
jest.mock('../../../config/database');
jest.mock('../../../services/paypalService');
jest.mock('../../../services/pagbankService');

describe('PaymentController', () => {
  let mockConnection;
  let mockReq;
  let mockRes;

  beforeEach(() => {
    // Mock database connection
    mockConnection = {
      execute: jest.fn(),
      release: jest.fn()
    };

    pool.getConnection = jest.fn().mockResolvedValue(mockConnection);

    // Mock request and response
    mockReq = {
      user: {
        userId: 1,
        tenantId: 1
      },
      body: {},
      params: {},
      query: {}
    };

    mockRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getPaymentMethods', () => {
    it('should return payment methods for tenant', async () => {
      const mockMethods = [
        {
          id: 1,
          method_name: 'paypal',
          sandbox_mode: true,
          active: true,
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      mockConnection.execute
        .mockResolvedValueOnce([mockMethods])
        .mockResolvedValueOnce([[{ api_key: 'encrypted_key', api_secret: 'encrypted_secret' }]]);

      await PaymentController.getPaymentMethods(mockReq, mockRes);

      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id, method_name'),
        [1]
      );
      expect(mockRes.json).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockConnection.execute.mockRejectedValue(new Error('Database error'));

      await PaymentController.getPaymentMethods(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockConnection.release).toHaveBeenCalled();
    });
  });

  describe('configurePaymentMethod', () => {
    it('should configure new payment method', async () => {
      mockReq.body = {
        method_name: 'paypal',
        api_key: 'test_key',
        api_secret: 'test_secret',
        sandbox_mode: true
      };

      mockConnection.execute
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ insertId: 1 }]);

      await PaymentController.configurePaymentMethod(mockReq, mockRes);

      expect(mockConnection.execute).toHaveBeenCalledTimes(2);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: expect.stringContaining('PAYPAL')
      });
      expect(mockConnection.release).toHaveBeenCalled();
    });

    it('should update existing payment method', async () => {
      mockReq.body = {
        method_name: 'paypal',
        api_key: 'test_key',
        api_secret: 'test_secret',
        sandbox_mode: true
      };

      mockConnection.execute
        .mockResolvedValueOnce([[{ id: 1 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      await PaymentController.configurePaymentMethod(mockReq, mockRes);

      expect(mockConnection.execute).toHaveBeenCalledTimes(2);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: expect.stringContaining('PAYPAL')
      });
    });

    it('should validate required fields', async () => {
      mockReq.body = {
        method_name: 'paypal'
        // Missing api_key and api_secret
      };

      await PaymentController.configurePaymentMethod(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: expect.stringContaining('required')
      });
    });

    it('should validate payment method', async () => {
      mockReq.body = {
        method_name: 'invalid_method',
        api_key: 'test_key',
        api_secret: 'test_secret'
      };

      await PaymentController.configurePaymentMethod(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: expect.stringContaining('not supported')
      });
    });
  });

  describe('togglePaymentMethod', () => {
    it('should toggle payment method status', async () => {
      mockReq.params = { id: 1 };
      mockReq.body = { active: true };

      mockConnection.execute
        .mockResolvedValueOnce([[{ id: 1 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      await PaymentController.togglePaymentMethod(mockReq, mockRes);

      expect(mockConnection.execute).toHaveBeenCalledTimes(2);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: expect.stringContaining('activated')
      });
    });

    it('should return 404 if method not found', async () => {
      mockReq.params = { id: 999 };
      mockReq.body = { active: true };

      mockConnection.execute.mockResolvedValueOnce([[]]);

      await PaymentController.togglePaymentMethod(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Payment method not found'
      });
    });

    it('should validate active field', async () => {
      mockReq.params = { id: 1 };
      mockReq.body = { active: 'invalid' };

      await PaymentController.togglePaymentMethod(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('createPaymentLink', () => {
    it('should create payment link successfully', async () => {
      mockReq.body = {
        payment_method: 'paypal',
        amount: 100.00,
        customer_phone: '5511999999999',
        customer_name: 'John Doe',
        description: 'Test payment'
      };

      const mockMethod = {
        id: 1,
        method_name: 'paypal',
        api_key: 'encrypted_key',
        api_secret: 'encrypted_secret',
        sandbox_mode: true,
        active: true
      };

      mockConnection.execute
        .mockResolvedValueOnce([[mockMethod]])
        .mockResolvedValueOnce([{ insertId: 1 }]);

      // Mock PayPal service
      const PayPalService = require('../../../services/paypalService');
      PayPalService.mockImplementation(() => ({
        createPayment: jest.fn().mockResolvedValue({
          success: true,
          payment_id: 'PAY123',
          payment_url: 'https://paypal.com/pay/PAY123'
        })
      }));

      await PaymentController.createPaymentLink(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        payment_link: expect.objectContaining({
          id: 1,
          payment_url: expect.any(String),
          payment_id: expect.any(String)
        })
      });
    });

    it('should validate required fields', async () => {
      mockReq.body = {
        payment_method: 'paypal'
        // Missing amount and customer_phone
      };

      await PaymentController.createPaymentLink(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should validate amount is positive', async () => {
      mockReq.body = {
        payment_method: 'paypal',
        amount: -10,
        customer_phone: '5511999999999'
      };

      await PaymentController.createPaymentLink(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: expect.stringContaining('greater than zero')
      });
    });

    it('should check if payment method is active', async () => {
      mockReq.body = {
        payment_method: 'paypal',
        amount: 100,
        customer_phone: '5511999999999'
      };

      mockConnection.execute.mockResolvedValueOnce([[]]);

      await PaymentController.createPaymentLink(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: expect.stringContaining('not configured or active')
      });
    });
  });

  describe('listPaymentLinks', () => {
    it('should list payment links with pagination', async () => {
      const mockLinks = [
        {
          id: 1,
          payment_method: 'paypal',
          amount: 100.00,
          status: 'pending',
          created_at: new Date()
        }
      ];

      mockConnection.execute
        .mockResolvedValueOnce([mockLinks])
        .mockResolvedValueOnce([[{ total: 1 }]]);

      await PaymentController.listPaymentLinks(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        links: mockLinks,
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1
      });
    });

    it('should filter by status', async () => {
      mockReq.query = { status: 'paid' };

      mockConnection.execute
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ total: 0 }]]);

      await PaymentController.listPaymentLinks(mockReq, mockRes);

      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining('AND p.status = ?'),
        expect.arrayContaining(['paid'])
      );
    });

    it('should filter by method', async () => {
      mockReq.query = { method: 'paypal' };

      mockConnection.execute
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ total: 0 }]]);

      await PaymentController.listPaymentLinks(mockReq, mockRes);

      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining('AND p.payment_method = ?'),
        expect.arrayContaining(['paypal'])
      );
    });
  });

  describe('checkPaymentStatus', () => {
    it('should check payment status', async () => {
      mockReq.params = { id: 1 };

      const mockLink = {
        id: 1,
        payment_method: 'paypal',
        payment_id: 'PAY123',
        status: 'pending',
        amount: 100.00
      };

      const mockMethod = {
        api_key: 'encrypted_key',
        api_secret: 'encrypted_secret',
        sandbox_mode: true
      };

      mockConnection.execute
        .mockResolvedValueOnce([[mockLink]])
        .mockResolvedValueOnce([[mockMethod]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      // Mock PayPal service
      const PayPalService = require('../../../services/paypalService');
      PayPalService.mockImplementation(() => ({
        getPaymentStatus: jest.fn().mockResolvedValue({
          status: 'paid',
          paid_at: new Date()
        })
      }));

      await PaymentController.checkPaymentStatus(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        id: 1,
        status: 'paid',
        amount: 100.00,
        paid_at: expect.any(Date),
        expires_at: mockLink.expires_at
      });
    });

    it('should return 404 if payment not found', async () => {
      mockReq.params = { id: 999 };

      mockConnection.execute.mockResolvedValueOnce([[]]);

      await PaymentController.checkPaymentStatus(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  describe('getPaymentStats', () => {
    it('should return payment statistics', async () => {
      mockConnection.execute
        .mockResolvedValueOnce([[{ count: 5, total: 500.00 }]])
        .mockResolvedValueOnce([[{ count: 2 }]])
        .mockResolvedValueOnce([[{ total: 10, paid: 8 }]]);

      await PaymentController.getPaymentStats(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        today: {
          count: 5,
          total: 500.00
        },
        pending: 2,
        success_rate: 80.0
      });
    });

    it('should handle zero payments', async () => {
      mockConnection.execute
        .mockResolvedValueOnce([[{ count: 0, total: 0 }]])
        .mockResolvedValueOnce([[{ count: 0 }]])
        .mockResolvedValueOnce([[{ total: 0, paid: 0 }]]);

      await PaymentController.getPaymentStats(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        today: {
          count: 0,
          total: 0
        },
        pending: 0,
        success_rate: 0
      });
    });
  });

  describe('Encryption/Decryption', () => {
    it('should encrypt and decrypt data correctly', () => {
      const originalText = 'test_secret_key';

      const encrypted = PaymentController.encryptData(originalText);
      expect(encrypted).not.toBe(originalText);
      expect(encrypted).toContain(':');

      const decrypted = PaymentController.decryptData(encrypted);
      expect(decrypted).toBe(originalText);
    });

    it('should generate different encrypted values for same input', () => {
      const text = 'test_key';

      const encrypted1 = PaymentController.encryptData(text);
      const encrypted2 = PaymentController.encryptData(text);

      expect(encrypted1).not.toBe(encrypted2);

      const decrypted1 = PaymentController.decryptData(encrypted1);
      const decrypted2 = PaymentController.decryptData(encrypted2);

      expect(decrypted1).toBe(text);
      expect(decrypted2).toBe(text);
    });
  });
});
