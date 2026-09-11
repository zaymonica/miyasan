/**
 * Notification Service
 * Handles automated email and WhatsApp notifications for the platform
 * 
 * @module services/NotificationService
 */

const { pool } = require('../config/database');
const { logger } = require('../config/logger');
const nodemailer = require('nodemailer');

class NotificationService {
  constructor() {
    this.checkInterval = null;
    this.whatsappService = null;
    this.platformSettings = null;
  }

  /**
   * Get platform settings from database
   */
  async getPlatformSettings() {
    if (this.platformSettings) {
      return this.platformSettings;
    }

    try {
      // Get settings from landing_page_settings
      const [settings] = await pool.execute(
        'SELECT company_name, contact_email, meta_title FROM landing_page_settings WHERE id = 1'
      );

      // Get system settings
      const [sysSettings] = await pool.execute(
        "SELECT setting_value FROM system_settings_kv WHERE setting_key = 'system_name'"
      );

      const platformName = sysSettings[0]?.setting_value || settings[0]?.company_name || 'Misayan SaaS';
      const supportEmail = settings[0]?.contact_email || 'support@misayan.cloud';

      this.platformSettings = {
        platformName,
        supportEmail,
        platformDomain: process.env.APP_URL ? new URL(process.env.APP_URL).host : 'saas.misayan.cloud'
      };

      return this.platformSettings;
    } catch (error) {
      logger.error('Error getting platform settings:', error);
      return {
        platformName: 'Misayan SaaS',
        supportEmail: 'support@misayan.cloud',
        platformDomain: 'saas.misayan.cloud'
      };
    }
  }

  /**
   * Initialize notification service
   */
  initialize(whatsappService) {
    this.whatsappService = whatsappService;
    this.startExpirationChecker();
    logger.info('✅ Notification Service initialized');
  }

  /**
   * Start checking for plan expirations (runs every hour)
   */
  startExpirationChecker() {
    // Run immediately on startup
    this.checkPlanExpirations().catch(err => {
      logger.error('Error in initial expiration check:', err);
    });

    // Then run every hour
    this.checkInterval = setInterval(async () => {
      try {
        await this.checkPlanExpirations();
      } catch (error) {
        logger.error('Error checking plan expirations:', error);
      }
    }, 3600000); // 1 hour

    logger.info('⏰ Plan expiration checker started (runs every hour)');
  }

  /**
   * Stop the expiration checker
   */
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      logger.info('⏹️  Plan expiration checker stopped');
    }
  }

  /**
   * Check for plan expirations and send notifications
   */
  async checkPlanExpirations() {
    try {
      logger.info('🔍 Checking for plan expirations...');

      // Get expiration settings
      const [settings] = await pool.execute(
        'SELECT * FROM plan_expiration_settings WHERE id = 1'
      );

      if (!settings[0] || !settings[0].enabled) {
        logger.debug('Plan expiration notifications are disabled');
        return;
      }

      const config = settings[0];
      const daysToCheck = [
        config.days_before_1,
        config.days_before_2,
        config.days_before_3,
        config.days_before_4,
        -config.days_after_1,
        -config.days_after_2,
        -config.days_after_3
      ].filter(d => d !== null && d !== undefined);

      logger.debug(`Checking for expirations at: ${daysToCheck.join(', ')} days`);

      // Get tenants with expiring plans
      for (const days of daysToCheck) {
        await this.checkAndNotifyForDays(days);
      }

      logger.info('✅ Plan expiration check completed');
    } catch (error) {
      logger.error('Error in checkPlanExpirations:', error);
    }
  }

  /**
   * Check and notify tenants for specific days before/after expiration
   */
  async checkAndNotifyForDays(days) {
    try {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + days);
      targetDate.setHours(0, 0, 0, 0);

      const nextDate = new Date(targetDate);
      nextDate.setDate(nextDate.getDate() + 1);

      logger.debug(`Checking tenants expiring on ${targetDate.toISOString().split('T')[0]} (${days} days)`);

      // Find tenants with subscription_end_date matching the target date
      const [tenants] = await pool.execute(
        `SELECT t.*, sp.name as plan_name 
         FROM tenants t 
         LEFT JOIN subscription_plans sp ON t.plan_id = sp.id 
         WHERE t.subscription_end_date >= ? 
         AND t.subscription_end_date < ?
         AND t.status IN ('active', 'grace_period')`,
        [targetDate, nextDate]
      );

      logger.debug(`Found ${tenants.length} tenants to notify for ${days} days`);

      for (const tenant of tenants) {
        await this.sendExpirationNotification(tenant, days);
      }
    } catch (error) {
      logger.error(`Error checking for ${days} days:`, error);
    }
  }

  /**
   * Send expiration notification to tenant
   */
  async sendExpirationNotification(tenant, daysRemaining) {
    try {
      const templateKey = daysRemaining >= 0 ? 'plan_expiring_soon' : 'plan_expired';
      
      // Check if notification was already sent today
      const today = new Date().toISOString().split('T')[0];
      const [existing] = await pool.execute(
        `SELECT id FROM notification_logs 
         WHERE tenant_id = ? 
         AND template_key = ? 
         AND DATE(created_at) = ?
         AND status = 'sent'`,
        [tenant.id, templateKey, today]
      );

      if (existing.length > 0) {
        logger.debug(`Notification already sent today for tenant ${tenant.id}`);
        return;
      }

      const settings = await this.getPlatformSettings();

      const variables = {
        tenant_name: tenant.name,
        platform_name: settings.platformName,
        subdomain: tenant.subdomain,
        plan_name: tenant.plan_name || 'N/A',
        days_remaining: Math.abs(daysRemaining).toString(),
        expiry_date: tenant.subscription_end_date ? 
          new Date(tenant.subscription_end_date).toLocaleDateString('en-US') : 'N/A',
        renewal_link: `https://${tenant.subdomain}.${settings.platformDomain}/admin`,
        login_url: `https://${tenant.subdomain}.${settings.platformDomain}/login`,
        support_email: settings.supportEmail,
        grace_days: '7'
      };

      const results = { email: null, whatsapp: null };

      // Send email notification
      if (tenant.email) {
        try {
          results.email = await this.sendEmailNotification(tenant.email, templateKey, variables, tenant.id);
          logger.info(`✉️  Email notification sent to tenant ${tenant.id} (${tenant.email})`);
        } catch (emailError) {
          logger.error(`Email notification failed for tenant ${tenant.id}:`, emailError);
        }
      }

      /* WhatsApp notifications temporarily disabled
      // Send WhatsApp notification
      if (tenant.phone) {
        try {
          results.whatsapp = await this.sendWhatsAppNotification(tenant.phone, templateKey, variables, tenant.id);
          logger.info(`📱 WhatsApp notification sent to tenant ${tenant.id} (${tenant.phone})`);
        } catch (waError) {
          logger.error(`WhatsApp notification failed for tenant ${tenant.id}:`, waError);
        }
      }
      */

      return results;
    } catch (error) {
      logger.error(`Error sending notification to tenant ${tenant.id}:`, error);
    }
  }

  /**
   * Send email notification using template
   */
  async sendEmailNotification(recipient, templateKey, variables, tenantId = null) {
    try {
      // Get email settings
      const [settings] = await pool.execute(
        'SELECT * FROM email_notification_settings WHERE id = 1'
      );

      if (!settings[0] || !settings[0].enabled) {
        throw new Error('Email notifications are not enabled');
      }

      const setting = settings[0];

      // Get template
      const [templates] = await pool.execute(
        'SELECT * FROM email_notification_templates WHERE template_key = ? AND enabled = TRUE',
        [templateKey]
      );

      if (templates.length === 0) {
        throw new Error(`Email template '${templateKey}' not found or disabled`);
      }

      const template = templates[0];

      // Replace variables in subject and body
      let subject = template.subject;
      let body = template.html_body || template.body;

      for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`{{${key}}}`, 'g');
        subject = subject.replace(regex, value);
        body = body.replace(regex, value);
      }

      // Create transporter
      const transporterConfig = {
        host: setting.smtp_host,
        port: parseInt(setting.smtp_port),
        secure: setting.smtp_secure === true || setting.smtp_secure === 'true' || parseInt(setting.smtp_port) === 465,
        auth: {
          user: setting.smtp_user,
          pass: setting.smtp_password
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
        tls: {
          rejectUnauthorized: false,
          minVersion: 'TLSv1.2'
        }
      };

      if (parseInt(setting.smtp_port) === 587) {
        transporterConfig.secure = false;
        transporterConfig.requireTLS = true;
      }

      const transporter = nodemailer.createTransport(transporterConfig);

      // Send email
      await transporter.sendMail({
        from: `"${setting.from_name}" <${setting.from_email}>`,
        to: recipient,
        subject: subject,
        html: body
      });

      // Log notification
      await pool.execute(
        `INSERT INTO notification_logs (tenant_id, notification_type, template_key, recipient, subject, message, status, sent_at)
         VALUES (?, 'email', ?, ?, ?, ?, 'sent', NOW())`,
        [tenantId, templateKey, recipient, subject, body]
      );

      return { success: true };
    } catch (error) {
      // Log failed notification
      try {
        await pool.execute(
          `INSERT INTO notification_logs (tenant_id, notification_type, template_key, recipient, message, status, error_message)
           VALUES (?, 'email', ?, ?, '', 'failed', ?)`,
          [tenantId, templateKey, recipient, error.message]
        );
      } catch (logError) {
        logger.error('Failed to log notification error:', logError);
      }
      throw error;
    }
  }

  /**
   * Send WhatsApp notification using template
   */
  async sendWhatsAppNotification(recipient, templateKey, variables, tenantId = null) {
    try {
      // Get WhatsApp settings
      const [settings] = await pool.execute(
        'SELECT * FROM whatsapp_notification_settings WHERE id = 1'
      );

      if (!settings[0] || !settings[0].enabled) {
        throw new Error('WhatsApp notifications are not enabled');
      }

      if (!settings[0].connected) {
        throw new Error('WhatsApp is not connected');
      }

      // Get template
      const [templates] = await pool.execute(
        'SELECT * FROM whatsapp_notification_templates WHERE template_key = ? AND enabled = TRUE',
        [templateKey]
      );

      if (templates.length === 0) {
        throw new Error(`WhatsApp template '${templateKey}' not found or disabled`);
      }

      const template = templates[0];

      // Replace variables in message
      let message = template.message;
      for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`{{${key}}}`, 'g');
        message = message.replace(regex, value);
      }

      // Send via WhatsApp service (tenant 0 = superadmin)
      if (!this.whatsappService) {
        throw new Error('WhatsApp service not initialized');
      }

      const result = await this.whatsappService.sendMessage(0, recipient, message);

      if (!result.success) {
        throw new Error(result.error || 'Failed to send WhatsApp message');
      }

      // Log notification
      await pool.execute(
        `INSERT INTO notification_logs (tenant_id, notification_type, template_key, recipient, message, status, sent_at)
         VALUES (?, 'whatsapp', ?, ?, ?, 'sent', NOW())`,
        [tenantId, templateKey, recipient, message]
      );

      return { success: true };
    } catch (error) {
      // Log failed notification
      try {
        await pool.execute(
          `INSERT INTO notification_logs (tenant_id, notification_type, template_key, recipient, message, status, error_message)
           VALUES (?, 'whatsapp', ?, ?, '', 'failed', ?)`,
          [tenantId, templateKey, recipient, error.message]
        );
      } catch (logError) {
        logger.error('Failed to log notification error:', logError);
      }
      throw error;
    }
  }

  /**
   * Send notification to specific tenant (used by controllers)
   */
  async sendNotificationToTenant(tenantId, templateKey, type = 'both', customData = {}) {
    try {
      const [tenants] = await pool.execute(
        `SELECT t.*, sp.name as plan_name FROM tenants t 
         LEFT JOIN subscription_plans sp ON t.plan_id = sp.id WHERE t.id = ?`,
        [tenantId]
      );

      if (tenants.length === 0) {
        throw new Error('Tenant not found');
      }

      const tenant = tenants[0];
      const results = { email: null, whatsapp: null };
      const settings = await this.getPlatformSettings();

      // Build login URL
      const loginUrl = `https://${settings.platformDomain}/login`;

      const variables = {
        tenant_name: tenant.name || tenant.company_name || 'Customer',
        platform_name: settings.platformName,
        plan_name: tenant.plan_name || 'N/A',
        login_url: loginUrl,
        support_email: settings.supportEmail,
        expiry_date: tenant.subscription_end_date ? 
          new Date(tenant.subscription_end_date).toLocaleDateString('en-US') : 'N/A',
        grace_days: '7',
        ...customData
      };

      // Send email notification (type 'email' or 'both')
      if (type === 'email' || type === 'both') {
        if (tenant.email) {
          try {
            results.email = await this.sendEmailNotification(tenant.email, templateKey, variables, tenantId);
            logger.info(`✉️ Email notification (${templateKey}) sent to tenant ${tenantId}`);
          } catch (emailError) {
            logger.error('Email notification failed:', emailError);
            results.email = { success: false, error: emailError.message };
          }
        } else {
          logger.warn(`No email address for tenant ${tenantId}`);
        }
      }

      /* WhatsApp notifications temporarily disabled
      if (type === 'whatsapp' || type === 'both') {
        if (tenant.phone) {
          try {
            results.whatsapp = await this.sendWhatsAppNotification(tenant.phone, templateKey, variables, tenantId);
            logger.info(`📱 WhatsApp notification (${templateKey}) sent to tenant ${tenantId}`);
          } catch (waError) {
            logger.error('WhatsApp notification failed:', waError);
            results.whatsapp = { success: false, error: waError.message };
          }
        } else {
          logger.warn(`No phone number for tenant ${tenantId}`);
        }
      }
      */

      return results;
    } catch (error) {
      logger.error('Send notification to tenant error:', error);
      throw error;
    }
  }

  /**
   * Send password reset notification (email and/or WhatsApp)
   * @param {Object} options - Reset options
   * @param {string} options.email - Recipient email
   * @param {string} options.phone - Recipient phone (optional)
   * @param {string} options.name - Recipient name
   * @param {string} options.resetToken - Password reset token
   * @param {string} options.subdomain - Tenant subdomain
   * @param {number} options.tenantId - Tenant ID
   * @returns {Promise<Object>} Results of notifications sent
   */
  async sendPasswordResetNotification({ email, phone, name, resetToken, subdomain, tenantId }) {
    const results = { email: null, whatsapp: null };
    const settings = await this.getPlatformSettings();
    
    // Build reset link
    const resetLink = subdomain ? 
      `https://${subdomain}.${settings.platformDomain}/reset-password?token=${resetToken}` :
      `https://${settings.platformDomain}/reset-password?token=${resetToken}`;

    const variables = {
      tenant_name: name || 'Customer',
      platform_name: settings.platformName,
      reset_link: resetLink,
      expiry_hours: '1',
      support_email: settings.supportEmail
    };

    // Send email notification
    if (email) {
      try {
        results.email = await this.sendEmailNotification(email, 'password_reset', variables, tenantId);
        logger.info(`✉️ Password reset email sent to ${email}`);
      } catch (emailError) {
        logger.error('Password reset email failed:', emailError);
        results.email = { success: false, error: emailError.message };
      }
    }

    /* WhatsApp notifications temporarily disabled
    // Send WhatsApp notification
    if (phone) {
      try {
        results.whatsapp = await this.sendWhatsAppNotification(phone, 'password_reset', variables, tenantId);
        logger.info(`📱 Password reset WhatsApp sent to ${phone}`);
      } catch (waError) {
        logger.error('Password reset WhatsApp failed:', waError);
        results.whatsapp = { success: false, error: waError.message };
      }
    }
    */

    return results;
  }

  /**
   * Send welcome notification to new tenant
   * @param {number} tenantId - Tenant ID
   * @param {Object} additionalData - Additional data like admin credentials
   * @returns {Promise<Object>} Results of notifications sent
   */
  async sendWelcomeNotification(tenantId, additionalData = {}) {
    try {
      const [tenants] = await pool.execute(
        `SELECT t.*, sp.name as plan_name FROM tenants t 
         LEFT JOIN subscription_plans sp ON t.plan_id = sp.id WHERE t.id = ?`,
        [tenantId]
      );

      if (tenants.length === 0) {
        throw new Error('Tenant not found');
      }

      const tenant = tenants[0];
      const results = { email: null, whatsapp: null };
      const settings = await this.getPlatformSettings();

      const loginUrl = `${settings.platformDomain}/login`;
      
      const variables = {
        tenant_name: tenant.name || tenant.company_name || 'Customer',
        platform_name: settings.platformName,
        plan_name: tenant.plan_name || 'Standard',
        login_url: loginUrl,
        support_email: settings.supportEmail,
        admin_username: additionalData.admin_username || ''
      };

      // Send email
      if (tenant.email) {
        try {
          results.email = await this.sendEmailNotification(tenant.email, 'welcome', variables, tenantId);
          logger.info(`✉️ Welcome email sent to tenant ${tenantId} (${tenant.email})`);
        } catch (emailError) {
          logger.error('Welcome email failed:', emailError);
          results.email = { success: false, error: emailError.message };
        }
      }

      /* WhatsApp notifications temporarily disabled
      // Send WhatsApp
      if (tenant.phone) {
        try {
          results.whatsapp = await this.sendWhatsAppNotification(tenant.phone, 'welcome', variables, tenantId);
          logger.info(`📱 Welcome WhatsApp sent to tenant ${tenantId} (${tenant.phone})`);
        } catch (waError) {
          logger.error('Welcome WhatsApp failed:', waError);
          results.whatsapp = { success: false, error: waError.message };
        }
      }
      */

      return results;
    } catch (error) {
      logger.error('Send welcome notification error:', error);
      throw error;
    }
  }

  /**
   * Send account suspended notification
   * @param {number} tenantId - Tenant ID
   * @param {string} reason - Suspension reason
   * @returns {Promise<Object>} Results of notifications sent
   */
  async sendAccountSuspendedNotification(tenantId, reason = 'Payment overdue') {
    return this.sendNotificationToTenant(tenantId, 'account_suspended', 'both', {
      suspension_reason: reason
    });
  }

  /**
   * Send account reactivated notification
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<Object>} Results of notifications sent
   */
  async sendAccountReactivatedNotification(tenantId) {
    return this.sendNotificationToTenant(tenantId, 'account_reactivated', 'both');
  }
}

module.exports = new NotificationService();
