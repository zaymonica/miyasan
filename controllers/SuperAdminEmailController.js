/**
 * Super Admin Email Controller
 * Manages email templates
 */

const BaseController = require('./BaseController');
const { pool } = require('../config/database');
const { logger } = require('../config/logger');

class SuperAdminEmailController extends BaseController {
  /**
   * Get all email templates
   * GET /api/superadmin/email/templates
   */
  static async getAllTemplates(req, res) {
    try {
      const [templates] = await pool.execute(
        'SELECT * FROM email_templates ORDER BY category, template_name'
      );

      return res.json({
        success: true,
        data: templates
      });
    } catch (error) {
      logger.error('Error getting email templates', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error loading email templates'
      });
    }
  }

  /**
   * Get email template by key
   * GET /api/superadmin/email/templates/:key
   */
  static async getTemplate(req, res) {
    try {
      const { key } = req.params;

      const [templates] = await pool.execute(
        'SELECT * FROM email_templates WHERE template_key = ?',
        [key]
      );

      if (templates.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Template not found'
        });
      }

      return res.json({
        success: true,
        data: templates[0]
      });
    } catch (error) {
      logger.error('Error getting email template', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error loading email template'
      });
    }
  }

  /**
   * Update email template
   * PUT /api/superadmin/email/templates/:key
   */
  static async updateTemplate(req, res) {
    try {
      const { key } = req.params;
      const { subject, html_body, text_body } = req.body;

      // Check if template exists
      const [existing] = await pool.execute(
        'SELECT * FROM email_templates WHERE template_key = ?',
        [key]
      );

      if (existing.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Template not found'
        });
      }

      // Validation
      if (!subject || !html_body || !text_body) {
        return res.status(400).json({
          success: false,
          message: 'Subject, HTML body, and text body are required'
        });
      }

      await pool.execute(
        'UPDATE email_templates SET subject = ?, html_body = ?, text_body = ? WHERE template_key = ?',
        [subject, html_body, text_body, key]
      );

      logger.info('Email template updated', { template_key: key });

      return res.json({
        success: true,
        message: 'Template updated successfully'
      });
    } catch (error) {
      logger.error('Error updating email template', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error updating email template'
      });
    }
  }

  /**
   * Reset email template to default
   * POST /api/superadmin/email/templates/:key/reset
   */
  static async resetTemplate(req, res) {
    try {
      const { key } = req.params;

      // Default templates
      const defaults = {
        account_created: {
          subject: 'Welcome to {{company_name}}!',
          html: '<h1>Welcome {{customer_name}}!</h1><p>Your account has been created successfully.</p><p>Plan: {{plan_name}}</p>',
          text: 'Welcome {{customer_name}}! Your account has been created successfully. Plan: {{plan_name}}'
        },
        account_cancelled: {
          subject: 'Account Cancelled - {{company_name}}',
          html: '<h1>Account Cancelled</h1><p>Dear {{customer_name}}, your account has been cancelled.</p>',
          text: 'Dear {{customer_name}}, your account has been cancelled.'
        },
        payment_success: {
          subject: 'Payment Received - {{company_name}}',
          html: '<h1>Payment Successful</h1><p>Thank you {{customer_name}}! We received your payment of {{amount}} {{currency}}.</p>',
          text: 'Thank you {{customer_name}}! We received your payment of {{amount}} {{currency}}.'
        },
        payment_failed: {
          subject: 'Payment Failed - {{company_name}}',
          html: '<h1>Payment Failed</h1><p>Dear {{customer_name}}, your payment of {{amount}} {{currency}} failed.</p>',
          text: 'Dear {{customer_name}}, your payment of {{amount}} {{currency}} failed.'
        },
        payment_reminder: {
          subject: 'Payment Due Soon - {{company_name}}',
          html: '<h1>Payment Reminder</h1><p>Dear {{customer_name}}, your payment of {{amount}} {{currency}} is due on {{due_date}}.</p>',
          text: 'Dear {{customer_name}}, your payment of {{amount}} {{currency}} is due on {{due_date}}.'
        },
        grace_period_warning: {
          subject: 'Account Suspension Warning - {{company_name}}',
          html: '<h1>Grace Period Warning</h1><p>Dear {{customer_name}}, your payment is overdue. Your account will be suspended in {{days_remaining}} days.</p>',
          text: 'Dear {{customer_name}}, your payment is overdue. Your account will be suspended in {{days_remaining}} days.'
        },
        account_suspended: {
          subject: 'Account Suspended - {{company_name}}',
          html: '<h1>Account Suspended</h1><p>Dear {{customer_name}}, your account has been suspended due to non-payment.</p>',
          text: 'Dear {{customer_name}}, your account has been suspended due to non-payment.'
        }
      };

      if (!defaults[key]) {
        return res.status(404).json({
          success: false,
          message: 'Template not found'
        });
      }

      const defaultTemplate = defaults[key];

      await pool.execute(
        'UPDATE email_templates SET subject = ?, html_body = ?, text_body = ? WHERE template_key = ?',
        [defaultTemplate.subject, defaultTemplate.html, defaultTemplate.text, key]
      );

      logger.info('Email template reset to default', { template_key: key });

      return res.json({
        success: true,
        message: 'Template reset to default successfully'
      });
    } catch (error) {
      logger.error('Error resetting email template', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error resetting email template'
      });
    }
  }

  /**
   * Preview email template with sample data
   * POST /api/superadmin/email/templates/:key/preview
   */
  static async previewTemplate(req, res) {
    try {
      const { key } = req.params;

      const [templates] = await pool.execute(
        'SELECT * FROM email_templates WHERE template_key = ?',
        [key]
      );

      if (templates.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Template not found'
        });
      }

      const template = templates[0];

      // Sample data for preview
      const sampleData = {
        customer_name: 'John Doe',
        company_name: 'Misayan SaaS',
        plan_name: 'Professional Plan',
        amount: '79.99',
        currency: 'USD',
        due_date: '2025-01-15',
        days_until_due: '7',
        days_remaining: '3',
        suspension_date: '2025-01-20',
        support_email: 'support@saas.misayan.cloud',
        support_phone: '+1 (555) 123-4567'
      };

      // Replace variables
      let previewSubject = template.subject;
      let previewHtml = template.html_body;
      let previewText = template.text_body;

      for (const [key, value] of Object.entries(sampleData)) {
        const regex = new RegExp(`{{${key}}}`, 'g');
        previewSubject = previewSubject.replace(regex, value);
        previewHtml = previewHtml.replace(regex, value);
        previewText = previewText.replace(regex, value);
      }

      return res.json({
        success: true,
        data: {
          subject: previewSubject,
          html_body: previewHtml,
          text_body: previewText,
          sample_data: sampleData
        }
      });
    } catch (error) {
      logger.error('Error previewing email template', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error previewing email template'
      });
    }
  }

  /**
   * Send test email
   * POST /api/superadmin/email/test
   */
  static async sendTestEmail(req, res) {
    try {
      const { template_key, recipient_email } = req.body;

      if (!template_key || !recipient_email) {
        return res.status(400).json({
          success: false,
          message: 'Template key and recipient email are required'
        });
      }

      // Get template
      const [templates] = await pool.execute(
        'SELECT * FROM email_templates WHERE template_key = ?',
        [template_key]
      );

      if (templates.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Template not found'
        });
      }

      // Get SMTP settings
      const [smtpSettings] = await pool.execute(
        'SELECT * FROM smtp_settings WHERE id = 1'
      );

      if (!smtpSettings[0] || !smtpSettings[0].enabled) {
        return res.status(400).json({
          success: false,
          message: 'SMTP is not configured or enabled'
        });
      }

      const template = templates[0];
      const smtp = smtpSettings[0];

      // Sample data
      const sampleData = {
        customer_name: 'Test User',
        company_name: 'Misayan SaaS',
        plan_name: 'Professional Plan',
        amount: '79.99',
        currency: 'USD',
        due_date: '2025-01-15',
        days_until_due: '7',
        days_remaining: '3',
        suspension_date: '2025-01-20'
      };

      // Replace variables
      let subject = template.subject;
      let htmlBody = template.html_body;
      let textBody = template.text_body;

      for (const [key, value] of Object.entries(sampleData)) {
        const regex = new RegExp(`{{${key}}}`, 'g');
        subject = subject.replace(regex, value);
        htmlBody = htmlBody.replace(regex, value);
        textBody = textBody.replace(regex, value);
      }

      // Send email
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransporter({
        host: smtp.smtp_host,
        port: smtp.smtp_port,
        secure: smtp.smtp_secure,
        auth: {
          user: smtp.smtp_user,
          pass: smtp.smtp_password
        }
      });

      await transporter.sendMail({
        from: `"${smtp.smtp_from_name}" <${smtp.smtp_from_email}>`,
        to: recipient_email,
        subject: `[TEST] ${subject}`,
        text: textBody,
        html: htmlBody
      });

      logger.info('Test email sent', { template_key, recipient_email });

      return res.json({
        success: true,
        message: 'Test email sent successfully'
      });
    } catch (error) {
      logger.error('Error sending test email', { error: error.message });
      return res.status(500).json({
        success: false,
        message: `Error sending test email: ${error.message}`
      });
    }
  }
}

module.exports = SuperAdminEmailController;
