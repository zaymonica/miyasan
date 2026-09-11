/**
 * Landing Page Routes
 */

const express = require('express');
const router = express.Router();
const LandingPageController = require('../controllers/LandingPageController');
const { requireAuth, requireSuperAdmin } = require('../middleware/auth');

// Public routes
router.get('/settings', LandingPageController.getSettings);
router.post('/whatsapp-link', LandingPageController.generateWhatsAppLink);

// Super Admin routes
router.put('/settings', requireAuth, requireSuperAdmin, LandingPageController.updateSettings);
router.post('/upload-logos', requireAuth, requireSuperAdmin, LandingPageController.uploadLogos);

router.get('/features', requireAuth, requireSuperAdmin, LandingPageController.getFeatures);
router.post('/features', requireAuth, requireSuperAdmin, LandingPageController.createFeature);
router.put('/features/:id', requireAuth, requireSuperAdmin, LandingPageController.updateFeature);
router.delete('/features/:id', requireAuth, requireSuperAdmin, LandingPageController.deleteFeature);

router.get('/testimonials', requireAuth, requireSuperAdmin, LandingPageController.getTestimonials);
router.post('/testimonials', requireAuth, requireSuperAdmin, LandingPageController.createTestimonial);
router.put('/testimonials/:id', requireAuth, requireSuperAdmin, LandingPageController.updateTestimonial);
router.delete('/testimonials/:id', requireAuth, requireSuperAdmin, LandingPageController.deleteTestimonial);

module.exports = router;
