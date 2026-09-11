/**
 * Profile Routes
 * 
 * Tenant profile customization routes.
 * 
 * @module routes/profile
 */

const express = require('express');
const router = express.Router();
const ProfileController = require('../controllers/ProfileController');
const { requireAuth } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');
const rateLimit = require('express-rate-limit');

// Rate limiter
const profileLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // limit each IP to 50 requests per windowMs
  message: 'Too many requests from this IP, please try again later'
});

// Apply auth and tenant middleware to all routes
router.use(requireAuth, tenantMiddleware);

router.get('/', profileLimiter, ProfileController.getProfile);
router.put('/colors', profileLimiter, ProfileController.updateColors);
router.post('/logo', profileLimiter, ProfileController.uploadLogo);
router.delete('/logo', profileLimiter, ProfileController.deleteLogo);
router.post('/reset-colors', profileLimiter, ProfileController.resetColors);

module.exports = router;
