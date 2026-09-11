/**
 * WhatsAppConnection
 * Manages WhatsApp connections with tenant isolation
 * 
 * @module services/whatsapp/WhatsAppConnection
 */

const pino = require('pino');
const path = require('path');
const fs = require('fs');
const { logger } = require('../../config/logger');
const WhatsAppConnectionModel = require('../../models/WhatsAppConnection');

class WhatsAppConnection {
  constructor(io, stateManager, qrHandler, options = {}) {
    this.io = io;
    this.stateManager = stateManager;
    this.qrHandler = qrHandler;
    
    // Store connections per tenant
    this.tenantConnections = new Map();
    this.tenantStores = new Map();
    this.tenantStates = new Map();
    this.lastResyncAt = new Map();
    this.storeIntervals = new Map();
    this.tenantChatStore = new Map();
    this.chatStoreIntervals = new Map();
    
    this.maxReconnectAttempts = options.maxReconnectAttempts || 10;
    this.initializeDebounceMs = 3000;
    
    // Baileys modules (loaded dynamically)
    this.makeWASocket = null;
    this.DisconnectReason = null;
    this.useMultiFileAuthState = null;
    this.downloadMediaMessage = null;
    this.fetchLatestBaileysVersion = null;
    this.makeCacheableSignalKeyStore = null;
    this.makeInMemoryStore = null;
    this.baileysLoaded = false;
  }

  /**
   * Load Baileys module dynamically
   */
  async loadBaileys() {
    if (this.baileysLoaded) return;
    
    try {
      const baileys = await import('@whiskeysockets/baileys');
      this.makeWASocket = baileys.makeWASocket || baileys.default?.makeWASocket;
      this.DisconnectReason = baileys.DisconnectReason || baileys.default?.DisconnectReason;
      this.useMultiFileAuthState = baileys.useMultiFileAuthState || baileys.default?.useMultiFileAuthState;
      this.downloadMediaMessage = baileys.downloadMediaMessage || baileys.default?.downloadMediaMessage;
      this.fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion || baileys.default?.fetchLatestBaileysVersion;
      this.makeCacheableSignalKeyStore = baileys.makeCacheableSignalKeyStore || baileys.default?.makeCacheableSignalKeyStore;
      this.makeInMemoryStore = baileys.makeInMemoryStore || baileys.default?.makeInMemoryStore;
      
      this.baileysLoaded = true;
      logger.info('Baileys module loaded successfully');
    } catch (error) {
      logger.error('Error loading Baileys module', { error: error.message });
      throw error;
    }
  }

  /**
   * Initialize WhatsApp connection for tenant
   * @param {number} tenantId - Tenant ID
   * @param {Object} eventHandlers - Event handlers
   */
  async initialize(tenantId, eventHandlers = {}) {
    try {
      // Validate tenantId (allow 0 for superadmin)
      if (tenantId === undefined || tenantId === null) {
        throw new Error('tenantId is required for initialization');
      }

      logger.info('Initialize called for tenant', { tenantId, hasEventHandlers: Object.keys(eventHandlers).length > 0 });

      // Check if already initializing
      const state = this.getTenantState(tenantId);
      if (state.isInitializing) {
        logger.warn('Initialization already in progress for tenant', { tenantId });
        return;
      }

      if (state.isConnected) {
        logger.warn('Tenant already connected', { tenantId });
        return;
      }

      // Debounce check
      const now = Date.now();
      if (now - state.lastInitializeTime < this.initializeDebounceMs) {
        logger.warn('Initialize called too soon for tenant', { 
          tenantId,
          timeSinceLastCall: now - state.lastInitializeTime 
        });
        return;
      }

      state.isInitializing = true;
      state.lastInitializeTime = now;
      state.eventHandlers = eventHandlers;

      const startTime = Date.now();
      logger.info('🚀 Initializing WhatsApp for tenant', { tenantId });

      // Load Baileys
      const baileysStart = Date.now();
      await this.loadBaileys();
      logger.info(`⚡ Baileys loaded in ${Date.now() - baileysStart}ms`, { tenantId });

      // Update connection status
      const statusStart = Date.now();
      await WhatsAppConnectionModel.updateStatus(tenantId, 'connecting');
      logger.info(`⚡ Status updated in ${Date.now() - statusStart}ms`, { tenantId });

      // Ensure tenant session directory exists
      const dirStart = Date.now();
      this.stateManager.ensureTenantSessionDirectory(tenantId);
      logger.info(`⚡ Directory created in ${Date.now() - dirStart}ms`, { tenantId });

      // Check for saved session
      const hasSession = this.stateManager.hasSession(tenantId);
      logger.info(hasSession ? '📁 Saved session found' : '🆕 No saved session, will generate QR', { tenantId });

      // Get tenant session path
      const sessionPath = this.stateManager.getTenantSessionPath(tenantId);

      // Load authentication state
      const authStart = Date.now();
      const { state: authState, saveCreds } = await this.useMultiFileAuthState(sessionPath);
      logger.info(`⚡ Auth state loaded in ${Date.now() - authStart}ms`, { tenantId });

      // Close previous socket if exists
      const existingSock = this.tenantConnections.get(tenantId);
      if (existingSock) {
        try {
          existingSock.ev.removeAllListeners();
          existingSock.end();
        } catch (err) {
          logger.warn('Error closing previous socket for tenant', { tenantId, error: err.message });
        }
      }
      if (this.tenantStores.has(tenantId)) {
        this.tenantStores.delete(tenantId);
      }
      if (this.tenantChatStore.has(tenantId)) {
        this.tenantChatStore.delete(tenantId);
      }
      if (this.chatStoreIntervals.has(tenantId)) {
        clearInterval(this.chatStoreIntervals.get(tenantId));
        this.chatStoreIntervals.delete(tenantId);
      }
      if (this.storeIntervals.has(tenantId)) {
        clearInterval(this.storeIntervals.get(tenantId));
        this.storeIntervals.delete(tenantId);
      }
      if (this.tenantChatStore.has(tenantId)) {
        this.tenantChatStore.delete(tenantId);
      }
      if (this.chatStoreIntervals.has(tenantId)) {
        clearInterval(this.chatStoreIntervals.get(tenantId));
        this.chatStoreIntervals.delete(tenantId);
      }

      // Create WhatsApp socket for tenant with SIMPLE settings (like 2.0)
      const sock = this.makeWASocket({
        auth: authState,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['Chrome', 'Windows', '120.0.0'],
        markOnlineOnConnect: false,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 25000,
        getMessage: async (_key) => ({ conversation: "" }),
        syncFullHistory: true,
        shouldSyncHistoryMessage: () => true
      });
      
      if (this.makeInMemoryStore) {
        const store = this.makeInMemoryStore({ logger: pino({ level: 'silent' }) });
        const storePath = path.join(sessionPath, 'baileys_store.json');
        if (fs.existsSync(storePath)) {
          store.readFromFile(storePath);
        }
        store.bind(sock.ev);
        this.tenantStores.set(tenantId, store);
        const intervalId = setInterval(() => {
          store.writeToFile(storePath);
        }, 10000);
        this.storeIntervals.set(tenantId, intervalId);
      }

      const chatStore = this.getChatStore(tenantId);
      const chatStorePath = path.join(sessionPath, 'chat_store.json');
      if (fs.existsSync(chatStorePath)) {
        try {
          const raw = fs.readFileSync(chatStorePath, 'utf-8');
          const storedChats = JSON.parse(raw || '[]');
          if (Array.isArray(storedChats)) {
            storedChats.forEach((chat) => {
              const chatId = chat?.id?.id || chat?.id || chat?.jid || chat?.remoteJid || chat?.key?.remoteJid || '';
              if (chatId) {
                chatStore.set(String(chatId), chat);
              }
            });
          }
        } catch (error) {
          logger.warn('Failed to read chat store file', { tenantId, error: error.message });
        }
      }
      if (!this.chatStoreIntervals.has(tenantId)) {
        const intervalId = setInterval(() => {
          try {
            const chatsArray = Array.from(chatStore.values());
            fs.writeFileSync(chatStorePath, JSON.stringify(chatsArray));
          } catch (error) {
            logger.warn('Failed to write chat store file', { tenantId, error: error.message });
          }
        }, 10000);
        this.chatStoreIntervals.set(tenantId, intervalId);
      }

      // Store connection
      this.tenantConnections.set(tenantId, sock);

      // Setup event handlers
      const handlersStart = Date.now();
      this.setupEventHandlers(tenantId, sock, eventHandlers);
      sock.ev.on('creds.update', saveCreds);
      logger.info(`⚡ Event handlers setup in ${Date.now() - handlersStart}ms`, { tenantId });

      logger.info(`✅ WhatsApp socket created for tenant in ${Date.now() - startTime}ms total`, { tenantId });

    } catch (error) {
      logger.error('Error initializing WhatsApp for tenant', { 
        tenantId, 
        error: error.message,
        stack: error.stack 
      });
      
      // Only try to update status if we have a valid tenantId
      if (tenantId) {
        try {
          await WhatsAppConnectionModel.updateStatus(tenantId, 'failed', {
            error_message: error.message
          });
        } catch (updateError) {
          logger.error('Error updating connection status after failure', {
            tenantId,
            error: updateError.message
          });
        }
      }
      
      const state = this.getTenantState(tenantId);
      state.isInitializing = false;
      
      throw error;
    }
  }

  /**
   * Fetch Baileys version - NOT USED when auth is passed directly
   * Baileys 6.7.x doesn't need version parameter
   */
  async fetchBaileysVersion() {
    // Version not needed in Baileys 6.7.x when using auth directly
    return undefined;
  }

  /**
   * Setup event handlers for tenant connection - ENHANCED ROBUST VERSION
   * @param {number} tenantId - Tenant ID
   * @param {Object} sock - WhatsApp socket
   * @param {Object} handlers - Event handlers
   */
  setupEventHandlers(tenantId, sock, handlers) {
    if (!sock) return;

    let connectionHealthCheck = null;
    let lastHeartbeat = Date.now();
    const tenantState = this.getTenantState(tenantId);
    tenantState.lastHeartbeatAt = lastHeartbeat;
    
    // Start health monitoring
    connectionHealthCheck = setInterval(() => {
      const now = Date.now();
      const state = this.getTenantState(tenantId);
      const heartbeatAt = state.lastHeartbeatAt || lastHeartbeat || 0;
      const timeSinceLastHeartbeat = now - heartbeatAt;
      const wsState = sock?.ws?.readyState;
      const wsOpen = wsState === 1;
      if (state.loggedOut || state.isInitializing) {
        return;
      }
      if (!this.isConnected(tenantId) || !wsOpen) {
        state.inactiveSocketCount = (state.inactiveSocketCount || 0) + 1;
        if (state.inactiveSocketCount >= 3) {
          logger.warn('Connection check detected inactive socket', {
            tenantId,
            timeSinceLastHeartbeat,
            wsState,
            attempts: state.inactiveSocketCount
          });
        } else {
          logger.info('Connection check detected inactive socket', {
            tenantId,
            timeSinceLastHeartbeat,
            wsState,
            attempts: state.inactiveSocketCount
          });
        }
        state.isConnected = false;
        state.lastDisconnectTime = Date.now();
        if (connectionHealthCheck) {
          clearInterval(connectionHealthCheck);
        }
        this.reconnect(tenantId);
        return;
      }
      if (state.inactiveSocketCount) {
        state.inactiveSocketCount = 0;
      }
      if (timeSinceLastHeartbeat > 900000) {
        logger.warn('Connection idle but healthy', {
          tenantId,
          timeSinceLastHeartbeat
        });
      }
    }, 60000);

    // Connection updates with enhanced error handling
    sock.ev.on('connection.update', async (update) => {
      try {
        lastHeartbeat = Date.now();
        tenantState.lastHeartbeatAt = lastHeartbeat;
        await this.handleConnectionUpdate(tenantId, update);
      } catch (error) {
        logger.error('Error in enhanced connection handler for tenant', { 
          tenantId, 
          error: error.message,
          stack: error.stack
        });
        
        // If critical error, attempt recovery
        if (error.message.includes('ECONNRESET') || 
            error.message.includes('ETIMEDOUT') ||
            error.message.includes('socket hang up')) {
          logger.info('Network error detected, scheduling reconnect', { tenantId });
          setTimeout(() => this.reconnect(tenantId), 5000);
        }
      }
    });

    // Enhanced message handling with rate limiting and validation
    if (handlers.onMessage) {
      let messageCount = 0;
      let lastMessageTime = Date.now();
      
      sock.ev.on('messages.upsert', async (m) => {
        try {
          lastHeartbeat = Date.now();
          tenantState.lastHeartbeatAt = lastHeartbeat;
          
          // SECURITY: Rate limiting to prevent spam/abuse
          const now = Date.now();
          if (now - lastMessageTime < 1000) { // Max 1 message per second
            messageCount++;
            if (messageCount > 10) { // Max 10 messages in burst
              logger.warn('Message rate limit exceeded for tenant', { 
                tenantId,
                messageCount 
              });
              return;
            }
          } else {
            messageCount = 0;
            lastMessageTime = now;
          }
          
          // VALIDATION: Ensure message structure is valid
          if (!m || !m.messages || !Array.isArray(m.messages)) {
            logger.warn('Invalid message structure received', { tenantId });
            return;
          }
          
          // SECURITY: Filter out potentially malicious messages
          const validMessages = m.messages.filter(msg => {
            if (!msg || !msg.key) return false;
            
            // Block messages from suspicious sources
            const fromMe = msg.key.fromMe;
            const remoteJid = msg.key.remoteJid;
            
            if (!fromMe && remoteJid) {
              // Basic validation of phone number format
              const phoneRegex = /^\d{10,20}@(s\.whatsapp\.net|lid)$/;
              const groupRegex = /^\d+@g\.us$/;
              
              if (!phoneRegex.test(remoteJid) && !groupRegex.test(remoteJid)) {
                logger.warn('Suspicious message source blocked', { 
                  tenantId, 
                  remoteJid 
                });
                return false;
              }
            }
            
            return true;
          });
          
          if (validMessages.length > 0) {
            logger.info('Enhanced message received for tenant', { 
              tenantId,
              type: m.type,
              messageCount: validMessages.length,
              originalCount: m.messages.length
            });
            
            await handlers.onMessage({ ...m, messages: validMessages });
          }
        } catch (error) {
          logger.error('Error processing enhanced message for tenant', { 
            tenantId,
            error: error.message,
            stack: error.stack
          });
        }
      });
    }

    // Enhanced history sync with better error handling
    sock.ev.on('messaging-history.set', (history) => {
      try {
        lastHeartbeat = Date.now();
        tenantState.lastHeartbeatAt = lastHeartbeat;
        
        const chatStore = this.getChatStore(tenantId);
        const chats = history?.chats || [];
        
        // VALIDATION: Ensure chats are valid before storing
        let validChats = 0;
        chats.forEach((chat) => {
          if (!chat) return;
          
          const chatId = chat?.id?.id || chat?.id || chat?.jid || chat?.remoteJid || chat?.key?.remoteJid || '';
          if (chatId && typeof chatId === 'string' && chatId.length > 0) {
            // SECURITY: Validate chat ID format
            const phoneRegex = /^\d{10,20}@(s\.whatsapp\.net|lid)$/;
            const groupRegex = /^\d+@g\.us$/;
            
            if (phoneRegex.test(chatId) || groupRegex.test(chatId)) {
              chatStore.set(String(chatId), chat);
              validChats++;
            } else {
              logger.warn('Invalid chat ID format blocked', { tenantId, chatId });
            }
          }
        });
        
        logger.info('Enhanced history sync received', {
          tenantId,
          totalChats: chats.length,
          validChats,
          messagesCount: history?.messages?.length || 0,
          isLatest: history?.isLatest
        });
      } catch (error) {
        logger.error('Error processing enhanced history sync', { 
          tenantId, 
          error: error.message 
        });
      }
    });

    // Enhanced chat upserts with validation
    sock.ev.on('chats.upsert', (chats) => {
      try {
        lastHeartbeat = Date.now();
        tenantState.lastHeartbeatAt = lastHeartbeat;
        
        const chatStore = this.getChatStore(tenantId);
        const list = Array.isArray(chats) ? chats : [];
        let validChats = 0;
        
        list.forEach((chat) => {
          if (!chat) return;
          
          const chatId = chat?.id?.id || chat?.id || chat?.jid || chat?.remoteJid || chat?.key?.remoteJid || '';
          if (chatId && typeof chatId === 'string') {
            // SECURITY: Validate chat ID format
            const phoneRegex = /^\d{10,20}@(s\.whatsapp\.net|lid)$/;
            const groupRegex = /^\d+@g\.us$/;
            
            if (phoneRegex.test(chatId) || groupRegex.test(chatId)) {
              chatStore.set(String(chatId), chat);
              validChats++;
            }
          }
        });
        
        if (validChats > 0) {
          logger.info('Enhanced chats upserted', { 
            tenantId, 
            totalChats: list.length,
            validChats 
          });
        }
      } catch (error) {
        logger.error('Error processing enhanced chats upsert', { 
          tenantId, 
          error: error.message 
        });
      }
    });

    // Enhanced connection close handling
    sock.ev.on('connection.close', (reason) => {
      logger.warn('Enhanced connection closed for tenant', { tenantId, reason });
      
      // Clear health check
      if (connectionHealthCheck) {
        clearInterval(connectionHealthCheck);
        connectionHealthCheck = null;
      }
      
      // Update tenant state
      const state = this.getTenantState(tenantId);
      state.isConnected = false;
      state.lastDisconnectTime = Date.now();
      state.lastDisconnectReason = reason;
    });

    // Enhanced WebSocket error handling with security measures
    if (sock.ws) {
      sock.ws.on('error', (error) => {
        // SECURITY: Log potential attack attempts
        if (error && error.message) {
          const suspiciousPatterns = [
            'ECONNREFUSED',
            'ENOTFOUND', 
            'certificate',
            'SSL',
            'TLS'
          ];
          
          const isSuspicious = suspiciousPatterns.some(pattern => 
            error.message.toLowerCase().includes(pattern.toLowerCase())
          );
          
          if (isSuspicious) {
            logger.warn('Potentially suspicious WebSocket error detected', {
              tenantId,
              error: error.message,
              code: error.code,
              timestamp: new Date().toISOString()
            });
          }
        }
        
        // Handle timeout errors gracefully
        if (error && (error.message === 'Timed Out' || error.code === 'ETIMEDOUT')) {
          logger.warn('WebSocket timeout for tenant (will retry)', { 
            tenantId,
            error: error.message 
          });
          
          // Schedule reconnect for timeout errors
          setTimeout(() => {
            if (!this.isConnected(tenantId)) {
              this.reconnect(tenantId);
            }
          }, 10000);
          return;
        }
        
        logger.error('Enhanced WebSocket error for tenant', { 
          tenantId,
          error: error.message,
          code: error.code,
          stack: error.stack
        });
      });

      sock.ws.on('close', (code, reason) => {
        logger.warn('Enhanced WebSocket closed for tenant', { 
          tenantId,
          code,
          reason: reason?.toString(),
          timestamp: new Date().toISOString()
        });
        
        // Clear health check
        if (connectionHealthCheck) {
          clearInterval(connectionHealthCheck);
          connectionHealthCheck = null;
        }
        
        // SECURITY: Log abnormal close codes
        if (code && (code < 1000 || code > 1015)) {
          logger.warn('Abnormal WebSocket close code detected', {
            tenantId,
            code,
            reason: reason?.toString()
          });
        }
      });

      // SECURITY: Monitor for potential attacks
      sock.ws.on('unexpected-response', (request, response) => {
        logger.warn('Unexpected WebSocket response detected', {
          tenantId,
          statusCode: response.statusCode,
          statusMessage: response.statusMessage
        });
      });
    }

    // Store health check reference for cleanup
    const state = this.getTenantState(tenantId);
    state.healthCheck = connectionHealthCheck;
  }

  /**
   * Handle connection updates for tenant
   * @param {number} tenantId - Tenant ID
   * @param {Object} update - Connection update
   */
  async handleConnectionUpdate(tenantId, update) {
    const { connection, lastDisconnect, qr, isNewLogin } = update;

    logger.info('📡 Connection update received', { 
      tenantId, 
      connection, 
      hasQR: !!qr,
      hasDisconnect: !!lastDisconnect,
      isNewLogin
    });

    // Handle QR code
    if (qr) {
      logger.info('🔲 QR code generated for tenant', { tenantId, qrLength: qr.length });
      await this.qrHandler.generateQR(tenantId, qr);
      await WhatsAppConnectionModel.update(tenantId, { qr_code: qr });
    }

    // Handle connection state
    if (connection === 'close') {
      const state = this.getTenantState(tenantId);
      state.isConnected = false;
      state.isInitializing = false;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const errorMessage = lastDisconnect?.error?.message;
      const shouldReconnect = statusCode !== this.DisconnectReason.loggedOut;
      if (statusCode === this.DisconnectReason.loggedOut) {
        state.loggedOut = true;
      }

      logger.warn('❌ Connection closed for tenant', { 
        tenantId,
        statusCode,
        errorMessage,
        shouldReconnect,
        disconnectReason: this.getDisconnectReasonName(statusCode)
      });

      await WhatsAppConnectionModel.updateStatus(tenantId, 'disconnected', {
        error_message: lastDisconnect?.error?.message
      });

      this.qrHandler.clearQR(tenantId);
      this.io.emit('connection-status', {
        status: 'disconnected',
        tenantId
      });

      // Auto-reconnect if not logged out
      if (shouldReconnect && state.reconnectAttempts < this.maxReconnectAttempts) {
        state.reconnectAttempts++;
        const baseDelay = Math.min(60000, 5000 * Math.pow(2, state.reconnectAttempts - 1));
        const jitter = 1000 + Math.floor(Math.random() * 2000);
        const delay = baseDelay + jitter;
        logger.info('Attempting reconnection for tenant', { 
          tenantId,
          attempt: state.reconnectAttempts,
          delay
        });
        
        setTimeout(() => {
          this.initialize(tenantId, state.eventHandlers);
        }, delay);
      }
    }

    if (connection === 'open') {
      const state = this.getTenantState(tenantId);
      state.isConnected = true;
      state.isInitializing = false;
      state.reconnectAttempts = 0;
      state.loggedOut = false;
      state.lastHeartbeatAt = Date.now();

      const sock = this.tenantConnections.get(tenantId);
      const phoneNumber = sock?.user?.id?.split(':')[0];

      logger.info('Connection opened for tenant', { tenantId, phoneNumber });

      await WhatsAppConnectionModel.updateStatus(tenantId, 'connected', {
        phone_number: phoneNumber,
        last_connected_at: new Date()
      });

      this.qrHandler.clearQR(tenantId);
      this.qrHandler.resetCounter(tenantId);

      this.io.emit('connection-status', {
        status: 'connected',
        phoneNumber,
        tenantId
      });

      await this.forceHistorySync(tenantId);
    }
  }

  /**
   * Send message for tenant
   * @param {number} tenantId - Tenant ID
   * @param {string} phoneNumber - Phone number
   * @param {string} messageText - Message text
   * @returns {Promise<Object>} Result
   */
  async sendMessage(tenantId, phoneNumber, messageText) {
    try {
      const sock = this.tenantConnections.get(tenantId);
      const state = this.getTenantState(tenantId);

      if (!sock || !state.isConnected) {
        logger.error('WhatsApp not connected for tenant', { tenantId });
        return { success: false, error: 'WhatsApp not connected' };
      }

      const jid = phoneNumber.includes('@') ? phoneNumber : `${phoneNumber}@s.whatsapp.net`;

      await sock.sendMessage(jid, { text: messageText });

      logger.info('Message sent for tenant', { tenantId, phoneNumber });
      return { success: true };
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
   * Disconnect tenant - ENHANCED ROBUST VERSION
   * @param {number} tenantId - Tenant ID
   */
  async disconnect(tenantId) {
    try {
      logger.info('Starting enhanced disconnect for tenant', { tenantId });
      
      const sock = this.tenantConnections.get(tenantId);
      const state = this.getTenantState(tenantId);
      
      // Clear health check if exists
      if (state.healthCheck) {
        clearInterval(state.healthCheck);
        state.healthCheck = null;
      }
      
      // Clear store intervals
      if (this.storeIntervals.has(tenantId)) {
        clearInterval(this.storeIntervals.get(tenantId));
        this.storeIntervals.delete(tenantId);
      }
      
      if (this.chatStoreIntervals.has(tenantId)) {
        clearInterval(this.chatStoreIntervals.get(tenantId));
        this.chatStoreIntervals.delete(tenantId);
      }
      
      // Save chat store before cleanup
      try {
        const chatStore = this.getChatStore(tenantId);
        if (chatStore && chatStore.size > 0) {
          const sessionPath = this.stateManager.getTenantSessionPath(tenantId);
          const chatStorePath = path.join(sessionPath, 'chat_store.json');
          const chatsArray = Array.from(chatStore.values());
          fs.writeFileSync(chatStorePath, JSON.stringify(chatsArray));
          logger.info('Chat store saved before disconnect', { 
            tenantId, 
            chatsCount: chatsArray.length 
          });
        }
      } catch (saveError) {
        logger.warn('Failed to save chat store before disconnect', {
          tenantId,
          error: saveError.message
        });
      }
      
      // Save Baileys store before cleanup
      try {
        const store = this.tenantStores.get(tenantId);
        if (store && store.writeToFile) {
          const sessionPath = this.stateManager.getTenantSessionPath(tenantId);
          const storePath = path.join(sessionPath, 'baileys_store.json');
          store.writeToFile(storePath);
          logger.info('Baileys store saved before disconnect', { tenantId });
        }
      } catch (saveError) {
        logger.warn('Failed to save Baileys store before disconnect', {
          tenantId,
          error: saveError.message
        });
      }
      
      if (sock) {
        try {
          // Remove all event listeners to prevent memory leaks
          sock.ev.removeAllListeners();
          
          // Gracefully logout if connected
          if (state.isConnected) {
            await sock.logout();
            logger.info('Tenant logged out successfully', { tenantId });
          }
          
          // Close the socket
          sock.end();
          logger.info('Socket closed for tenant', { tenantId });
        } catch (sockError) {
          logger.warn('Error during socket cleanup', {
            tenantId,
            error: sockError.message
          });
        }
        
        this.tenantConnections.delete(tenantId);
      }
      
      // Clean up stores
      if (this.tenantStores.has(tenantId)) {
        this.tenantStores.delete(tenantId);
      }
      
      if (this.tenantChatStore.has(tenantId)) {
        this.tenantChatStore.delete(tenantId);
      }
      
      // Reset tenant state
      state.isConnected = false;
      state.isInitializing = false;
      state.reconnectAttempts = 0;
      state.lastDisconnectTime = Date.now();
      state.eventHandlers = {};

      // Update database status
      await WhatsAppConnectionModel.updateStatus(tenantId, 'disconnected', {
        disconnected_at: new Date(),
        disconnect_reason: 'manual_disconnect'
      });
      
      // Clear QR code
      this.qrHandler.clearQR(tenantId);

      // Emit disconnect event
      this.io.emit('connection-status', {
        status: 'disconnected',
        tenantId,
        reason: 'manual_disconnect',
        timestamp: new Date().toISOString()
      });

      logger.info('Enhanced tenant disconnect completed successfully', { tenantId });
      return true;
    } catch (error) {
      logger.error('Error in enhanced disconnect for tenant', { 
        tenantId, 
        error: error.message,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Get tenant state
   * @param {number} tenantId - Tenant ID
   * @returns {Object} Tenant state
   */
  getTenantState(tenantId) {
    if (!this.tenantStates.has(tenantId)) {
      this.tenantStates.set(tenantId, {
        isConnected: false,
        isInitializing: false,
        reconnectAttempts: 0,
        lastInitializeTime: 0,
        eventHandlers: {},
        loggedOut: false,
        lastHeartbeatAt: 0
      });
    }
    return this.tenantStates.get(tenantId);
  }

  /**
   * Get socket for tenant
   * @param {number} tenantId - Tenant ID
   * @returns {Object|null} Socket or null
   */
  getSocket(tenantId) {
    return this.tenantConnections.get(tenantId) || null;
  }

  /**
   * Get chats for tenant
   * @param {number} tenantId - Tenant ID
   * @returns {Array} List of chats
   */
  async getChats(tenantId) {
    const sock = this.tenantConnections.get(tenantId);
    if (!sock) {
      logger.warn("No socket found for tenant to get chats", { tenantId });
      return [];
    }
    try {
      const state = this.getTenantState(tenantId);
      const chatStore = this.getChatStore(tenantId);
      if (chatStore.size) {
        return Array.from(chatStore.values());
      }
      const sessionPath = this.stateManager.getTenantSessionPath(tenantId);
      const chatStorePath = path.join(sessionPath, 'chat_store.json');
      if (fs.existsSync(chatStorePath)) {
        try {
          const raw = fs.readFileSync(chatStorePath, 'utf-8');
          const storedChats = JSON.parse(raw || '[]');
          if (Array.isArray(storedChats)) {
            storedChats.forEach((chat) => {
              const chatId = chat?.id?.id || chat?.id || chat?.jid || chat?.remoteJid || chat?.key?.remoteJid || '';
              if (chatId) {
                chatStore.set(String(chatId), chat);
              }
            });
          }
        } catch (error) {
          logger.warn('Failed to read chat store file', { tenantId, error: error.message });
        }
        if (chatStore.size) {
          return Array.from(chatStore.values());
        }
      }
      let store = this.tenantStores.get(tenantId);
      if (!store && this.makeInMemoryStore) {
        const sessionPath = this.stateManager.getTenantSessionPath(tenantId);
        const storePath = path.join(sessionPath, 'baileys_store.json');
        store = this.makeInMemoryStore({ logger: pino({ level: 'silent' }) });
        if (fs.existsSync(storePath)) {
          store.readFromFile(storePath);
        }
        store.bind(sock.ev);
        this.tenantStores.set(tenantId, store);
        if (!this.storeIntervals.has(tenantId)) {
          const intervalId = setInterval(() => {
            store.writeToFile(storePath);
          }, 10000);
          this.storeIntervals.set(tenantId, intervalId);
        }
      }
      if (store?.chats?.all) {
        const chats = store.chats.all();
        if (chats.length) return chats;
      }
      if (store?.chats?.values) {
        const chats = Array.from(store.chats.values());
        if (chats.length) return chats;
      }
      const storeStats = this.getStoreStats(tenantId);
      if (store && storeStats.storeFileExists && storeStats.storeFileSize > 0 && store.readFromFile) {
        const sessionPath = this.stateManager.getTenantSessionPath(tenantId);
        const storePath = path.join(sessionPath, 'baileys_store.json');
        store.readFromFile(storePath);
        if (store?.chats?.all) {
          const chats = store.chats.all();
          if (chats.length) return chats;
        }
        if (store?.chats?.values) {
          const chats = Array.from(store.chats.values());
          if (chats.length) return chats;
        }
      }
      if (sock?.chats?.all) {
        const chats = sock.chats.all();
        if (chats.length) return chats;
      }
      const now = Date.now();
      const last = this.lastResyncAt.get(tenantId) || 0;
      if (state.loggedOut) {
        return [];
      }
      if (sock?.resyncAppState && now - last > 30000) {
        this.lastResyncAt.set(tenantId, now);
        await sock.resyncAppState(['regular', 'regular_high', 'regular_low', 'critical_block', 'critical_unblock_low'], true);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      if (store?.chats?.all) {
        return store.chats.all();
      }
      if (store?.chats?.values) {
        return Array.from(store.chats.values());
      }
      if (sock?.chats?.all) {
        return sock.chats.all();
      }
      logger.warn("Chat store empty after resync", {
        tenantId,
        storeStats: this.getStoreStats(tenantId)
      });
      logger.warn("No chat store available for tenant", { tenantId });
      return [];
    } catch (error) {
      logger.error("Error fetching chats for tenant", { tenantId, error: error.message });
      return [];
    }
  }

  getStoreStats(tenantId) {
    try {
      const sessionPath = this.stateManager.getTenantSessionPath(tenantId);
      const storePath = path.join(sessionPath, 'baileys_store.json');
      const chatStorePath = path.join(sessionPath, 'chat_store.json');
      const store = this.tenantStores.get(tenantId);
      const chatsCount = store?.chats?.all ? store.chats.all().length : (store?.chats?.values ? Array.from(store.chats.values()).length : 0);
      let storeFileSize = 0;
      let storeFileExists = false;
      let chatStoreFileSize = 0;
      let chatStoreFileExists = false;
      if (fs.existsSync(storePath)) {
        storeFileExists = true;
        storeFileSize = fs.statSync(storePath).size;
      }
      if (fs.existsSync(chatStorePath)) {
        chatStoreFileExists = true;
        chatStoreFileSize = fs.statSync(chatStorePath).size;
      }
      return {
        hasStore: !!store,
        chatsCount,
        storeFileExists,
        storeFileSize,
        chatStoreFileExists,
        chatStoreFileSize
      };
    } catch (error) {
      return {
        hasStore: false,
        chatsCount: 0,
        storeFileExists: false,
        storeFileSize: 0,
        chatStoreFileExists: false,
        chatStoreFileSize: 0
      };
    }
  }

  getChatStore(tenantId) {
    if (!this.tenantChatStore.has(tenantId)) {
      this.tenantChatStore.set(tenantId, new Map());
    }
    return this.tenantChatStore.get(tenantId);
  }

  /**
   * Check if tenant is connected
   * @param {number} tenantId - Tenant ID
   * @returns {boolean} Connection status
   */
  isConnected(tenantId) {
    const state = this.getTenantState(tenantId);
    return state.isConnected;
  }

  /**
   * Get download media message function
   * @returns {Function} Download function
   */
  getDownloadMediaMessage() {
    return this.downloadMediaMessage;
  }

  /**
   * Get connection status for tenant
   * @param {number} tenantId - Tenant ID
   * @returns {Object} Connection status
   */
  getStatus(tenantId) {
    const state = this.getTenantState(tenantId);
    const sock = this.tenantConnections.get(tenantId);
    
    return {
      connected: state.isConnected,
      initializing: state.isInitializing,
      reconnectAttempts: state.reconnectAttempts,
      hasSocket: !!sock,
      loggedOut: state.loggedOut
    };
  }

  /**
   * Reconnect tenant
   * @param {number} tenantId - Tenant ID
   */
  async reconnect(tenantId) {
    const state = this.getTenantState(tenantId);
    state.reconnectAttempts = 0;
    await this.initialize(tenantId, state.eventHandlers);
  }

  async forceHistorySync(tenantId) {
    const sock = this.tenantConnections.get(tenantId);
    if (!sock) return false;
    const now = Date.now();
    const last = this.lastResyncAt.get(tenantId) || 0;
    if (now - last < 5000) return true;
    this.lastResyncAt.set(tenantId, now);
    if (sock.resyncAppState) {
      await sock.resyncAppState(['regular', 'regular_high', 'regular_low', 'critical_block', 'critical_unblock_low'], true);
    }
    if (sock.cleanDirtyBits) {
      await sock.cleanDirtyBits('account_sync');
      await sock.cleanDirtyBits('groups');
    }
    return true;
  }

  /**
   * Get human-readable disconnect reason name
   * @param {number} statusCode - Disconnect status code
   * @returns {string} Reason name
   */
  getDisconnectReasonName(statusCode) {
    if (!this.DisconnectReason || !statusCode) return 'Unknown';
    
    const reasons = {
      [this.DisconnectReason.badSession]: 'Bad Session',
      [this.DisconnectReason.connectionClosed]: 'Connection Closed',
      [this.DisconnectReason.connectionLost]: 'Connection Lost',
      [this.DisconnectReason.connectionReplaced]: 'Connection Replaced',
      [this.DisconnectReason.loggedOut]: 'Logged Out',
      [this.DisconnectReason.restartRequired]: 'Restart Required',
      [this.DisconnectReason.timedOut]: 'Timed Out',
      [this.DisconnectReason.multideviceMismatch]: 'Multidevice Mismatch'
    };
    
    return reasons[statusCode] || `Unknown (${statusCode})`;
  }
}

module.exports = WhatsAppConnection;
