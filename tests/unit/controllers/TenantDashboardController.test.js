/**
 * TenantDashboardController Unit Tests
 * Tests for tenant dashboard metrics and statistics
 */

const TenantDashboardController = require('../../../controllers/TenantDashboardController');
const { pool } = require('../../../config/database');

// Mock dependencies
jest.mock('../../../config/database');
jest.mock('../../../services/WhatsAppService', () => ({
  getWhatsAppService: jest.fn()
}));

describe('TenantDashboardController', () => {
  let mockReq;
  let mockRes;
  let mockConnection;

  beforeEach(() => {
    jest.clearAllMocks();

    mockReq = {
      user: {
        id: 1,
        tenantId: 1,
        role: 'admin'
      },
      tenantId: 1,
      app: {
        get: jest.fn()
      }
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    mockConnection = {
      query: jest.fn(),
      execute: jest.fn(),
      release: jest.fn()
    };

    pool.getConnection = jest.fn().mockResolvedValue(mockConnection);
  });

  describe('getMetrics', () => {
    it('should return dashboard metrics successfully', async () => {
      // Mock all database queries
      mockConnection.query
        .mockResolvedValueOnce([[{ count: 50 }]]) // Today's messages
        .mockResolvedValueOnce([[{ count: 500 }]]) // Month messages
        .mockResolvedValueOnce([[{ count: 10 }]]) // Active conversations
        .mockResolvedValueOnce([[{ count: 100 }]]) // Total contacts
        .mockResolvedValueOnce([[{ count: 5 }]]) // Unique contacts today
        .mockResolvedValueOnce([[]]) // Hourly stats
        .mockResolvedValueOnce([[]]) // Conversation stats
        .mockResolvedValueOnce([[]]) // Daily messages
        .mockResolvedValueOnce([[]]) // Recent conversations
        .mockResolvedValueOnce([[]]) // Usage stats
        .mockResolvedValueOnce([[]]) // Plan limits
        .mockResolvedValueOnce([[{ count: 3 }]]) // Waiting conversations
        .mockResolvedValueOnce([[{ count: 2 }]]) // Invoices pending
        .mockResolvedValueOnce([[{ count: 1 }]]) // Invoices accepted
        .mockResolvedValueOnce([[{ count: 5 }]]); // Invoices paid

      await TenantDashboardController.getMetrics(mockReq, mockRes);

      expect(mockConnection.query).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          todayMessages: 50,
          waitingConversations: 3,
          activeConversations: 10,
          invoicesPending: 2,
          invoicesAccepted: 1,
          invoicesPaid: 5
        }
      });
      expect(mockConnection.release).toHaveBeenCalled();
    });

    it('should handle missing data gracefully', async () => {
      // Mock queries returning empty results
      mockConnection.query.mockResolvedValue([[]]);

      await TenantDashboardController.getMetrics(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          todayMessages: 0,
          waitingConversations: 0,
          activeConversations: 0,
          invoicesPending: 0,
          invoicesAccepted: 0,
          invoicesPaid: 0
        }
      });
    });

    it('should handle database errors', async () => {
      mockConnection.query.mockRejectedValue(new Error('Database error'));

      await TenantDashboardController.getMetrics(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Internal server error',
        error: 'Database error'
      });
      expect(mockConnection.release).toHaveBeenCalled();
    });

    it('should use tenantId from user if not in request', async () => {
      mockReq.tenantId = null;
      mockConnection.query.mockResolvedValue([[]]);

      await TenantDashboardController.getMetrics(mockReq, mockRes);

      expect(mockConnection.query).toHaveBeenCalled();
      const firstCall = mockConnection.query.mock.calls[0];
      expect(firstCall[1]).toContain(1); // tenantId from user
    });
  });

  describe('getWhatsAppStatus', () => {
    it('should return WhatsApp status successfully', async () => {
      const mockWhatsAppService = {
        getStatus: jest.fn().mockReturnValue({
          connected: true,
          qr: null,
          phone: '5511999999999'
        })
      };

      const { getWhatsAppService } = require('../../../services/WhatsAppService');
      getWhatsAppService.mockReturnValue(mockWhatsAppService);
      mockReq.app.get.mockReturnValue({});

      await TenantDashboardController.getWhatsAppStatus(mockReq, mockRes);

      expect(mockWhatsAppService.getStatus).toHaveBeenCalledWith(1);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          connected: true,
          qr: null,
          phone: '5511999999999'
        }
      });
    });

    it('should handle WhatsApp service errors', async () => {
      const { getWhatsAppService } = require('../../../services/WhatsAppService');
      getWhatsAppService.mockImplementation(() => {
        throw new Error('WhatsApp service error');
      });

      await TenantDashboardController.getWhatsAppStatus(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Error getting WhatsApp status',
        error: 'WhatsApp service error',
        stack: expect.any(String)
      });
    });
  });

  describe('initWhatsApp', () => {
    it('should initialize WhatsApp successfully', async () => {
      const mockWhatsAppService = {
        initializeTenant: jest.fn().mockResolvedValue(true)
      };

      const { getWhatsAppService } = require('../../../services/WhatsAppService');
      getWhatsAppService.mockReturnValue(mockWhatsAppService);
      mockReq.app.get.mockReturnValue({});

      await TenantDashboardController.initWhatsApp(mockReq, mockRes);

      expect(mockWhatsAppService.initializeTenant).toHaveBeenCalledWith(1);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'WhatsApp initialization started'
      });
    });

    it('should handle initialization errors', async () => {
      const mockWhatsAppService = {
        initializeTenant: jest.fn().mockRejectedValue(new Error('Init failed'))
      };

      const { getWhatsAppService } = require('../../../services/WhatsAppService');
      getWhatsAppService.mockReturnValue(mockWhatsAppService);
      mockReq.app.get.mockReturnValue({});

      await TenantDashboardController.initWhatsApp(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Error initializing WhatsApp',
        error: 'Init failed',
        stack: expect.any(String)
      });
    });
  });

  describe('disconnectWhatsApp', () => {
    it('should disconnect WhatsApp successfully', async () => {
      const mockWhatsAppService = {
        disconnect: jest.fn().mockResolvedValue(true)
      };

      const { getWhatsAppService } = require('../../../services/WhatsAppService');
      getWhatsAppService.mockReturnValue(mockWhatsAppService);
      mockReq.app.get.mockReturnValue({});

      await TenantDashboardController.disconnectWhatsApp(mockReq, mockRes);

      expect(mockWhatsAppService.disconnect).toHaveBeenCalledWith(1);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'WhatsApp disconnected successfully'
      });
    });

    it('should handle disconnect errors', async () => {
      const mockWhatsAppService = {
        disconnect: jest.fn().mockRejectedValue(new Error('Disconnect failed'))
      };

      const { getWhatsAppService } = require('../../../services/WhatsAppService');
      getWhatsAppService.mockReturnValue(mockWhatsAppService);
      mockReq.app.get.mockReturnValue({});

      await TenantDashboardController.disconnectWhatsApp(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Error disconnecting WhatsApp',
        error: 'Disconnect failed'
      });
    });
  });

  describe('getQRCode', () => {
    it('should return QR code successfully', async () => {
      const mockWhatsAppService = {
        getQRCode: jest.fn().mockReturnValue('mock_qr_code_data')
      };

      const { getWhatsAppService } = require('../../../services/WhatsAppService');
      getWhatsAppService.mockReturnValue(mockWhatsAppService);
      mockReq.app.get.mockReturnValue({});

      await TenantDashboardController.getQRCode(mockReq, mockRes);

      expect(mockWhatsAppService.getQRCode).toHaveBeenCalledWith(1);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: { qr: 'mock_qr_code_data' }
      });
    });

    it('should handle QR code errors', async () => {
      const mockWhatsAppService = {
        getQRCode: jest.fn().mockImplementation(() => {
          throw new Error('QR code not available');
        })
      };

      const { getWhatsAppService } = require('../../../services/WhatsAppService');
      getWhatsAppService.mockReturnValue(mockWhatsAppService);
      mockReq.app.get.mockReturnValue({});

      await TenantDashboardController.getQRCode(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Error getting QR code',
        error: 'QR code not available'
      });
    });
  });

  describe('getHourlyMessages', () => {
    it('should return hourly message statistics', async () => {
      const mockHourlyData = [
        { hour: 9, count: 10 },
        { hour: 10, count: 15 },
        { hour: 14, count: 20 }
      ];

      mockConnection.query.mockResolvedValue([mockHourlyData]);

      await TenantDashboardController.getHourlyMessages(mockReq, mockRes);

      expect(mockConnection.query).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: expect.arrayContaining([
          { hour: 9, count: 10 },
          { hour: 10, count: 15 },
          { hour: 14, count: 20 }
        ])
      });
      
      // Check that all 24 hours are included
      const response = mockRes.json.mock.calls[0][0];
      expect(response.data).toHaveLength(24);
    });

    it('should fill missing hours with 0', async () => {
      mockConnection.query.mockResolvedValue([[]]);

      await TenantDashboardController.getHourlyMessages(mockReq, mockRes);

      const response = mockRes.json.mock.calls[0][0];
      expect(response.data).toHaveLength(24);
      expect(response.data[0]).toEqual({ hour: 0, count: 0 });
      expect(response.data[23]).toEqual({ hour: 23, count: 0 });
    });

    it('should handle database errors', async () => {
      mockConnection.query.mockRejectedValue(new Error('Database error'));

      await TenantDashboardController.getHourlyMessages(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockConnection.release).toHaveBeenCalled();
    });
  });
});
