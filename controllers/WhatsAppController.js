/**
 * WhatsAppController.js
 * 
 * Controller for WhatsApp operations
 * Handles connection, messaging, and status management
 * 
 * @module controllers/WhatsAppController
 */

const { logger } = require('../config/logger');
const { getWhatsAppService } = require('../services/WhatsAppService');

/**
 * WhatsApp Controller
 * All methods are tenant-scoped via req.tenant.id
 */
class WhatsAppController {
  /**
   * Connect WhatsApp for tenant
   * POST /api/tenant/whatsapp/connect
   */
  static async connect(req, res) {
    try {
      // Check if tenant exists
      if (!req.tenant || !req.tenant.id) {
        logger.error('Tenant not found in request');
        return res.status(400).json({
          success: false,
          message: 'Tenant information not found. Please login again.'
        });
      }

      const tenantId = req.tenant.id;
      const io = req.app.get('io');
      const whatsappService = getWhatsAppService(io);

      logger.info(`Connecting WhatsApp for tenant ${tenantId}`);

      const instance = await whatsappService.initializeTenant(tenantId);
      
      // Get current status and QR code
      const status = await whatsappService.getTenantStatus(tenantId);
      
      logger.info(`WhatsApp connection initiated for tenant ${tenantId}`, {
        hasQR: !!status.qr,
        status: status.status
      });

      res.json({
        success: true,
        message: 'WhatsApp connection initiated',
        data: {
          status: status.status,
          qr: status.qr || null,
          phoneNumber: status.phoneNumber || null
        }
      });
    } catch (error) {
      logger.error(`Error connecting WhatsApp: ${error.message}`, { 
        tenantId: req.tenant.id,
        error: error.stack 
      });
      res.status(500).json({
        success: false,
        message: 'Failed to connect WhatsApp',
        error: error.message
      });
    }
  }

  /**
   * Disconnect WhatsApp for tenant
   * POST /api/tenant/whatsapp/disconnect
   */
  static async disconnect(req, res) {
    try {
      const tenantId = req.tenant.id;
      const io = req.app.get('io');
      const whatsappService = getWhatsAppService(io);

      logger.info(`Disconnecting WhatsApp for tenant ${tenantId}`);

      await whatsappService.disconnectTenant(tenantId);

      res.json({
        success: true,
        message: 'WhatsApp disconnected successfully'
      });
    } catch (error) {
      logger.error(`Error disconnecting WhatsApp: ${error.message}`, { 
        tenantId: req.tenant.id,
        error: error.stack 
      });
      res.status(500).json({
        success: false,
        message: 'Failed to disconnect WhatsApp',
        error: error.message
      });
    }
  }

  /**
   * Get WhatsApp connection status
   * GET /api/tenant/whatsapp/status
   */
  static async getStatus(req, res) {
    try {
      const tenantId = req.tenant.id;
      const io = req.app.get('io');
      const whatsappService = getWhatsAppService(io);

      const status = await whatsappService.getTenantStatus(tenantId);

      res.json({
        success: true,
        data: status
      });
    } catch (error) {
      logger.error(`Error getting WhatsApp status: ${error.message}`, { 
        tenantId: req.tenant.id,
        error: error.stack 
      });
      res.status(500).json({
        success: false,
        message: 'Failed to get WhatsApp status',
        error: error.message
      });
    }
  }

  /**
   * Get QR code for connection
   * GET /api/tenant/whatsapp/qr
   */
  static async getQR(req, res) {
    try {
      const tenantId = req.tenant.id;
      const io = req.app.get('io');
      const whatsappService = getWhatsAppService(io);

      const qrCode = await whatsappService.getQRCode(tenantId);

      if (!qrCode) {
        return res.status(404).json({
          success: false,
          message: 'No QR code available'
        });
      }

      res.json({
        success: true,
        data: { qrCode }
      });
    } catch (error) {
      logger.error(`Error getting QR code: ${error.message}`, { 
        tenantId: req.tenant.id,
        error: error.stack 
      });
      res.status(500).json({
        success: false,
        message: 'Failed to get QR code',
        error: error.message
      });
    }
  }

  /**
   * Clear WhatsApp session
   * DELETE /api/tenant/whatsapp/session
   */
  static async clearSession(req, res) {
    try {
      const tenantId = req.tenant.id;
      const io = req.app.get('io');
      const whatsappService = getWhatsAppService(io);

      logger.info(`Clearing WhatsApp session for tenant ${tenantId}`);

      await whatsappService.clearTenantSession(tenantId);

      res.json({
        success: true,
        message: 'WhatsApp session cleared successfully'
      });
    } catch (error) {
      logger.error(`Error clearing session: ${error.message}`, { 
        tenantId: req.tenant.id,
        error: error.stack 
      });
      res.status(500).json({
        success: false,
        message: 'Failed to clear session',
        error: error.message
      });
    }
  }

  /**
   * Send WhatsApp message
   * POST /api/tenant/whatsapp/send
   * Body: { phoneNumber, message, mediaUrl? }
   */
  static async sendMessage(req, res) {
    try {
      const tenantId = req.tenant.id;
      const { phoneNumber, message, mediaUrl } = req.body;

      // Validate input
      if (!phoneNumber || !message) {
        return res.status(400).json({
          success: false,
          message: 'Phone number and message are required'
        });
      }

      const io = req.app.get('io');
      const whatsappService = getWhatsAppService(io);

      logger.info(`Sending WhatsApp message for tenant ${tenantId} to ${phoneNumber}`);

      // Send message (mediaUrl not supported yet, would need sendMediaMessage)
      const result = await whatsappService.sendMessage(tenantId, phoneNumber, message);

      // Check if the service returned an error
      if (result.success === false) {
        return res.status(500).json({
          success: false,
          message: result.error || 'Failed to send message',
          error: result.error
        });
      }

      res.json({
        success: true,
        message: 'Message sent successfully',
        data: result
      });
    } catch (error) {
      logger.error(`Error sending message: ${error.message}`, { 
        tenantId: req.tenant.id,
        error: error.stack 
      });
      res.status(500).json({
        success: false,
        message: 'Failed to send message',
        error: error.message
      });
    }
  }

  /**
   * Get WhatsApp messages
   * GET /api/tenant/whatsapp/messages?limit=50&offset=0&phoneNumber=
   */
  static async getMessages(req, res) {
    try {
      const tenantId = req.tenant.id;
      const { limit = 50, offset = 0, phoneNumber } = req.query;

      const io = req.app.get('io');
      const whatsappService = getWhatsAppService(io);

      const messages = await whatsappService.getMessages(tenantId, {
        limit: parseInt(limit),
        offset: parseInt(offset),
        phoneNumber
      });

      res.json({
        success: true,
        data: messages
      });
    } catch (error) {
      logger.error(`Error getting messages: ${error.message}`, { 
        tenantId: req.tenant.id,
        error: error.stack 
      });
      res.status(500).json({
        success: false,
        message: 'Failed to get messages',
        error: error.message
      });
    }
  }

  /**
   * Get WhatsApp contacts
   * GET /api/tenant/whatsapp/contacts?limit=50&offset=0&search=
   */
  static async getContacts(req, res) {
    try {
      const tenantId = req.tenant.id;
      const { limit = 50, offset = 0, search } = req.query;

      const io = req.app.get('io');
      const whatsappService = getWhatsAppService(io);

      const contacts = await whatsappService.getContacts(tenantId, {
        limit: parseInt(limit),
        offset: parseInt(offset),
        search
      });

      res.json({
        success: true,
        data: contacts
      });
    } catch (error) {
      logger.error(`Error getting contacts: ${error.message}`, { 
        tenantId: req.tenant.id,
        error: error.stack 
      });
      res.status(500).json({
        success: false,
        message: 'Failed to get contacts',
        error: error.message
      });
    }
  }
}

module.exports = WhatsAppController;
