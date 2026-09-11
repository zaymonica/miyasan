/**
 * WhatsApp Cloud User Routes - ENHANCED ROBUST VERSION
 * Routes for store/department users to manage conversations
 * Features:
 * - Multi-source support (WhatsApp Cloud + Web)
 * - Robust media handling
 * - Enhanced conversation management
 * - Comprehensive error handling
 */

const express = require('express');
const router = express.Router();
const WhatsAppCloudUserController = require('../controllers/WhatsAppCloudUserController');
const WhatsAppCloudFlowController = require('../controllers/WhatsAppCloudFlowController');
const { authenticateToken } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Get WhatsApp Cloud accounts for current user
 */
router.get('/accounts', authenticateToken, asyncHandler(WhatsAppCloudUserController.getAccounts));

/**
 * Get conversations for current user - ENHANCED
 * Supports both WhatsApp Cloud and Web sources
 * Only shows unclaimed or user's claimed conversations
 */
router.get('/conversations', authenticateToken, asyncHandler(WhatsAppCloudUserController.getConversations));

/**
 * Get conversations for current user from WhatsApp Web - ENHANCED
 */
router.get('/web-conversations', authenticateToken, asyncHandler(WhatsAppCloudUserController.getWebConversations));
router.post('/web-conversations/force-sync', authenticateToken, asyncHandler(WhatsAppCloudUserController.forceWebConversationsSync));
router.get('/web-conversations/force-sync', authenticateToken, asyncHandler(WhatsAppCloudUserController.forceWebConversationsSync));

/**
 * Claim a conversation (exclusive lock) - ENHANCED
 */
router.post('/conversations/:id/claim', authenticateToken, asyncHandler(WhatsAppCloudUserController.claimConversation));

/**
 * Release a conversation - ENHANCED
 */
router.post('/conversations/:id/release', authenticateToken, asyncHandler(WhatsAppCloudUserController.releaseConversation));

/**
 * Get messages for a conversation (auto-claims) - ENHANCED
 */
router.get('/conversations/:id/messages', authenticateToken, asyncHandler(WhatsAppCloudUserController.getMessages));

/**
 * Send text message - ENHANCED
 */
router.post('/conversations/:id/send-message', authenticateToken, asyncHandler(WhatsAppCloudUserController.sendMessage));

/**
 * Send media message - NEW ENHANCED ENDPOINT
 */
router.post('/conversations/:id/send-media', authenticateToken, asyncHandler(WhatsAppCloudUserController.sendMediaMessage));

/**
 * Send product message - NEW ENHANCED ENDPOINT
 */
router.post('/conversations/:id/send-product', authenticateToken, asyncHandler(WhatsAppCloudUserController.sendProductMessage));

/**
 * Send invoice message - NEW ENHANCED ENDPOINT
 */
router.post('/conversations/:id/send-invoice', authenticateToken, asyncHandler(WhatsAppCloudUserController.sendInvoiceMessage));

/**
 * Add internal note
 */
router.post('/conversations/:id/internal-note', authenticateToken, asyncHandler(WhatsAppCloudUserController.addInternalNote));

/**
 * Conversation notes
 */
router.get('/conversations/:conversationId/notes', authenticateToken, asyncHandler(WhatsAppCloudUserController.getConversationNotes));
router.post('/conversations/:conversationId/notes', authenticateToken, asyncHandler(WhatsAppCloudUserController.addConversationNote));

/**
 * Update conversation tags - ENHANCED
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

/**
 * Transfer conversation
 */
router.put('/conversations/:conversationId/transfer', authenticateToken, asyncHandler(WhatsAppCloudUserController.transferConversationEnhanced));

/**
 * Get pipeline stages for current tenant (read-only)
 * GET /api/user/whatsapp-cloud/pipeline-stages
 */
router.get('/pipeline-stages', authenticateToken, asyncHandler(WhatsAppCloudUserController.getPipelineStages));

router.get('/flows', authenticateToken, asyncHandler(WhatsAppCloudFlowController.list));
router.post('/flows', authenticateToken, asyncHandler(WhatsAppCloudFlowController.save));
router.delete('/flows/:flowId', authenticateToken, asyncHandler(WhatsAppCloudFlowController.delete));

/**
 * FAQ Management Routes
 */
const WhatsAppCloudFAQController = require('../controllers/WhatsAppCloudFAQController');

// Get all FAQs
router.get('/faqs', authenticateToken, asyncHandler(WhatsAppCloudFAQController.list));

// Search FAQs
router.get('/faqs/search', authenticateToken, asyncHandler(WhatsAppCloudFAQController.search));

// Get FAQ statistics
router.get('/faqs/statistics', authenticateToken, asyncHandler(WhatsAppCloudFAQController.getStatistics));

// Get FAQ settings
router.get('/faqs/settings', authenticateToken, asyncHandler(WhatsAppCloudFAQController.getSettings));

// Save FAQ settings
router.post('/faqs/settings', authenticateToken, asyncHandler(WhatsAppCloudFAQController.saveSettings));

// Get FAQ by ID
router.get('/faqs/:id', authenticateToken, asyncHandler(WhatsAppCloudFAQController.getById));

// Get FAQ analytics
router.get('/faqs/:id/analytics', authenticateToken, asyncHandler(WhatsAppCloudFAQController.getFAQAnalytics));

// Create new FAQ
router.post('/faqs', authenticateToken, asyncHandler(WhatsAppCloudFAQController.create));

// Update FAQ
router.put('/faqs/:id', authenticateToken, asyncHandler(WhatsAppCloudFAQController.update));

// Toggle FAQ active status
router.patch('/faqs/:id/toggle', authenticateToken, asyncHandler(WhatsAppCloudFAQController.toggleActive));

// Reorder FAQs
router.post('/faqs/reorder', authenticateToken, asyncHandler(WhatsAppCloudFAQController.reorder));

// Delete FAQ
router.delete('/faqs/:id', authenticateToken, asyncHandler(WhatsAppCloudFAQController.delete));


/**
 * Get stores for transfer - NEW ENDPOINT
 */
router.get('/stores', authenticateToken, asyncHandler(WhatsAppCloudUserController.getStores));

/**
 * Get departments for transfer - NEW ENDPOINT
 */
router.get('/departments', authenticateToken, asyncHandler(WhatsAppCloudUserController.getDepartments));

/**
 * Health check endpoint for debugging
 */
router.get('/health', authenticateToken, asyncHandler(WhatsAppCloudUserController.healthCheck));

module.exports = router;
