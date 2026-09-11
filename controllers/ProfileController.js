/**
 * Profile Controller
 * 
 * Handles tenant profile customization including logo and color scheme.
 * Each tenant has isolated profile settings.
 * 
 * @module controllers/ProfileController
 */

const pool = require('../config/database').pool;
const { logger } = require('../config/logger');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// Configure multer for logo upload
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/logos');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const tenantId = req.user.tenantId;
    const ext = path.extname(file.originalname);
    const filename = `tenant-${tenantId}-${Date.now()}${ext}`;
    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 2 * 1024 * 1024 // 2MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|svg/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, svg)'));
    }
  }
});

class ProfileController {
  /**
   * Get tenant profile
   * @route GET /api/profile
   */
  static async getProfile(req, res) {
    try {
      const tenantId = req.user.tenantId;

      const [profiles] = await pool.execute(
        'SELECT * FROM tenant_profiles WHERE tenant_id = ?',
        [tenantId]
      );

      let profile;
      if (profiles.length === 0) {
        // Create default profile if doesn't exist
        await pool.execute(
          'INSERT INTO tenant_profiles (tenant_id) VALUES (?)',
          [tenantId]
        );

        const [newProfiles] = await pool.execute(
          'SELECT * FROM tenant_profiles WHERE tenant_id = ?',
          [tenantId]
        );
        profile = newProfiles[0];
      } else {
        profile = profiles[0];
      }

      logger.info('Profile retrieved', { 
        tenantId,
        userId: req.user.id 
      });

      res.json({
        success: true,
        data: profile
      });
    } catch (error) {
      logger.error('Error getting profile', { 
        error: error.message,
        tenantId: req.user?.tenantId,
        userId: req.user?.id 
      });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve profile'
      });
    }
  }

  /**
   * Update tenant profile colors
   * @route PUT /api/profile/colors
   */
  static async updateColors(req, res) {
    try {
      const tenantId = req.user.tenantId;
      const {
        primary_color,
        primary_dark,
        primary_light,
        accent_color,
        text_color,
        text_light,
        bg_color,
        white,
        success,
        warning,
        danger,
        info
      } = req.body;

      // Ensure profile exists
      const [existing] = await pool.execute(
        'SELECT id FROM tenant_profiles WHERE tenant_id = ?',
        [tenantId]
      );

      if (existing.length === 0) {
        await pool.execute(
          'INSERT INTO tenant_profiles (tenant_id) VALUES (?)',
          [tenantId]
        );
      }

      // Build update query
      const updates = [];
      const values = [];

      if (primary_color !== undefined) {
        updates.push('primary_color = ?');
        values.push(primary_color);
      }
      if (primary_dark !== undefined) {
        updates.push('primary_dark = ?');
        values.push(primary_dark);
      }
      if (primary_light !== undefined) {
        updates.push('primary_light = ?');
        values.push(primary_light);
      }
      if (accent_color !== undefined) {
        updates.push('accent_color = ?');
        values.push(accent_color);
      }
      if (text_color !== undefined) {
        updates.push('text_color = ?');
        values.push(text_color);
      }
      if (text_light !== undefined) {
        updates.push('text_light = ?');
        values.push(text_light);
      }
      if (bg_color !== undefined) {
        updates.push('bg_color = ?');
        values.push(bg_color);
      }
      if (white !== undefined) {
        updates.push('white = ?');
        values.push(white);
      }
      if (success !== undefined) {
        updates.push('success = ?');
        values.push(success);
      }
      if (warning !== undefined) {
        updates.push('warning = ?');
        values.push(warning);
      }
      if (danger !== undefined) {
        updates.push('danger = ?');
        values.push(danger);
      }
      if (info !== undefined) {
        updates.push('info = ?');
        values.push(info);
      }

      if (updates.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No colors to update'
        });
      }

      values.push(tenantId);

      await pool.execute(
        `UPDATE tenant_profiles SET ${updates.join(', ')} WHERE tenant_id = ?`,
        values
      );

      // Get updated profile
      const [profiles] = await pool.execute(
        'SELECT * FROM tenant_profiles WHERE tenant_id = ?',
        [tenantId]
      );

      logger.info('Profile colors updated', { 
        tenantId,
        userId: req.user.id 
      });

      res.json({
        success: true,
        message: 'Colors updated successfully',
        data: profiles[0]
      });
    } catch (error) {
      logger.error('Error updating colors', { 
        error: error.message,
        tenantId: req.user?.tenantId,
        userId: req.user?.id 
      });
      res.status(500).json({
        success: false,
        error: 'Failed to update colors'
      });
    }
  }

  /**
   * Upload tenant logo
   * @route POST /api/profile/logo
   */
  static uploadLogo = [
    upload.single('logo'),
    async (req, res) => {
      try {
        const tenantId = req.user.tenantId;

        if (!req.file) {
          return res.status(400).json({
            success: false,
            error: 'No file uploaded'
          });
        }

        // Get old logo to delete
        const [existing] = await pool.execute(
          'SELECT logo_url FROM tenant_profiles WHERE tenant_id = ?',
          [tenantId]
        );

        const logoUrl = `/uploads/logos/${req.file.filename}`;

        // Ensure profile exists
        if (existing.length === 0) {
          await pool.execute(
            'INSERT INTO tenant_profiles (tenant_id, logo_url) VALUES (?, ?)',
            [tenantId, logoUrl]
          );
        } else {
          await pool.execute(
            'UPDATE tenant_profiles SET logo_url = ? WHERE tenant_id = ?',
            [logoUrl, tenantId]
          );

          // Delete old logo file if exists
          if (existing[0].logo_url) {
            const oldLogoPath = path.join(__dirname, '..', existing[0].logo_url);
            try {
              await fs.unlink(oldLogoPath);
            } catch (err) {
              // Ignore if file doesn't exist
              logger.warn('Could not delete old logo', { error: err.message });
            }
          }
        }

        logger.info('Logo uploaded', { 
          tenantId,
          userId: req.user.id,
          filename: req.file.filename
        });

        res.json({
          success: true,
          message: 'Logo uploaded successfully',
          data: {
            logo_url: logoUrl
          }
        });
      } catch (error) {
        logger.error('Error uploading logo', { 
          error: error.message,
          tenantId: req.user?.tenantId,
          userId: req.user?.id 
        });
        res.status(500).json({
          success: false,
          error: error.message || 'Failed to upload logo'
        });
      }
    }
  ];

  /**
   * Delete tenant logo
   * @route DELETE /api/profile/logo
   */
  static async deleteLogo(req, res) {
    try {
      const tenantId = req.user.tenantId;

      const [existing] = await pool.execute(
        'SELECT logo_url FROM tenant_profiles WHERE tenant_id = ?',
        [tenantId]
      );

      if (existing.length === 0 || !existing[0].logo_url) {
        return res.status(404).json({
          success: false,
          error: 'No logo found'
        });
      }

      const logoPath = path.join(__dirname, '..', existing[0].logo_url);

      // Delete file
      try {
        await fs.unlink(logoPath);
      } catch (err) {
        logger.warn('Could not delete logo file', { error: err.message });
      }

      // Update database
      await pool.execute(
        'UPDATE tenant_profiles SET logo_url = NULL WHERE tenant_id = ?',
        [tenantId]
      );

      logger.info('Logo deleted', { 
        tenantId,
        userId: req.user.id 
      });

      res.json({
        success: true,
        message: 'Logo deleted successfully'
      });
    } catch (error) {
      logger.error('Error deleting logo', { 
        error: error.message,
        tenantId: req.user?.tenantId,
        userId: req.user?.id 
      });
      res.status(500).json({
        success: false,
        error: 'Failed to delete logo'
      });
    }
  }

  /**
   * Reset colors to default
   * @route POST /api/profile/reset-colors
   */
  static async resetColors(req, res) {
    try {
      const tenantId = req.user.tenantId;

      await pool.execute(
        `UPDATE tenant_profiles SET 
          primary_color = '#00a149',
          primary_dark = '#654321',
          primary_light = '#A0522D',
          accent_color = '#CD853F',
          text_color = '#333333',
          text_light = '#666666',
          bg_color = '#f5f5f5',
          white = '#ffffff',
          success = '#28a745',
          warning = '#ffc107',
          danger = '#dc3545',
          info = '#17a2b8'
        WHERE tenant_id = ?`,
        [tenantId]
      );

      // Get updated profile
      const [profiles] = await pool.execute(
        'SELECT * FROM tenant_profiles WHERE tenant_id = ?',
        [tenantId]
      );

      logger.info('Colors reset to default', { 
        tenantId,
        userId: req.user.id 
      });

      res.json({
        success: true,
        message: 'Colors reset to default successfully',
        data: profiles[0]
      });
    } catch (error) {
      logger.error('Error resetting colors', { 
        error: error.message,
        tenantId: req.user?.tenantId,
        userId: req.user?.id 
      });
      res.status(500).json({
        success: false,
        error: 'Failed to reset colors'
      });
    }
  }
}

module.exports = ProfileController;
