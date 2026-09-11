/**
 * PWA Controller
 * Handles PWA manifest, icons, and settings
 * 
 * @module controllers/PWAController
 */

const BaseController = require('./BaseController');
const { pool } = require('../config/database');
const { logger } = require('../config/logger');
const path = require('path');
const fs = require('fs').promises;

class PWAController extends BaseController {
    /**
     * Get PWA manifest
     * Dynamic manifest based on system settings
     */
    async getManifest(req, res) {
        try {
            // Get system branding settings from system_settings_kv
            const [settings] = await pool.execute(
                'SELECT setting_key, setting_value FROM system_settings_kv WHERE setting_key IN (?, ?, ?, ?, ?)',
                ['system_name', 'pwa_icon_192', 'pwa_icon_512', 'pwa_theme_color', 'pwa_background_color']
            );

            const settingsMap = {};
            settings.forEach(s => {
                settingsMap[s.setting_key] = s.setting_value;
            });

            const manifest = {
                name: settingsMap.system_name || 'Misayan Chat',
                short_name: (settingsMap.system_name || 'Misayan').substring(0, 12),
                description: 'WhatsApp-style chat application',
                start_url: '/user/',
                display: 'standalone',
                background_color: settingsMap.pwa_background_color || '#075E54',
                theme_color: settingsMap.pwa_theme_color || '#075E54',
                orientation: 'portrait-primary',
                scope: '/user/',
                icons: [
                    {
                        src: '/api/pwa/icon/192',
                        sizes: '192x192',
                        type: 'image/png',
                        purpose: 'any maskable'
                    },
                    {
                        src: '/api/pwa/icon/512',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'any maskable'
                    }
                ],
                categories: ['business', 'communication'],
                prefer_related_applications: false
            };

            res.setHeader('Content-Type', 'application/manifest+json');
            res.json(manifest);
        } catch (error) {
            logger.error('Error generating PWA manifest:', error);
            // Return default manifest on error
            res.setHeader('Content-Type', 'application/manifest+json');
            res.json({
                name: 'Misayan Chat',
                short_name: 'Misayan',
                start_url: '/user/',
                display: 'standalone',
                background_color: '#075E54',
                theme_color: '#075E54',
                icons: []
            });
        }
    }

    /**
     * Get PWA icon
     * Returns icon based on size parameter
     */
    async getIcon(req, res) {
        try {
            const size = parseInt(req.params.size) || 192;
            const validSizes = [16, 32, 48, 72, 96, 128, 144, 152, 180, 192, 384, 512];
            const targetSize = validSizes.includes(size) ? size : 192;

            // Try to get custom icon from settings
            const [settings] = await pool.execute(
                'SELECT setting_value FROM system_settings_kv WHERE setting_key = ?',
                [`pwa_icon_${targetSize}`]
            );

            if (settings.length > 0 && settings[0].setting_value) {
                const iconPath = path.join(__dirname, '..', 'public', settings[0].setting_value);
                try {
                    await fs.access(iconPath);
                    return res.sendFile(iconPath);
                } catch (e) {
                    // File doesn't exist, fall through to default
                }
            }

            // Try general PWA icon
            const [generalIcon] = await pool.execute(
                'SELECT setting_value FROM system_settings_kv WHERE setting_key = ?',
                ['pwa_icon']
            );

            if (generalIcon.length > 0 && generalIcon[0].setting_value) {
                const iconPath = path.join(__dirname, '..', 'public', generalIcon[0].setting_value);
                try {
                    await fs.access(iconPath);
                    return res.sendFile(iconPath);
                } catch (e) {
                    // File doesn't exist, fall through to default
                }
            }

            // Return default icon
            const defaultIconPath = path.join(__dirname, '..', 'public', 'images', 'default-pwa-icon.svg');
            try {
                await fs.access(defaultIconPath);
                res.setHeader('Content-Type', 'image/svg+xml');
                return res.sendFile(defaultIconPath);
            } catch (e) {
                // Generate a simple colored square as fallback
                res.status(404).json({ error: 'Icon not found' });
            }
        } catch (error) {
            logger.error('Error getting PWA icon:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * Get PWA settings
     * Returns preloader and icon settings
     */
    async getSettings(req, res) {
        try {
            const [settings] = await pool.execute(
                `SELECT setting_key, setting_value FROM system_settings_kv 
                 WHERE setting_key LIKE 'pwa_%' OR setting_key LIKE 'preloader_%'`
            );

            const settingsMap = {};
            settings.forEach(s => {
                settingsMap[s.setting_key] = s.setting_value;
            });

            return res.json({ success: true, data: settingsMap });
        } catch (error) {
            logger.error('Error getting PWA settings:', error);
            return res.json({ success: true, data: {} });
        }
    }

    /**
     * Update PWA settings (SuperAdmin only)
     */
    async updateSettings(req, res) {
        try {
            const {
                pwa_icon,
                pwa_icon_192,
                pwa_icon_512,
                pwa_theme_color,
                pwa_background_color,
                preloader_bg_color,
                preloader_text
            } = req.body;

            const settingsToUpdate = {
                pwa_icon,
                pwa_icon_192,
                pwa_icon_512,
                pwa_theme_color,
                pwa_background_color,
                preloader_bg_color,
                preloader_text
            };

            for (const [key, value] of Object.entries(settingsToUpdate)) {
                if (value !== undefined) {
                    await pool.execute(
                        `INSERT INTO system_settings_kv (setting_key, setting_value, updated_at)
                         VALUES (?, ?, NOW())
                         ON DUPLICATE KEY UPDATE setting_value = ?, updated_at = NOW()`,
                        [key, value, value]
                    );
                }
            }

            // Handle file uploads
            if (req.files) {
                if (req.files.pwa_icon_file) {
                    const iconPath = await this.saveUploadedIcon(req.files.pwa_icon_file[0], 'pwa_icon');
                    await this.updateSetting('pwa_icon', iconPath);
                }
                if (req.files.pwa_icon_192_file) {
                    const iconPath = await this.saveUploadedIcon(req.files.pwa_icon_192_file[0], 'pwa_icon_192');
                    await this.updateSetting('pwa_icon_192', iconPath);
                }
                if (req.files.pwa_icon_512_file) {
                    const iconPath = await this.saveUploadedIcon(req.files.pwa_icon_512_file[0], 'pwa_icon_512');
                    await this.updateSetting('pwa_icon_512', iconPath);
                }
            }

            logger.info('PWA settings updated');
            return res.json({ success: true, message: 'PWA settings updated successfully' });
        } catch (error) {
            logger.error('Error updating PWA settings:', error);
            return res.status(500).json({ success: false, error: 'Error updating PWA settings' });
        }
    }

    /**
     * Save uploaded icon file
     */
    async saveUploadedIcon(file, type) {
        const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'pwa');
        await fs.mkdir(uploadDir, { recursive: true });

        const filename = `${type}_${Date.now()}${path.extname(file.originalname)}`;
        const filepath = path.join(uploadDir, filename);

        await fs.writeFile(filepath, file.buffer);

        return `/uploads/pwa/${filename}`;
    }

    /**
     * Update a single setting
     */
    async updateSetting(key, value) {
        await pool.execute(
            `INSERT INTO system_settings_kv (setting_key, setting_value, updated_at)
             VALUES (?, ?, NOW())
             ON DUPLICATE KEY UPDATE setting_value = ?, updated_at = NOW()`,
            [key, value, value]
        );
    }
}

module.exports = new PWAController();
