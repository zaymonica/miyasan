/**
 * Notification Controller
 * Manages email and WhatsApp notification settings, templates, and sending
 * 
 * @module controllers/NotificationController
 */

const BaseController = require('./BaseController');
const { pool } = require('../config/database');
const { logger } = require('../config/logger');
const nodemailer = require('nodemailer');

class NotificationController extends BaseController {
  // ==================== EMAIL NOTIFICATIONS ====================
  
  /**
   * Get email settings
   */
  static async getEmailSettings(req, res) {
    try {
      const [settings] = await pool.execute(
        'SELECT * FROM email_notification_settings WHERE id = 1'
      );

      if (settings[0]) {
        delete settings[0].smtp_password;
      }

      return res.json({
        success: true,
        data: settings[0] || null
      });
    } catch (error) {
      logger.error('Get email settings error', { error: error.message });
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Update email settings
   */
  static async updateEmailSettings(req, res) {
    try {
      const { smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password, from_email, from_name, enabled } = req.body;
      const [existing] = await pool.execute('SELECT id FROM email_notification_settings WHERE id = 1');

      if (existing.length === 0) {
        await pool.execute(
          `INSERT INTO email_notification_settings 
           (smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password, from_email, from_name, enabled) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password, from_email, from_name, enabled]
        );
      } else {
        const updates = [];
        const values = [];

        if (smtp_host !== undefined) { updates.push('smtp_host = ?'); values.push(smtp_host); }
        if (smtp_port !== undefined) { updates.push('smtp_port = ?'); values.push(smtp_port); }
        if (smtp_secure !== undefined) { updates.push('smtp_secure = ?'); values.push(smtp_secure); }
        if (smtp_user !== undefined) { updates.push('smtp_user = ?'); values.push(smtp_user); }
        if (smtp_password) { updates.push('smtp_password = ?'); values.push(smtp_password); }
        if (from_email !== undefined) { updates.push('from_email = ?'); values.push(from_email); }
        if (from_name !== undefined) { updates.push('from_name = ?'); values.push(from_name); }
        if (enabled !== undefined) { updates.push('enabled = ?'); values.push(enabled); }

        if (updates.length > 0) {
          values.push(1);
          await pool.execute(`UPDATE email_notification_settings SET ${updates.join(', ')} WHERE id = ?`, values);
        }
      }

      logger.info('Email settings updated');
      return res.json({ success: true, message: 'Email settings updated successfully' });
    } catch (error) {
      logger.error('Update email settings error', { error: error.message });
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Test email connection
   */
  static async testEmailConnection(req, res) {
    try {
      const { smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password, from_email, test_recipient } = req.body;

      if (!test_recipient) {
        return res.status(400).json({ success: false, message: 'Test recipient email is required' });
      }

      if (!smtp_host || !smtp_port || !smtp_user || !smtp_password) {
        return res.status(400).json({ success: false, message: 'SMTP configuration is incomplete' });
      }

      // Create transporter with more robust settings
      const transporterConfig = {
        host: smtp_host,
        port: parseInt(smtp_port),
        secure: smtp_secure === true || smtp_secure === 'true' || parseInt(smtp_port) === 465,
        auth: { 
          user: smtp_user, 
          pass: smtp_password 
        },
        // Connection timeout settings
        connectionTimeout: 10000, // 10 seconds
        greetingTimeout: 10000,
        socketTimeout: 15000,
        // TLS settings for better compatibility
        tls: {
          rejectUnauthorized: false, // Allow self-signed certificates
          minVersion: 'TLSv1.2'
        }
      };

      // For port 587, use STARTTLS
      if (parseInt(smtp_port) === 587) {
        transporterConfig.secure = false;
        transporterConfig.requireTLS = true;
      }

      logger.info('Testing email connection', { 
        host: smtp_host, 
        port: smtp_port, 
        secure: transporterConfig.secure,
        user: smtp_user 
      });

      const transporter = nodemailer.createTransport(transporterConfig);

      // Verify connection first
      try {
        await transporter.verify();
        logger.info('SMTP connection verified successfully');
      } catch (verifyError) {
        logger.error('SMTP verification failed', { error: verifyError.message });
        return res.status(500).json({ 
          success: false, 
          message: `SMTP connection failed: ${verifyError.message}. Please check your SMTP settings.` 
        });
      }

      // Send test email
      await transporter.sendMail({
        from: from_email || smtp_user,
        to: test_recipient,
        subject: 'Test Email - Misayan SaaS',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #00a149;">✅ Test Successful!</h1>
            <p>Your email configuration is working correctly.</p>
            <hr style="border: 1px solid #eee;">
            <p style="color: #666; font-size: 12px;">
              Sent from: ${smtp_host}:${smtp_port}<br>
              Time: ${new Date().toISOString()}
            </p>
          </div>
        `
      });

      return res.json({ success: true, message: 'Test email sent successfully' });
    } catch (error) {
      logger.error('Test email error', { error: error.message, stack: error.stack });
      
      // Provide more helpful error messages
      let userMessage = error.message;
      if (error.code === 'ECONNRESET') {
        userMessage = 'Connection was reset by the server. This may be due to firewall settings, incorrect port, or the SMTP server rejecting the connection.';
      } else if (error.code === 'ECONNREFUSED') {
        userMessage = 'Connection refused. Please verify the SMTP host and port are correct.';
      } else if (error.code === 'ETIMEDOUT') {
        userMessage = 'Connection timed out. The SMTP server may be unreachable or blocked by firewall.';
      } else if (error.code === 'EAUTH' || error.message.includes('auth')) {
        userMessage = 'Authentication failed. Please check your username and password.';
      }
      
      return res.status(500).json({ success: false, message: `Email test failed: ${userMessage}` });
    }
  }

  /**
   * Get email templates
   */
  static async getEmailTemplates(req, res) {
    try {
      const { category } = req.query;
      let query = 'SELECT * FROM email_notification_templates';
      const params = [];

      if (category) {
        query += ' WHERE category = ?';
        params.push(category);
      }
      query += ' ORDER BY category, template_name';

      const [templates] = await pool.execute(query, params);
      return res.json({ success: true, data: templates });
    } catch (error) {
      logger.error('Get email templates error', { error: error.message });
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Update email template
   */
  static async updateEmailTemplate(req, res) {
    try {
      const { id } = req.params;
      const { subject, body, html_body, enabled } = req.body;
      const updates = [];
      const values = [];

      if (subject !== undefined) { updates.push('subject = ?'); values.push(subject); }
      if (body !== undefined) { updates.push('body = ?'); values.push(body); }
      if (html_body !== undefined) { updates.push('html_body = ?'); values.push(html_body); }
      if (enabled !== undefined) { updates.push('enabled = ?'); values.push(enabled); }

      if (updates.length > 0) {
        values.push(id);
        await pool.execute(`UPDATE email_notification_templates SET ${updates.join(', ')} WHERE id = ?`, values);
      }

      logger.info(`Email template updated: ${id}`);
      return res.json({ success: true, message: 'Template updated successfully' });
    } catch (error) {
      logger.error('Update email template error', { error: error.message });
      return res.status(500).json({ success: false, message: error.message });
    }
  }


  // ==================== WHATSAPP NOTIFICATIONS ====================

  /**
   * Get WhatsApp connection status
   */
  static async getWhatsAppStatus(req, res) {
    try {
      const [settings] = await pool.execute('SELECT * FROM whatsapp_notification_settings WHERE id = 1');
      const setting = settings[0] || { connected: false, enabled: false };

      try {
        const { getWhatsAppService } = require('../services/WhatsAppService');
        const io = req.app.get('io');
        const whatsappService = getWhatsAppService(io);
        const tenantId = 0; // Superadmin tenant
        
        if (whatsappService) {
          const status = whatsappService.getStatus(tenantId);
          const qrCode = await whatsappService.getQRCode(tenantId);
          
          logger.info('WhatsApp status check', {
            tenantId,
            hasInstance: !!whatsappService.getInstance(tenantId),
            connected: status.connected,
            initialized: status.initialized,
            hasQR: !!qrCode,
            qrLength: qrCode ? qrCode.length : 0,
            qrPreview: qrCode ? qrCode.substring(0, 50) : null
          });
          
          return res.json({
            success: true,
            data: {
              connected: status.connected || false,
              qrCode: qrCode || null,
              phoneNumber: status.phoneNumber || setting.phone_number,
              lastConnected: setting.last_connected_at,
              enabled: setting.enabled
            }
          });
        }
        
        return res.json({
          success: true,
          data: {
            connected: false,
            qrCode: null,
            phoneNumber: setting.phone_number,
            lastConnected: setting.last_connected_at,
            enabled: setting.enabled
          }
        });
      } catch (wsError) {
        logger.warn('WhatsApp service not available', { error: wsError.message });
        return res.json({
          success: true,
          data: {
            connected: false,
            qrCode: null,
            phoneNumber: setting.phone_number,
            lastConnected: setting.last_connected_at,
            enabled: setting.enabled
          }
        });
      }
    } catch (error) {
      logger.error('Get WhatsApp status error', { error: error.message });
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Initialize WhatsApp connection
   */
  static async initWhatsApp(req, res) {
    try {
      const { getWhatsAppService } = require('../services/WhatsAppService');
      const io = req.app.get('io');
      const whatsappService = getWhatsAppService(io);
      
      // Use tenant ID 0 for superadmin notifications
      const tenantId = 0; // Superadmin tenant
      
      if (!whatsappService) {
        return res.status(500).json({ success: false, message: 'WhatsApp service not initialized' });
      }
      
      await whatsappService.initializeTenant(tenantId);
      logger.info('WhatsApp initialization started for superadmin notifications');
      return res.json({ success: true, message: 'WhatsApp initialization started. Please scan the QR code.' });
    } catch (error) {
      logger.error('Init WhatsApp error', { error: error.message });
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Disconnect WhatsApp
   */
  static async disconnectWhatsApp(req, res) {
    try {
      const { getWhatsAppService } = require('../services/WhatsAppService');
      const io = req.app.get('io');
      const whatsappService = getWhatsAppService(io);
      const tenantId = 0; // Superadmin uses tenant 0
      
      if (!whatsappService) {
        return res.status(500).json({ success: false, message: 'WhatsApp service not initialized' });
      }
      
      await whatsappService.disconnect(tenantId);
      await pool.execute('UPDATE whatsapp_notification_settings SET connected = FALSE WHERE id = 1');
      logger.info('WhatsApp disconnected for superadmin notifications');
      return res.json({ success: true, message: 'WhatsApp disconnected successfully' });
    } catch (error) {
      logger.error('Disconnect WhatsApp error', { error: error.message });
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get WhatsApp settings
   */
  static async getWhatsAppSettings(req, res) {
    try {
      const [settings] = await pool.execute('SELECT * FROM whatsapp_notification_settings WHERE id = 1');
      return res.json({ success: true, data: settings[0] || null });
    } catch (error) {
      logger.error('Get WhatsApp settings error', { error: error.message });
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Update WhatsApp settings
   */
  static async updateWhatsAppSettings(req, res) {
    try {
      const { phone_number, session_name, enabled } = req.body;
      const [existing] = await pool.execute('SELECT id FROM whatsapp_notification_settings WHERE id = 1');

      if (existing.length === 0) {
        await pool.execute(
          `INSERT INTO whatsapp_notification_settings (phone_number, session_name, enabled) VALUES (?, ?, ?)`,
          [phone_number, session_name || 'superadmin_notifications', enabled]
        );
      } else {
        const updates = [];
        const values = [];
        if (phone_number !== undefined) { updates.push('phone_number = ?'); values.push(phone_number); }
        if (session_name !== undefined) { updates.push('session_name = ?'); values.push(session_name); }
        if (enabled !== undefined) { updates.push('enabled = ?'); values.push(enabled); }

        if (updates.length > 0) {
          values.push(1);
          await pool.execute(`UPDATE whatsapp_notification_settings SET ${updates.join(', ')} WHERE id = ?`, values);
        }
      }

      logger.info('WhatsApp settings updated');
      return res.json({ success: true, message: 'WhatsApp settings updated successfully' });
    } catch (error) {
      logger.error('Update WhatsApp settings error', { error: error.message });
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get WhatsApp templates
   */
  static async getWhatsAppTemplates(req, res) {
    try {
      const { category } = req.query;
      let query = 'SELECT * FROM whatsapp_notification_templates';
      const params = [];

      if (category) {
        query += ' WHERE category = ?';
        params.push(category);
      }
      query += ' ORDER BY category, template_name';

      const [templates] = await pool.execute(query, params);
      return res.json({ success: true, data: templates });
    } catch (error) {
      logger.error('Get WhatsApp templates error', { error: error.message });
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Update WhatsApp template
   */
  static async updateWhatsAppTemplate(req, res) {
    try {
      const { id } = req.params;
      const { message, enabled } = req.body;
      const updates = [];
      const values = [];

      if (message !== undefined) { updates.push('message = ?'); values.push(message); }
      if (enabled !== undefined) { updates.push('enabled = ?'); values.push(enabled); }

      if (updates.length > 0) {
        values.push(id);
        await pool.execute(`UPDATE whatsapp_notification_templates SET ${updates.join(', ')} WHERE id = ?`, values);
      }

      logger.info(`WhatsApp template updated: ${id}`);
      return res.json({ success: true, message: 'Template updated successfully' });
    } catch (error) {
      logger.error('Update WhatsApp template error', { error: error.message });
      return res.status(500).json({ success: false, message: error.message });
    }
  }


  // ==================== PLAN EXPIRATION SETTINGS ====================

  /**
   * Get plan expiration reminder settings
   */
  static async getExpirationSettings(req, res) {
    try {
      const [settings] = await pool.execute('SELECT * FROM plan_expiration_settings WHERE id = 1');
      return res.json({
        success: true,
        data: settings[0] || {
          days_before_1: 7, days_before_2: 3, days_before_3: 1, days_before_4: 0,
          days_after_1: 1, days_after_2: 3, days_after_3: 7, enabled: true
        }
      });
    } catch (error) {
      logger.error('Get expiration settings error', { error: error.message });
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Update plan expiration reminder settings
   */
  static async updateExpirationSettings(req, res) {
    try {
      const { days_before_1, days_before_2, days_before_3, days_before_4,
              days_after_1, days_after_2, days_after_3, enabled } = req.body;

      const [existing] = await pool.execute('SELECT id FROM plan_expiration_settings WHERE id = 1');

      if (existing.length === 0) {
        await pool.execute(
          `INSERT INTO plan_expiration_settings 
           (days_before_1, days_before_2, days_before_3, days_before_4, days_after_1, days_after_2, days_after_3, enabled) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [days_before_1, days_before_2, days_before_3, days_before_4, days_after_1, days_after_2, days_after_3, enabled]
        );
      } else {
        await pool.execute(
          `UPDATE plan_expiration_settings SET 
           days_before_1 = ?, days_before_2 = ?, days_before_3 = ?, days_before_4 = ?,
           days_after_1 = ?, days_after_2 = ?, days_after_3 = ?, enabled = ? WHERE id = 1`,
          [days_before_1, days_before_2, days_before_3, days_before_4, days_after_1, days_after_2, days_after_3, enabled]
        );
      }

      logger.info('Plan expiration settings updated');
      return res.json({ success: true, message: 'Expiration settings updated successfully' });
    } catch (error) {
      logger.error('Update expiration settings error', { error: error.message });
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // ==================== NOTIFICATION LOGS ====================

  /**
   * Get notification logs
   */
  static async getNotificationLogs(req, res) {
    try {
      const { type, status, page = 1, limit = 50 } = req.query;
      const { page: pageNum, limit: limitNum, offset } = BaseController.validatePagination(page, limit);

      let query = 'SELECT * FROM notification_logs WHERE 1=1';
      const params = [];

      if (type) { query += ' AND notification_type = ?'; params.push(type); }
      if (status) { query += ' AND status = ?'; params.push(status); }

      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(limitNum, offset);

      const [logs] = await pool.execute(query, params);

      let countQuery = 'SELECT COUNT(*) as total FROM notification_logs WHERE 1=1';
      const countParams = [];
      if (type) { countQuery += ' AND notification_type = ?'; countParams.push(type); }
      if (status) { countQuery += ' AND status = ?'; countParams.push(status); }

      const [countResult] = await pool.execute(countQuery, countParams);

      return res.json({
        success: true,
        data: logs,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: countResult[0].total,
          totalPages: Math.ceil(countResult[0].total / limitNum)
        }
      });
    } catch (error) {
      logger.error('Get notification logs error', { error: error.message });
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Send test WhatsApp notification
   */
  static async sendTestWhatsApp(req, res) {
    try {
      const { phone_number, message } = req.body;
      if (!phone_number || !message) {
        return res.status(400).json({ success: false, message: 'Phone number and message are required' });
      }

      const { getWhatsAppService } = require('../services/WhatsAppService');
      const io = req.app.get('io');
      const whatsappService = getWhatsAppService(io);
      
      if (!whatsappService) {
        return res.status(500).json({ success: false, message: 'WhatsApp service not initialized' });
      }
      
      const result = await whatsappService.sendMessage(0, phone_number, message);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to send message');
      }

      await pool.execute(
        `INSERT INTO notification_logs (notification_type, template_key, recipient, message, status, sent_at)
         VALUES ('whatsapp', 'test', ?, ?, 'sent', NOW())`,
        [phone_number, message]
      );

      return res.json({ success: true, message: 'Test message sent successfully' });
    } catch (error) {
      logger.error('Send test WhatsApp error', { error: error.message });
      try {
        await pool.execute(
          `INSERT INTO notification_logs (notification_type, template_key, recipient, message, status, error_message)
           VALUES ('whatsapp', 'test', ?, ?, 'failed', ?)`,
          [req.body.phone_number, req.body.message, error.message]
        );
      } catch (logError) {
        logger.error('Failed to log notification error', { error: logError.message });
      }
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Send notification to tenant
   */
  static async sendNotificationToTenant(tenantId, templateKey, type = 'both', customData = {}) {
    try {
      const notificationService = require('../services/NotificationService');
      return await notificationService.sendNotificationToTenant(tenantId, templateKey, type, customData);
    } catch (error) {
      logger.error('Send notification to tenant error', { error: error.message, tenantId });
      throw error;
    }
  }

  /**
   * Send email notification using template
   */
  static async sendEmailNotification(recipient, templateKey, variables) {
    const notificationService = require('../services/NotificationService');
    return await notificationService.sendEmailNotification(recipient, templateKey, variables);
  }

  /**
   * Send WhatsApp notification using template
   */
  static async sendWhatsAppNotification(recipient, templateKey, variables) {
    const notificationService = require('../services/NotificationService');
    return await notificationService.sendWhatsAppNotification(recipient, templateKey, variables);
  }
}

module.exports = NotificationController;
