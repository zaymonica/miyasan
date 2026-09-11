/**
 * WhatsAppService.js
 * 
 * Multi-tenant WhatsApp service manager
 * Manages separate WhatsApp connections for each tenant
 * Based on Baileys 6.5.0
 * 
 * @module services/WhatsAppService
 */

const path = require('path');
const fs = require('fs').promises;
const { logger } = require('../config/logger');
const { pool } = require('../config/database');
const BillingService = require('./BillingService');

// WhatsApp modules (will be loaded per tenant)
const WhatsAppConnection = require('./whatsapp/WhatsAppConnection');
const WhatsAppMessageHandler = require('./whatsapp/WhatsAppMessageHandler');
const WhatsAppMediaHandler = require('./whatsapp/WhatsAppMediaHandler');
const WhatsAppQRHandler = require('./whatsapp/WhatsAppQRHandler');
const WhatsAppStateManager = require('./whatsapp/WhatsAppStateManager');

/**
 * Multi-tenant WhatsApp Service
 * Manages separate WhatsApp instances for each tenant
 */
class WhatsAppService {
  constructor(io) {
    this.io = io;
    this.tenantInstances = new Map(); // tenantId => WhatsAppInstance
    this.sessionsPath = path.join(__dirname, '../sessions');
    this.uploadsPath = path.join(__dirname, '../uploads');
    this.rateLimits = new Map(); // key: `${tenantId}:${phone}` -> { lastSentAt, windowStart, windowCount }
  }

  /**
   * Initialize WhatsApp service for a tenant
   * @param {number} tenantId - Tenant ID
   * @param {Object} options - Configuration options
   * @returns {Promise<Object>} Instance details
   */
  async initializeTenant(tenantId, options = {}) {
    try {
      // Check if tenant already has an instance
      if (this.tenantInstances.has(tenantId)) {
        const existingInstance = this.tenantInstances.get(tenantId);
        const isConnected = existingInstance.connection.isConnected(tenantId);
        
        logger.info(`Tenant ${tenantId} already has WhatsApp instance`, { isConnected });
        
        // If already connected, return the instance
        if (isConnected) {
          return existingInstance;
        }
        
        // If not connected, try to initialize again
        logger.info(`Tenant ${tenantId} instance exists but not connected, reinitializing...`);
        const tenantState = existingInstance.connection.getTenantState(tenantId);
        const eventHandlers = tenantState ? tenantState.eventHandlers : {};
        await existingInstance.connection.initialize(tenantId, eventHandlers);
        
        return existingInstance;
      }

      let tenant;
      
      // Special case: tenant 0 is superadmin (system notifications)
      if (tenantId === 0) {
        tenant = {
          id: 0,
          name: 'Superadmin',
          subdomain: 'superadmin',
          status: 'active'
        };
        logger.info('Initializing WhatsApp for superadmin notifications (tenant 0)');
      } else {
        // Verify tenant exists and is active
        const connection = await pool.getConnection();
        const [tenants] = await connection.query(
          'SELECT * FROM tenants WHERE id = ? AND status = ?',
          [tenantId, 'active']
        );
        connection.release();

        if (!tenants.length) {
          throw new Error('Tenant not found or inactive');
        }

        tenant = tenants[0];
      }

      // Create tenant-specific paths
      const tenantSessionPath = path.join(this.sessionsPath, `tenant_${tenantId}`);
      const tenantUploadPath = path.join(this.uploadsPath, `tenant_${tenantId}`);

      // Ensure directories exist (parallel for speed)
      await Promise.all([
        fs.mkdir(tenantSessionPath, { recursive: true }),
        fs.mkdir(tenantUploadPath, { recursive: true })
      ]);

      // Create tenant-specific Socket.IO namespace
      const tenantNamespace = this.io.of(`/tenant/${tenantId}`);

      // Initialize WhatsApp modules for this tenant
      const stateManager = new WhatsAppStateManager(tenantSessionPath);
      const qrHandler = new WhatsAppQRHandler(tenantNamespace, {
        maxQrGenerations: 3,
        qrTimeoutDuration: 60000
      });
      const mediaHandler = new WhatsAppMediaHandler({
        uploadPath: tenantUploadPath,
        maxFileSize: 50 * 1024 * 1024
      });
      const whatsappConnection = new WhatsAppConnection(
        tenantNamespace,
        stateManager,
        qrHandler,
        { maxReconnectAttempts: 5 }
      );
      // CRITICAL FIX: Pass main io object, not namespace
      const messageHandler = new WhatsAppMessageHandler(
        this.io,
        mediaHandler,
        { enableOpenAI: options.enableOpenAI || false, tenantId }
      );

      // Create instance object
      const instance = {
        tenantId,
        tenant,
        connection: whatsappConnection,
        messageHandler,
        mediaHandler,
        qrHandler,
        stateManager,
        namespace: tenantNamespace,
        isConnected: false,
        createdAt: new Date()
      };

      // Setup message handler
      const onMessageHandler = async (m) => {
        try {
          // Check usage limits before processing
          const withinLimits = await BillingService.checkUsageLimits(tenantId);
          
          if (!withinLimits) {
            logger.warn(`Tenant ${tenantId} exceeded usage limits`);
            tenantNamespace.emit('usage-limit-exceeded', {
              message: 'Monthly message limit exceeded'
            });
            return;
          }

          const sock = whatsappConnection.getSocket(tenantId);
          const downloadMediaMessage = whatsappConnection.getDownloadMediaMessage();
          
          console.log(`📞 [WhatsAppService] Calling messageHandler.handleMessage for tenant ${tenantId}`);
          await messageHandler.handleMessage(tenantId, m, sock, downloadMediaMessage);
          
          // Track usage
          await BillingService.trackMessageUsage(tenantId, 1);
        } catch (error) {
          logger.error(`Error handling message for tenant ${tenantId}:`, error);
        }
      };

      // Initialize connection - PASS tenantId as first parameter
      await whatsappConnection.initialize(tenantId, {
        onMessage: onMessageHandler
      });

      // Store instance
      this.tenantInstances.set(tenantId, instance);

      logger.info(`WhatsApp initialized for tenant ${tenantId}`);

      return instance;
    } catch (error) {
      logger.error(`Error initializing WhatsApp for tenant ${tenantId}:`, error);
      throw error;
    }
  }

  /**
   * Get WhatsApp instance for a tenant
   * @param {number} tenantId - Tenant ID
   * @returns {Object|null} WhatsApp instance
   */
  getInstance(tenantId) {
    return this.tenantInstances.get(tenantId) || null;
  }

  /**
   * Send message for a tenant
   * @param {number} tenantId - Tenant ID
   * @param {string} phoneNumber - Recipient phone number
   * @param {string} messageText - Message text
   * @param {number} conversationId - Conversation ID (optional)
   * @returns {Promise<Object>} Send result
   */
  async sendMessage(tenantId, phoneNumber, messageText, conversationId = null, options = {}) {
    try {
      logger.info(`[WhatsAppService.sendMessage] Called`, { tenantId, phoneNumber, messageLength: messageText.length });
      
      // Check usage limits
      const withinLimits = await BillingService.checkUsageLimits(tenantId);
      
      logger.info(`[WhatsAppService.sendMessage] Usage limits check`, { tenantId, withinLimits });
      
      if (!withinLimits) {
        return {
          success: false,
          error: 'Monthly message limit exceeded'
        };
      }

      const instance = this.getInstance(tenantId);
      
      logger.info(`[WhatsAppService.sendMessage] Instance check`, { tenantId, hasInstance: !!instance });
      
      if (!instance) {
        return {
          success: false,
          error: 'WhatsApp not initialized for this tenant'
        };
      }

      const sock = instance.connection.getSocket(tenantId);
      const isConnected = instance.connection.isConnected(tenantId);
      
      logger.info(`[WhatsAppService.sendMessage] Connection check`, { 
        tenantId, 
        hasSock: !!sock, 
        isConnected,
        sockUser: sock?.user?.id,
        sockAuthState: sock?.authState?.creds?.me?.id
      });
      
      if (!sock || !isConnected) {
        try {
          logger.info(`[WhatsAppService.sendMessage] Attempting reconnect`, { tenantId });
          await instance.connection.reconnect(tenantId);
          const wait = async (ms) => new Promise(r => setTimeout(r, ms));
          await wait(1500);
        } catch (reconnectError) {
          logger.warn(`[WhatsAppService.sendMessage] Reconnect attempt failed`, { tenantId, error: reconnectError.message });
        }
        const sockAfter = instance.connection.getSocket(tenantId);
        const connectedAfter = instance.connection.isConnected(tenantId);
        if (!sockAfter || !connectedAfter) {
          return {
            success: false,
            error: 'WhatsApp not connected'
          };
        }
      }

      // Anti-ban: strict per-contact rate limit and human-like jitter
      let local = phoneNumber.includes('@') ? phoneNumber.split('@')[0] : phoneNumber.replace(/^\+/, '');
      if (local.includes(':')) {
        local = local.split(':')[0];
      }
      const rateKey = `${tenantId}:${local}`;
      const now = Date.now();
      const minIntervalMs = 4000;       // min 4s between messages to same contact
      const windowMs = 60000;           // 1 minute window
      const limitPerWindow = 15;        // max 15 messages per minute to same contact
      const state = this.rateLimits.get(rateKey) || { lastSentAt: 0, windowStart: now, windowCount: 0 };
      const inWindow = now - state.windowStart < windowMs;
      const countOk = inWindow ? state.windowCount < limitPerWindow : true;
      const intervalOk = now - state.lastSentAt >= minIntervalMs;
      if (!countOk || !intervalOk) {
        const retryAfterMs = intervalOk ? (state.windowStart + windowMs - now) : (minIntervalMs - (now - state.lastSentAt));
        logger.warn(`[WhatsAppService.sendMessage] Rate limited`, { tenantId, local, retryAfterMs });
        return { success: false, error: 'Rate limited. Retry later.' };
      }
      // Update rate state pre-send to serialize multiple sends
      if (!inWindow) {
        state.windowStart = now;
        state.windowCount = 0;
      }
      state.lastSentAt = now;
      state.windowCount += 1;
      this.rateLimits.set(rateKey, state);
      // Human-like jitter
      const jitterMs = 800 + Math.floor(Math.random() * 1400);
      await new Promise(r => setTimeout(r, jitterMs));

      // If phoneNumber already contains @, use it as JID directly (it's a remoteJid)
      // Otherwise, format it as a WhatsApp JID
      // CRITICAL FIX: Handle @lid format - WhatsApp may need @s.whatsapp.net for sending
      let jid;
      if (phoneNumber.includes('@')) {
        const local = phoneNumber.split('@')[0];
        const cleanedLocal = local.includes(':') ? local.split(':')[0] : local;
        if (phoneNumber.includes('@lid')) {
          jid = `${cleanedLocal}@s.whatsapp.net`;
        } else if (phoneNumber.includes('@s.whatsapp.net')) {
          jid = `${cleanedLocal}@s.whatsapp.net`;
        } else {
          jid = phoneNumber.replace(local, cleanedLocal);
        }
        logger.info(`[WhatsAppService.sendMessage] Using JID format`, { 
          tenantId, 
          originalPhone: phoneNumber, 
          jid,
          isLid: phoneNumber.includes('@lid'),
          isWhatsappNet: phoneNumber.includes('@s.whatsapp.net')
        });
      } else {
        const cleanPhone = phoneNumber.replace(/^\+/, '');
        jid = `${cleanPhone}@s.whatsapp.net`;
      }
      
      logger.info(`[WhatsAppService.sendMessage] Sending to JID`, { 
        tenantId, 
        originalPhone: phoneNumber, 
        jid,
        messageLength: messageText.length
      });
      
      let sentMessageResult;
      try {
        // CRITICAL FIX: Try without timeout first to see if it completes
        logger.info(`[WhatsAppService.sendMessage] Calling sock.sendMessage...`, { tenantId, jid });
        
        sentMessageResult = await sock.sendMessage(jid, { text: messageText });
        
        logger.info(`[WhatsAppService.sendMessage] sock.sendMessage completed`, { 
          tenantId, 
          jid,
          result: sentMessageResult ? 'success' : 'no result',
          messageId: sentMessageResult?.key?.id
        });
      } catch (sendError) {
        logger.error(`[WhatsAppService.sendMessage] sock.sendMessage failed`, { 
          tenantId, 
          jid, 
          error: sendError.message,
          errorCode: sendError.code,
          stack: sendError.stack 
        });
        return {
          success: false,
          error: `Failed to send WhatsApp message: ${sendError.message}`
        };
      }
      
      logger.info(`[WhatsAppService.sendMessage] Message sent successfully`, { tenantId, jid });
      
      // Save outgoing message with WhatsApp message ID for edit/delete support
      if (conversationId && !options.skipSave) {
        await instance.messageHandler.saveOutgoingMessage(
          tenantId,
          phoneNumber.replace('@s.whatsapp.net', '').replace('@lid', ''),
          messageText,
          {
            messageType: options.messageType || 'text',
            conversationId: conversationId,
            whatsappMessageId: sentMessageResult?.key?.id || null,
            senderUserId: options.senderUserId,
            senderName: options.senderName,
            senderStore: options.senderStore,
            senderDepartment: options.senderDepartment,
            metadata: options.metadata,
            isBotMessage: options.isBotMessage,
            botPersonaName: options.botPersonaName,
            status: options.status
          }
        );
      }

      // Track usage
      await BillingService.trackMessageUsage(tenantId, 1);
      
      logger.info(`Message sent for tenant ${tenantId} to ${phoneNumber}`);
      
      // CRITICAL FIX: Emit real-time update to tenant namespace
      const tenantNamespace = this.io.of(`/tenant/${tenantId}`);
      tenantNamespace.emit('message-sent', {
        conversationId: conversationId,
        phoneNumber: phoneNumber.replace('@s.whatsapp.net', '').replace('@lid', ''),
        message: messageText,
        timestamp: new Date()
      });
      
      // Return success with WhatsApp message ID for edit/delete support
      return { 
        success: true,
        whatsappMessageId: sentMessageResult?.key?.id || null
      };
    } catch (error) {
      logger.error(`[WhatsAppService.sendMessage] Error sending message for tenant ${tenantId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send media message for a tenant
   * @param {number} tenantId - Tenant ID
   * @param {string} phoneNumber - Recipient phone number
   * @param {string} filePathOrUrl - Media file path or URL (can be /uploads/filename or full path)
   * @param {string} caption - Media caption
   * @param {number} conversationId - Conversation ID (optional)
   * @returns {Promise<Object>} Send result
   */
  async sendMediaMessage(tenantId, phoneNumber, filePathOrUrl, caption = '', conversationId = null, options = {}) {
    try {
      logger.info(`[sendMediaMessage] Starting for tenant ${tenantId}`, { phoneNumber, filePathOrUrl, caption });
      
      // Check usage limits
      const withinLimits = await BillingService.checkUsageLimits(tenantId);
      
      if (!withinLimits) {
        return {
          success: false,
          error: 'Monthly message limit exceeded'
        };
      }

      const instance = this.getInstance(tenantId);
      
      if (!instance) {
        return {
          success: false,
          error: 'WhatsApp not initialized for this tenant'
        };
      }

      const sock = instance.connection.getSocket(tenantId);
      
      if (!sock || !instance.connection.isConnected(tenantId)) {
        return {
          success: false,
          error: 'WhatsApp not connected'
        };
      }

      // Anti-ban: rate-limit and jitter for media too
      const local = phoneNumber.includes('@') ? phoneNumber.split('@')[0] : phoneNumber.replace(/^\+/, '');
      const rateKey = `${tenantId}:${local}`;
      const now = Date.now();
      const minIntervalMs = 5000;       // stricter interval for media
      const windowMs = 60000;
      const limitPerWindow = 10;        // lower limit for media
      const state = this.rateLimits.get(rateKey) || { lastSentAt: 0, windowStart: now, windowCount: 0 };
      const inWindow = now - state.windowStart < windowMs;
      const countOk = inWindow ? state.windowCount < limitPerWindow : true;
      const intervalOk = now - state.lastSentAt >= minIntervalMs;
      if (!countOk || !intervalOk) {
        const retryAfterMs = intervalOk ? (state.windowStart + windowMs - now) : (minIntervalMs - (now - state.lastSentAt));
        logger.warn(`[WhatsAppService.sendMediaMessage] Rate limited`, { tenantId, local, retryAfterMs });
        return { success: false, error: 'Rate limited. Retry later.' };
      }
      if (!inWindow) {
        state.windowStart = now;
        state.windowCount = 0;
      }
      state.lastSentAt = now;
      state.windowCount += 1;
      this.rateLimits.set(rateKey, state);
      const jitterMs = 1200 + Math.floor(Math.random() * 1800);
      await new Promise(r => setTimeout(r, jitterMs));

      // CRITICAL FIX: Convert URL path to actual file path
      let actualFilePath = filePathOrUrl;
      
      // If it's a URL path like /uploads/filename, convert to actual file path
      if (filePathOrUrl.startsWith('/uploads/')) {
        actualFilePath = path.join(__dirname, '..', filePathOrUrl);
        logger.info(`[sendMediaMessage] Converted URL to path: ${actualFilePath}`);
      } else if (!path.isAbsolute(filePathOrUrl)) {
        // If it's a relative path, make it absolute from project root
        actualFilePath = path.join(__dirname, '..', filePathOrUrl);
        logger.info(`[sendMediaMessage] Made path absolute: ${actualFilePath}`);
      }

      // Check if file exists
      const fsSync = require('fs');
      if (!fsSync.existsSync(actualFilePath)) {
        logger.error(`[sendMediaMessage] File not found: ${actualFilePath}`);
        return { success: false, error: `File not found: ${actualFilePath}` };
      }

      const media = await instance.mediaHandler.uploadMedia(tenantId, actualFilePath);
      
      if (!media) {
        logger.error(`[sendMediaMessage] Error uploading media for tenant ${tenantId}`);
        return { success: false, error: 'Error uploading media' };
      }

      let jid;
      if (phoneNumber.includes('@')) {
        const local = phoneNumber.split('@')[0];
        const cleanedLocal = local.includes(':') ? local.split(':')[0] : local;
        if (phoneNumber.includes('@lid') || phoneNumber.includes('@s.whatsapp.net')) {
          jid = `${cleanedLocal}@s.whatsapp.net`;
        } else {
          jid = phoneNumber.replace(local, cleanedLocal);
        }
      } else {
        const cleanPhone = phoneNumber.replace(/^\+/, '').split(':')[0];
        jid = `${cleanPhone}@s.whatsapp.net`;
      }
      
      // CRITICAL FIX: Build message with proper mimetype and filename for documents
      const message = {};
      
      // Get original filename for documents
      const originalFilename = path.basename(actualFilePath);

      if (media.messageType === 'image') {
        message.image = media.buffer;
        message.mimetype = media.mimeType;
        if (caption) message.caption = caption;
      } else if (media.messageType === 'video') {
        message.video = media.buffer;
        message.mimetype = media.mimeType;
        if (caption) message.caption = caption;
      } else if (media.messageType === 'audio') {
        message.audio = media.buffer;
        message.mimetype = media.mimeType;
        // Voice note (ptt) for ogg, webm, or mp4 audio
        message.ptt = media.mimeType.includes('ogg') || 
                      media.mimeType.includes('webm') || 
                      media.mimeType.includes('opus');
      } else {
        // Document - CRITICAL: Include mimetype and filename
        message.document = media.buffer;
        message.mimetype = media.mimeType;
        message.fileName = originalFilename;
        if (caption) message.caption = caption;
      }
      
      logger.info(`[sendMediaMessage] Sending ${media.messageType} with mimetype: ${media.mimeType}, filename: ${originalFilename}`);

      const sentMediaResult = await sock.sendMessage(jid, message);
      
      // Save outgoing message with WhatsApp message ID for edit/delete support
      if (conversationId && !options.skipSave) {
        const mediaSize = media?.buffer?.length || options.mediaSize || null;
        await instance.messageHandler.saveOutgoingMessage(
          tenantId,
          phoneNumber.replace('@s.whatsapp.net', '').replace('@lid', ''),
          caption || '[Media]',
          {
            messageType: media.messageType,
            mediaUrl: options.mediaUrl || filePathOrUrl,
            mediaMimetype: media.mimeType,
            mediaSize,
            caption,
            conversationId: conversationId,
            whatsappMessageId: sentMediaResult?.key?.id || null,
            senderUserId: options.senderUserId,
            senderName: options.senderName,
            senderStore: options.senderStore,
            senderDepartment: options.senderDepartment,
            metadata: options.metadata,
            isBotMessage: options.isBotMessage,
            botPersonaName: options.botPersonaName,
            status: options.status
          }
        );
      }
      
      // Track usage
      await BillingService.trackMessageUsage(tenantId, 1);
      
      // Emit real-time update
      const tenantNamespace = this.io.of(`/tenant/${tenantId}`);
      tenantNamespace.emit('message-sent', {
        conversationId: conversationId,
        phoneNumber: phoneNumber.replace('@s.whatsapp.net', '').replace('@lid', ''),
        message: caption || '[Media]',
        mediaUrl: filePathOrUrl,
        mediaType: media.messageType,
        timestamp: new Date()
      });
      
      logger.info(`Media message sent for tenant ${tenantId}`);
      
      // Return success with WhatsApp message ID for edit/delete support
      return { 
        success: true,
        whatsappMessageId: sentMediaResult?.key?.id || null
      };
    } catch (error) {
      logger.error(`Error sending media for tenant ${tenantId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get connection status for a tenant
   * @param {number} tenantId - Tenant ID
   * @returns {Object} Connection status
   */
  getStatus(tenantId) {
    const instance = this.getInstance(tenantId);
    
    if (!instance) {
      return {
        connected: false,
        initialized: false,
        error: 'Not initialized'
      };
    }

    const connStatus = instance.connection.getStatus(tenantId);
    const sessionInfo = instance.stateManager.getSessionInfo(tenantId);
    
    return {
      ...connStatus,
      session: sessionInfo,
      phoneNumber: this.getPhoneNumber(tenantId),
      initialized: true
    };
  }

  /**
   * Get connected phone number for a tenant
   * @param {number} tenantId - Tenant ID
   * @returns {string|null} Phone number
   */
  getPhoneNumber(tenantId) {
    try {
      const instance = this.getInstance(tenantId);
      
      if (!instance) return null;
      
      const sock = instance.connection.getSocket(tenantId);
      
      if (!sock || !instance.connection.isConnected(tenantId)) {
        return null;
      }
      
      const user = sock.user;
      return user?.id ? user.id.split(':')[0] : null;
    } catch (error) {
      return null;
    }
  }

  async getWebConversations(tenantId) {
    try {
      const normalizedTenantId = Number(tenantId);
      logger.info('Web conversations fetch start', { tenantId: normalizedTenantId });
      let instance = this.getInstance(normalizedTenantId);
      if (!instance) {
        await this.initializeTenant(normalizedTenantId);
        instance = this.getInstance(normalizedTenantId);
      } else {
        const statusSnapshot = instance.connection.getStatus(normalizedTenantId);
        if (!statusSnapshot.loggedOut && !instance.connection.isConnected(normalizedTenantId)) {
          await this.initializeTenant(normalizedTenantId);
        }
      }

      if (!instance) {
        return [];
      }
      const status = instance.connection.getStatus(normalizedTenantId);

      const waitFor = async (condition, timeoutMs, intervalMs) => {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
          if (await condition()) return true;
          await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
        return false;
      };

      if (!status.loggedOut && !instance.connection.isConnected(normalizedTenantId)) {
        await waitFor(() => instance.connection.isConnected(normalizedTenantId), 10000, 500);
      }

      let chats = await instance.connection.getChats(normalizedTenantId);
      if (!status.loggedOut && !chats.length && instance.connection.isConnected(normalizedTenantId)) {
        await instance.connection.forceHistorySync(normalizedTenantId);
        await waitFor(async () => {
          const nextChats = await instance.connection.getChats(normalizedTenantId);
          if (nextChats.length) {
            chats = nextChats;
            return true;
          }
          return false;
        }, 30000, 1000);
      }
      if (!status.loggedOut && !chats.length && instance.connection.isConnected(normalizedTenantId)) {
        await instance.connection.reconnect(normalizedTenantId);
        await waitFor(() => instance.connection.isConnected(normalizedTenantId), 15000, 500);
        await waitFor(async () => {
          const nextChats = await instance.connection.getChats(normalizedTenantId);
          if (nextChats.length) {
            chats = nextChats;
            return true;
          }
          return false;
        }, 20000, 1000);
      }
      logger.info('Web conversations fetch result', {
        tenantId: normalizedTenantId,
        connected: instance.connection.isConnected(normalizedTenantId),
        chatsCount: chats.length,
        storeStats: instance.connection.getStoreStats?.(normalizedTenantId) || null
      });
      const filteredChats = chats.filter(chat => {
        const rawId = chat?.id?.id || chat?.id || chat?.jid || chat?.remoteJid || chat?.key?.remoteJid;
        if (!rawId) return false;
        const chatId = typeof rawId === 'string' ? rawId : String(rawId);
        return Boolean(chatId) && chatId.includes('@');
      });

      const { pool } = require('../config/database');
      if (!filteredChats.length) {
        logger.warn('Web chat store empty, falling back to database conversations', { tenantId: normalizedTenantId });
        const [rows] = await pool.query(
          `SELECT id, phone_number, contact_name, last_message, last_message_time, remote_jid, updated_at
           FROM conversations
           WHERE tenant_id = ?
           ORDER BY COALESCE(last_message_time, updated_at) DESC
           LIMIT 200`,
          [normalizedTenantId]
        );
        return rows.map(row => {
          const phone = row.phone_number || (row.remote_jid ? String(row.remote_jid).split('@')[0] : '');
          const timestamp = row.last_message_time
            ? new Date(row.last_message_time).getTime()
            : (row.updated_at ? new Date(row.updated_at).getTime() : 0);
          return {
            id: row.id,
            name: row.contact_name || phone || row.remote_jid || '',
            phone,
            avatar: null,
            lastMessage: row.last_message || '',
            timestamp,
            stageId: 'new',
            tags: [],
            unreadCount: 0,
            conversationId: row.id,
            source: 'whatsapp_web'
          };
        });
      }
      const chatIdList = Array.from(new Set(filteredChats.map(chat => {
        const rawId = chat?.id?.id || chat?.id || chat?.jid || chat?.remoteJid || chat?.key?.remoteJid || '';
        return typeof rawId === 'string' ? rawId : String(rawId);
      }).filter(Boolean)));
      const conversationMap = new Map();
      const contactMap = new Map();
      if (chatIdList.length) {
        const placeholders = chatIdList.map(() => '?').join(',');
        const [conversationRows] = await pool.query(
          `SELECT id, remote_jid, phone_number, contact_name, last_message, last_message_time
           FROM conversations
           WHERE tenant_id = ? AND remote_jid IN (${placeholders})`,
          [normalizedTenantId, ...chatIdList]
        );
        conversationRows.forEach(row => {
          if (row.remote_jid) {
            conversationMap.set(row.remote_jid, row);
          }
        });
        const phoneSet = new Set();
        conversationRows.forEach(row => {
          if (row.phone_number) phoneSet.add(String(row.phone_number));
        });
        chatIdList.forEach(chatId => {
          const phone = chatId.split('@')[0];
          if (phone && phone.length >= 6) phoneSet.add(phone);
        });
        const phoneList = Array.from(phoneSet);
        if (phoneList.length) {
          const phonePlaceholders = phoneList.map(() => '?').join(',');
          const [contactRows] = await pool.query(
            `SELECT phone_number, name FROM whatsapp_contacts WHERE tenant_id = ? AND phone_number IN (${phonePlaceholders})`,
            [normalizedTenantId, ...phoneList]
          );
          contactRows.forEach(row => {
            if (row.phone_number) {
              contactMap.set(String(row.phone_number), row.name);
            }
          });
        }
      }

      const conversationByPhone = new Map();
      conversationMap.forEach((row) => {
        if (row.phone_number) {
          conversationByPhone.set(String(row.phone_number), row);
        }
      });

      const chatInfos = filteredChats.map(chat => {
        const rawId = chat?.id?.id || chat?.id || chat?.jid || chat?.remoteJid || chat?.key?.remoteJid || '';
        const chatId = typeof rawId === 'string' ? rawId : String(rawId);
        const phone = chatId ? chatId.split('@')[0] : '';
        const conversation = conversationMap.get(chatId) || conversationByPhone.get(String(phone));
        const displayName = conversation?.contact_name || contactMap.get(String(phone)) || chat?.name || chat?.pushName || chat?.subject || phone || chatId;
        const lastMessageText = chat?.lastMessage?.message?.conversation
          || chat?.lastMessage?.message?.extendedTextMessage?.text
          || chat?.lastMessage?.message?.imageMessage?.caption
          || chat?.lastMessage?.message?.videoMessage?.caption
          || conversation?.last_message
          || '';
        const lastTimestamp = chat?.lastMessage?.messageTimestamp
          ? chat.lastMessage.messageTimestamp * 1000
          : (chat?.conversationTimestamp ? chat.conversationTimestamp * 1000 : (conversation?.last_message_time ? new Date(conversation.last_message_time).getTime() : 0));
        return {
          chatId,
          phone,
          displayName,
          lastMessageText,
          lastTimestamp,
          unreadCount: chat?.unreadCount || 0
        };
      });

      return chatInfos.map(info => {
        const conversation = conversationMap.get(info.chatId) || conversationByPhone.get(String(info.phone));
        const conversationId = conversation?.id || info.chatId;
        return {
          id: conversationId,
          name: info.displayName,
          phone: info.phone,
          avatar: null,
          lastMessage: info.lastMessageText,
          timestamp: info.lastTimestamp,
          stageId: 'new',
          tags: [],
          unreadCount: info.unreadCount,
          conversationId,
          source: 'whatsapp_web'
        };
      });
    } catch (error) {
      logger.error('Error fetching Web WhatsApp conversations for tenant', {
        tenantId,
        error: error.message
      });
      return [];
    }
  }

  async forceWebSync(tenantId) {
    const normalizedTenantId = Number(tenantId);
    logger.info('Force web sync start', { tenantId: normalizedTenantId });
    let instance = this.getInstance(normalizedTenantId);
    if (!instance) {
      await this.initializeTenant(normalizedTenantId);
      instance = this.getInstance(normalizedTenantId);
    }
    if (!instance) return false;
    const status = instance.connection.getStatus(normalizedTenantId);
    if (status.loggedOut) {
      return false;
    }
    await instance.connection.forceHistorySync(normalizedTenantId);
    let chats = await instance.connection.getChats(normalizedTenantId);
    if (!chats.length) {
      await instance.connection.reconnect(normalizedTenantId);
      const waitFor = async (condition, timeoutMs, intervalMs) => {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
          if (await condition()) return true;
          await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
        return false;
      };
      await waitFor(() => instance.connection.isConnected(normalizedTenantId), 15000, 500);
      await waitFor(async () => {
        const nextChats = await instance.connection.getChats(normalizedTenantId);
        if (nextChats.length) {
          chats = nextChats;
          return true;
        }
        return false;
      }, 20000, 1000);
    }
    logger.info('Force web sync result', {
      tenantId: normalizedTenantId,
      connected: instance.connection.isConnected(normalizedTenantId),
      chatsCount: chats.length,
      storeStats: instance.connection.getStoreStats?.(normalizedTenantId) || null
    });
    return true;
  }

  /**
   * Disconnect WhatsApp for a tenant
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<boolean>} Success status
   */
  async disconnect(tenantId) {
    try {
      const instance = this.getInstance(tenantId);
      
      if (!instance) {
        return false;
      }

      await instance.connection.disconnect(tenantId);
      
      // Remove instance
      this.tenantInstances.delete(tenantId);
      
      logger.info(`WhatsApp disconnected for tenant ${tenantId}`);
      
      return true;
    } catch (error) {
      logger.error(`Error disconnecting tenant ${tenantId}:`, error);
      return false;
    }
  }

  /**
   * Reconnect WhatsApp for a tenant
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<boolean>} Success status
   */
  async reconnect(tenantId) {
    try {
      const instance = this.getInstance(tenantId);
      
      if (!instance) {
        // Initialize if not exists
        await this.initializeTenant(tenantId);
        return true;
      }

      await instance.connection.reconnect(tenantId);
      
      logger.info(`WhatsApp reconnection initiated for tenant ${tenantId}`);
      
      return true;
    } catch (error) {
      logger.error(`Error reconnecting tenant ${tenantId}:`, error);
      return false;
    }
  }

  /**
   * Clear session for a tenant
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<boolean>} Success status
   */
  async clearSession(tenantId) {
    try {
      logger.info(`Clearing session for tenant ${tenantId}`);
      
      const instance = this.getInstance(tenantId);
      
      if (!instance) {
        logger.warn(`No instance found for tenant ${tenantId}`);
        return false;
      }

      // Disconnect first
      await instance.connection.disconnect(tenantId);
      
      // Backup before clearing
      instance.stateManager.backupSession(tenantId);
      
      // Clear session files
      const cleared = instance.stateManager.clearSession(tenantId);
      
      if (cleared) {
        instance.qrHandler.resetCounter(tenantId);
        instance.qrHandler.clearQR(tenantId);
        
        // Remove instance from map to force recreation
        this.tenantInstances.delete(tenantId);
        
        logger.info(`Session cleared and instance removed for tenant ${tenantId}`);
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error(`Error clearing session for tenant ${tenantId}:`, error);
      return false;
    }
  }

  /**
   * Get QR code for a tenant
   * @param {number} tenantId - Tenant ID
   * @returns {string|null} QR code
   */
  getQRCode(tenantId) {
    const instance = this.getInstance(tenantId);
    return instance ? instance.qrHandler.getCurrentQR(tenantId) : null;
  }

  /**
   * Get all active tenant instances
   * @returns {Array} List of active tenants
   */
  getActiveTenants() {
    return Array.from(this.tenantInstances.keys());
  }

  /**
   * Disconnect all tenants (for shutdown)
   * @returns {Promise<void>}
   */
  async disconnectAll() {
    logger.info('Disconnecting all tenant WhatsApp instances');
    
    const disconnectPromises = Array.from(this.tenantInstances.keys()).map(
      tenantId => this.disconnect(tenantId)
    );
    
    await Promise.all(disconnectPromises);
    
    logger.info('All tenant instances disconnected');
  }

  /**
   * Clean old media for a tenant
   * @param {number} tenantId - Tenant ID
   * @param {number} daysToKeep - Days to keep media
   * @returns {Promise<number>} Number of files cleaned
   */
  async cleanOldMedia(tenantId, daysToKeep = 30) {
    try {
      const instance = this.getInstance(tenantId);
      
      if (!instance) {
        return 0;
      }

      const cleaned = instance.mediaHandler.cleanOldMedia(daysToKeep);
      logger.info(`Old media cleaned for tenant ${tenantId}:`, { cleaned });
      
      return cleaned;
    } catch (error) {
      logger.error(`Error cleaning media for tenant ${tenantId}:`, error);
      return 0;
    }
  }

  /**
   * Clean old backups for a tenant
   * @param {number} tenantId - Tenant ID
   * @param {number} daysToKeep - Days to keep backups
   * @returns {Promise<number>} Number of backups cleaned
   */
  async cleanOldBackups(tenantId, daysToKeep = 7) {
    try {
      const instance = this.getInstance(tenantId);
      
      if (!instance) {
        return 0;
      }

      const cleaned = instance.stateManager.cleanOldBackups(daysToKeep);
      logger.info(`Old backups cleaned for tenant ${tenantId}:`, { cleaned });
      
      return cleaned;
    } catch (error) {
      logger.error(`Error cleaning backups for tenant ${tenantId}:`, error);
      return 0;
    }
  }

  /**
   * Get tenant status (wrapper for Controller)
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<Object>} Status object
   */
  async getTenantStatus(tenantId) {
    try {
      logger.info('Getting tenant status', { tenantId });
      
      const status = this.getStatus(tenantId);
      logger.info('Status retrieved', { tenantId, status });
      
      // Get QR code if connecting
      let qrCode = null;
      const instance = this.getInstance(tenantId);
      
      if (instance && instance.qrHandler) {
        qrCode = instance.qrHandler.getCurrentQR(tenantId);
        logger.info('QR code retrieved from handler', { 
          tenantId, 
          hasQR: !!qrCode,
          qrLength: qrCode ? qrCode.length : 0,
          qrPreview: qrCode ? qrCode.substring(0, 50) + '...' : null
        });
      } else {
        logger.warn('No instance or qrHandler found', { 
          tenantId,
          hasInstance: !!instance,
          hasQRHandler: instance ? !!instance.qrHandler : false
        });
      }

      const result = {
        status: status.connected ? 'connected' : (status.initialized ? 'connecting' : 'disconnected'),
        phoneNumber: status.phoneNumber,
        qr: qrCode,
        ...status
      };
      
      logger.info('Returning tenant status', { 
        tenantId, 
        statusValue: result.status,
        hasQR: !!result.qr,
        qrLength: result.qr ? result.qr.length : 0,
        connected: status.connected,
        initialized: status.initialized
      });
      
      return result;
    } catch (error) {
      logger.error(`Error getting tenant status: ${error.message}`, { tenantId, stack: error.stack });
      return {
        status: 'disconnected',
        error: error.message
      };
    }
  }

  /**
   * Get current QR code for tenant
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<string|null>} QR code data URL
   */
  async getQRCode(tenantId) {
    try {
      const instance = this.getInstance(tenantId);
      
      if (!instance || !instance.qrHandler) {
        return null;
      }

      return instance.qrHandler.getCurrentQR(tenantId);
    } catch (error) {
      logger.error(`Error getting QR code: ${error.message}`, { tenantId });
      return null;
    }
  }

  /**
   * Disconnect tenant (wrapper for Controller)
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<boolean>} Success status
   */
  async disconnectTenant(tenantId) {
    return await this.disconnect(tenantId);
  }

  /**
   * Clear tenant session (wrapper for Controller)
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<boolean>} Success status
   */
  async clearTenantSession(tenantId) {
    return await this.clearSession(tenantId);
  }

  /**
   * Get messages for tenant
   * @param {number} tenantId - Tenant ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Messages data
   */
  async getMessages(tenantId, options = {}) {
    try {
      const { limit = 50, offset = 0, phoneNumber } = options;
      
      const WhatsAppMessage = require('../models/WhatsAppMessage');
      
      let query = `
        SELECT * FROM whatsapp_messages 
        WHERE tenant_id = ?
      `;
      const params = [tenantId];

      if (phoneNumber) {
        query += ` AND phone_number = ?`;
        params.push(phoneNumber);
      }

      query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const [messages] = await pool.query(query, params);

      return {
        messages,
        total: messages.length,
        limit,
        offset
      };
    } catch (error) {
      logger.error(`Error getting messages: ${error.message}`, { tenantId });
      throw error;
    }
  }

  /**
   * Get contacts for tenant
   * @param {number} tenantId - Tenant ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Contacts data
   */
  async getContacts(tenantId, options = {}) {
    try {
      const { limit = 50, offset = 0, search } = options;
      
      const WhatsAppContact = require('../models/WhatsAppContact');
      
      let query = `
        SELECT * FROM whatsapp_contacts 
        WHERE tenant_id = ?
      `;
      const params = [tenantId];

      if (search) {
        query += ` AND (name LIKE ? OR phone_number LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`);
      }

      query += ` ORDER BY last_message_at DESC LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const [contacts] = await pool.query(query, params);

      return {
        contacts,
        total: contacts.length,
        limit,
        offset
      };
    } catch (error) {
      logger.error(`Error getting contacts: ${error.message}`, { tenantId });
      throw error;
    }
  }

  /**
   * Restore all saved sessions on server startup
   * @returns {Promise<void>}
   */
  async restoreAllSessions() {
    try {
      logger.info('🔄 Restoring saved WhatsApp sessions...');
      
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
          const sessionPath = path.join(this.sessionsPath, `tenant_${tenant.id}`, 'creds.json');
          const hasSession = await fs.access(sessionPath).then(() => true).catch(() => false);
          
          if (hasSession) {
            logger.info(`📁 Restoring session for tenant: ${tenant.name} (ID: ${tenant.id})`);
            
            // Initialize connection (will load saved session)
            await this.initializeTenant(tenant.id);
            restored++;
            
            // Small delay to avoid overwhelming the system
            await new Promise(resolve => setTimeout(resolve, 2000));
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
}

// Singleton instance
let whatsappServiceInstance = null;

/**
 * Get WhatsApp service instance
 * @param {Object} io - Socket.IO instance
 * @returns {WhatsAppService} Service instance
 */
function getWhatsAppService(io) {
  if (!whatsappServiceInstance && io) {
    whatsappServiceInstance = new WhatsAppService(io);
  }
  return whatsappServiceInstance;
}

module.exports = { WhatsAppService, getWhatsAppService };
