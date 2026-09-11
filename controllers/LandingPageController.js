/**
 * Landing Page Controller
 * Manages landing page settings and content
 */

const BaseController = require('./BaseController');
const { pool } = require('../config/database');
const { logger } = require('../config/logger');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for landing page logo uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../public/uploads/landing');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const fieldName = file.fieldname.replace('_file', '');
    cb(null, `${fieldName}-${Date.now()}${ext}`);
  }
});

const uploadLogos = multer({
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|svg|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype) || file.mimetype === 'image/svg+xml';
    if (extname || mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed (jpg, png, gif, svg, webp)'));
  }
}).fields([
  { name: 'company_logo_file', maxCount: 1 },
  { name: 'header_logo_file', maxCount: 1 },
  { name: 'hero_logo_file', maxCount: 1 },
  { name: 'footer_logo_file', maxCount: 1 }
]);

class LandingPageController extends BaseController {
  /**
   * Get landing page settings (PUBLIC)
   */
  static async getSettings(req, res) {
    try {
      const [settings] = await pool.execute(
        'SELECT * FROM landing_page_settings WHERE id = 1'
      );

      const [features] = await pool.execute(
        'SELECT * FROM landing_page_features WHERE active = 1 ORDER BY sort_order'
      );

      const [testimonials] = await pool.execute(
        'SELECT * FROM landing_page_testimonials WHERE active = 1 ORDER BY sort_order'
      );

      // Get active subscription plans
      const [plans] = await pool.execute(
        `SELECT 
           sp.*, 
           COALESCE(c.symbol, dc.symbol) as currency_symbol,
           COALESCE(sp.currency, dc.code) as currency
         FROM subscription_plans sp
         LEFT JOIN currencies c ON c.code = sp.currency
         LEFT JOIN (
           SELECT code, symbol 
           FROM currencies 
           WHERE is_default = TRUE AND active = TRUE 
           ORDER BY id 
           LIMIT 1
         ) dc ON 1 = 1
         WHERE sp.active = 1
         ORDER BY sp.sort_order, sp.price`
      );

      // Format plans for display
      const formattedPlans = (plans || []).map(plan => {
        const planFeatures = [];

        // Add resource limits
        if (plan.max_messages_per_month) {
          planFeatures.push({
            type: 'limit',
            text: `${plan.max_messages_per_month.toLocaleString()} messages/month`,
            enabled: true
          });
        }
        if (plan.max_users) {
          planFeatures.push({
            type: 'limit',
            text: `${plan.max_users} ${plan.max_users === 1 ? 'user' : 'users'}`,
            enabled: true
          });
        }
        if (plan.max_conversations) {
          planFeatures.push({
            type: 'limit',
            text: `${plan.max_conversations.toLocaleString()} conversations`,
            enabled: true
          });
        }

        // Add feature toggles
        if (plan.whatsapp_enabled) {
          planFeatures.push({
            type: 'feature',
            text: 'WhatsApp Integration',
            enabled: true
          });
        }
        if (plan.ai_enabled) {
          planFeatures.push({
            type: 'feature',
            text: 'AI-Powered Responses',
            enabled: true
          });
        }
        if (plan.analytics_enabled) {
          planFeatures.push({
            type: 'feature',
            text: 'Analytics & Reports',
            enabled: true
          });
        }
        if (plan.priority_support_enabled) {
          planFeatures.push({
            type: 'feature',
            text: 'Priority Support',
            enabled: true
          });
        }
        if (plan.api_access_enabled) {
          planFeatures.push({
            type: 'feature',
            text: 'API Access',
            enabled: true
          });
        }
        if (plan.custom_branding_enabled) {
          planFeatures.push({
            type: 'feature',
            text: 'Custom Branding',
            enabled: true
          });
        }

        return {
          ...plan,
          formatted_features: planFeatures
        };
      });

      return res.json({
        success: true,
        data: {
          settings: settings[0] || {},
          features: features || [],
          testimonials: testimonials || [],
          plans: formattedPlans || []
        }
      });
    } catch (error) {
      logger.error('Error getting landing page settings', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        message: 'Error loading landing page: ' + error.message
      });
    }
  }

  /**
   * Update landing page settings (SUPER ADMIN)
   */
  static async updateSettings(req, res) {
    try {
      const settings = req.body;

      const updateFields = [];
      const values = [];

      // Build dynamic update query
      Object.keys(settings).forEach(key => {
        if (key !== 'id') {
          updateFields.push(`${key} = ?`);
          values.push(settings[key]);
        }
      });

      if (updateFields.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No fields to update'
        });
      }

      const query = `UPDATE landing_page_settings SET ${updateFields.join(', ')} WHERE id = 1`;
      await pool.execute(query, values);

      logger.info('Landing page settings updated');

      return res.json({
        success: true,
        message: 'Settings updated successfully'
      });
    } catch (error) {
      logger.error('Error updating landing page settings', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error updating settings'
      });
    }
  }

  /**
   * Get features
   */
  static async getFeatures(req, res) {
    try {
      const [features] = await pool.execute(
        'SELECT * FROM landing_page_features ORDER BY sort_order'
      );

      return res.json({
        success: true,
        data: features
      });
    } catch (error) {
      logger.error('Error getting features', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error loading features'
      });
    }
  }

  /**
   * Create feature
   */
  static async createFeature(req, res) {
    try {
      const { icon, title, description, sort_order, active } = req.body;

      const [result] = await pool.execute(
        'INSERT INTO landing_page_features (icon, title, description, sort_order, active) VALUES (?, ?, ?, ?, ?)',
        [icon, title, description, sort_order || 0, active !== undefined ? active : 1]
      );

      return res.status(201).json({
        success: true,
        message: 'Feature created successfully',
        data: { id: result.insertId }
      });
    } catch (error) {
      logger.error('Error creating feature', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error creating feature'
      });
    }
  }

  /**
   * Update feature
   */
  static async updateFeature(req, res) {
    try {
      const { id } = req.params;
      const { icon, title, description, sort_order, active } = req.body;

      // Get current feature data first
      const [existing] = await pool.execute(
        'SELECT * FROM landing_page_features WHERE id = ?',
        [id]
      );

      if (existing.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Feature not found'
        });
      }

      const currentFeature = existing[0];

      // Use existing values if not provided (partial update support)
      const updatedIcon = icon !== undefined ? icon : currentFeature.icon;
      const updatedTitle = title !== undefined ? title : currentFeature.title;
      const updatedDescription = description !== undefined ? description : currentFeature.description;
      const updatedSortOrder = sort_order !== undefined ? sort_order : currentFeature.sort_order;
      const updatedActive = active !== undefined ? active : currentFeature.active;

      await pool.execute(
        'UPDATE landing_page_features SET icon = ?, title = ?, description = ?, sort_order = ?, active = ? WHERE id = ?',
        [updatedIcon, updatedTitle, updatedDescription, updatedSortOrder, updatedActive, id]
      );

      return res.json({
        success: true,
        message: 'Feature updated successfully'
      });
    } catch (error) {
      logger.error('Error updating feature', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        message: 'Error updating feature'
      });
    }
  }

  /**
   * Delete feature
   */
  static async deleteFeature(req, res) {
    try {
      const { id } = req.params;

      await pool.execute('DELETE FROM landing_page_features WHERE id = ?', [id]);

      return res.json({
        success: true,
        message: 'Feature deleted successfully'
      });
    } catch (error) {
      logger.error('Error deleting feature', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error deleting feature'
      });
    }
  }

  /**
   * Get testimonials
   */
  static async getTestimonials(req, res) {
    try {
      const [testimonials] = await pool.execute(
        'SELECT * FROM landing_page_testimonials ORDER BY sort_order'
      );

      return res.json({
        success: true,
        data: testimonials
      });
    } catch (error) {
      logger.error('Error getting testimonials', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error loading testimonials'
      });
    }
  }

  /**
   * Create testimonial
   */
  static async createTestimonial(req, res) {
    try {
      const { customer_name, customer_title, customer_company, customer_avatar, testimonial_text, rating, sort_order, active } = req.body;

      const [result] = await pool.execute(
        'INSERT INTO landing_page_testimonials (customer_name, customer_title, customer_company, customer_avatar, testimonial_text, rating, sort_order, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [customer_name, customer_title, customer_company, customer_avatar, testimonial_text, rating || 5, sort_order || 0, active !== undefined ? active : 1]
      );

      return res.status(201).json({
        success: true,
        message: 'Testimonial created successfully',
        data: { id: result.insertId }
      });
    } catch (error) {
      logger.error('Error creating testimonial', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error creating testimonial'
      });
    }
  }

  /**
   * Update testimonial
   */
  static async updateTestimonial(req, res) {
    try {
      const { id } = req.params;
      const { customer_name, customer_title, customer_company, customer_avatar, testimonial_text, rating, sort_order, active } = req.body;

      await pool.execute(
        'UPDATE landing_page_testimonials SET customer_name = ?, customer_title = ?, customer_company = ?, customer_avatar = ?, testimonial_text = ?, rating = ?, sort_order = ?, active = ? WHERE id = ?',
        [customer_name, customer_title, customer_company, customer_avatar, testimonial_text, rating, sort_order, active, id]
      );

      return res.json({
        success: true,
        message: 'Testimonial updated successfully'
      });
    } catch (error) {
      logger.error('Error updating testimonial', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error updating testimonial'
      });
    }
  }

  /**
   * Delete testimonial
   */
  static async deleteTestimonial(req, res) {
    try {
      const { id } = req.params;

      await pool.execute('DELETE FROM landing_page_testimonials WHERE id = ?', [id]);

      return res.json({
        success: true,
        message: 'Testimonial deleted successfully'
      });
    } catch (error) {
      logger.error('Error deleting testimonial', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error deleting testimonial'
      });
    }
  }

  /**
   * Generate WhatsApp link
   */
  static generateWhatsAppLink(req, res) {
    try {
      const { phone, message } = req.body;

      if (!phone) {
        return res.status(400).json({
          success: false,
          message: 'Phone number is required'
        });
      }

      // Remove non-numeric characters
      const cleanPhone = phone.replace(/\D/g, '');

      // Generate link
      let link = `https://wa.me/${cleanPhone}`;
      
      if (message) {
        link += `?text=${encodeURIComponent(message)}`;
      }

      return res.json({
        success: true,
        data: {
          link,
          phone: cleanPhone,
          message: message || ''
        }
      });
    } catch (error) {
      logger.error('Error generating WhatsApp link', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error generating link'
      });
    }
  }

  /**
   * Upload landing page logos
   * POST /api/landing/upload-logos
   */
  static uploadLogos(req, res) {
    uploadLogos(req, res, async function(err) {
      if (err) {
        logger.error('Logo upload error', { error: err.message });
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }

      try {
        const logoFields = ['company_logo', 'header_logo', 'hero_logo', 'footer_logo'];
        const updates = {};

        for (const field of logoFields) {
          const fileField = `${field}_file`;
          
          // Handle file upload
          if (req.files && req.files[fileField]) {
            const file = req.files[fileField][0];
            const logoUrl = `/uploads/landing/${file.filename}`;
            
            // Delete old logo if exists
            const [oldSettings] = await pool.execute(
              `SELECT ${field} FROM landing_page_settings WHERE id = 1`
            );
            if (oldSettings[0] && oldSettings[0][field]) {
              const oldPath = path.join(__dirname, '../public', oldSettings[0][field]);
              if (fs.existsSync(oldPath) && oldSettings[0][field].includes('/uploads/landing/')) {
                try {
                  fs.unlinkSync(oldPath);
                } catch (e) {
                  logger.warn('Could not delete old logo', { path: oldPath });
                }
              }
            }
            
            updates[field] = logoUrl;
          }
          
          // Handle removal request
          const removeField = `remove_${field}`;
          if (req.body[removeField] === 'true') {
            const [oldSettings] = await pool.execute(
              `SELECT ${field} FROM landing_page_settings WHERE id = 1`
            );
            if (oldSettings[0] && oldSettings[0][field]) {
              const oldPath = path.join(__dirname, '../public', oldSettings[0][field]);
              if (fs.existsSync(oldPath) && oldSettings[0][field].includes('/uploads/landing/')) {
                try {
                  fs.unlinkSync(oldPath);
                } catch (e) {
                  logger.warn('Could not delete logo', { path: oldPath });
                }
              }
            }
            updates[field] = null;
          }
        }

        // Update database
        if (Object.keys(updates).length > 0) {
          const updateFields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
          const values = Object.values(updates);
          
          await pool.execute(
            `UPDATE landing_page_settings SET ${updateFields} WHERE id = 1`,
            values
          );
          
          // Also update system_settings_kv if company_logo changed
          if (updates.company_logo !== undefined) {
            if (updates.company_logo) {
              await pool.execute(
                `INSERT INTO system_settings_kv (setting_key, setting_value) 
                 VALUES ('system_logo', ?) 
                 ON DUPLICATE KEY UPDATE setting_value = ?`,
                [updates.company_logo, updates.company_logo]
              );
            } else {
              await pool.execute(
                "DELETE FROM system_settings_kv WHERE setting_key = 'system_logo'"
              );
            }
          }
        }

        logger.info('Landing page logos updated');

        return res.json({
          success: true,
          message: 'Logos updated successfully',
          data: updates
        });
      } catch (error) {
        logger.error('Error uploading logos', { error: error.message });
        return res.status(500).json({
          success: false,
          message: 'Error uploading logos'
        });
      }
    });
  }
}

module.exports = LandingPageController;

