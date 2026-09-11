/**
 * WhatsApp Cloud User Routes - Enhanced
 * Routes for store/department users to manage conversations
 * Includes all conversation management, messaging, and pipeline operations
 */

const express = require('express');
const router = express.Router();
const WhatsAppCloudUserController = require('../controllers/WhatsAppCloudUserController');
const { authenticateToken } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const multer = require('multer');

const upload = multer({ dest: 'uploads/temp/' });

/**
 * Get accounts for current user
 */
router.get('/accounts', authenticateToken, asyncHandler(WhatsAppCloudUserController.getAccounts));

/**
 * Get conversations for current user
 * Only shows unclaimed or user's claimed conversations
 */
router.get('/conversations', authenticateToken, asyncHandler(WhatsAppCloudUserController.getConversations));

/**
 * Get conversation details
 */
router.get('/conversations/:id', authenticateToken, asyncHandler(WhatsAppCloudUserController.getConversation));

/**
 * Claim a conversation (exclusive lock)
 */
router.post('/conversations/:id/claim', authenticateToken, asyncHandler(WhatsAppCloudUserController.claimConversation));

/**
 * Release a conversation
 */
router.post('/conversations/:id/release', authenticateToken, asyncHandler(WhatsAppCloudUserController.releaseConversation));

/**
 * Get messages for a conversation (auto-claims)
 */
router.get('/conversations/:id/messages', authenticateToken, asyncHandler(WhatsAppCloudUserController.getMessages));

/**
 * Send text message
 */
router.post('/conversations/:id/send-message', authenticateToken, asyncHandler(WhatsAppCloudUserController.sendMessage));

/**
 * Add internal note
 */
router.post('/conversations/:id/internal-note', authenticateToken, asyncHandler(WhatsAppCloudUserController.addInternalNote));

/**
 * Transfer conversation to department
 */
router.put('/conversations/:id/transfer', authenticateToken, asyncHandler(WhatsAppCloudUserController.transferConversation));

/**
 * Update conversation tags
 */
router.put('/conversations/:id/tags', authenticateToken, asyncHandler(WhatsAppCloudUserController.updateTags));

/**
 * Update conversation priority
 */
router.put('/conversations/:id/priority', authenticateToken, asyncHandler(WhatsAppCloudUserController.updatePriority));

/**
 * Update conversation stage (pipeline)
 */
router.put('/conversations/:id/stage', authenticateToken, asyncHandler(WhatsAppCloudUserController.updateStage));

module.exports = router;
