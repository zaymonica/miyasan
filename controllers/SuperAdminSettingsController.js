/**
 * Super Admin Settings Controller
 * Manages system settings, SMTP, and payment gateways
 */

const BaseController = require('./BaseController');
const { pool } = require('../config/database');
const { logger } = require('../config/logger');
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../public/uploads/system');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const prefix = file.fieldname === 'favicon' ? 'favicon' : 'logo';
    cb(null, `${prefix}-${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|svg|ico/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype) || file.mimetype === 'image/x-icon' || file.mimetype === 'image/vnd.microsoft.icon';
    if (extname || mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed'));
  }
}).fields([
  { name: 'system_logo', maxCount: 1 },
  { name: 'favicon', maxCount: 1 }
]);

class SuperAdminSettingsController extends BaseController {
  /**
   * Get super admin profile
   * GET /api/superadmin/profile
   */
  static async getProfile(req, res) {
    try {
      const adminId = req.user.id;
      const [admins] = await pool.execute(
        'SELECT id, email, name FROM super_admins WHERE id = ?',
        [adminId]
      );

      if (admins.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Super admin not found'
        });
      }

      return res.json({
        success: true,
        data: admins[0]
      });
    } catch (error) {
      logger.error('Error getting super admin profile', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error loading profile'
      });
    }
  }

  /**
   * Update super admin profile
   * PUT /api/superadmin/profile
   */
  static async updateProfile(req, res) {
    try {
      const adminId = req.user.id;
      const { email, current_password, new_password } = req.body;

      // Verify current password if changing password or email
      if (new_password || email) {
        const [admins] = await pool.execute(
          'SELECT password FROM super_admins WHERE id = ?',
          [adminId]
        );

        if (admins.length === 0) {
          return res.status(404).json({
            success: false,
            message: 'Super admin not found'
          });
        }

        // If changing password, verify current password
        if (new_password && !current_password) {
           return res.status(400).json({
            success: false,
            message: 'Current password is required to set a new password'
          });
        }

        if (current_password) {
             const isValidPassword = await bcrypt.compare(current_password, admins[0].password);
             if (!isValidPassword) {
                return res.status(401).json({
                  success: false,
                  message: 'Invalid current password'
                });
             }
        }
      }

      const updateFields = [];
      const values = [];

      if (email) {
        // Check if email is taken by another superadmin
        const [existing] = await pool.execute(
          'SELECT id FROM super_admins WHERE email = ? AND id != ?',
          [email, adminId]
        );

        if (existing.length > 0) {
          return res.status(400).json({
            success: false,
            message: 'Email already in use'
          });
        }

        updateFields.push('email = ?');
        values.push(email);
      }

      if (new_password) {
        const hashedPassword = await bcrypt.hash(new_password, 10);
        updateFields.push('password = ?');
        values.push(hashedPassword);
      }

      if (updateFields.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No changes provided'
        });
      }

      values.push(adminId);

      await pool.execute(
        `UPDATE super_admins SET ${updateFields.join(', ')} WHERE id = ?`,
        values
      );

      logger.info('Super admin profile updated', { adminId });

      return res.json({
        success: true,
        message: 'Profile updated successfully'
      });
    } catch (error) {
      logger.error('Error updating super admin profile', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error updating profile'
      });
    }
  }

  /**
   * Get system settings
   * GET /api/superadmin/settings/system
   */
  static async getSystemSettings(req, res) {
    try {
      const [settings] = await pool.execute(
        'SELECT * FROM system_settings WHERE id = 1'
      );

      return res.json({
        success: true,
        data: settings[0] || {
          grace_period_days: 7,
          payment_reminder_days: '7,3,2,1',
          overdue_reminder_interval_days: 2,
          auto_suspend_enabled: true
        }
      });
    } catch (error) {
      logger.error('Error getting system settings', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error loading system settings'
      });
    }
  }

  /**
   * Update system settings
   * PUT /api/superadmin/settings/system
   */
  static async updateSystemSettings(req, res) {
    try {
      const {
        grace_period_days,
        payment_reminder_days,
        overdue_reminder_interval_days,
        auto_suspend_enabled
      } = req.body;

      // Validation
      if (grace_period_days !== undefined && (grace_period_days < 0 || grace_period_days > 90)) {
        return res.status(400).json({
          success: false,
          message: 'Grace period must be between 0 and 90 days'
        });
      }

      const updateFields = [];
      const values = [];

      if (grace_period_days !== undefined) {
        updateFields.push('grace_period_days = ?');
        values.push(grace_period_days);
      }
      if (payment_reminder_days !== undefined) {
        updateFields.push('payment_reminder_days = ?');
        values.push(payment_reminder_days);
      }
      if (overdue_reminder_interval_days !== undefined) {
        updateFields.push('overdue_reminder_interval_days = ?');
        values.push(overdue_reminder_interval_days);
      }
      if (auto_suspend_enabled !== undefined) {
        updateFields.push('auto_suspend_enabled = ?');
        values.push(auto_suspend_enabled);
      }

      if (updateFields.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No fields to update'
        });
      }

      await pool.execute(
        `INSERT INTO system_settings (id, ${updateFields.map((_, i) => updateFields[i].split(' = ')[0]).join(', ')})
         VALUES (1, ${values.map(() => '?').join(', ')})
         ON DUPLICATE KEY UPDATE ${updateFields.join(', ')}`,
        [...values, ...values]
      );

      logger.info('System settings updated');

      return res.json({
        success: true,
        message: 'System settings updated successfully'
      });
    } catch (error) {
      logger.error('Error updating system settings', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error updating system settings'
      });
    }
  }

  /**
   * Get SMTP settings
   * GET /api/superadmin/settings/smtp
   */
  static async getSMTPSettings(req, res) {
    try {
      const [settings] = await pool.execute(
        'SELECT * FROM smtp_settings WHERE id = 1'
      );

      // Don't send password to client
      if (settings[0]) {
        delete settings[0].smtp_password;
      }

      return res.json({
        success: true,
        data: settings[0] || {}
      });
    } catch (error) {
      logger.error('Error getting SMTP settings', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error loading SMTP settings'
      });
    }
  }

  /**
   * Update SMTP settings
   * PUT /api/superadmin/settings/smtp
   */
  static async updateSMTPSettings(req, res) {
    try {
      const {
        smtp_host,
        smtp_port,
        smtp_user,
        smtp_password,
        smtp_from_email,
        smtp_from_name,
        smtp_secure,
        enabled
      } = req.body;

      // Validation
      if (!smtp_host || !smtp_port || !smtp_user || !smtp_from_email) {
        return res.status(400).json({
          success: false,
          message: 'Host, port, user, and from email are required'
        });
      }

      const updateFields = [];
      const values = [];

      updateFields.push('smtp_host = ?', 'smtp_port = ?', 'smtp_user = ?', 
                       'smtp_from_email = ?', 'smtp_from_name = ?', 'smtp_secure = ?');
      values.push(smtp_host, smtp_port, smtp_user, smtp_from_email, 
                 smtp_from_name || 'System', smtp_secure !== false);

      if (smtp_password) {
        updateFields.push('smtp_password = ?');
        values.push(smtp_password);
      }

      if (enabled !== undefined) {
        updateFields.push('enabled = ?');
        values.push(enabled);
      }

      await pool.execute(
        `INSERT INTO smtp_settings (id, ${updateFields.map((_, i) => updateFields[i].split(' = ')[0]).join(', ')})
         VALUES (1, ${values.map(() => '?').join(', ')})
         ON DUPLICATE KEY UPDATE ${updateFields.join(', ')}`,
        [...values, ...values]
      );

      logger.info('SMTP settings updated');

      return res.json({
        success: true,
        message: 'SMTP settings updated successfully'
      });
    } catch (error) {
      logger.error('Error updating SMTP settings', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error updating SMTP settings'
      });
    }
  }

  /**
   * Test SMTP connection
   * POST /api/superadmin/settings/smtp/test
   */
  static async testSMTPConnection(req, res) {
    try {
      const { test_email } = req.body;

      if (!test_email) {
        return res.status(400).json({
          success: false,
          message: 'Test email address is required'
        });
      }

      const [settings] = await pool.execute(
        'SELECT * FROM smtp_settings WHERE id = 1'
      );

      if (!settings[0] || !settings[0].smtp_host) {
        return res.status(400).json({
          success: false,
          message: 'SMTP settings not configured'
        });
      }

      const config = settings[0];

      const transporter = nodemailer.createTransport({
        host: config.smtp_host,
        port: config.smtp_port,
        secure: config.smtp_secure,
        auth: {
          user: config.smtp_user,
          pass: config.smtp_password
        }
      });

      await transporter.verify();

      await transporter.sendMail({
        from: `"${config.smtp_from_name}" <${config.smtp_from_email}>`,
        to: test_email,
        subject: 'SMTP Test Email',
        text: 'This is a test email from your SaaS platform. SMTP is configured correctly!',
        html: '<h1>SMTP Test Email</h1><p>This is a test email from your SaaS platform. SMTP is configured correctly!</p>'
      });

      logger.info('SMTP test email sent', { test_email });

      return res.json({
        success: true,
        message: 'Test email sent successfully'
      });
    } catch (error) {
      logger.error('SMTP test failed', { error: error.message });
      return res.status(500).json({
        success: false,
        message: `SMTP test failed: ${error.message}`
      });
    }
  }

  /**
   * Get payment gateway settings
   * GET /api/superadmin/settings/payment-gateways
   */
  static async getPaymentGateways(req, res) {
    try {
      const [gateways] = await pool.execute(
        'SELECT * FROM payment_gateway_settings'
      );

      // Mask sensitive data
      const maskedGateways = gateways.map(gw => ({
        ...gw,
        stripe_secret_key: gw.stripe_secret_key ? '***' : null,
        stripe_webhook_secret: gw.stripe_webhook_secret ? '***' : null,
        paypal_client_secret: gw.paypal_client_secret ? '***' : null
      }));

      return res.json({
        success: true,
        data: maskedGateways
      });
    } catch (error) {
      logger.error('Error getting payment gateways', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error loading payment gateways'
      });
    }
  }

  /**
   * Update payment gateway settings
   * PUT /api/superadmin/settings/payment-gateways/:gateway
   */
  static async updatePaymentGateway(req, res) {
    try {
      const { gateway } = req.params;
      const updates = req.body;

      if (!['stripe', 'paypal'].includes(gateway)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid gateway. Must be stripe or paypal'
        });
      }

      const updateFields = [];
      const values = [];

      if (gateway === 'stripe') {
        if (updates.stripe_secret_key) {
          updateFields.push('stripe_secret_key = ?');
          values.push(updates.stripe_secret_key);
        }
        if (updates.stripe_publishable_key) {
          updateFields.push('stripe_publishable_key = ?');
          values.push(updates.stripe_publishable_key);
        }
        if (updates.stripe_webhook_secret) {
          updateFields.push('stripe_webhook_secret = ?');
          values.push(updates.stripe_webhook_secret);
        }
      } else if (gateway === 'paypal') {
        if (updates.paypal_client_id) {
          updateFields.push('paypal_client_id = ?');
          values.push(updates.paypal_client_id);
        }
        if (updates.paypal_client_secret) {
          updateFields.push('paypal_client_secret = ?');
          values.push(updates.paypal_client_secret);
        }
        if (updates.paypal_mode) {
          updateFields.push('paypal_mode = ?');
          values.push(updates.paypal_mode);
        }
      }

      if (updates.enabled !== undefined) {
        updateFields.push('enabled = ?');
        values.push(updates.enabled);
      }

      if (updateFields.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No fields to update'
        });
      }

      values.push(gateway);

      await pool.execute(
        `INSERT INTO payment_gateway_settings (gateway_name, ${updateFields.map((_, i) => updateFields[i].split(' = ')[0]).join(', ')})
         VALUES (?, ${values.slice(0, -1).map(() => '?').join(', ')})
         ON DUPLICATE KEY UPDATE ${updateFields.join(', ')}`,
        [gateway, ...values.slice(0, -1), ...values.slice(0, -1)]
      );

      logger.info('Payment gateway updated', { gateway });

      return res.json({
        success: true,
        message: 'Payment gateway updated successfully'
      });
    } catch (error) {
      logger.error('Error updating payment gateway', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error updating payment gateway'
      });
    }
  }

  /**
   * Get system branding settings
   * GET /api/superadmin/system-branding
   */
  static async getSystemBranding(req, res) {
    try {
      // Get from system_settings_kv
      const [settings] = await pool.execute(
        `SELECT setting_key, setting_value FROM system_settings_kv 
         WHERE setting_key IN ('system_name', 'system_logo', 'favicon', 'support_email')`
      );

      const data = {};
      settings.forEach(s => {
        data[s.setting_key] = s.setting_value;
      });

      // Also get from landing_page_settings as fallback
      const [landing] = await pool.execute(
        'SELECT company_name, company_logo, contact_email FROM landing_page_settings WHERE id = 1'
      );

      if (landing[0]) {
        if (!data.system_name) data.system_name = landing[0].company_name;
        if (!data.system_logo) data.system_logo = landing[0].company_logo;
        if (!data.support_email) data.support_email = landing[0].contact_email;
      }

      return res.json({
        success: true,
        data: {
          system_name: data.system_name || 'Misayan SaaS',
          system_logo: data.system_logo || null,
          favicon: data.favicon || null,
          support_email: data.support_email || ''
        }
      });
    } catch (error) {
      logger.error('Error getting system branding', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error loading system branding'
      });
    }
  }

  /**
   * Update system branding settings
   * PUT /api/superadmin/system-branding
   */
  static async updateSystemBranding(req, res) {
    upload(req, res, async function(err) {
      if (err) {
        logger.error('File upload error', { error: err.message });
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }

      try {
        const { system_name, support_email, remove_logo, remove_favicon } = req.body;
        
        // Update system name
        if (system_name) {
          await pool.execute(
            `INSERT INTO system_settings_kv (setting_key, setting_value) 
             VALUES ('system_name', ?) 
             ON DUPLICATE KEY UPDATE setting_value = ?`,
            [system_name, system_name]
          );
          
          // Also update landing page company name
          await pool.execute(
            'UPDATE landing_page_settings SET company_name = ? WHERE id = 1',
            [system_name]
          );
        }

        // Update support email
        if (support_email !== undefined) {
          await pool.execute(
            `INSERT INTO system_settings_kv (setting_key, setting_value) 
             VALUES ('support_email', ?) 
             ON DUPLICATE KEY UPDATE setting_value = ?`,
            [support_email, support_email]
          );
          
          // Also update landing page contact email
          await pool.execute(
            'UPDATE landing_page_settings SET contact_email = ? WHERE id = 1',
            [support_email]
          );
        }

        // Handle logo upload
        if (req.files && req.files.system_logo) {
          const logoFile = req.files.system_logo[0];
          const logoUrl = `/uploads/system/${logoFile.filename}`;
          
          // Delete old logo if exists
          const [oldLogo] = await pool.execute(
            "SELECT setting_value FROM system_settings_kv WHERE setting_key = 'system_logo'"
          );
          if (oldLogo[0] && oldLogo[0].setting_value) {
            const oldPath = path.join(__dirname, '../public', oldLogo[0].setting_value);
            if (fs.existsSync(oldPath)) {
              fs.unlinkSync(oldPath);
            }
          }
          
          await pool.execute(
            `INSERT INTO system_settings_kv (setting_key, setting_value) 
             VALUES ('system_logo', ?) 
             ON DUPLICATE KEY UPDATE setting_value = ?`,
            [logoUrl, logoUrl]
          );
          
          // Also update landing page
          await pool.execute(
            'UPDATE landing_page_settings SET company_logo = ? WHERE id = 1',
            [logoUrl]
          );
        }

        // Handle favicon upload
        if (req.files && req.files.favicon) {
          const faviconFile = req.files.favicon[0];
          const faviconUrl = `/uploads/system/${faviconFile.filename}`;
          
          // Delete old favicon if exists
          const [oldFavicon] = await pool.execute(
            "SELECT setting_value FROM system_settings_kv WHERE setting_key = 'favicon'"
          );
          if (oldFavicon[0] && oldFavicon[0].setting_value) {
            const oldPath = path.join(__dirname, '../public', oldFavicon[0].setting_value);
            if (fs.existsSync(oldPath)) {
              fs.unlinkSync(oldPath);
            }
          }
          
          await pool.execute(
            `INSERT INTO system_settings_kv (setting_key, setting_value) 
             VALUES ('favicon', ?) 
             ON DUPLICATE KEY UPDATE setting_value = ?`,
            [faviconUrl, faviconUrl]
          );
        }

        // Handle logo removal
        if (remove_logo === 'true') {
          const [oldLogo] = await pool.execute(
            "SELECT setting_value FROM system_settings_kv WHERE setting_key = 'system_logo'"
          );
          if (oldLogo[0] && oldLogo[0].setting_value) {
            const oldPath = path.join(__dirname, '../public', oldLogo[0].setting_value);
            if (fs.existsSync(oldPath)) {
              fs.unlinkSync(oldPath);
            }
          }
          await pool.execute(
            "DELETE FROM system_settings_kv WHERE setting_key = 'system_logo'"
          );
          await pool.execute(
            'UPDATE landing_page_settings SET company_logo = NULL WHERE id = 1'
          );
        }

        // Handle favicon removal
        if (remove_favicon === 'true') {
          const [oldFavicon] = await pool.execute(
            "SELECT setting_value FROM system_settings_kv WHERE setting_key = 'favicon'"
          );
          if (oldFavicon[0] && oldFavicon[0].setting_value) {
            const oldPath = path.join(__dirname, '../public', oldFavicon[0].setting_value);
            if (fs.existsSync(oldPath)) {
              fs.unlinkSync(oldPath);
            }
          }
          await pool.execute(
            "DELETE FROM system_settings_kv WHERE setting_key = 'favicon'"
          );
        }

        logger.info('System branding updated');

        return res.json({
          success: true,
          message: 'System branding updated successfully'
        });
      } catch (error) {
        logger.error('Error updating system branding', { error: error.message });
        return res.status(500).json({
          success: false,
          message: 'Error updating system branding'
        });
      }
    });
  }

  /**
   * Get timezone settings
   * GET /api/superadmin/settings/timezone
   */
  static async getTimezoneSettings(req, res) {
    try {
      const [settings] = await pool.execute(
        `SELECT setting_key, setting_value FROM system_settings_kv 
         WHERE setting_key IN ('system_timezone', 'date_format', 'time_format', 'clock_enabled')`
      );

      const data = {};
      settings.forEach(s => {
        data[s.setting_key] = s.setting_value;
      });

      return res.json({
        success: true,
        data: {
          timezone: data.system_timezone || 'UTC',
          date_format: data.date_format || 'YYYY-MM-DD',
          time_format: data.time_format || '24h',
          clock_enabled: data.clock_enabled === 'true'
        }
      });
    } catch (error) {
      logger.error('Error getting timezone settings', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error loading timezone settings'
      });
    }
  }

  /**
   * Update timezone settings
   * PUT /api/superadmin/settings/timezone
   */
  static async updateTimezoneSettings(req, res) {
    try {
      const { timezone, date_format, time_format, clock_enabled } = req.body;

      // Update timezone
      if (timezone) {
        await pool.execute(
          `INSERT INTO system_settings_kv (setting_key, setting_value) 
           VALUES ('system_timezone', ?) 
           ON DUPLICATE KEY UPDATE setting_value = ?`,
          [timezone, timezone]
        );
      }

      // Update date format
      if (date_format) {
        await pool.execute(
          `INSERT INTO system_settings_kv (setting_key, setting_value) 
           VALUES ('date_format', ?) 
           ON DUPLICATE KEY UPDATE setting_value = ?`,
          [date_format, date_format]
        );
      }

      // Update time format
      if (time_format) {
        await pool.execute(
          `INSERT INTO system_settings_kv (setting_key, setting_value) 
           VALUES ('time_format', ?) 
           ON DUPLICATE KEY UPDATE setting_value = ?`,
          [time_format, time_format]
        );
      }

      // Update clock enabled
      if (clock_enabled !== undefined) {
        await pool.execute(
          `INSERT INTO system_settings_kv (setting_key, setting_value) 
           VALUES ('clock_enabled', ?) 
           ON DUPLICATE KEY UPDATE setting_value = ?`,
          [String(clock_enabled), String(clock_enabled)]
        );
      }

      logger.info('Timezone settings updated');

      return res.json({
        success: true,
        message: 'Timezone settings updated successfully'
      });
    } catch (error) {
      logger.error('Error updating timezone settings', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error updating timezone settings'
      });
    }
  }

  /**
   * Get Meta/Facebook App settings for WhatsApp Cloud API
   * GET /api/superadmin/settings/meta
   */
  static async getMetaSettings(req, res) {
    try {
      const [settings] = await pool.execute(
        `SELECT setting_key, setting_value FROM system_settings_kv 
         WHERE setting_key IN ('meta_app_id', 'meta_app_secret', 'meta_config_id', 'meta_business_id', 'meta_embedded_signup_enabled')`
      );

      const settingsObj = {};
      settings.forEach(row => {
        // Don't send app secret to client (only indicate if it's set)
        if (row.setting_key === 'meta_app_secret') {
          settingsObj[row.setting_key] = row.setting_value ? '********' : '';
        } else {
          settingsObj[row.setting_key] = row.setting_value;
        }
      });

      logger.info('Meta settings retrieved', { 
        settingsCount: settings.length,
        embeddedSignupEnabled: settingsObj.meta_embedded_signup_enabled 
      });

      return res.json({
        success: true,
        data: settingsObj
      });
    } catch (error) {
      logger.error('Error getting Meta settings', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error loading Meta settings'
      });
    }
  }

  /**
   * Get Meta App configuration status (public route for tenants)
   * GET /api/superadmin/settings/meta/status
   */
  static async getMetaStatus(req, res) {
    try {
      const [settings] = await pool.execute(
        `SELECT setting_key, setting_value FROM system_settings_kv 
         WHERE setting_key IN ('meta_app_id', 'meta_config_id', 'meta_embedded_signup_enabled')`
      );

      const settingsObj = {};
      settings.forEach(row => {
        settingsObj[row.setting_key] = row.setting_value;
      });

      // Check if Meta App is properly configured
      const isConfigured = !!(
        settingsObj.meta_app_id && 
        settingsObj.meta_config_id && 
        settingsObj.meta_embedded_signup_enabled === '1'
      );

      return res.json({
        success: true,
        data: {
          meta_app_id: settingsObj.meta_app_id || null,
          meta_config_id: settingsObj.meta_config_id || null,
          meta_embedded_signup_enabled: settingsObj.meta_embedded_signup_enabled === '1',
          is_configured: isConfigured
        }
      });
    } catch (error) {
      logger.error('Error getting Meta status', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error checking Meta configuration status'
      });
    }
  }

  /**
   * Update Meta/Facebook App settings
   * PUT /api/superadmin/settings/meta
   */
  static async updateMetaSettings(req, res) {
    try {
      const {
        meta_app_id,
        meta_app_secret,
        meta_config_id,
        meta_business_id,
        meta_embedded_signup_enabled
      } = req.body;

      // Update Meta App ID
      if (meta_app_id !== undefined) {
        await pool.execute(
          `INSERT INTO system_settings_kv (setting_key, setting_value) 
           VALUES ('meta_app_id', ?) 
           ON DUPLICATE KEY UPDATE setting_value = ?`,
          [meta_app_id, meta_app_id]
        );
      }

      // Update Meta App Secret (only if provided and not masked)
      if (meta_app_secret && meta_app_secret !== '********') {
        await pool.execute(
          `INSERT INTO system_settings_kv (setting_key, setting_value) 
           VALUES ('meta_app_secret', ?) 
           ON DUPLICATE KEY UPDATE setting_value = ?`,
          [meta_app_secret, meta_app_secret]
        );
      }

      // Update Meta Config ID (for Embedded Signup)
      if (meta_config_id !== undefined) {
        await pool.execute(
          `INSERT INTO system_settings_kv (setting_key, setting_value) 
           VALUES ('meta_config_id', ?) 
           ON DUPLICATE KEY UPDATE setting_value = ?`,
          [meta_config_id, meta_config_id]
        );
      }

      // Update Meta Business ID
      if (meta_business_id !== undefined) {
        await pool.execute(
          `INSERT INTO system_settings_kv (setting_key, setting_value) 
           VALUES ('meta_business_id', ?) 
           ON DUPLICATE KEY UPDATE setting_value = ?`,
          [meta_business_id, meta_business_id]
        );
      }

      // Update Embedded Signup enabled flag
      if (meta_embedded_signup_enabled !== undefined) {
        const enabledValue = meta_embedded_signup_enabled === true || meta_embedded_signup_enabled === 'true' || meta_embedded_signup_enabled === '1' ? '1' : '0';
        await pool.execute(
          `INSERT INTO system_settings_kv (setting_key, setting_value) 
           VALUES ('meta_embedded_signup_enabled', ?) 
           ON DUPLICATE KEY UPDATE setting_value = ?`,
          [enabledValue, enabledValue]
        );
      }

      logger.info('Meta settings updated');

      return res.json({
        success: true,
        message: 'Meta settings updated successfully'
      });
    } catch (error) {
      logger.error('Error updating Meta settings', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error updating Meta settings'
      });
    }
  }

  /**
   * Test Meta App connection
   * POST /api/superadmin/settings/meta/test
   */
  static async testMetaConnection(req, res) {
    try {
      const [settings] = await pool.execute(
        `SELECT setting_key, setting_value FROM system_settings_kv 
         WHERE setting_key IN ('meta_app_id', 'meta_app_secret')`
      );

      const settingsObj = {};
      settings.forEach(row => {
        settingsObj[row.setting_key] = row.setting_value;
      });

      if (!settingsObj.meta_app_id || !settingsObj.meta_app_secret) {
        return res.status(400).json({
          success: false,
          message: 'Meta App ID and App Secret are required'
        });
      }

      // Test the connection by making a request to Meta Graph API
      const axios = require('axios');
      try {
        const response = await axios.get(
          `https://graph.facebook.com/v18.0/${settingsObj.meta_app_id}`,
          {
            params: {
              fields: 'name,category',
              access_token: `${settingsObj.meta_app_id}|${settingsObj.meta_app_secret}`
            }
          }
        );

        return res.json({
          success: true,
          message: 'Meta App connection successful',
          data: {
            app_name: response.data.name,
            app_category: response.data.category
          }
        });
      } catch (apiError) {
        logger.error('Meta API test failed', { error: apiError.message });
        return res.status(400).json({
          success: false,
          message: 'Failed to connect to Meta API. Please check your credentials.',
          error: apiError.response?.data?.error?.message || apiError.message
        });
      }
    } catch (error) {
      logger.error('Error testing Meta connection', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error testing Meta connection'
      });
    }
  }
}

module.exports = SuperAdminSettingsController;
