/**
 * WooCommerceNotificationController Unit Tests
 */

const WooCommerceNotificationController = require('../../../controllers/WooCommerceNotificationController');

// Mock dependencies
jest.mock('../../../config/database', () => ({
  pool: {
    query: jest.fn(),
    execute: jest.fn()
  }
}));

jest.mock('../../../config/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

jest.mock('../../../middleware/errorHandler', () => ({
  asyncHandler: (fn) => fn
}));

jest.mock('../../../services/WhatsAppService', () => ({
  getWhatsAppService: jest.fn()
}));

const { pool } = require('../../../config/database');
const { getWhatsAppService } = require('../../../services/WhatsAppService');

describe('WooCommerceNotificationController', () => {
  let mockReq;
  let mockRes;

  beforeEach(() => {
    jest.clearAllMocks();

    mockReq = {
      user: { tenantId: 1 },
      params: {},
      body: {},
      headers: {}
    };

    mockRes = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis()
    };
  });

  describe('getSettings', () => {
    it('should return configured settings', async () => {
      const mockSettings = { id: 1, new_order_enabled: true };
      pool.query.mockResolvedValue([[mockSettings]]);

      await WooCommerceNotificationController.getSettings(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          configured: true,
          settings: mockSettings
        }
      });
    });

    it('should return default settings if not configured', async () => {
      pool.query.mockResolvedValue([[]]);

      await WooCommerceNotificationController.getSettings(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          configured: false,
          settings: expect.objectContaining({
            new_order_enabled: false
          })
        }
      });
    });

    it('should handle errors', async () => {
      pool.query.mockRejectedValue(new Error('DB error'));

      await WooCommerceNotificationController.getSettings(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('saveSettings', () => {
    it('should save notification settings', async () => {
      mockReq.body = {
        new_order_enabled: true,
        new_order_template: 'Test template'
      };
      pool.query.mockResolvedValue([{ affectedRows: 1 }]);

      await WooCommerceNotificationController.saveSettings(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Notification settings saved successfully'
      });
    });

    it('should handle errors', async () => {
      mockReq.body = { new_order_enabled: true };
      pool.query.mockRejectedValue(new Error('DB error'));

      await WooCommerceNotificationController.saveSettings(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('generateSecret', () => {
    it('should generate webhook secret', async () => {
      await WooCommerceNotificationController.generateSecret(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: { secret: expect.any(String) }
      });
    });
  });

  describe('handleWebhook', () => {
    it('should return 200 if notifications not configured', async () => {
      mockReq.params.tenantId = '1';
      mockReq.headers['x-wc-webhook-topic'] = 'order.created';
      pool.query.mockResolvedValue([[]]);

      await WooCommerceNotificationController.handleWebhook(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Notifications not configured' });
    });

    it('should verify webhook signature', async () => {
      mockReq.params.tenantId = '1';
      mockReq.headers['x-wc-webhook-topic'] = 'order.created';
      mockReq.headers['x-wc-webhook-signature'] = 'invalid';
      mockReq.body = {};

      const mockSettings = { webhook_secret: 'secret123' };
      pool.query.mockResolvedValue([[mockSettings]]);

      await WooCommerceNotificationController.handleWebhook(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
    });
  });

  describe('testNotification', () => {
    it('should send test notification', async () => {
      mockReq.body = {
        type: 'new_order',
        phone: '+1234567890',
        template: 'Test {{order_id}}'
      };

      const mockWhatsAppService = {
        sendMessage: jest.fn().mockResolvedValue({ success: true })
      };
      getWhatsAppService.mockReturnValue(mockWhatsAppService);

      await WooCommerceNotificationController.testNotification(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: expect.stringContaining('Test notification sent')
      });
    });

    it('should validate phone is required', async () => {
      mockReq.body = { type: 'new_order', template: 'Test' };

      await WooCommerceNotificationController.testNotification(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should validate template is required', async () => {
      mockReq.body = { type: 'new_order', phone: '+1234567890' };

      await WooCommerceNotificationController.testNotification(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should validate phone format', async () => {
      mockReq.body = { type: 'new_order', phone: '123', template: 'Test' };

      await WooCommerceNotificationController.testNotification(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should validate notification type', async () => {
      mockReq.body = { type: 'invalid', phone: '+1234567890', template: 'Test' };

      await WooCommerceNotificationController.testNotification(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('replacePlaceholders', () => {
    it('should replace placeholders in template', () => {
      const template = 'Hello {{name}}, your order #{{order_id}} is ready';
      const data = { name: 'John', order_id: '123' };

      const result = WooCommerceNotificationController.replacePlaceholders(template, data);

      expect(result).toBe('Hello John, your order #123 is ready');
    });

    it('should handle multiple occurrences', () => {
      const template = '{{name}} - {{name}}';
      const data = { name: 'Test' };

      const result = WooCommerceNotificationController.replacePlaceholders(template, data);

      expect(result).toBe('Test - Test');
    });
  });

  describe('getDefaultSettings', () => {
    it('should return default settings object', () => {
      const defaults = WooCommerceNotificationController.getDefaultSettings();

      expect(defaults).toHaveProperty('webhook_secret');
      expect(defaults).toHaveProperty('new_order_enabled', false);
      expect(defaults).toHaveProperty('customer_registration_enabled', false);
      expect(defaults).toHaveProperty('password_reset_enabled', false);
      expect(defaults).toHaveProperty('product_comment_enabled', false);
    });
  });

  describe('getDefaultTemplates', () => {
    it('should return default templates', () => {
      const templates = WooCommerceNotificationController.getDefaultTemplates();

      expect(templates).toHaveProperty('new_order');
      expect(templates).toHaveProperty('customer_registration');
      expect(templates).toHaveProperty('password_reset');
      expect(templates).toHaveProperty('product_comment');
    });
  });

  describe('sendWhatsAppMessage', () => {
    it('should send message via WhatsApp service', async () => {
      const mockWhatsAppService = {
        sendMessage: jest.fn().mockResolvedValue({ success: true })
      };
      getWhatsAppService.mockReturnValue(mockWhatsAppService);

      await WooCommerceNotificationController.sendWhatsAppMessage(1, '+1234567890', 'Test');

      expect(mockWhatsAppService.sendMessage).toHaveBeenCalledWith(1, '+1234567890', 'Test');
    });

    it('should throw error if service not initialized', async () => {
      getWhatsAppService.mockReturnValue(null);

      await expect(
        WooCommerceNotificationController.sendWhatsAppMessage(1, '+1234567890', 'Test')
      ).rejects.toThrow('WhatsApp service not initialized');
    });

    it('should sanitize phone number', async () => {
      const mockWhatsAppService = {
        sendMessage: jest.fn().mockResolvedValue({ success: true })
      };
      getWhatsAppService.mockReturnValue(mockWhatsAppService);

      await WooCommerceNotificationController.sendWhatsAppMessage(1, '+1 (234) 567-890', 'Test');

      expect(mockWhatsAppService.sendMessage).toHaveBeenCalledWith(1, '+1234567890', 'Test');
    });
  });
});
