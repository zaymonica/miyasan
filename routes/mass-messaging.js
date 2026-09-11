/**
 * Mass Messaging Routes
 * Routes for bulk message campaigns
 * 
 * Note: Main mass messaging functionality is implemented in routes/mass-send.js
 * This file provides backward compatibility for legacy endpoints.
 * 
 * @module routes/mass-messaging
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { requireTenant } = require('../middleware/tenant');
const MassSendController = require('../controllers/MassSendController');

// All routes require authentication and tenant context
router.use(requireAuth, requireAdmin, requireTenant);

/**
 * @swagger
 * /api/mass-messaging/campaigns:
 *   get:
 *     summary: Get mass messaging campaigns (legacy endpoint)
 *     tags: [Mass Messaging]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of campaigns
 */
router.get('/campaigns', MassSendController.getHistory);

module.exports = router;
