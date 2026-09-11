/**
 * WhatsAppController Unit Tests
 * Tests for WhatsApp controller endpoints
 */

const WhatsAppController = require('../../../controllers/WhatsAppController');
const { getWhatsAppService } = require('../../../services/WhatsAppService');

// Mock dependencies
jest.mock('../../../services/WhatsAppService');
jest.mock('../../../config/logger');

describe('WhatsAppController', () => {
  let mockReq;
  let mockRes;
  let mockWhatsAppService;

  beforeEach(() => {
    // Mock request
    mockReq = {
      tenant: { id: 1, name: 'Test Tenant' },
      app: {
        get: jest.fn().mockReturnValue({})
      }
    };

    // Mock response
    mockRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };

    // Mock WhatsApp service
    mockWhatsAppService = {
      initializeTenant: jest.fn().mockResolvedValue({
        tenantId: 1,
        status: 'connecting'
      }),
      getTenantStatus: jest.fn().mockResolvedValue({
        status: 'connected',
        phoneNumber: '5511999999999',
        qr: null
      }),
      disconnectTenant: jest.fn().mockResolvedValue(true),
      clearTenantSession: jest.fn().mockResolvedValue(true),
      getQRCode: jest.fn().mockResolvedValue('data:image/png;base64,...'),
      sendMessage: jest.fn().mockResolvedValue({ success: true }),
      getMessages: jest.fn().mockResolvedValue({ messages: [], total: 0 }),
      getContacts: jest.fn().mockResolvedValue({ contacts: [], total: 0 })
    };

    getWhatsAppService.mockReturnValue(mockWhatsAppService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('connect', () => {
    it('should initiate WhatsApp connection', async () => {
      await WhatsAppController.connect(mockReq, mockRes);

      expect(mockWhatsAppService.initializeTenant).toHaveBeenCalledWith(1);
      expect(mockWhatsAppService.getTenantStatus).toHaveBeenCalledWith(1);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'WhatsApp connection initiated',
        data: expect.objectContaining({
          status: 'connected'
        })
      });
    });

    it('should return error if tenant not found', async () => {
      mockReq.tenant = null;

      await WhatsAppController.connect(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Tenant information not found. Please login again.'
      });
    });

    it('should handle connection errors', async () => {
      mockWhatsAppService.initializeTenant.mockRejectedValue(new Error('Connection failed'));

      await WhatsAppController.connect(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Failed to connect WhatsApp',
        error: 'Connection failed'
      });
    });
  });

  describe('disconnect', () => {
    it('should disconnect WhatsApp successfully', async () => {
      await WhatsAppController.disconnect(mockReq, mockRes);

      expect(mockWhatsAppService.disconnectTenant).toHaveBeenCalledWith(1);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'WhatsApp disconnected successfully'
      });
    });

    it('should handle disconnection errors', async () => {
      mockWhatsAppService.disconnectTenant.mockRejectedValue(new Error('Disconnect failed'));

      await WhatsAppController.disconnect(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getStatus', () => {
    it('should return connection status', async () => {
      await WhatsAppController.getStatus(mockReq, mockRes);

      expect(mockWhatsAppService.getTenantStatus).toHaveBeenCalledWith(1);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          status: 'connected',
          phoneNumber: '5511999999999'
        })
      });
    });
  });

  describe('getQR', () => {
    it('should return QR code if available', async () => {
      await WhatsAppController.getQR(mockReq, mockRes);

      expect(mockWhatsAppService.getQRCode).toHaveBeenCalledWith(1);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: { qrCode: expect.any(String) }
      });
    });

    it('should return 404 if no QR code available', async () => {
      mockWhatsAppService.getQRCode.mockResolvedValue(null);

      await WhatsAppController.getQR(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'No QR code available'
      });
    });
  });

  describe('clearSession', () => {
    it('should clear session successfully', async () => {
      await WhatsAppController.clearSession(mockReq, mockRes);

      expect(mockWhatsAppService.clearTenantSession).toHaveBeenCalledWith(1);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'WhatsApp session cleared successfully'
      });
    });
  });

  describe('sendMessage', () => {
    beforeEach(() => {
      mockReq.body = {
        phoneNumber: '5511999999999',
        message: 'Test message'
      };
    });

    it('should send message successfully', async () => {
      await WhatsAppController.sendMessage(mockReq, mockRes);

      expect(mockWhatsAppService.sendMessage).toHaveBeenCalledWith(
        1,
        '5511999999999',
        'Test message'
      );
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Message sent successfully',
        data: { success: true }
      });
    });

    it('should validate required fields', async () => {
      mockReq.body = { phoneNumber: '5511999999999' };

      await WhatsAppController.sendMessage(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Phone number and message are required'
      });
    });
  });

  describe('getMessages', () => {
    it('should return messages list', async () => {
      mockReq.query = { limit: '20', offset: '0' };

      await WhatsAppController.getMessages(mockReq, mockRes);

      expect(mockWhatsAppService.getMessages).toHaveBeenCalledWith(1, {
        limit: 20,
        offset: 0,
        phoneNumber: undefined
      });
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          messages: expect.any(Array)
        })
      });
    });
  });

  describe('getContacts', () => {
    it('should return contacts list', async () => {
      mockReq.query = { limit: '50', offset: '0' };

      await WhatsAppController.getContacts(mockReq, mockRes);

      expect(mockWhatsAppService.getContacts).toHaveBeenCalledWith(1, {
        limit: 50,
        offset: 0,
        search: undefined
      });
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          contacts: expect.any(Array)
        })
      });
    });
  });
});
