/**
 * WhatsApp Service - Main Orchestrator
 * Coordinates all WhatsApp modules with tenant isolation
 * 
 * @module services/whatsapp
 */

const path = require('path');
const { logger } = require('../../config/logger');
const WhatsAppConnection = require('./WhatsAppConnection');
const WhatsAppMessageHandler = require('./WhatsAppMessageHandler');
const WhatsAppMediaHandler = require('./WhatsAppMediaHandler');
const WhatsAppQRHandler = require('./WhatsAppQRHandler');
const WhatsAppStateManager = require('./WhatsAppStateManager');

class WhatsAppService {
  constructor(io, options = {}) {
    this.io = io;
    this.enableOpenAI = options.enableOpenAI || false;

    // Initialize modules
    this.stateManager = new WhatsAppStateManager(
      options.sessionPath || path.join(__dirname, '../../sessions')
    );

    this.qrHandler = new WhatsAppQRHandler(io, {
      maxQrGenerations: options.maxQrGenerations || 10,
      qrTimeoutDuration: options.qrTimeoutDuration || 120000
    });

    this.mediaHandler = new WhatsAppMediaHandler({
      uploadPath: options.uploadPath || path.join(__dirname, '../../uploads/whatsapp'),
      maxFileSize: options.maxFileSize || 50 * 1024 * 1024
    });

    this.connection = new WhatsAppConnection(io, this.stateManager, this.qrHandler, {
      maxReconnectAttempts: options.maxReconnectAttempts || 10
    });

    this.messageHandler = new WhatsAppMessageHandler(io, this.mediaHandler, {
      enableOpenAI: this.enableOpenAI
    });

    logger.info('WhatsApp Service initialized');
  }

  /**
   * Restore all saved sessions on server startup
   * @returns {Promise<void>}
   */
  async restoreAllSessions() {
    try {
      logger.info('🔄 Restoring saved WhatsApp sessions...');
      
      const { pool } = require('../../config/database');
      
      // Get all active tenants (exclude system tenant id=0)
      const [tenants] = await pool.query(
        `SELECT id, name FROM tenants WHERE status = 'active' AND id != 0`
      );
      
      logger.info(`Found ${tenants.length} active tenants`);
      
      let restored = 0;
      let skipped = 0;
      
      for (const tenant of tenants) {
        try {
          // Check if tenant has saved session
          if (this.stateManager.hasSession(tenant.id)) {
            logger.info(`📁 Restoring session for tenant: ${tenant.name} (ID: ${tenant.id})`);
            
            // Initialize connection (will load saved session)
            await this.initializeTenant(tenant.id);
            restored++;
            
            // Small delay to avoid overwhelming the system
            await new Promise(resolve => setTimeout(resolve, 1000));
          } else {
            logger.debug(`⏭️  No saved session for tenant: ${tenant.name} (ID: ${tenant.id})`);
            skipped++;
          }
        } catch (error) {
          logger.error(`❌ Failed to restore session for tenant ${tenant.id}:`, error.message);
        }
      }
      
      logger.info(`✅ Session restoration complete: ${restored} restored, ${skipped} skipped`);
    } catch (error) {
      logger.error('Error restoring sessions:', error);
    }
  }

  /**
   * Initialize WhatsApp connection for tenant
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<void>}
   */
  async initializeTenant(tenantId) {
    try {
      logger.info('Initializing WhatsApp for tenant', { tenantId });

      // Setup message handler
      const onMessageHandler = async (m) => {
        const sock = this.connection.getSocket(tenantId);
        const downloadMediaMessage = this.connection.getDownloadMediaMessage();
        await this.messageHandler.handleMessage(tenantId, m, sock, downloadMediaMessage);
      };

      // Initialize connection with message handler
      await this.connection.initialize(tenantId, {
        onMessage: onMessageHandler
      });

      logger.info('WhatsApp initialized successfully for tenant', { tenantId });
    } catch (error) {
      logger.error('Error initializing WhatsApp for tenant', {
        tenantId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Send text message for tenant
   * @param {number} tenantId - Tenant ID
   * @param {string} phoneNumber - Phone number
   * @param {string} messageText - Message text
   * @returns {Promise<Object>} Result
   */
  async sendMessage(tenantId, phoneNumber, messageText) {
    try {
      logger.info('Sending message for tenant', { tenantId, phoneNumber });

      const result = await this.connection.sendMessage(tenantId, phoneNumber, messageText);

      if (result.success) {
        // Save outgoing message
        await this.messageHandler.saveOutgoingMessage(tenantId, phoneNumber, messageText, {
          messageType: 'text'
        });
      }

      return result;
    } catch (error) {
      logger.error('Error sending message for tenant', {
        tenantId,
        phoneNumber,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Send media message for tenant
   * @param {number} tenantId - Tenant ID
   * @param {string} phoneNumber - Phone number
   * @param {string} filePath - File path
   * @param {string} caption - Caption (optional)
   * @returns {Promise<Object>} Result
   */
  async sendMediaMessage(tenantId, phoneNumber, filePath, caption = '') {
    try {
      logger.info('Sending media message for tenant', { tenantId, phoneNumber, filePath });

      const sock = this.connection.getSocket(tenantId);

      if (!sock || !this.connection.isConnected(tenantId)) {
        return { success: false, error: 'WhatsApp not connected' };
      }

      // Upload media
      const media = await this.mediaHandler.uploadMedia(tenantId, filePath);

      if (!media) {
        return { success: false, error: 'Error uploading media' };
      }

      const jid = phoneNumber.includes('@') ? phoneNumber : `${phoneNumber}@s.whatsapp.net`;

      // Prepare message
      const message = {
        caption: caption || undefined
      };

      if (media.messageType === 'image') {
        message.image = media.buffer;
      } else if (media.messageType === 'video') {
        message.video = media.buffer;
      } else if (media.messageType === 'audio') {
        message.audio = media.buffer;
      } else {
        message.document = media.buffer;
        message.mimetype = media.mimeType;
      }

      // Send message
      await sock.sendMessage(jid, message);

      // Save outgoing message
      await this.messageHandler.saveOutgoingMessage(tenantId, phoneNumber, caption, {
        messageType: media.messageType,
        mediaMimetype: media.mimeType
      });

      logger.info('Media message sent for tenant', {
        tenantId,
        phoneNumber,
        mediaType: media.messageType
      });

      return { success: true };
    } catch (error) {
      logger.error('Error sending media message for tenant', {
        tenantId,
        phoneNumber,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Disconnect tenant
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<boolean>} Success status
   */
  async disconnectTenant(tenantId) {
    try {
      logger.info('Disconnecting tenant', { tenantId });

      const result = await this.connection.disconnect(tenantId);

      if (result) {
        this.qrHandler.cleanup(tenantId);
      }

      return result;
    } catch (error) {
      logger.error('Error disconnecting tenant', {
        tenantId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Clear session for tenant
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<boolean>} Success status
   */
  async clearSession(tenantId) {
    try {
      logger.info('Clearing session for tenant', { tenantId });

      // Disconnect first
      await this.disconnectTenant(tenantId);

      // Clear session files
      const result = this.stateManager.clearSession(tenantId);

      // Clear QR handler data
      this.qrHandler.cleanup(tenantId);

      return result;
    } catch (error) {
      logger.error('Error clearing session for tenant', {
        tenantId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Get connection status for tenant
   * @param {number} tenantId - Tenant ID
   * @returns {Object} Connection status
   */
  getConnectionStatus(tenantId) {
    const isConnected = this.connection.isConnected(tenantId);
    const hasSession = this.stateManager.hasSession(tenantId);
    const qrStats = this.qrHandler.getStats(tenantId);
    const sessionInfo = this.stateManager.getSessionInfo(tenantId);

    return {
      tenantId,
      isConnected,
      hasSession,
      qr: qrStats,
      session: sessionInfo
    };
  }

  /**
   * Get QR code for tenant
   * @param {number} tenantId - Tenant ID
   * @returns {string|null} QR code or null
   */
  getQRCode(tenantId) {
    return this.qrHandler.getCurrentQR(tenantId);
  }

  /**
   * Get socket for tenant
   * @param {number} tenantId - Tenant ID
   * @returns {Object|null} Socket or null
   */
  getSocket(tenantId) {
    return this.connection.getSocket(tenantId);
  }

  /**
   * Check if tenant is connected
   * @param {number} tenantId - Tenant ID
   * @returns {boolean} Connection status
   */
  isConnected(tenantId) {
    return this.connection.isConnected(tenantId);
  }

  /**
   * Get Web WhatsApp conversations for tenant
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<Array>} List of conversations
   */
  async getWebConversations(tenantId) {
    try {
      logger.info('Fetching Web WhatsApp conversations for tenant', { tenantId });
      const chats = await this.connection.getChats(tenantId);
      // Transform chats into a format suitable for the frontend pipeline
      return chats.map(chat => ({
        id: chat.id,
        name: chat.name || chat.id.split('@')[0],
        phone: chat.id.split('@')[0],
        avatar: null, // Baileys chats don't directly provide avatar URLs
        lastMessage: chat.lastMessage?.message?.conversation || chat.lastMessage?.message?.extendedTextMessage?.text || '',
        timestamp: chat.lastMessage?.messageTimestamp * 1000 || 0,
        stageId: 'new', // Default stage for new web conversations
        tags: [],
        unreadCount: chat.unreadCount || 0,
        conversationId: chat.id,
        source: 'web'
      }));
    } catch (error) {
      logger.error('Error fetching Web WhatsApp conversations for tenant', {
        tenantId,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Get service statistics
   * @returns {Object} Service statistics
   */
  getStats() {
    const sessionStats = this.stateManager.getStats();
    const activeTenants = this.qrHandler.getActiveTenants();

    return {
      sessions: sessionStats,
      activeTenants: activeTenants.length,
      tenants: activeTenants
    };
  }

  /**
   * Cleanup old data
   * @param {Object} options - Cleanup options
   * @returns {Object} Cleanup results
   */
  async cleanup(options = {}) {
    try {
      const results = {
        backups: 0,
        media: {}
      };

      // Clean old backups
      if (options.cleanBackups !== false) {
        results.backups = this.stateManager.cleanOldBackups(
          options.backupDaysToKeep || 7
        );
      }

      // Clean old media for each tenant
      if (options.cleanMedia !== false && options.tenantIds) {
        for (const tenantId of options.tenantIds) {
          const deleted = this.mediaHandler.cleanOldMedia(
            tenantId,
            options.mediaDaysToKeep || 30
          );
          results.media[tenantId] = deleted;
        }
      }

      logger.info('Cleanup completed', results);
      return results;
    } catch (error) {
      logger.error('Error during cleanup', { error: error.message });
      return { error: error.message };
    }
  }
}

module.exports = WhatsAppService;
