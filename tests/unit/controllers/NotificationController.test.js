/**
 * NotificationController Unit Tests
 */

const NotificationController = require('../../../controllers/NotificationController');

// Mock dependencies
jest.mock('../../../config/database', () => ({
  pool: {
    execute: jest.fn()
  }
}));

jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({
    verify: jest.fn(),
    sendMail: jest.fn()
  })
}));

const { pool } = require('../../../config/database');
const nodemailer = require('nodemailer');

describe('NotificationController', () => {
  let mockReq;
  let mockRes;

  beforeEach(() => {
    jest.clearAllMocks();

    mockReq = {
      body: {},
      query: {},
      params: {},
      app: {
        get: jest.fn()
      }
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('getEmailSettings', () => {
    it('should return email settings without password', async () => {
      pool.execute.mockResolvedValue([[{
        id: 1,
        smtp_host: 'smtp.test.com',
        smtp_password: 'secret'
      }]]);

      await NotificationController.getEmailSettings(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.not.objectContaining({ smtp_password: 'secret' })
        })
      );
    });

    it('should return null if no settings', async () => {
      pool.execute.mockResolvedValue([[]]);

      await NotificationController.getEmailSettings(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: null
      });
    });
  });

  describe('updateEmailSettings', () => {
    it('should create settings if not exists', async () => {
      mockReq.body = {
        smtp_host: 'smtp.test.com',
        smtp_port: 587,
        smtp_user: 'user',
        smtp_password: 'pass',
        from_email: 'test@test.com',
        enabled: true
      };

      pool.execute
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      await NotificationController.updateEmailSettings(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    it('should update existing settings', async () => {
      mockReq.body = { smtp_host: 'new.smtp.com' };

      pool.execute
        .mockResolvedValueOnce([[{ id: 1 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      await NotificationController.updateEmailSettings(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  describe('testEmailConnection', () => {
    it('should send test email successfully', async () => {
      mockReq.body = {
        smtp_host: 'smtp.test.com',
        smtp_port: 587,
        smtp_user: 'user',
        smtp_password: 'pass',
        from_email: 'test@test.com',
        test_recipient: 'recipient@test.com'
      };

      const mockTransporter = {
        verify: jest.fn().mockResolvedValue(true),
        sendMail: jest.fn().mockResolvedValue({ messageId: '123' })
      };
      nodemailer.createTransport.mockReturnValue(mockTransporter);

      await NotificationController.testEmailConnection(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    it('should reject if test_recipient missing', async () => {
      mockReq.body = {
        smtp_host: 'smtp.test.com',
        smtp_port: 587
      };

      await NotificationController.testEmailConnection(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should reject if SMTP config incomplete', async () => {
      mockReq.body = {
        test_recipient: 'test@test.com'
      };

      await NotificationController.testEmailConnection(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('getEmailTemplates', () => {
    it('should return all templates', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, template_key: 'welcome' },
        { id: 2, template_key: 'password_reset' }
      ]]);

      await NotificationController.getEmailTemplates(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.any(Array)
        })
      );
    });

    it('should filter by category', async () => {
      mockReq.query = { category: 'tenant' };
      pool.execute.mockResolvedValue([[{ id: 1, category: 'tenant' }]]);

      await NotificationController.getEmailTemplates(mockReq, mockRes);

      expect(pool.execute).toHaveBeenCalledWith(
        expect.stringContaining('WHERE category = ?'),
        ['tenant']
      );
    });
  });

  describe('updateEmailTemplate', () => {
    it('should update template', async () => {
      mockReq.params = { id: 1 };
      mockReq.body = { subject: 'New Subject', enabled: true };

      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      await NotificationController.updateEmailTemplate(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  describe('getWhatsAppStatus', () => {
    it('should return WhatsApp status', async () => {
      pool.execute.mockResolvedValue([[{
        connected: false,
        enabled: true,
        phone_number: '123456789'
      }]]);

      await NotificationController.getWhatsAppStatus(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  describe('getWhatsAppTemplates', () => {
    it('should return WhatsApp templates', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, template_key: 'welcome', message: 'Hello!' }
      ]]);

      await NotificationController.getWhatsAppTemplates(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.any(Array)
        })
      );
    });
  });

  describe('updateWhatsAppTemplate', () => {
    it('should update WhatsApp template', async () => {
      mockReq.params = { id: 1 };
      mockReq.body = { message: 'Updated message', enabled: true };

      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      await NotificationController.updateWhatsAppTemplate(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  describe('getExpirationSettings', () => {
    it('should return expiration settings', async () => {
      pool.execute.mockResolvedValue([[{
        days_before_1: 7,
        days_before_2: 3,
        enabled: true
      }]]);

      await NotificationController.getExpirationSettings(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    it('should return defaults if no settings', async () => {
      pool.execute.mockResolvedValue([[]]);

      await NotificationController.getExpirationSettings(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ days_before_1: 7 })
        })
      );
    });
  });

  describe('updateExpirationSettings', () => {
    it('should update expiration settings', async () => {
      mockReq.body = {
        days_before_1: 10,
        days_before_2: 5,
        enabled: true
      };

      pool.execute
        .mockResolvedValueOnce([[{ id: 1 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      await NotificationController.updateExpirationSettings(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  describe('getNotificationLogs', () => {
    it('should return notification logs with pagination', async () => {
      mockReq.query = { page: 1, limit: 50 };

      pool.execute
        .mockResolvedValueOnce([[{ id: 1, notification_type: 'email' }]])
        .mockResolvedValueOnce([[{ total: 1 }]]);

      await NotificationController.getNotificationLogs(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          pagination: expect.any(Object)
        })
      );
    });

    it('should filter by type and status', async () => {
      mockReq.query = { type: 'email', status: 'sent' };

      pool.execute
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ total: 0 }]]);

      await NotificationController.getNotificationLogs(mockReq, mockRes);

      expect(pool.execute).toHaveBeenCalledWith(
        expect.stringContaining('notification_type = ?'),
        expect.arrayContaining(['email', 'sent'])
      );
    });
  });
});
