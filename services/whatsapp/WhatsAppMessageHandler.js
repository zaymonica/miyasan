/**
 * WhatsAppMessageHandler
 * Processes incoming WhatsApp messages with tenant isolation
 * 
 * @module services/whatsapp/WhatsAppMessageHandler
 */

const { logger } = require('../../config/logger');
const WhatsAppContact = require('../../models/WhatsAppContact');
const axios = require('axios');
const crypto = require('crypto');

class WhatsAppMessageHandler {
  constructor(io, mediaHandler, options = {}) {
    this.io = io;
    this.mediaHandler = mediaHandler;
    this.enableOpenAI = options.enableOpenAI || false;
  }

  /**
   * Get bot settings for tenant
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<Object>} Bot settings
   */
  async getBotSettings(tenantId) {
    const { pool } = require('../../config/database');
    try {
      const [rows] = await pool.execute(
        'SELECT bot_enabled, group_enabled FROM tenants WHERE id = ?',
        [tenantId]
      );
      
      if (rows.length === 0) {
        return { bot_enabled: true, group_enabled: false };
      }
      
      return {
        bot_enabled: rows[0].bot_enabled === 1 || rows[0].bot_enabled === true,
        group_enabled: rows[0].group_enabled === 1 || rows[0].group_enabled === true
      };
    } catch (error) {
      logger.error('Error getting bot settings', { tenantId, error: error.message });
      return { bot_enabled: true, group_enabled: false };
    }
  }

  /**
   * Check if conversation is in manual mode (human took over)
   * @param {number} tenantId - Tenant ID
   * @param {number} conversationId - Conversation ID
   * @returns {Promise<boolean>} True if in manual mode
   */
  async isConversationInManualMode(tenantId, conversationId) {
    const { pool } = require('../../config/database');
    try {
      const [rows] = await pool.execute(
        'SELECT status, assigned_user_id FROM conversations WHERE id = ? AND tenant_id = ?',
        [conversationId, tenantId]
      );
      
      if (rows.length === 0) {
        return false;
      }
      
      // If conversation is assigned to someone or status is 'active'/'attended' (human handling), it's in manual mode
      const conv = rows[0];
      return conv.assigned_user_id !== null || conv.status === 'active' || conv.status === 'attended';
    } catch (error) {
      logger.error('Error checking manual mode', { tenantId, conversationId, error: error.message });
      return false;
    }
  }

  /**
   * Normalize remoteJid to ensure consistency
   * Always use @lid format if available, otherwise @s.whatsapp.net
   * @param {string} remoteJid - Original remoteJid
   * @returns {string} Normalized remoteJid
   */
  normalizeRemoteJid(remoteJid) {
    if (!remoteJid) return null;
    
    // If already has @lid, keep it
    if (remoteJid.includes('@lid')) {
      return remoteJid;
    }
    
    // If has @s.whatsapp.net, extract number and add @lid
    if (remoteJid.includes('@s.whatsapp.net')) {
      const number = remoteJid.split('@')[0];
      return `${number}@lid`;
    }
    
    // If no @, add @lid
    return `${remoteJid}@lid`;
  }

  /**
   * Extract phone number from remoteJid
   * Tries to get the real phone number, not the LID
   * @param {string} remoteJid - Remote JID
   * @param {Object} message - WhatsApp message object
   * @param {Object} sock - WhatsApp socket (optional, for LID resolution)
   * @returns {string} Phone number
   */
  extractPhoneNumber(remoteJid, message, sock = null) {
    if (!remoteJid) return 'unknown';
    
    console.log('🔍 [extractPhoneNumber] Input:', { remoteJid, hasMessage: !!message, hasSock: !!sock });
    
    // CRITICAL: Check for remoteJidAlt first (contains real phone number)
    if (message?.key?.remoteJidAlt) {
      const altJid = message.key.remoteJidAlt;
      console.log('🔍 [extractPhoneNumber] Found remoteJidAlt:', altJid);
      
      if (altJid.includes('@s.whatsapp.net')) {
        let number = altJid.split('@')[0];
        if (number.includes(':')) {
          number = number.split(':')[0];
        }
        console.log('✅ [extractPhoneNumber] Using real number from remoteJidAlt:', number);
        return this.formatPhoneNumber(number);
      }
    }
    
    // If it's a @s.whatsapp.net format, extract the number directly
    if (remoteJid.includes('@s.whatsapp.net')) {
      let number = remoteJid.split('@')[0];
      // Remove any : suffix (device identifier)
      if (number.includes(':')) {
        number = number.split(':')[0];
      }
      console.log('🔍 [extractPhoneNumber] Extracted from @s.whatsapp.net:', number);
      return this.formatPhoneNumber(number);
    }
    
    // If it's a @lid format, try to get number from participant or other sources
    if (remoteJid.includes('@lid')) {
      console.log('🔍 [extractPhoneNumber] Processing @lid format');
      
      // Check if there's a participant (for group messages)
      if (message?.key?.participant) {
        let participant = message.key.participant;
        console.log('🔍 [extractPhoneNumber] Found participant:', participant);
        if (participant.includes('@s.whatsapp.net')) {
          let number = participant.split('@')[0];
          if (number.includes(':')) {
            number = number.split(':')[0];
          }
          return this.formatPhoneNumber(number);
        }
      }
      
      // For LID, extract the numeric part
      let lidNumber = remoteJid.split('@')[0];
      if (lidNumber.includes(':')) {
        lidNumber = lidNumber.split(':')[0];
      }
      
      console.log('🔍 [extractPhoneNumber] LID number:', lidNumber, 'length:', lidNumber.length);
      
      // If it looks like a phone number (10-15 digits, all numeric), format it
      if (lidNumber.length >= 10 && lidNumber.length <= 15 && /^\d+$/.test(lidNumber)) {
        return this.formatPhoneNumber(lidNumber);
      }
      
      // Otherwise return the LID as-is (it's an internal ID)
      return lidNumber;
    }
    
    // Fallback: just extract the number part
    let number = remoteJid;
    if (number.includes('@')) {
      number = number.split('@')[0];
    }
    if (number.includes(':')) {
      number = number.split(':')[0];
    }
    return this.formatPhoneNumber(number);
  }

  /**
   * Format phone number for display - INTERNATIONAL
   * @param {string} number - Raw phone number
   * @returns {string} Formatted phone number
   */
  formatPhoneNumber(number) {
    if (!number) return 'unknown';
    
    // Remove any non-numeric characters except +
    let clean = number.replace(/[^\d+]/g, '');
    
    // Add + if not present and looks like international number
    if (!clean.startsWith('+') && clean.length > 10) {
      clean = '+' + clean;
    }
    
    return clean;
  }

  /**
   * Process incoming message for tenant
   * @param {number} tenantId - Tenant ID
   * @param {Object} m - Messages upsert event
   * @param {Object} sock - WhatsApp socket
   * @param {Function} downloadMediaMessage - Download function
   */
  async handleMessage(tenantId, m, sock, downloadMediaMessage) {
    try {
      console.log('🔔 [WhatsApp] handleMessage called for tenant:', tenantId);
      logger.info('Processing messages for tenant', {
        tenantId,
        hasMessages: !!m.messages,
        messageCount: m.messages?.length || 0,
        type: m.type
      });

      // CRITICAL: Only process 'notify' type messages (new incoming messages)
      // Ignore 'append' type (history sync) to prevent creating old conversations
      if (m.type !== 'notify') {
        console.log(`⏭️ [WhatsApp] Ignoring message type: ${m.type} (only processing 'notify')`);
        logger.info('Ignoring non-notify message type', { tenantId, type: m.type });
        return;
      }

      const messages = m.messages;
      if (!messages || messages.length === 0) {
        console.log('⚠️ [WhatsApp] No messages in upsert event');
        logger.warn('No messages in upsert event', { tenantId });
        return;
      }

      console.log(`📨 [WhatsApp] Processing ${messages.length} message(s)`);

      for (const message of messages) {
        // DEBUG: Log FULL message to see what data is available
        console.log('🔍 DEBUG FULL message:', JSON.stringify(message, null, 2));

        const protocolType = message?.message?.protocolMessage?.type;
        const isHistorySync = protocolType === 2 || !!message?.message?.protocolMessage?.historySyncNotification;
        if (isHistorySync) {
          console.log('⏭️ [WhatsApp] Ignoring history sync message');
          logger.info('Ignoring history sync message', { tenantId });
          continue;
        }
        
        // Ignore messages from self
        if (message.key.fromMe) {
          console.log('⏭️ [WhatsApp] Ignoring message from self');
          logger.info('Ignoring message from self', { tenantId });
          continue;
        }

        // Ignore status broadcasts (stories/status updates)
        if (message.key.remoteJid === 'status@broadcast') {
          console.log('⏭️ [WhatsApp] Ignoring status broadcast');
          logger.info('Ignoring status broadcast', { tenantId });
          continue;
        }

        // Ignore messages without valid remoteJid
        if (!message.key.remoteJid) {
          console.log('⏭️ [WhatsApp] Ignoring message without remoteJid');
          logger.info('Ignoring message without remoteJid', { tenantId });
          continue;
        }

        console.log('✅ [WhatsApp] Processing incoming message...');
        await this.processMessage(tenantId, message, sock, downloadMediaMessage);
      }
    } catch (error) {
      console.error('❌ [WhatsApp] Error handling messages:', error);
      logger.error('Error handling messages for tenant', {
        tenantId,
        error: error.message
      });
    }
  }

  /**
   * Check and send welcome messages if needed
   * @param {number} tenantId - Tenant ID
   * @param {string} phoneNumber - Phone number
   * @param {Object} sock - WhatsApp socket
   * @param {string} remoteJid - Remote JID
   * @param {string} pushName - Contact name
   * @returns {Promise<boolean>} True if welcome messages were sent
   */
  async checkAndSendWelcomeMessages(tenantId, phoneNumber, sock, remoteJid, pushName) {
    const { pool } = require('../../config/database');
    let connection;
    try {
      console.log(`👋 [Welcome] Checking for tenant ${tenantId}, phone ${phoneNumber}`);
      connection = await pool.getConnection();

      // Check if welcome was already sent in last 2 hours
      const [sent] = await connection.execute(
        'SELECT id FROM welcome_sent WHERE tenant_id = ? AND phone_number = ? AND sent_at > DATE_SUB(NOW(), INTERVAL 2 HOUR)',
        [tenantId, phoneNumber]
      );

      if (sent.length > 0) {
        console.log('⏭️ [Welcome] Already sent in last 2 hours');
        connection.release();
        return false; // Already sent in last 2 hours
      }

      // Get active welcome messages for this tenant
      const [welcomeMessages] = await connection.execute(
        'SELECT * FROM welcome_messages WHERE tenant_id = ? AND active = TRUE ORDER BY order_position ASC',
        [tenantId]
      );

      console.log(`📋 [Welcome] Found ${welcomeMessages.length} welcome messages`);

      if (welcomeMessages.length === 0) {
        console.log('⏭️ [Welcome] No welcome messages configured');
        connection.release();
        return false;
      }

      // Send each welcome message with delay
      for (let i = 0; i < welcomeMessages.length; i++) {
        const msg = welcomeMessages[i];
        
        // Add delay before first message (7 seconds) or between messages (2 seconds)
        if (i === 0) {
          await new Promise(resolve => setTimeout(resolve, 7000)); // 7 seconds delay for first message
        } else {
          await new Promise(resolve => setTimeout(resolve, 2000)); // 2 seconds between messages
        }

        // Send typing indicator
        try {
          await sock.sendPresenceUpdate('composing', remoteJid);
        } catch (err) {
          logger.warn('Error sending typing indicator', { error: err.message });
        }
        
        // Wait for typing effect (3 seconds)
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Replace placeholders in message text
        const text = await this.replacePlaceholders(tenantId, msg.message_text, { phoneNumber, pushName });
        
        try {
          await sock.sendMessage(remoteJid, { text });
          logger.info('Welcome message sent', { tenantId, phoneNumber, messageIndex: i });
        } catch (err) {
          logger.error('Error sending welcome message', { 
            error: err.message, 
            tenantId,
            phoneNumber
          });
        }

        // Stop typing
        try {
          await sock.sendPresenceUpdate('available', remoteJid);
        } catch (err) {
          logger.warn('Error stopping typing indicator', { error: err.message });
        }
      }

      // Mark as sent
      await connection.execute(
        'INSERT INTO welcome_sent (tenant_id, phone_number, sent_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE sent_at = NOW()',
        [tenantId, phoneNumber]
      );

      connection.release();
      logger.info('Welcome messages sent', { tenantId, phoneNumber, count: welcomeMessages.length });
      return true;
    } catch (error) {
      if (connection) connection.release();
      logger.error('Error sending welcome messages', { tenantId, error: error.message });
      return false;
    }
  }

  /**
   * Process auto-reply (FAQ matching)
   * @param {number} tenantId - Tenant ID
   * @param {string} phoneNumber - Phone number
   * @param {string} text - Message text
   * @param {Object} message - Original message
   * @param {Object} sock - WhatsApp socket
   * @param {string} remoteJid - Remote JID
   * @param {string} pushName - Contact name
   * @returns {Promise<boolean>} True if FAQ was matched and sent
   */
  async processAutoReply(tenantId, phoneNumber, text, message, sock, remoteJid, pushName) {
    if (!text) return false;

    const { pool } = require('../../config/database');
    let connection;
    try {
      console.log(`🤖 [FAQ] Searching FAQ for tenant ${tenantId}, text: "${text}"`);
      connection = await pool.getConnection();

      // Check for FAQ match
      const [faqs] = await connection.execute(
        'SELECT * FROM faqs WHERE tenant_id = ? AND active = TRUE AND LOWER(question) LIKE LOWER(?) ORDER BY order_position ASC LIMIT 1',
        [tenantId, `%${text}%`]
      );

      console.log(`📋 [FAQ] Found ${faqs.length} matching FAQ(s)`);

      if (faqs.length === 0) {
        console.log('⏭️ [FAQ] No FAQ match found');
        connection.release();
        return false;
      }

      const faq = faqs[0];
      console.log(`✅ [FAQ] Matched FAQ: "${faq.question}" -> "${faq.answer.substring(0, 50)}..."`);

      
      // Replace placeholders in FAQ answer
      const response = await this.replacePlaceholders(tenantId, faq.answer, { phoneNumber, pushName });
      
      // Wait 3 seconds before reacting
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Send reaction to message if configured
      if (message?.key && faq.emoji) {
        try {
          await sock.sendMessage(remoteJid, {
            react: {
              text: faq.emoji,
              key: message.key
            }
          });
          logger.info('Reaction sent', { tenantId, phoneNumber, emoji: faq.emoji });
        } catch (err) {
          logger.warn('Error sending reaction', { error: err.message });
        }
      }

      // Wait 2 more seconds
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Send typing indicator
      try {
        await sock.sendPresenceUpdate('composing', remoteJid);
      } catch (err) {
        logger.warn('Error sending typing indicator', { error: err.message });
      }

      // Wait for typing effect
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Send FAQ response
      try {
        await sock.sendMessage(remoteJid, { text: response });
        logger.info('FAQ response sent', { tenantId, phoneNumber, faqId: faq.id });
        
        // Save outgoing message
        await this.saveOutgoingMessage(tenantId, phoneNumber, response, {
          messageType: 'text'
        });
      } catch (err) {
        logger.error('Error sending FAQ response', { error: err.message, tenantId, phoneNumber });
      }

      // Stop typing
      try {
        await sock.sendPresenceUpdate('available', remoteJid);
      } catch (err) {
        logger.warn('Error stopping typing indicator', { error: err.message });
      }

      connection.release();
      return true;
    } catch (error) {
      if (connection) connection.release();
      logger.error('Error processing auto-reply', { tenantId, error: error.message });
      return false;
    }
  }

  /**
   * Process AI response when no FAQ match
   * @param {number} tenantId - Tenant ID
   * @param {string} phoneNumber - Phone number
   * @param {string} text - Message text
   * @param {Object} message - Original message
   * @param {Object} sock - WhatsApp socket
   * @param {string} remoteJid - Remote JID
   * @param {string} pushName - Contact name
   * @param {number} conversationId - Conversation ID
   * @returns {Promise<boolean>} True if AI response was sent
   */
  async processAIResponse(tenantId, phoneNumber, text, message, sock, remoteJid, pushName, conversationId) {
    if (!text) return false;

    const { pool } = require('../../config/database');
    let connection;
    
    try {
      console.log(`🤖 [AI] Checking AI config for tenant ${tenantId}`);
      connection = await pool.getConnection();

      // Get active AI configuration for this tenant
      const [configs] = await connection.execute(
        `SELECT * FROM ai_configurations 
         WHERE tenant_id = ? AND active = TRUE AND auto_response_enabled = TRUE
         LIMIT 1`,
        [tenantId]
      );

      if (configs.length === 0) {
        console.log('⏭️ [AI] No active AI configuration found');
        connection.release();
        return false;
      }

      const config = configs[0];
      console.log(`✅ [AI] Found active config: ${config.persona_name} (${config.provider})`);

      // Check business hours if configured
      if (config.business_hours_start && config.business_hours_end) {
        const now = new Date();
        const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
        const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
        
        const businessDays = (config.business_days || '').toLowerCase().split(',').map(d => d.trim());
        
        if (businessDays.length > 0 && !businessDays.includes(currentDay)) {
          console.log(`⏭️ [AI] Outside business days (${currentDay} not in ${businessDays.join(', ')})`);
          connection.release();
          return false;
        }
        
        if (currentTime < config.business_hours_start || currentTime > config.business_hours_end) {
          console.log(`⏭️ [AI] Outside business hours (${currentTime} not between ${config.business_hours_start}-${config.business_hours_end})`);
          connection.release();
          return false;
        }
      }

      // Decrypt API key
      const apiKey = this.decryptApiKey(config.api_key);
      
      if (!apiKey) {
        console.log('⏭️ [AI] Failed to decrypt API key');
        connection.release();
        return false;
      }

      const history = [];

      // Build messages array for AI
      const messages = [];
      
      // Add system prompt
      if (config.system_prompt) {
        messages.push({
          role: 'system',
          content: config.system_prompt
        });
      }

      // Add conversation history (reversed to chronological order)
      const reversedHistory = history.reverse();
      for (const msg of reversedHistory) {
        messages.push({
          role: msg.direction === 'incoming' ? 'user' : 'assistant',
          content: msg.content
        });
      }

      // Add current message if not already in history
      if (messages.length === 0 || messages[messages.length - 1].content !== text) {
        messages.push({
          role: 'user',
          content: text
        });
      }

      console.log(`🤖 [AI] Sending request to ${config.provider} with ${messages.length} messages`);

      // Call AI API
      let aiResponse;
      const apiUrl = config.provider === 'deepseek' 
        ? 'https://api.deepseek.com/v1/chat/completions'
        : 'https://api.openai.com/v1/chat/completions';

      try {
        const response = await axios.post(
          apiUrl,
          {
            model: config.model_name,
            messages: messages,
            temperature: parseFloat(config.temperature) || 0.7,
            max_tokens: parseInt(config.max_tokens) || 1000
          },
          {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 30000
          }
        );

        aiResponse = response.data.choices[0].message.content;
        console.log(`✅ [AI] Got response: "${aiResponse.substring(0, 100)}..."`);
      } catch (apiError) {
        console.error('❌ [AI] API error:', apiError.response?.data || apiError.message);
        connection.release();
        return false;
      }

      // Apply response delay if configured
      const delay = (config.response_delay || 2) * 1000;
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      // Send typing indicator
      try {
        await sock.sendPresenceUpdate('composing', remoteJid);
      } catch (err) {
        logger.warn('Error sending typing indicator', { error: err.message });
      }

      // Wait for typing effect (based on response length)
      const typingDelay = Math.min(Math.max(aiResponse.length * 20, 1000), 5000);
      await new Promise(resolve => setTimeout(resolve, typingDelay));

      // Send AI response
      try {
        await sock.sendMessage(remoteJid, { text: aiResponse });
        logger.info('AI response sent', { tenantId, phoneNumber, provider: config.provider });
        
        // Save outgoing message
        await this.saveOutgoingMessage(tenantId, phoneNumber, aiResponse, {
          messageType: 'text',
          metadata: { ai_generated: true, provider: config.provider, model: config.model_name }
        });
      } catch (err) {
        logger.error('Error sending AI response', { error: err.message, tenantId, phoneNumber });
        connection.release();
        return false;
      }

      // Stop typing
      try {
        await sock.sendPresenceUpdate('available', remoteJid);
      } catch (err) {
        logger.warn('Error stopping typing indicator', { error: err.message });
      }

      connection.release();
      return true;
    } catch (error) {
      if (connection) connection.release();
      logger.error('Error processing AI response', { tenantId, error: error.message });
      console.error('❌ [AI] Full error:', error);
      return false;
    }
  }

  /**
   * Decrypt API key
   * @param {string} encryptedText - Encrypted API key
   * @returns {string|null} Decrypted API key or null on error
   */
  decryptApiKey(encryptedText) {
    try {
      const keyString = process.env.ENCRYPTION_KEY || 'default-key-change-in-production-32';
      const key = crypto.createHash('sha256').update(keyString).digest();

      const textParts = encryptedText.split(':');
      const iv = Buffer.from(textParts.shift(), 'hex');
      const encrypted = textParts.join(':');

      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      logger.error('Error decrypting API key', { error: error.message });
      return null;
    }
  }

  /**
   * Replace placeholders in text
   * @param {number} tenantId - Tenant ID
   * @param {string} text - Text with placeholders
   * @param {Object} data - Placeholder data
   * @returns {Promise<string>} Text with replaced placeholders
   */
  async replacePlaceholders(tenantId, text, data = {}) {
    if (!text) return text;

    let result = text;

    // Replace {{customer_name}} with WhatsApp contact name
    if (data.pushName) {
      result = result.replace(/\{\{customer_name\}\}/g, data.pushName);
      result = result.replace(/\{\{name\}\}/g, data.pushName);
      result = result.replace(/\{\{nome\}\}/g, data.pushName);
    }

    // Replace {{current_date}} and {{current_time}} with current date and time
    const now = new Date();
    result = result.replace(/\{\{current_date\}\}/g, now.toLocaleDateString());
    result = result.replace(/\{\{current_time\}\}/g, now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

    // Replace {{phone}} with phone number
    if (data.phoneNumber) {
      result = result.replace(/\{\{phone\}\}/g, data.phoneNumber);
      result = result.replace(/\{\{telefone\}\}/g, data.phoneNumber);
    }

    // Get custom placeholders from database
    const { pool } = require('../../config/database');
    try {
      const [placeholders] = await pool.query(
        'SELECT placeholder_key, placeholder_value FROM message_placeholders WHERE tenant_id = ? AND active = TRUE',
        [tenantId]
      );

      for (const placeholder of placeholders) {
        const regex = new RegExp(`\\{\\{${placeholder.placeholder_key}\\}\\}`, 'g');
        result = result.replace(regex, placeholder.placeholder_value);
      }
    } catch (error) {
      logger.error('Error replacing placeholders', { tenantId, error: error.message });
    }

    return result;
  }

  /**
   * Process single message
   * @param {number} tenantId - Tenant ID
   * @param {Object} message - WhatsApp message
   * @param {Object} sock - WhatsApp socket
   * @param {Function} downloadMediaMessage - Download function
   */
  async processMessage(tenantId, message, sock, downloadMediaMessage) {
    try {
      // Extract message data
      const originalRemoteJid = message.key.remoteJid;
      
      // CRITICAL FIX: Always use originalRemoteJid for sending messages back
      // The remoteJidAlt is only useful for extracting the phone number
      // But for sending, we MUST use the original JID that WhatsApp gave us
      const remoteJid = originalRemoteJid;
      
      // Extract phone number - try to get the real number for display
      let phoneNumber = this.extractPhoneNumber(originalRemoteJid, message);
      
      const pushName = message.pushName || 'Unknown';

      logger.info('Processing message for tenant', {
        tenantId,
        from: phoneNumber,
        pushName,
        originalRemoteJid,
        remoteJidAlt: message.key.remoteJidAlt,
        remoteJid,
        isLID: originalRemoteJid.includes('@lid'),
        usingAlt: !!message.key.remoteJidAlt
      });

      // Extract message content
      const messageData = this.extractMessageData(message);

      // Download media if exists
      if (messageData.mediaType) {
        const media = await this.mediaHandler.downloadMedia(
          tenantId,
          message,
          downloadMediaMessage
        );
        if (media) {
          messageData.mediaUrl = media.url;
          messageData.mediaMimetype = media.mimeType;
          messageData.mediaSize = media.size;
          messageData.caption = media.caption;
        }
      }

      const messageSummary = messageData.text || messageData.caption || (messageData.mediaType ? `[${messageData.mediaType}]` : null);
      const conversationId = await this.getOrCreateConversation(tenantId, phoneNumber, pushName, messageSummary, remoteJid);
      if (!conversationId) {
        return;
      }

      const { pool } = require('../../config/database');
      const whatsappMessageId = message.key?.id || null;
      let alreadySaved = false;
      if (whatsappMessageId) {
        const [existing] = await pool.query(
          'SELECT id FROM whatsapp_messages WHERE tenant_id = ? AND whatsapp_message_id = ? LIMIT 1',
          [tenantId, whatsappMessageId]
        );
        alreadySaved = existing.length > 0;
      }
      if (!alreadySaved) {
        await pool.query(
          `INSERT INTO whatsapp_messages 
           (tenant_id, connection_id, phone_number, contact_name, message_type, content, media_url, media_mimetype, media_size, caption, direction, status, whatsapp_message_id, conversation_id, metadata)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'incoming', 'delivered', ?, ?, ?)`,
          [
            tenantId,
            null,
            phoneNumber,
            pushName || null,
            messageData.mediaType || 'text',
            messageSummary || null,
            messageData.mediaUrl || null,
            messageData.mediaMimetype || null,
            messageData.mediaSize || null,
            messageData.caption || null,
            whatsappMessageId || `msg_${Date.now()}`,
            conversationId,
            JSON.stringify({
              remoteJid,
              remoteJidAlt: message.key?.remoteJidAlt || null,
              pushName
            })
          ]
        );
      }

      const savedMessage = {
        id: whatsappMessageId || `msg_${Date.now()}`,
        conversation_id: conversationId
      };

      // Update or create contact
      await WhatsAppContact.upsert(tenantId, {
        phone_number: phoneNumber,
        name: pushName,
        last_message_at: new Date()
      });

      await WhatsAppContact.incrementMessageCount(tenantId, phoneNumber);

      // Emit to tenant namespace - CRITICAL FIX: Use correct namespace
      const tenantNamespace = this.io.of(`/tenant/${tenantId}`);
      
      // Emit new message event
      tenantNamespace.emit('new-message', {
        tenantId,
        messageId: savedMessage.id,
        conversationId: conversationId,
        phoneNumber,
        contactName: pushName,
        messageType: messageData.mediaType || 'text',
        content: messageSummary || messageData.text,
        mediaUrl: messageData.mediaUrl,
        timestamp: new Date(),
        direction: 'incoming'
      });

      // Emit alert for new message received (visible to all users initially)
      tenantNamespace.emit('new-message-alert', {
        conversationId: conversationId,
        contactName: pushName,
        phoneNumber,
        message: `New message received from ${pushName || phoneNumber}`,
        timestamp: new Date()
      });
      
      logger.info('Socket events emitted', { 
        tenantId, 
        event: 'new-message', 
        conversationId,
        messageId: savedMessage.id 
      });

      logger.info('Message processed for tenant', {
        tenantId,
        messageId: savedMessage.id,
        phoneNumber
      });

      const rawTimestamp = Number(message.messageTimestamp || message.message?.messageTimestamp || message.key?.messageTimestamp);
      const messageTimestamp = rawTimestamp ? (rawTimestamp < 1e12 ? rawTimestamp * 1000 : rawTimestamp) : Date.now();
      const isOldMessage = messageTimestamp && Date.now() - messageTimestamp > 300000;
      const shouldAutoReply = !alreadySaved && !isOldMessage;

      if (messageData.text && !message.key.fromMe && shouldAutoReply) {
        console.log('💬 [Auto-Reply] Processing text message:', messageData.text);
        
        // Check if this is a group message
        const isGroup = originalRemoteJid.includes('@g.us');
        
        // Check bot settings before processing
        const botSettings = await this.getBotSettings(tenantId);
        console.log('🤖 [Bot Settings]', botSettings);
        
        // Skip if bot is disabled
        if (!botSettings.bot_enabled) {
          console.log('⏭️ [Auto-Reply] Bot is disabled for this tenant');
        }
        // Skip if it's a group and group responses are disabled
        else if (isGroup && !botSettings.group_enabled) {
          console.log('⏭️ [Auto-Reply] Group responses are disabled');
        }
        // Check if conversation is in manual mode (human took over)
        else if (await this.isConversationInManualMode(tenantId, conversationId)) {
          console.log('⏭️ [Auto-Reply] Conversation is in manual mode, skipping bot');
        }
        else {
          // Check and send welcome messages first
          console.log('👋 [Welcome] Checking welcome messages...');
          const welcomeSent = await this.checkAndSendWelcomeMessages(
            tenantId,
            phoneNumber,
            sock,
            remoteJid,
            pushName
          );

          if (welcomeSent) {
            console.log('✅ [Welcome] Welcome messages sent!');
          } else {
            console.log('⏭️ [Welcome] No welcome messages sent, checking FAQ...');
          }

          // Process auto-reply only if no welcome messages were sent
          if (!welcomeSent) {
            console.log('🤖 [FAQ] Checking FAQ auto-reply...');
            const faqSent = await this.processAutoReply(
              tenantId,
              phoneNumber,
              messageData.text,
              message,
              sock,
              remoteJid,
              pushName
            );
            
            if (faqSent) {
              console.log('✅ [FAQ] FAQ response sent!');
            } else {
              console.log('⏭️ [FAQ] No FAQ match found, checking AI...');
              
              // Try AI response if no FAQ match
              const aiSent = await this.processAIResponse(
                tenantId,
                phoneNumber,
                messageData.text,
                message,
                sock,
                remoteJid,
                pushName,
                conversationId
              );
              
              if (aiSent) {
                console.log('✅ [AI] AI response sent!');
              } else {
                console.log('⏭️ [AI] No AI response (not configured or disabled)');
              }
            }
          }
        }
      } else {
        console.log('⏭️ [Auto-Reply] Skipping auto-reply');
      }
    } catch (error) {
      logger.error('Error processing message for tenant', {
        tenantId,
        error: error.message,
        stack: error.stack,
        remoteJid: message?.key?.remoteJid,
        remoteJidAlt: message?.key?.remoteJidAlt
      });
      console.error('❌ [processMessage] Full error:', error);
    }
  }

  /**
   * Get or create conversation - FIXED to prevent duplicates
   * @param {number} tenantId - Tenant ID
   * @param {string} phoneNumber - Phone number
   * @param {string} contactName - Contact name
   * @param {string} lastMessage - Last message text
   * @param {string} remoteJid - WhatsApp remote JID
   * @returns {Promise<number>} Conversation ID
   */
  async getOrCreateConversation(tenantId, phoneNumber, contactName, lastMessage, remoteJid) {
    const { pool } = require('../../config/database');
    let connection;
    
    try {
      connection = await pool.getConnection();
      
      // CRITICAL FIX: Normalize phone number to prevent duplicates
      // Remove any @ suffix and extract just the number
      let normalizedPhone = phoneNumber;
      if (normalizedPhone.includes('@')) {
        normalizedPhone = normalizedPhone.split('@')[0];
      }
      // Remove any : suffix (device identifier)
      if (normalizedPhone.includes(':')) {
        normalizedPhone = normalizedPhone.split(':')[0];
      }
      // Remove + prefix for consistency
      normalizedPhone = normalizedPhone.replace(/^\+/, '');

      if (!normalizedPhone || normalizedPhone === 'unknown' || normalizedPhone.length < 6) {
        logger.warn('Skipping conversation creation for invalid phone', { tenantId, phoneNumber, normalizedPhone });
        connection.release();
        return null;
      }
      
      // CRITICAL FIX: Normalize remoteJid - always use the original format
      // Don't convert between @lid and @s.whatsapp.net
      let normalizedRemoteJid = remoteJid;
      if (normalizedRemoteJid && normalizedRemoteJid.includes(':')) {
        // Remove device identifier from remoteJid
        const parts = normalizedRemoteJid.split('@');
        if (parts.length === 2) {
          const numberPart = parts[0].split(':')[0];
          normalizedRemoteJid = `${numberPart}@${parts[1]}`;
        }
      }
      
      logger.info('getOrCreateConversation - normalized', { 
        original: phoneNumber, 
        normalized: normalizedPhone,
        remoteJid,
        normalizedRemoteJid
      });
      
      // CRITICAL FIX: Search by remote_jid first (most reliable), then by phone_number
      // Also search for both @lid and @s.whatsapp.net variants
      const lidJid = `${normalizedPhone}@lid`;
      const whatsappJid = `${normalizedPhone}@s.whatsapp.net`;
      
      let [conversations] = await connection.query(
        `SELECT id, phone_number, remote_jid FROM conversations 
         WHERE tenant_id = ? AND (
           remote_jid = ?
           OR remote_jid = ?
           OR remote_jid = ?
           OR phone_number = ? 
           OR phone_number = ?
           OR phone_number LIKE ?
         )
         ORDER BY updated_at DESC
         LIMIT 1`,
        [tenantId, normalizedRemoteJid, lidJid, whatsappJid, normalizedPhone, `+${normalizedPhone}`, `%${normalizedPhone.slice(-10)}`]
      );

      let conversationId;
      let isNewConversation = false;
      const lastMessageText = lastMessage || '[Media]';
      const finalContactName = contactName || null;
      
      if (conversations.length === 0) {
        // Create new conversation with normalized phone number
        // Use INSERT IGNORE to prevent duplicate key errors
        try {
          const [result] = await connection.query(
            'INSERT INTO conversations (tenant_id, phone_number, remote_jid, contact_name, last_message, last_message_time, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), ?, NOW(), NOW())',
            [tenantId, normalizedPhone, normalizedRemoteJid, finalContactName, lastMessageText, 'waiting']
          );
          conversationId = result.insertId;
          isNewConversation = true;
          logger.info('Conversation created', { tenantId, conversationId, phoneNumber: normalizedPhone, contactName: finalContactName });
        } catch (insertError) {
          // If duplicate key error, try to find the existing conversation
          if (insertError.code === 'ER_DUP_ENTRY') {
            logger.warn('Duplicate entry detected, fetching existing conversation', { tenantId, normalizedRemoteJid });
            
            const [existingConv] = await connection.query(
              `SELECT id FROM conversations WHERE tenant_id = ? AND remote_jid = ? LIMIT 1`,
              [tenantId, normalizedRemoteJid]
            );
            
            if (existingConv.length > 0) {
              conversationId = existingConv[0].id;
              logger.info('Found existing conversation after duplicate error', { tenantId, conversationId });
            } else {
              throw insertError;
            }
          } else {
            throw insertError;
          }
        }
      } else {
        conversationId = conversations[0].id;
        
        // Update last message, contact name, and remote_jid (if provided)
        const updateFields = ['last_message = ?', 'last_message_time = NOW()', 'updated_at = NOW()'];
        const updateParams = [lastMessageText];
        
        if (finalContactName) {
          updateFields.push('contact_name = ?');
          updateParams.push(finalContactName);
        }
        
        // Only update remote_jid if it's different and not null
        if (normalizedRemoteJid && conversations[0].remote_jid !== normalizedRemoteJid) {
          updateFields.push('remote_jid = ?');
          updateParams.push(normalizedRemoteJid);
        }
        
        // Only set status to waiting if not already attended/active
        updateFields.push("status = CASE WHEN status IN ('attended', 'active') THEN status ELSE 'waiting' END");
        
        updateParams.push(conversationId);
        
        await connection.query(
          `UPDATE conversations SET ${updateFields.join(', ')} WHERE id = ?`,
          updateParams
        );
        
        logger.info('Conversation updated', { tenantId, conversationId, phoneNumber: normalizedPhone, contactName: finalContactName });
      }

      connection.release();
      
      // If this is a new conversation, emit a special event for first message visibility
      if (isNewConversation) {
        // This will be handled by the calling method to emit appropriate alerts
        logger.info('New conversation created - first message will be visible to all store users', { 
          tenantId, 
          conversationId, 
          phoneNumber: normalizedPhone 
        });
      }
      
      return conversationId;
    } catch (error) {
      if (connection) connection.release();
      logger.error('Error getting/creating conversation', { 
        tenantId, 
        phoneNumber,
        remoteJid,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Extract message data from Baileys message object
   * @param {Object} message - WhatsApp message
   * @returns {Object} Extracted data
   */
  extractMessageData(message) {
    const msg = message.message;
    const messageData = {
      text: null,
      mediaUrl: null,
      mediaType: null,
      mediaMimetype: null,
      mediaSize: null,
      caption: null
    };

    if (!msg) return messageData;

    // Text message
    if (msg.conversation) {
      messageData.text = msg.conversation;
    } else if (msg.extendedTextMessage) {
      messageData.text = msg.extendedTextMessage.text;
    }

    // Image message
    if (msg.imageMessage) {
      messageData.mediaType = 'image';
      messageData.caption = msg.imageMessage.caption;
      messageData.mediaMimetype = msg.imageMessage.mimetype;
    }

    // Video message
    if (msg.videoMessage) {
      messageData.mediaType = 'video';
      messageData.caption = msg.videoMessage.caption;
      messageData.mediaMimetype = msg.videoMessage.mimetype;
    }

    // Audio message
    if (msg.audioMessage) {
      messageData.mediaType = 'audio';
      messageData.mediaMimetype = msg.audioMessage.mimetype;
    }

    // Document message
    if (msg.documentMessage) {
      messageData.mediaType = 'document';
      messageData.caption = msg.documentMessage.caption;
      messageData.mediaMimetype = msg.documentMessage.mimetype;
      messageData.text = msg.documentMessage.fileName;
    }

    // Sticker message
    if (msg.stickerMessage) {
      messageData.mediaType = 'sticker';
      messageData.mediaMimetype = msg.stickerMessage.mimetype;
    }

    // Location message
    if (msg.locationMessage) {
      messageData.mediaType = 'location';
      messageData.text = `Location: ${msg.locationMessage.degreesLatitude}, ${msg.locationMessage.degreesLongitude}`;
    }

    // Contact message
    if (msg.contactMessage) {
      messageData.mediaType = 'contact';
      messageData.text = msg.contactMessage.displayName;
    }

    return messageData;
  }

  /**
   * Save outgoing message for tenant
   * @param {number} tenantId - Tenant ID
   * @param {string} phoneNumber - Phone number
   * @param {string} content - Message content
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Saved message
   */
  async saveOutgoingMessage(tenantId, phoneNumber, content, options = {}) {
    const { pool } = require('../../config/database');
    let connection;
    
    try {
      connection = await pool.getConnection();
      
      // Verify tenant exists
      const [tenants] = await connection.query(
        'SELECT id FROM tenants WHERE id = ?',
        [tenantId]
      );
      
      if (tenants.length === 0) {
        connection.release();
        throw new Error(`Tenant ${tenantId} not found`);
      }
      
      // Normalize phoneNumber to remoteJid format
      let remoteJid = phoneNumber;
      if (remoteJid && !remoteJid.includes('@')) {
        remoteJid = `${remoteJid}@lid`;
      } else if (remoteJid && remoteJid.includes('@s.whatsapp.net')) {
        const number = remoteJid.split('@')[0];
        remoteJid = `${number}@lid`;
      }
      
      // CRITICAL FIX: Get contact name from conversation or use phone number
      let contactName = options.contactName;
      if (!contactName || contactName === 'Unknown' || contactName.trim() === '') {
        // Try to get from existing conversation
        const [existingConv] = await connection.query(
          'SELECT contact_name FROM conversations WHERE tenant_id = ? AND (remote_jid = ? OR phone_number = ?) LIMIT 1',
          [tenantId, remoteJid, remoteJid.split('@')[0]]
        );
        
        if (existingConv.length > 0 && existingConv[0].contact_name) {
          contactName = existingConv[0].contact_name;
        } else {
          contactName = remoteJid.split('@')[0]; // Use phone number as fallback
        }
      }
      
      // Get or create conversation with normalized remoteJid
      const conversationId = await this.getOrCreateConversation(
        tenantId, 
        remoteJid.split('@')[0], // phoneNumber without @
        contactName, 
        content,
        remoteJid // Pass the normalized remoteJid
      );
      if (!conversationId) {
        return;
      }

      const whatsappMessageId = options.whatsappMessageId || `msg_${Date.now()}`;
      const messageType = options.messageType || 'text';
      const contentValue = content || options.caption || null;
      const metadata = options.metadata ? JSON.stringify(options.metadata) : null;
      const isBotMessage = options.isBotMessage || options.metadata?.ai_generated || false;

      const [existing] = await connection.query(
        'SELECT id FROM whatsapp_messages WHERE tenant_id = ? AND whatsapp_message_id = ? LIMIT 1',
        [tenantId, whatsappMessageId]
      );
      if (!existing.length) {
        await connection.query(
          `INSERT INTO whatsapp_messages 
           (tenant_id, connection_id, phone_number, contact_name, message_type, content, media_url, media_mimetype, media_size, caption, direction, status, whatsapp_message_id, conversation_id, metadata, sender_user_id, sender_name, sender_store, sender_department, is_bot_message, bot_persona_name)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'outgoing', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            tenantId,
            null,
            phoneNumber,
            contactName || null,
            messageType,
            contentValue,
            options.mediaUrl || null,
            options.mediaMimetype || null,
            options.mediaSize || null,
            options.caption || null,
            options.status || 'sent',
            whatsappMessageId,
            conversationId,
            metadata,
            options.senderUserId || null,
            options.senderName || null,
            options.senderStore || null,
            options.senderDepartment || null,
            isBotMessage,
            options.botPersonaName || null
          ]
        );
      }

      const savedMessage = {
        id: whatsappMessageId,
        conversation_id: conversationId
      };

      // Update contact
      await WhatsAppContact.upsert(tenantId, {
        phone_number: phoneNumber,
        last_message_at: new Date()
      });

      await WhatsAppContact.incrementMessageCount(tenantId, phoneNumber);

      // Emit to tenant namespace - CRITICAL FIX: Use correct namespace
      const tenantNamespace = this.io.of(`/tenant/${tenantId}`);
      tenantNamespace.emit('message-sent', {
        tenantId,
        messageId: savedMessage.id,
        conversationId: conversationId,
        phoneNumber,
        content,
        timestamp: new Date(),
        direction: 'outgoing'
      });
      
      logger.info('Socket event emitted', { 
        tenantId, 
        event: 'message-sent', 
        conversationId,
        messageId: savedMessage.id 
      });

      logger.info('Outgoing message processed for tenant', {
        tenantId,
        messageId: savedMessage.id,
        phoneNumber
      });

      connection.release();
      return savedMessage;
    } catch (error) {
      if (connection) connection.release();
      logger.error('Error processing outgoing message for tenant', {
        tenantId,
        phoneNumber,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Update message status
   * @param {number} tenantId - Tenant ID
   * @param {string} whatsappMessageId - WhatsApp message ID
   * @param {string} status - New status
   */
  async updateMessageStatus(tenantId, whatsappMessageId, status) {
    logger.info('Message status received for tenant', {
      tenantId,
      whatsappMessageId,
      status
    });
  }

  /**
   * Get message type from content
   * @param {Object} message - WhatsApp message
   * @returns {string} Message type
   */
  getMessageType(message) {
    const msg = message.message;
    if (!msg) return 'text';

    if (msg.imageMessage) return 'image';
    if (msg.videoMessage) return 'video';
    if (msg.audioMessage) return 'audio';
    if (msg.documentMessage) return 'document';
    if (msg.stickerMessage) return 'sticker';
    if (msg.locationMessage) return 'location';
    if (msg.contactMessage) return 'contact';

    return 'text';
  }

  /**
   * Get message content
   * @param {Object} message - WhatsApp message
   * @returns {string|null} Message content
   */
  getMessageContent(message) {
    const msg = message.message;
    if (!msg) return null;

    if (msg.conversation) return msg.conversation;
    if (msg.extendedTextMessage) return msg.extendedTextMessage.text;
    if (msg.imageMessage?.caption) return msg.imageMessage.caption;
    if (msg.videoMessage?.caption) return msg.videoMessage.caption;
    if (msg.documentMessage?.caption) return msg.documentMessage.caption;

    return null;
  }
}

module.exports = WhatsAppMessageHandler;
