/**
 * PWA Routes
 * Handles PWA manifest, icons, and settings
 * 
 * @module routes/pwa
 */

const express = require('express');
const router = express.Router();
const PWAController = require('../controllers/PWAController');
const { requireAuth, requireSuperAdmin } = require('../middleware/auth');
const multer = require('multer');

// Configure multer for icon uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/x-icon'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only PNG, JPEG, SVG, and ICO are allowed.'));
        }
    }
});

/**
 * @route GET /api/pwa/manifest
 * @desc Get dynamic PWA manifest
 * @access Public
 */
router.get('/manifest', (req, res) => PWAController.getManifest(req, res));

/**
 * @route GET /api/pwa/icon/:size
 * @desc Get PWA icon by size
 * @access Public
 */
router.get('/icon/:size', (req, res) => PWAController.getIcon(req, res));

/**
 * @route GET /api/pwa/settings
 * @desc Get PWA settings (preloader, icons)
 * @access Public
 */
router.get('/settings', (req, res) => PWAController.getSettings(req, res));

/**
 * @route PUT /api/pwa/settings
 * @desc Update PWA settings (SuperAdmin only)
 * @access SuperAdmin
 */
router.put('/settings', 
    requireAuth,
    requireSuperAdmin,
    upload.fields([
        { name: 'pwa_icon_file', maxCount: 1 },
        { name: 'pwa_icon_192_file', maxCount: 1 },
        { name: 'pwa_icon_512_file', maxCount: 1 }
    ]),
    (req, res) => PWAController.updateSettings(req, res)
);

module.exports = router;
