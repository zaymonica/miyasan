/**
 * WhatsApp Cloud API Routes
 * Handles WhatsApp Cloud integration and Facebook Embedded Signup
 */

const express = require('express');
const router = express.Router();
const WhatsAppCloudController = require('../controllers/WhatsAppCloudController');
const { authenticateToken } = require("../middleware/auth");
const { requireTenant } = require('../middleware/tenant');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * @swagger
 * tags:
 *   name: WhatsApp Cloud
 *   description: WhatsApp Cloud API integration endpoints
 */

/**
 * @swagger
 * tags:
 *   name: Messages
 *   description: |
 *     Send and receive WhatsApp messages
 *     
 *     **Common Use Cases:**
 *     - Customer support conversations
 *     - Order notifications and updates
 *     - Appointment reminders
 *     - Marketing campaigns
 *     - Two-way interactive messaging
 */

/**
 * @swagger
 * /api/whatsapp-cloud/facebook-callback:
 *   post:
 *     summary: Process Facebook Embedded Signup callback
 *     tags: [WhatsApp Cloud]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               code:
 *                 type: string
 *                 description: Authorization code from Facebook
 *               auth_response:
 *                 type: object
 *                 description: Auth response object from Facebook SDK
 *     responses:
 *       200:
 *         description: Account connected successfully
 *       400:
 *         description: Invalid request or configuration error
 *       500:
 *         description: Server error
 */
router.post('/facebook-callback', authenticateToken, requireTenant, asyncHandler(WhatsAppCloudController.facebookCallback));

/**
 * @swagger
 * /api/whatsapp-cloud/webhook:
 *   get:
 *     summary: Webhook verification endpoint (Facebook)
 *     tags: [WhatsApp Cloud]
 *     parameters:
 *       - in: query
 *         name: hub.mode
 *         schema:
 *           type: string
 *       - in: query
 *         name: hub.verify_token
 *         schema:
 *           type: string
 *       - in: query
 *         name: hub.challenge
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Verification successful
 *       403:
 *         description: Verification failed
 */
router.get('/webhook', WhatsAppCloudController.webhookVerify);

/**
 * @swagger
 * /api/whatsapp-cloud/webhook:
 *   post:
 *     summary: Receive WhatsApp messages and events
 *     tags: [WhatsApp Cloud]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Event received
 */
router.post('/webhook', asyncHandler(WhatsAppCloudController.webhookReceive));

/**
 * @swagger
 * /api/whatsapp-cloud/accounts:
 *   get:
 *     summary: Get all WhatsApp Cloud accounts for tenant
 *     tags: [WhatsApp Cloud]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of WhatsApp accounts
 */
router.get('/accounts', authenticateToken, requireTenant, asyncHandler(WhatsAppCloudController.getAccounts));

/**
 * @swagger
 * /api/whatsapp-cloud/accounts/{id}:
 *   put:
 *     summary: Update WhatsApp account manually
 *     tags: [WhatsApp Cloud]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               account_name:
 *                 type: string
 *               waba_id:
 *                 type: string
 *               phone_number_id:
 *                 type: string
 *               phone_number:
 *                 type: string
 *               access_token:
 *                 type: string
 *               app_id:
 *                 type: string
 *               app_secret:
 *                 type: string
 *     responses:
 *       200:
 *         description: Account updated successfully
 */
router.put('/accounts/:id', authenticateToken, requireTenant, asyncHandler(WhatsAppCloudController.updateAccount));

/**
 * @swagger
 * /api/whatsapp-cloud/accounts/{id}:
 *   delete:
 *     summary: Delete WhatsApp account
 *     tags: [WhatsApp Cloud]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Account deleted successfully
 */
router.delete('/accounts/:id', authenticateToken, requireTenant, asyncHandler(WhatsAppCloudController.deleteAccount));

/**
 * @swagger
 * /api/whatsapp-cloud/accounts/{id}/set-default:
 *   put:
 *     summary: Set account as default
 *     tags: [WhatsApp Cloud]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Default account updated successfully
 */
router.put('/accounts/:id/set-default', authenticateToken, requireTenant, asyncHandler(WhatsAppCloudController.setDefaultAccount));

/**
 * @swagger
 * /api/whatsapp-cloud/accounts/{id}/test:
 *   post:
 *     summary: Test WhatsApp account connection
 *     tags: [WhatsApp Cloud]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Connection test successful
 *       400:
 *         description: Connection test failed
 */
router.post('/accounts/:id/test', authenticateToken, requireTenant, asyncHandler(WhatsAppCloudController.testAccount));

/**
 * @swagger
 * /api/whatsapp-cloud/accounts/{id}/sync-templates:
 *   post:
 *     summary: Sync message templates from Meta
 *     tags: [WhatsApp Cloud]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Templates synced successfully
 */
router.post('/accounts/:id/sync-templates', authenticateToken, requireTenant, asyncHandler(WhatsAppCloudController.syncTemplates));
router.post('/accounts/:id/mark-webhook-verified', authenticateToken, requireTenant, asyncHandler(WhatsAppCloudController.markWebhookVerified));

/**
 * @swagger
 * /api/whatsapp-cloud/accounts/{id}/templates:
 *   get:
 *     summary: Get templates for account
 *     tags: [WhatsApp Cloud]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Templates retrieved successfully
 */
router.get('/accounts/:id/templates', authenticateToken, requireTenant, asyncHandler(WhatsAppCloudController.getTemplates));

/**
 * @swagger
 * /api/whatsapp-cloud/admin/conversations:
 *   get:
 *     summary: Get all conversations for tenant (admin view)
 *     tags: [WhatsApp Cloud]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Conversations retrieved successfully
 */
router.get('/admin/conversations', authenticateToken, requireTenant, asyncHandler(WhatsAppCloudController.getAdminConversations));

/**
 * @swagger
 * /api/whatsapp-cloud/conversations:
 *   get:
 *     summary: Get all conversations for active account
 *     tags: [WhatsApp Cloud]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Conversations retrieved successfully
 */
router.get('/conversations', authenticateToken, requireTenant, asyncHandler(WhatsAppCloudController.getConversations));

/**
 * @swagger
 * /api/whatsapp-cloud/conversations/{id}/messages:
 *   get:
 *     summary: Get messages for a conversation
 *     description: |
 *       Retrieve all messages from a specific conversation with pagination support.
 *       
 *       **Use Cases:**
 *       - **Customer Support Dashboard**: Load conversation history to understand customer context
 *       - **Chat Interface**: Display message thread in real-time chat applications
 *       - **Analytics & Reporting**: Extract message data for conversation analysis
 *       - **Message Search**: Retrieve messages to search for specific content or keywords
 *       
 *       **Example Scenario:**
 *       A support agent opens a customer conversation. The system calls this endpoint to load
 *       the complete message history, showing both incoming customer messages and outgoing
 *       agent responses, allowing the agent to understand the full context before responding.
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Conversation ID
 *         schema:
 *           type: integer
 *         example: 123
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *         example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Number of messages per page
 *         example: 50
 *     responses:
 *       200:
 *         description: Messages retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 messages:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       conversationId:
 *                         type: integer
 *                       messageId:
 *                         type: string
 *                       direction:
 *                         type: string
 *                         enum: [inbound, outbound]
 *                       content:
 *                         type: string
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                       status:
 *                         type: string
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *             example:
 *               messages:
 *                 - id: 1
 *                   conversationId: 123
 *                   messageId: "wamid.HBgNNTUxMTk4NzY1NDMyMRUCABIYFjNFQjBDMDg4RjREMzRFNTlCMjRGNTMA"
 *                   direction: "inbound"
 *                   content: "Olá, preciso de ajuda com meu pedido #12345"
 *                   timestamp: "2026-02-04T10:30:00Z"
 *                   status: "delivered"
 */
router.get('/conversations/:id/messages', authenticateToken, requireTenant, asyncHandler(WhatsAppCloudController.getMessages));

/**
 * @swagger
 * /api/whatsapp-cloud/send-message:
 *   post:
 *     summary: Send text message
 *     tags: [WhatsApp Cloud]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               accountId:
 *                 type: integer
 *               to:
 *                 type: string
 *               message:
 *                 type: string
 *               conversationId:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Message sent successfully
 */
router.post('/send-message', authenticateToken, requireTenant, asyncHandler(WhatsAppCloudController.sendMessage));

router.post('/campaigns/send', authenticateToken, requireTenant, asyncHandler(WhatsAppCloudController.sendTemplateCampaign));
router.get('/campaigns', authenticateToken, requireTenant, asyncHandler(WhatsAppCloudController.listTemplateCampaigns));
router.post('/campaigns', authenticateToken, requireTenant, asyncHandler(WhatsAppCloudController.createTemplateCampaign));
router.put('/campaigns/:id', authenticateToken, requireTenant, asyncHandler(WhatsAppCloudController.updateTemplateCampaign));
router.delete('/campaigns/:id', authenticateToken, requireTenant, asyncHandler(WhatsAppCloudController.deleteTemplateCampaign));

/**
 * @swagger
 * /api/whatsapp-cloud/send-media:
 *   post:
 *     summary: Send media message
 *     tags: [WhatsApp Cloud]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               accountId:
 *                 type: integer
 *               to:
 *                 type: string
 *               conversationId:
 *                 type: integer
 *               media:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Media sent successfully
 */
const multer = require('multer');
const upload = multer({ dest: 'uploads/temp/' });
router.post('/send-media', authenticateToken, upload.single('media'), asyncHandler(WhatsAppCloudController.sendMedia));

module.exports = router;
