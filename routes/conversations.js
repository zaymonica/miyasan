/**
 * Conversations Routes
 * Routes for conversation monitoring (admin only) and user chat
 * 
 * Features:
 * - Claim/release conversations for exclusive attendance
 * - Transfer to store/department
 * - Tenant admin view-only mode
 * 
 * @module routes/conversations
 */

const express = require('express');
const router = express.Router();
const ConversationsController = require('../controllers/ConversationsController');
const ChatController = require('../controllers/ChatController');

// Note: requireAuth and tenantMiddleware are already applied in server.js
// No need to apply them again here

/**
 * @swagger
 * tags:
 *   name: Messages
 *   description: |
 *     Send, receive, and manage WhatsApp messages
 *     
 *     **Common Use Cases:**
 *     - Customer support conversations
 *     - Order notifications and updates
 *     - Appointment reminders
 *     - Marketing campaigns
 *     - Two-way interactive messaging
 *     - Message editing and deletion
 *     - Media sharing (images, videos, documents)
 */

/**
 * @swagger
 * /api/tenant/conversations:
 *   get:
 *     summary: Get all conversations (filtered by user role and claim status)
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [waiting, attended, closed, active, archived]
 *         description: Filter by conversation status
 *       - in: query
 *         name: assigned_user_id
 *         schema:
 *           type: integer
 *         description: Filter by assigned user
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by contact name or phone
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Number of conversations to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Offset for pagination
 *     responses:
 *       200:
 *         description: List of conversations
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/', ChatController.getConversations);

/**
 * @swagger
 * /api/tenant/conversations/stats:
 *   get:
 *     summary: Get conversation statistics
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Conversation statistics
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
// IMPORTANT: Specific routes must come BEFORE /:id to avoid being captured by it
router.get('/stats', ConversationsController.getStats);

router.delete('/:id/notes', ConversationsController.clearConversationNotes);

/**
 * @swagger
 * /api/tenant/conversations/{id}/claim:
 *   post:
 *     summary: Claim a conversation for exclusive attendance
 *     tags: [Conversations]
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
 *         description: Conversation claimed successfully
 *       403:
 *         description: Cannot claim - already claimed by another user or admin
 *       404:
 *         description: Conversation not found
 */
router.post('/:id/claim', ChatController.claimConversation);

/**
 * @swagger
 * /api/tenant/conversations/{id}/release:
 *   post:
 *     summary: Release a claimed conversation
 *     tags: [Conversations]
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
 *         description: Conversation released successfully
 *       404:
 *         description: Conversation not found or not claimed by this user
 */
router.post('/:id/release', ChatController.releaseConversation);

/**
 * @swagger
 * /api/tenant/conversations/{id}/messages:
 *   get:
 *     summary: Get messages in conversation
 *     description: |
 *       Retrieve all messages from a specific conversation with complete sender information.
 *       
 *       **Use Cases:**
 *       - **Customer Support Dashboard**: Load conversation history to understand customer context
 *       - **Chat Interface**: Display message thread in real-time chat applications
 *       - **Analytics & Reporting**: Extract message data for conversation analysis
 *       - **Message Search**: Retrieve messages to search for specific content or keywords
 *       - **Audit Trail**: Review complete conversation history for quality assurance
 *       
 *       **Example Scenario:**
 *       A support agent opens a customer conversation. The system calls this endpoint to load
 *       the complete message history, showing both incoming customer messages and outgoing
 *       agent responses with timestamps and status, allowing the agent to understand the full
 *       context before responding.
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
 *         description: List of messages with sender info
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
 *                       conversation_id:
 *                         type: integer
 *                       sender_type:
 *                         type: string
 *                         enum: [user, contact, system]
 *                       sender_id:
 *                         type: integer
 *                       message:
 *                         type: string
 *                       media_url:
 *                         type: string
 *                       media_type:
 *                         type: string
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                       status:
 *                         type: string
 *                       sender_name:
 *                         type: string
 *             example:
 *               messages:
 *                 - id: 1
 *                   conversation_id: 123
 *                   sender_type: "contact"
 *                   sender_id: 456
 *                   message: "Olá, preciso de ajuda com meu pedido #12345"
 *                   media_url: null
 *                   media_type: null
 *                   timestamp: "2026-02-04T10:30:00Z"
 *                   status: "delivered"
 *                   sender_name: "João Silva"
 *                 - id: 2
 *                   conversation_id: 123
 *                   sender_type: "user"
 *                   sender_id: 789
 *                   message: "Olá João! Claro, vou verificar o status do seu pedido. Um momento por favor."
 *                   media_url: null
 *                   media_type: null
 *                   timestamp: "2026-02-04T10:31:00Z"
 *                   status: "read"
 *                   sender_name: "Maria Atendente"
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Conversation not found
 */
router.get('/:id/messages', ChatController.getMessages);

/**
 * @swagger
 * /api/tenant/conversations/{id}/messages:
 *   post:
 *     summary: Send message in conversation (auto-claims if unclaimed)
 *     description: |
 *       Send a text or media message in a conversation. Automatically claims the conversation
 *       if it's unclaimed, ensuring exclusive attendance.
 *       
 *       **Use Cases:**
 *       - **Customer Support Response**: Agent replies to customer inquiries
 *       - **Order Updates**: Send order confirmations, shipping updates, delivery notifications
 *       - **Appointment Reminders**: Send reminders for scheduled appointments
 *       - **Product Information**: Share product details, prices, and availability
 *       - **Media Sharing**: Send images, videos, documents, or audio files
 *       
 *       **Example Scenario:**
 *       A customer asks about their order status. The support agent uses this endpoint to send
 *       a personalized response with the tracking information. If the conversation wasn't claimed,
 *       it's automatically claimed by the agent, preventing other agents from responding simultaneously.
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 description: Text message content to send
 *                 example: "Olá! Seu pedido #12345 foi enviado e chegará em 2-3 dias úteis. Código de rastreamento: BR123456789"
 *               media_url:
 *                 type: string
 *                 description: URL of media file to send (image, video, document, audio)
 *                 example: "https://example.com/uploads/invoice.pdf"
 *               media_type:
 *                 type: string
 *                 enum: [image, video, document, audio]
 *                 description: Type of media being sent
 *                 example: "document"
 *           examples:
 *             textMessage:
 *               summary: Simple text message
 *               value:
 *                 message: "Olá! Verificamos seu pedido e ele está a caminho. Previsão de entrega: amanhã."
 *             orderConfirmation:
 *               summary: Order confirmation with details
 *               value:
 *                 message: "✅ Pedido #12345 confirmado!\n\nItens:\n- Produto A (2x)\n- Produto B (1x)\n\nTotal: R$ 150,00\n\nObrigado pela sua compra!"
 *             mediaMessage:
 *               summary: Message with document attachment
 *               value:
 *                 message: "Segue a nota fiscal do seu pedido em anexo."
 *                 media_url: "https://example.com/uploads/invoice-12345.pdf"
 *                 media_type: "document"
 *             appointmentReminder:
 *               summary: Appointment reminder
 *               value:
 *                 message: "🗓️ Lembrete: Você tem uma consulta agendada para amanhã às 14h no consultório da Dra. Maria.\n\nEndereço: Rua das Flores, 123\n\nConfirme sua presença respondendo SIM."
 *     responses:
 *       200:
 *         description: Message sent with sender info
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     conversation_id:
 *                       type: integer
 *                     message:
 *                       type: string
 *                     sender_name:
 *                       type: string
 *                     timestamp:
 *                       type: string
 *             example:
 *               success: true
 *               message:
 *                 id: 456
 *                 conversation_id: 123
 *                 message: "Olá! Seu pedido #12345 foi enviado e chegará em 2-3 dias úteis."
 *                 sender_name: "Maria Atendente"
 *                 timestamp: "2026-02-04T10:35:00Z"
 *       403:
 *         description: Cannot send - admin or conversation claimed by another user
 *       404:
 *         description: Conversation not found
 */
router.post('/:id/messages', ChatController.sendMessage);

/**
 * @swagger
 * /api/tenant/conversations/{conversationId}/messages/{messageId}:
 *   put:
 *     summary: Edit a message
 *     description: |
 *       Edit a previously sent message. Only the sender can edit their own messages,
 *       and received messages cannot be edited.
 *       
 *       **Use Cases:**
 *       - **Typo Correction**: Fix spelling or grammar mistakes in sent messages
 *       - **Information Update**: Update incorrect information (prices, dates, addresses)
 *       - **Clarification**: Add or modify details to make the message clearer
 *       
 *       **Example Scenario:**
 *       An agent sent a message with the wrong delivery date. They use this endpoint to
 *       correct the date, ensuring the customer receives accurate information.
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         description: Conversation ID
 *         schema:
 *           type: integer
 *         example: 123
 *       - in: path
 *         name: messageId
 *         required: true
 *         description: Message ID to edit
 *         schema:
 *           type: integer
 *         example: 456
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - newMessage
 *             properties:
 *               newMessage:
 *                 type: string
 *                 description: Updated message content
 *                 example: "Olá! Seu pedido #12345 foi enviado e chegará em 3-5 dias úteis (correção: prazo atualizado)."
 *           examples:
 *             correctionExample:
 *               summary: Correcting delivery date
 *               value:
 *                 newMessage: "Olá! Seu pedido #12345 foi enviado e chegará em 3-5 dias úteis (correção: prazo atualizado)."
 *             priceCorrection:
 *               summary: Correcting price information
 *               value:
 *                 newMessage: "O valor total do pedido é R$ 180,00 (correção: valor atualizado com frete)."
 *     responses:
 *       200:
 *         description: Message edited successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *             example:
 *               success: true
 *               message: "Mensagem editada com sucesso"
 *       403:
 *         description: Cannot edit - not the sender or received message
 *       404:
 *         description: Message not found
 */
router.put('/:conversationId/messages/:messageId', ChatController.editMessage);

/**
 * @swagger
 * /api/tenant/conversations/{conversationId}/messages/{messageId}:
 *   delete:
 *     summary: Delete a message
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: deleteFor
 *         schema:
 *           type: string
 *           enum: [me, everyone]
 *           default: me
 *         description: Delete for me only or for everyone
 *     responses:
 *       200:
 *         description: Message deleted successfully
 *       403:
 *         description: Cannot delete for everyone - not the sender or received message
 *       404:
 *         description: Message not found
 */
router.delete('/:conversationId/messages/:messageId', ChatController.deleteMessage);

/**
 * @swagger
 * /api/tenant/conversations/{id}/transfer:
 *   post:
 *     summary: Transfer conversation to store or department
 *     tags: [Conversations]
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
 *               targetStore:
 *                 type: string
 *                 description: Store name to transfer to
 *               targetDepartment:
 *                 type: string
 *                 description: Department name to transfer to
 *     responses:
 *       200:
 *         description: Conversation transferred successfully
 *       403:
 *         description: Cannot transfer - not the owner
 */
router.post('/:id/transfer', ChatController.transferConversation);

/**
 * @swagger
 * /api/tenant/conversations/{id}/status:
 *   put:
 *     summary: Update conversation status
 *     tags: [Conversations]
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
 *               status:
 *                 type: string
 *                 enum: [active, archived, closed]
 *     responses:
 *       200:
 *         description: Status updated
 */
router.put('/:id/status', ChatController.updateStatus);

/**
 * @swagger
 * /api/tenant/conversations/{id}:
 *   get:
 *     summary: Get conversation details with messages
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Conversation ID
 *     responses:
 *       200:
 *         description: Conversation details with messages
 *       404:
 *         description: Conversation not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
// IMPORTANT: This generic /:id route MUST come AFTER all specific routes like /:id/messages
router.get('/:id', ConversationsController.getConversation);

module.exports = router;
