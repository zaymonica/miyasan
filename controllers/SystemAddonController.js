/**
 * System Addon Controller
 * Manages system add-ons (plugins) that can be uploaded and activated
 * 
 * @class SystemAddonController
 */

const BaseController = require('./BaseController');
const { ValidationError, NotFoundError } = require('../middleware/errorHandler');
const { logger } = require('../config/logger');
const { clearAddonCache } = require('../middleware/addonCheck');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const AdmZip = require('adm-zip');

// Directory where addons are stored
const ADDONS_DIR = path.join(__dirname, '..', 'addons');
const UPLOADS_TEMP_DIR = path.join(__dirname, '..', 'uploads', 'temp');

class SystemAddonController extends BaseController {
  /**
   * Get all system addons
   * GET /api/superadmin/system-addons
   */
  static async getAddons(req, res) {
    try {
      const addons = await BaseController.executeQuery(`
        SELECT * FROM system_addons ORDER BY created_at DESC
      `);

      // Check for icon images in each addon
      const addonsWithIcons = addons.map(addon => {
        const hasIconImage = SystemAddonController.checkAddonHasIconImage(addon.directory);
        return { ...addon, has_icon_image: hasIconImage };
      });

      return BaseController.sendSuccess(res, { addons: addonsWithIcons });
    } catch (error) {
      logger.error('Error getting system addons', { error: error.message });
      return BaseController.sendError(res, error.message, 500);
    }
  }

  /**
   * Check if addon has an icon image file
   */
  static checkAddonHasIconImage(directory) {
    if (!directory) return false;
    
    const iconExtensions = ['.png', '.jpg', '.jpeg', '.svg', '.ico', '.webp'];
    const addonDir = path.join(ADDONS_DIR, directory);

    for (const ext of iconExtensions) {
      const iconPath = path.join(addonDir, `icon${ext}`);
      if (fsSync.existsSync(iconPath)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get single addon by ID
   * GET /api/superadmin/system-addons/:id
   */
  static async getAddon(req, res) {
    try {
      const { id } = req.params;

      const addons = await BaseController.executeQuery(
        'SELECT * FROM system_addons WHERE id = ?',
        [id]
      );

      if (addons.length === 0) {
        throw new NotFoundError('Addon not found');
      }

      return BaseController.sendSuccess(res, { addon: addons[0] });
    } catch (error) {
      logger.error('Error getting addon', { error: error.message });
      return BaseController.sendError(res, error.message, error.statusCode || 500);
    }
  }

  /**
   * Upload and install a new addon
   * POST /api/superadmin/system-addons/upload
   */
  static async uploadAddon(req, res) {
    try {
      if (!req.file) {
        throw new ValidationError('No file uploaded');
      }

      const zipPath = req.file.path;
      const originalName = req.file.originalname;

      // Validate file extension
      if (!originalName.endsWith('.zip')) {
        await fs.unlink(zipPath);
        throw new ValidationError('Only ZIP files are allowed');
      }

      // Create addons directory if it doesn't exist
      await fs.mkdir(ADDONS_DIR, { recursive: true });

      // Extract and validate the addon
      const addonInfo = await SystemAddonController.extractAndValidateAddon(zipPath);

      // Check if addon already exists
      const existing = await BaseController.executeQuery(
        'SELECT id FROM system_addons WHERE slug = ?',
        [addonInfo.slug]
      );

      if (existing.length > 0) {
        // Update existing addon
        await BaseController.executeQuery(`
          UPDATE system_addons SET
            name = ?,
            description = ?,
            version = ?,
            author = ?,
            icon = ?,
            config = ?,
            updated_at = NOW()
          WHERE slug = ?
        `, [
          addonInfo.name,
          addonInfo.description || '',
          addonInfo.version || '1.0.0',
          addonInfo.author || '',
          addonInfo.icon || 'puzzle-piece',
          JSON.stringify(addonInfo.config || {}),
          addonInfo.slug
        ]);

        logger.info(`Addon updated: ${addonInfo.name}`);

        return BaseController.sendSuccess(res, {
          addon: { ...addonInfo, id: existing[0].id },
          updated: true
        }, 200, 'Addon updated successfully');
      }

      // Insert new addon
      const result = await BaseController.executeQuery(`
        INSERT INTO system_addons (
          slug, name, description, version, author, icon, 
          directory, config, active, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, FALSE, NOW())
      `, [
        addonInfo.slug,
        addonInfo.name,
        addonInfo.description || '',
        addonInfo.version || '1.0.0',
        addonInfo.author || '',
        addonInfo.icon || 'puzzle-piece',
        addonInfo.directory,
        JSON.stringify(addonInfo.config || {})
      ]);

      // Clean up temp file
      await fs.unlink(zipPath).catch(() => {});

      logger.info(`Addon installed: ${addonInfo.name}`);

      return BaseController.sendSuccess(res, {
        addon: { id: result.insertId, ...addonInfo }
      }, 201, 'Addon installed successfully');
    } catch (error) {
      // Clean up temp file on error
      if (req.file && req.file.path) {
        await fs.unlink(req.file.path).catch(() => {});
      }
      logger.error('Error uploading addon', { error: error.message });
      return BaseController.sendError(res, error.message, error.statusCode || 500);
    }
  }

  /**
   * Extract and validate addon from ZIP file
   */
  static async extractAndValidateAddon(zipPath) {
    try {
      const zip = new AdmZip(zipPath);
      const zipEntries = zip.getEntries();

      // Find addon.json in the ZIP
      let addonJsonEntry = null;
      let rootDir = '';

      for (const entry of zipEntries) {
        if (entry.entryName.endsWith('addon.json') && !entry.isDirectory) {
          addonJsonEntry = entry;
          // Get the root directory (if any)
          const parts = entry.entryName.split('/');
          if (parts.length > 1) {
            rootDir = parts[0];
          }
          break;
        }
      }

      if (!addonJsonEntry) {
        throw new ValidationError('Invalid addon: addon.json not found');
      }

      // Parse addon.json
      const addonJsonContent = addonJsonEntry.getData().toString('utf8');
      let addonInfo;
      
      try {
        addonInfo = JSON.parse(addonJsonContent);
      } catch (e) {
        throw new ValidationError('Invalid addon.json format');
      }

      // Validate required fields
      if (!addonInfo.slug || !addonInfo.name) {
        throw new ValidationError('addon.json must contain slug and name');
      }

      // Validate slug format (alphanumeric and hyphens only)
      if (!/^[a-z0-9-]+$/.test(addonInfo.slug)) {
        throw new ValidationError('Addon slug must contain only lowercase letters, numbers, and hyphens');
      }

      // Create addon directory
      const addonDir = path.join(ADDONS_DIR, addonInfo.slug);
      
      // Remove existing directory if it exists
      await fs.rm(addonDir, { recursive: true, force: true }).catch(() => {});
      await fs.mkdir(addonDir, { recursive: true });

      // Extract files to addon directory
      for (const entry of zipEntries) {
        if (entry.isDirectory) continue;

        let targetPath = entry.entryName;
        
        // Remove root directory prefix if present
        if (rootDir && targetPath.startsWith(rootDir + '/')) {
          targetPath = targetPath.substring(rootDir.length + 1);
        }

        if (!targetPath) continue;

        const fullPath = path.join(addonDir, targetPath);
        const dirPath = path.dirname(fullPath);

        // Create directory structure
        await fs.mkdir(dirPath, { recursive: true });

        // Write file
        await fs.writeFile(fullPath, entry.getData());
      }

      addonInfo.directory = addonInfo.slug;

      return addonInfo;
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new ValidationError(`Failed to extract addon: ${error.message}`);
    }
  }

  /**
   * Toggle addon active status
   * PUT /api/superadmin/system-addons/:id/toggle
   */
  static async toggleAddon(req, res) {
    try {
      const { id } = req.params;

      // Get current addon
      const addons = await BaseController.executeQuery(
        'SELECT * FROM system_addons WHERE id = ?',
        [id]
      );

      if (addons.length === 0) {
        throw new NotFoundError('Addon not found');
      }

      const addon = addons[0];
      const newStatus = !addon.active;

      // If activating, run activation hook
      if (newStatus) {
        await SystemAddonController.runAddonHook(addon, 'activate');
      } else {
        // If deactivating, run deactivation hook
        await SystemAddonController.runAddonHook(addon, 'deactivate');
      }

      // Update status
      await BaseController.executeQuery(
        'UPDATE system_addons SET active = ?, updated_at = NOW() WHERE id = ?',
        [newStatus ? 1 : 0, id]
      );

      // Clear addon cache so changes take effect immediately
      clearAddonCache(addon.slug);

      logger.info(`Addon ${newStatus ? 'activated' : 'deactivated'}: ${addon.name}`);

      return BaseController.sendSuccess(res, {
        addon: { ...addon, active: newStatus }
      }, 200, `Addon ${newStatus ? 'activated' : 'deactivated'} successfully`);
    } catch (error) {
      logger.error('Error toggling addon', { error: error.message });
      return BaseController.sendError(res, error.message, error.statusCode || 500);
    }
  }

  /**
   * Run addon lifecycle hook
   */
  static async runAddonHook(addon, hookName) {
    try {
      const hookPath = path.join(ADDONS_DIR, addon.directory, 'hooks', `${hookName}.js`);
      
      if (fsSync.existsSync(hookPath)) {
        const hook = require(hookPath);
        if (typeof hook === 'function') {
          await hook();
        } else if (typeof hook[hookName] === 'function') {
          await hook[hookName]();
        }
        logger.info(`Addon hook executed: ${addon.slug}/${hookName}`);
      }
    } catch (error) {
      logger.error(`Error running addon hook: ${addon.slug}/${hookName}`, { error: error.message });
      // Don't throw - hooks are optional
    }
  }

  /**
   * Delete addon
   * DELETE /api/superadmin/system-addons/:id
   */
  static async deleteAddon(req, res) {
    try {
      const { id } = req.params;

      // Get addon
      const addons = await BaseController.executeQuery(
        'SELECT * FROM system_addons WHERE id = ?',
        [id]
      );

      if (addons.length === 0) {
        throw new NotFoundError('Addon not found');
      }

      const addon = addons[0];

      // Run uninstall hook if exists
      await SystemAddonController.runAddonHook(addon, 'uninstall');

      // Delete addon directory
      const addonDir = path.join(ADDONS_DIR, addon.directory);
      await fs.rm(addonDir, { recursive: true, force: true }).catch(() => {});

      // Delete from database
      await BaseController.executeQuery('DELETE FROM system_addons WHERE id = ?', [id]);

      logger.info(`Addon deleted: ${addon.name}`);

      return BaseController.sendSuccess(res, null, 200, 'Addon deleted successfully');
    } catch (error) {
      logger.error('Error deleting addon', { error: error.message });
      return BaseController.sendError(res, error.message, error.statusCode || 500);
    }
  }

  /**
   * Get addon icon image
   * GET /api/superadmin/system-addons/:id/icon
   */
  static async getAddonIcon(req, res) {
    try {
      const { id } = req.params;

      const addons = await BaseController.executeQuery(
        'SELECT directory, icon FROM system_addons WHERE id = ?',
        [id]
      );

      if (addons.length === 0) {
        throw new NotFoundError('Addon not found');
      }

      const addon = addons[0];
      
      // Check for icon file in addon directory
      const iconExtensions = ['.png', '.jpg', '.jpeg', '.svg', '.ico', '.webp'];
      const addonDir = path.join(ADDONS_DIR, addon.directory);

      for (const ext of iconExtensions) {
        const iconPath = path.join(addonDir, `icon${ext}`);
        if (fsSync.existsSync(iconPath)) {
          // Set appropriate content type
          const contentTypes = {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon',
            '.webp': 'image/webp'
          };
          res.setHeader('Content-Type', contentTypes[ext] || 'image/png');
          res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24h
          return res.sendFile(iconPath);
        }
      }

      // No icon image found - return 404
      return res.status(404).json({ error: 'Icon not found' });
    } catch (error) {
      logger.error('Error getting addon icon', { error: error.message });
      return BaseController.sendError(res, error.message, error.statusCode || 500);
    }
  }
}

module.exports = SystemAddonController;
