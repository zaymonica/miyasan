/**
 * WhatsApp Routes
 * 
 * API endpoints for WhatsApp operations
 * All routes are tenant-scoped and require authentication
 * 
 * @module routes/whatsapp
 */

const express = require('express');
const router = express.Router();
const WhatsAppController = require('../controllers/WhatsAppController');
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { apiLimiter } = require('../middleware/security');

// Note: tenantMiddleware is already applied in server.js for all /api routes
// Note: requireAuth middleware will be applied per route

/**
 * @swagger
 * /api/tenant/whatsapp/connect:
 *   post:
 *     summary: Connect WhatsApp for tenant
 *     tags: [WhatsApp]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Connection initiated successfully
 *       500:
 *         description: Server error
 */
router.post("/connect", requireAuth, requireAdmin, apiLimiter, WhatsAppController.connect);

/**
 * @swagger
 * /api/tenant/whatsapp/disconnect:
 *   post:
 *     summary: Disconnect WhatsApp for tenant
 *     tags: [WhatsApp]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Disconnected successfully
 *       500:
 *         description: Server error
 */
router.post("/disconnect", requireAuth, requireAdmin, apiLimiter, WhatsAppController.disconnect);

/**
 * @swagger
 * /api/tenant/whatsapp/status:
 *   get:
 *     summary: Get WhatsApp connection status
 *     tags: [WhatsApp]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Status retrieved successfully
 *       500:
 *         description: Server error
 */
router.get("/status", requireAuth, requireAdmin, WhatsAppController.getStatus);

/**
 * @swagger
 * /api/tenant/whatsapp/qr:
 *   get:
 *     summary: Get QR code for connection
 *     tags: [WhatsApp]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: QR code retrieved successfully
 *       404:
 *         description: No QR code available
 *       500:
 *         description: Server error
 */
router.get("/qr", requireAuth, requireAdmin, WhatsAppController.getQR);

/**
 * @swagger
 * /api/tenant/whatsapp/session:
 *   delete:
 *     summary: Clear WhatsApp session
 *     tags: [WhatsApp]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Session cleared successfully
 *       500:
 *         description: Server error
 */
router.delete("/session", requireAuth, requireAdmin, apiLimiter, WhatsAppController.clearSession);

/**
 * @swagger
 * /api/tenant/whatsapp/send:
 *   post:
 *     summary: Send WhatsApp message
 *     tags: [WhatsApp]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phoneNumber
 *               - message
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 example: "5511999999999"
 *               message:
 *                 type: string
 *                 example: "Hello from Misayan!"
 *               mediaUrl:
 *                 type: string
 *                 example: "https://example.com/image.jpg"
 *     responses:
 *       200:
 *         description: Message sent successfully
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Server error
 */
router.post("/send", requireAuth, requireAdmin, apiLimiter, WhatsAppController.sendMessage);

/**
 * @swagger
 * /api/tenant/whatsapp/messages:
 *   get:
 *     summary: Get WhatsApp messages
 *     tags: [WhatsApp]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *       - in: query
 *         name: phoneNumber
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Messages retrieved successfully
 *       500:
 *         description: Server error
 */
router.get("/messages", requireAuth, requireAdmin, WhatsAppController.getMessages);

/**
 * @swagger
 * /api/tenant/whatsapp/contacts:
 *   get:
 *     summary: Get WhatsApp contacts
 *     tags: [WhatsApp]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Contacts retrieved successfully
 *       500:
 *         description: Server error
 */
router.get("/contacts", requireAuth, requireAdmin, WhatsAppController.getContacts);

module.exports = router;
