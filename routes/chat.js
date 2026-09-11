/**
 * Chat Routes
 * Routes for WhatsApp conversation management
 * 
 * Note: Main chat functionality is implemented in routes/conversations.js
 * This file provides backward compatibility for legacy endpoints.
 * 
 * @module routes/chat
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const ChatController = require('../controllers/ChatController');

// All routes require authentication and tenant context
router.use(requireAuth, requireTenant);

/**
 * @swagger
 * /api/chat/conversations:
 *   get:
 *     summary: Get conversations (legacy endpoint)
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of conversations
 */
router.get('/conversations', ChatController.getConversations);

module.exports = router;
