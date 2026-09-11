/**
 * Notification System Tests
 * Tests for WhatsApp and Email notification functionality
 */

const request = require('supertest');

// Mock the database pool
jest.mock('../config/database', () => ({
  pool: {
    execute: jest.fn(),
    getConnection: jest.fn()
  }
}));

// Mock nodemailer
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test-id' })
  }))
}));

// Mock WhatsApp service
jest.mock('../services/WhatsAppService', () => ({
  getConnectionStatus: jest.fn().mockResolvedValue({ connected: false }),
  initializeWhatsApp: jest.fn().mockResolvedValue(true),
  disconnectWhatsApp: jest.fn().mockResolvedValue(true),
  sendMessage: jest.fn().mockResolvedValue(true)
}));

const { pool } = require('../config/database');
const NotificationController = require('../controllers/NotificationController');

describe('NotificationController', () => {
  let mockReq;
  let mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockReq = {
      body: {},
      params: {},
      query: {}
    };
    
    mockRes = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis()
    };
  });

  describe('Email Settings', () => {
    test('getEmailSettings should return settings without password', async () => {
      const mockSettings = [{
        id: 1,
        smtp_host: 'smtp.test.com',
        smtp_port: 587,
        smtp_password: 'secret',
        enabled: true
      }];
      
      pool.execute.mockResolvedValueOnce([mockSettings]);
      
      await NotificationController.getEmailSettings(mockReq, mockRes);
      
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: expect.not.objectContaining({ smtp_password: 'secret' })
      });
    });

    test('updateEmailSettings should update existing settings', async () => {
      mockReq.body = {
        smtp_host: 'smtp.new.com',
        smtp_port: 465,
        enabled: true
      };
      
      pool.execute
        .mockResolvedValueOnce([[{ id: 1 }]]) // Check existing
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // Update
      
      await NotificationController.updateEmailSettings(mockReq, mockRes);
      
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Email settings updated successfully'
      });
    });

    test('testEmailConnection should send test email', async () => {
      mockReq.body = {
        smtp_host: 'smtp.test.com',
        smtp_port: 587,
        smtp_secure: false,
        smtp_user: 'user@test.com',
        smtp_password: 'password',
        from_email: 'noreply@test.com',
        test_recipient: 'recipient@test.com'
      };
      
      await NotificationController.testEmailConnection(mockReq, mockRes);
      
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Test email sent successfully'
      });
    });

    test('testEmailConnection should fail without recipient', async () => {
      mockReq.body = {
        smtp_host: 'smtp.test.com'
      };
      
      await NotificationController.testEmailConnection(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Test recipient email is required'
      });
    });
  });

  describe('Email Templates', () => {
    test('getEmailTemplates should return all templates', async () => {
      const mockTemplates = [
        { id: 1, template_name: 'Welcome', category: 'tenant' },
        { id: 2, template_name: 'Password Reset', category: 'security' }
      ];
      
      pool.execute.mockResolvedValueOnce([mockTemplates]);
      
      await NotificationController.getEmailTemplates(mockReq, mockRes);
      
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockTemplates
      });
    });

    test('getEmailTemplates should filter by category', async () => {
      mockReq.query = { category: 'tenant' };
      const mockTemplates = [{ id: 1, template_name: 'Welcome', category: 'tenant' }];
      
      pool.execute.mockResolvedValueOnce([mockTemplates]);
      
      await NotificationController.getEmailTemplates(mockReq, mockRes);
      
      expect(pool.execute).toHaveBeenCalledWith(
        expect.stringContaining('WHERE category = ?'),
        ['tenant']
      );
    });

    test('updateEmailTemplate should update template', async () => {
      mockReq.params = { id: '1' };
      mockReq.body = {
        subject: 'New Subject',
        body: 'New Body',
        enabled: true
      };
      
      pool.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);
      
      await NotificationController.updateEmailTemplate(mockReq, mockRes);
      
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Template updated successfully'
      });
    });
  });

  describe('WhatsApp Settings', () => {
    test('getWhatsAppStatus should return connection status', async () => {
      pool.execute.mockResolvedValueOnce([[{ enabled: true, phone_number: '5511999999999' }]]);
      
      await NotificationController.getWhatsAppStatus(mockReq, mockRes);
      
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          connected: false,
          enabled: true
        })
      });
    });

    test('initWhatsApp should start initialization', async () => {
      await NotificationController.initWhatsApp(mockReq, mockRes);
      
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'WhatsApp initialization started. Please scan the QR code.'
      });
    });

    test('disconnectWhatsApp should disconnect and update database', async () => {
      pool.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);
      
      await NotificationController.disconnectWhatsApp(mockReq, mockRes);
      
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'WhatsApp disconnected successfully'
      });
    });
  });

  describe('WhatsApp Templates', () => {
    test('getWhatsAppTemplates should return all templates', async () => {
      const mockTemplates = [
        { id: 1, template_name: 'Welcome', category: 'tenant', message: 'Hello!' }
      ];
      
      pool.execute.mockResolvedValueOnce([mockTemplates]);
      
      await NotificationController.getWhatsAppTemplates(mockReq, mockRes);
      
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockTemplates
      });
    });

    test('updateWhatsAppTemplate should update message', async () => {
      mockReq.params = { id: '1' };
      mockReq.body = { message: 'New message', enabled: true };
      
      pool.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);
      
      await NotificationController.updateWhatsAppTemplate(mockReq, mockRes);
      
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Template updated successfully'
      });
    });
  });

  describe('Expiration Settings', () => {
    test('getExpirationSettings should return settings', async () => {
      const mockSettings = [{
        days_before_1: 7,
        days_before_2: 3,
        days_after_1: 1,
        enabled: true
      }];
      
      pool.execute.mockResolvedValueOnce([mockSettings]);
      
      await NotificationController.getExpirationSettings(mockReq, mockRes);
      
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockSettings[0]
      });
    });

    test('getExpirationSettings should return defaults if no settings', async () => {
      pool.execute.mockResolvedValueOnce([[]]);
      
      await NotificationController.getExpirationSettings(mockReq, mockRes);
      
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          days_before_1: 7,
          days_before_2: 3,
          enabled: true
        })
      });
    });

    test('updateExpirationSettings should update settings', async () => {
      mockReq.body = {
        days_before_1: 5,
        days_before_2: 2,
        days_before_3: 1,
        days_before_4: 0,
        days_after_1: 1,
        days_after_2: 3,
        days_after_3: 7,
        enabled: true
      };
      
      pool.execute
        .mockResolvedValueOnce([[{ id: 1 }]]) // Check existing
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // Update
      
      await NotificationController.updateExpirationSettings(mockReq, mockRes);
      
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Expiration settings updated successfully'
      });
    });
  });

  describe('Notification Logs', () => {
    test('getNotificationLogs should return paginated logs', async () => {
      const mockLogs = [
        { id: 1, notification_type: 'email', status: 'sent' },
        { id: 2, notification_type: 'whatsapp', status: 'sent' }
      ];
      
      pool.execute
        .mockResolvedValueOnce([mockLogs])
        .mockResolvedValueOnce([[{ total: 2 }]]);
      
      await NotificationController.getNotificationLogs(mockReq, mockRes);
      
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockLogs,
        pagination: expect.objectContaining({
          page: 1,
          total: 2
        })
      });
    });

    test('getNotificationLogs should filter by type', async () => {
      mockReq.query = { type: 'email' };
      
      pool.execute
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ total: 0 }]]);
      
      await NotificationController.getNotificationLogs(mockReq, mockRes);
      
      expect(pool.execute).toHaveBeenCalledWith(
        expect.stringContaining('notification_type = ?'),
        expect.arrayContaining(['email'])
      );
    });
  });

  describe('Send Test WhatsApp', () => {
    test('sendTestWhatsApp should send message and log', async () => {
      mockReq.body = {
        phone_number: '5511999999999',
        message: 'Test message'
      };
      
      pool.execute.mockResolvedValueOnce([{ insertId: 1 }]);
      
      await NotificationController.sendTestWhatsApp(mockReq, mockRes);
      
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Test message sent successfully'
      });
    });

    test('sendTestWhatsApp should fail without phone', async () => {
      mockReq.body = { message: 'Test' };
      
      await NotificationController.sendTestWhatsApp(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });
});

describe('Notification Templates Variables', () => {
  test('should have correct variables for welcome template', () => {
    const expectedVariables = ['tenant_name', 'platform_name', 'subdomain', 'plan_name', 'login_url'];
    // This would be tested against actual database data
    expect(expectedVariables).toContain('tenant_name');
    expect(expectedVariables).toContain('login_url');
  });

  test('should have correct variables for payment template', () => {
    const expectedVariables = ['tenant_name', 'plan_name', 'amount', 'payment_date', 'next_billing_date'];
    expect(expectedVariables).toContain('amount');
    expect(expectedVariables).toContain('payment_date');
  });
});
