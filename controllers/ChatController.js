/**
 * Chat Controller
 * 
 * Handles conversations and messages for tenant
 * Adapted for multi-tenant SaaS
 * 
 * Features:
 * - Exclusive conversation claiming by users
 * - Transfer to store/department
 * - Sender info (user name + store/department) in messages
 * - Tenant admin view-only mode
 * 
 * @module controllers/ChatController
 */

const BaseController = require('./BaseController');
const { pool } = require('../config/database');
const { logger } = require('../config/logger');
const BillingService = require('../services/BillingService');

class ChatController extends BaseController {
  /**
   * Get all conversations for user (filtered by claim status and store/department)
   * GET /api/user/conversations
   * 
   * Rules:
   * - New messages visible to all store users
   * - Department users only see transferred conversations
   * - Claimed conversations only visible to the user who claimed them
   */
  static async getConversations(req, res) {
    const connection = await pool.getConnection();

    try {
      const tenantId = req.user.tenantId;
      const userId = req.user.id;
      const userRole = req.user.role;
      const userStore = req.user.store;
      const userDepartment = req.user.department;
      const { page = 1, limit = 20, status, search } = req.query;
      const offset = (page - 1) * limit;

      let query = `
        SELECT 
          c.*,
          c.contact_name,
          c.phone_number,
          (SELECT COUNT(*) FROM whatsapp_messages m WHERE m.conversation_id = c.id) as message_count,
          (SELECT COUNT(*) FROM whatsapp_messages m WHERE m.conversation_id = c.id AND m.status != 'read' AND m.direction = 'incoming') as unread_count,
          c.last_message,
          c.last_message_time as last_message_at,
          u.name as claimed_by_name,
          u.store as claimed_by_store,
          u.department as claimed_by_department
        FROM conversations c
        LEFT JOIN users u ON c.claimed_by_user_id = u.id
        WHERE c.tenant_id = ?
      `;
      const params = [tenantId];

      // Apply visibility rules based on user role
      if (userRole !== 'admin') {
        // For store users: see unclaimed conversations OR conversations claimed by them OR transferred to their store
        // For department users: only see conversations transferred to their department OR claimed by them
        if (userDepartment) {
          // Department user - only see transferred to their department or claimed by them
          query += ` AND (
            c.claimed_by_user_id = ? 
            OR c.transferred_to_department = ?
          )`;
          params.push(userId, userDepartment);
        } else if (userStore) {
          // Store user - see unclaimed, claimed by them, or transferred to their store
          query += ` AND (
            (c.is_claimed = FALSE AND c.transferred_to_department IS NULL)
            OR c.claimed_by_user_id = ?
            OR c.transferred_to_store = ?
          )`;
          params.push(userId, userStore);
        } else {
          // User without store/department - only see unclaimed or claimed by them
          query += ` AND (c.is_claimed = FALSE OR c.claimed_by_user_id = ?)`;
          params.push(userId);
        }
      }

      if (status) {
        query += ' AND c.status = ?';
        params.push(status);
      }

      if (search) {
        query += ' AND (c.contact_name LIKE ? OR c.phone_number LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
      }

      query += ' ORDER BY c.updated_at DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit), offset);

      const [conversations] = await connection.query(query, params);

      // Get total count with same filters
      let countQuery = `
        SELECT COUNT(*) as total FROM conversations c
        WHERE c.tenant_id = ?
      `;
      const countParams = [tenantId];

      if (userRole !== 'admin') {
        if (userDepartment) {
          countQuery += ` AND (c.claimed_by_user_id = ? OR c.transferred_to_department = ?)`;
          countParams.push(userId, userDepartment);
        } else if (userStore) {
          countQuery += ` AND ((c.is_claimed = FALSE AND c.transferred_to_department IS NULL) OR c.claimed_by_user_id = ? OR c.transferred_to_store = ?)`;
          countParams.push(userId, userStore);
        } else {
          countQuery += ` AND (c.is_claimed = FALSE OR c.claimed_by_user_id = ?)`;
          countParams.push(userId);
        }
      }

      if (status) {
        countQuery += ' AND c.status = ?';
        countParams.push(status);
      }

      if (search) {
        countQuery += ' AND (c.contact_name LIKE ? OR c.phone_number LIKE ?)';
        countParams.push(`%${search}%`, `%${search}%`);
      }

      const [countResult] = await connection.query(countQuery, countParams);

      res.json({
        success: true,
        data: conversations,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: countResult[0].total,
          pages: Math.ceil(countResult[0].total / limit)
        }
      });
    } catch (error) {
      logger.error('Error getting conversations:', error);
      res.status(500).json({
        success: false,
        message: req.t('errors.internal_server_error'),
        error: error.message
      });
    } finally {
      connection.release();
    }
  }

  /**
   * Claim a conversation for exclusive attendance
   * POST /api/user/conversations/:id/claim
   */
  static async claimConversation(req, res) {
    const connection = await pool.getConnection();

    try {
      const tenantId = req.user.tenantId;
      const userId = req.user.id;
      const userRole = req.user.role;
      const { id } = req.params;

      // Tenant admin cannot claim conversations
      if (userRole === 'admin' && !req.user.store && !req.user.department) {
        return res.status(403).json({
          success: false,
          message: req.t('chat.admin_cannot_claim')
        });
      }

      // Check if conversation exists and belongs to tenant
      const [conversations] = await connection.query(
        'SELECT * FROM conversations WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (!conversations.length) {
        return res.status(404).json({
          success: false,
          message: req.t('errors.conversation_not_found')
        });
      }

      const conversation = conversations[0];

      // Check if already claimed by another user
      if (conversation.is_claimed && conversation.claimed_by_user_id !== userId) {
        return res.status(403).json({
          success: false,
          message: req.t('chat.conversation_already_claimed')
        });
      }

      // Claim the conversation
      await connection.query(`
        UPDATE conversations 
        SET claimed_by_user_id = ?, 
            claimed_at = NOW(), 
            is_claimed = TRUE,
            status = 'attended',
            updated_at = NOW()
        WHERE id = ? AND tenant_id = ?
      `, [userId, id, tenantId]);

      // Get user's store for the alert
      const userStore = req.user.store;

      // Emit socket event for real-time update
      const io = req.app.get('io');
      if (io) {
        const tenantNamespace = io.of(`/tenant/${tenantId}`);
        
        // Emit conversation claimed event
        tenantNamespace.emit('conversation-claimed', {
          conversationId: id,
          claimedByUserId: userId,
          claimedByName: req.user.name,
          claimedByStore: userStore
        });

        // Emit alert to all users about the conversation being attended
        if (userStore) {
          tenantNamespace.emit('conversation-attended-alert', {
            conversationId: id,
            store: userStore,
            message: req.t('chat.message_attended_by_store', { store: userStore })
          });
        }
      }

      logger.info(`Conversation ${id} claimed by user ${userId} for tenant ${tenantId}`);

      res.json({
        success: true,
        message: req.t('chat.conversation_claimed')
      });
    } catch (error) {
      logger.error('Error claiming conversation:', error);
      res.status(500).json({
        success: false,
        message: req.t('errors.internal_server_error'),
        error: error.message
      });
    } finally {
      connection.release();
    }
  }

  /**
   * Release a claimed conversation
   * POST /api/user/conversations/:id/release
   */
  static async releaseConversation(req, res) {
    const connection = await pool.getConnection();

    try {
      const tenantId = req.user.tenantId;
      const userId = req.user.id;
      const { id } = req.params;

      // Check if conversation exists
      const [conversations] = await connection.query(
        'SELECT * FROM conversations WHERE id = ? AND tenant_id = ? LIMIT 1',
        [id, tenantId]
      );

      if (!conversations.length) {
        return res.status(404).json({
          success: false,
          message: req.t('errors.conversation_not_found_or_not_claimed')
        });
      }

      const conversation = conversations[0];
      if (conversation.claimed_by_user_id && conversation.claimed_by_user_id !== userId) {
        return res.status(403).json({
          success: false,
          message: req.t('chat.conversation_claimed_by_other')
        });
      }

      // Release the conversation
      await connection.query(`
        UPDATE conversations 
        SET claimed_by_user_id = NULL, 
            claimed_at = NULL, 
            is_claimed = FALSE,
            status = 'waiting',
            updated_at = NOW()
        WHERE id = ? AND tenant_id = ?
      `, [id, tenantId]);

      // Emit socket event for real-time update
      const io = req.app.get('io');
      if (io) {
        const tenantNamespace = io.of(`/tenant/${tenantId}`);
        tenantNamespace.emit('conversation-released', {
          conversationId: id
        });
      }

      logger.info(`Conversation ${id} released by user ${userId} for tenant ${tenantId}`);

      res.json({
        success: true,
        message: req.t('chat.conversation_released')
      });
    } catch (error) {
      logger.error('Error releasing conversation:', error);
      res.status(500).json({
        success: false,
        message: req.t('errors.internal_server_error'),
        error: error.message
      });
    } finally {
      connection.release();
    }
  }

  /**
   * Get conversation details with messages
   * GET /api/tenant/conversations/:id
   */
  static async getConversation(req, res) {
    const connection = await pool.getConnection();

    try {
      const tenantId = req.user.tenantId;
      const { id } = req.params;
      const { page = 1, limit = 50 } = req.query;
      const offset = (page - 1) * limit;

      // Get conversation
      const [conversations] = await connection.query(`
        SELECT 
          c.*,
          c.contact_name,
          c.phone_number
        FROM conversations c
        LEFT JOIN contacts co ON c.contact_id = co.id
        WHERE c.id = ? AND c.tenant_id = ?
      `, [id, tenantId]);

      if (!conversations.length) {
        return res.status(404).json({
          success: false,
          message: req.t('errors.conversation_not_found')
        });
      }

      // Get messages
      const [messages] = await connection.query(`
        SELECT * FROM whatsapp_messages
        WHERE conversation_id = ? AND tenant_id = ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `, [id, tenantId, parseInt(limit), offset]);

      // Get total message count
      const [countResult] = await connection.query(
        'SELECT COUNT(*) as total FROM whatsapp_messages WHERE conversation_id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      // Mark messages as read
      await connection.query(`
        UPDATE whatsapp_messages 
        SET status = 'read' 
        WHERE conversation_id = ? AND tenant_id = ? AND direction = 'incoming' AND status != 'read'
      `, [id, tenantId]);

      res.json({
        success: true,
        data: {
          conversation: conversations[0],
          messages: messages.reverse(), // Reverse to show oldest first
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: countResult[0].total,
            pages: Math.ceil(countResult[0].total / limit)
          }
        }
      });
    } catch (error) {
      logger.error('Error getting conversation:', error);
      res.status(500).json({
        success: false,
        message: req.t('errors.internal_server_error'),
        error: error.message
      });
    } finally {
      connection.release();
    }
  }

  /**
   * Send message in conversation
   * POST /api/user/conversations/:id/messages
   * 
   * Rules:
   * - Tenant admin CANNOT send messages (view-only)
   * - User must have claimed the conversation OR it must be unclaimed
   * - Message includes sender info: *UserName - Store/Department*
   */
  static async sendMessage(req, res) {
    const connection = await pool.getConnection();

    try {
      const tenantId = req.user.tenantId;
      const userId = req.user.id;
      const userName = req.user.name || req.user.username;
      const userStore = req.user.store;
      const userDepartment = req.user.department;
      const userRole = req.user.role;
      const { id } = req.params;
      const { message, media_url, media_type } = req.body;

      // Block tenant admin from sending messages
      if (userRole === 'admin' && !userStore && !userDepartment) {
        return res.status(403).json({
          success: false,
          message: req.t('chat.admin_cannot_send_messages')
        });
      }

      if (!message && !media_url) {
        return res.status(400).json({
          success: false,
          message: req.t('validation.message_required')
        });
      }

      // Check usage limits
      const withinLimits = await BillingService.checkUsageLimits(tenantId);
      if (!withinLimits) {
        return res.status(403).json({
          success: false,
          message: req.t('billing.usage_limit_exceeded')
        });
      }

      let conversationId = id;
      let conversation = null;
      if (String(id).includes('@')) {
        const rawJid = String(id);
        let numberPart = rawJid.split('@')[0] || '';
        if (numberPart.includes(':')) {
          numberPart = numberPart.split(':')[0];
        }
        let normalizedPhone = numberPart.replace(/^\+/, '');
        let normalizedRemoteJid = rawJid;
        if (normalizedRemoteJid.includes(':')) {
          const parts = normalizedRemoteJid.split('@');
          if (parts.length === 2) {
            const num = parts[0].split(':')[0];
            normalizedRemoteJid = `${num}@${parts[1]}`;
          }
        }
        const lidJid = normalizedPhone ? `${normalizedPhone}@lid` : normalizedRemoteJid;
        const waJid = normalizedPhone ? `${normalizedPhone}@s.whatsapp.net` : normalizedRemoteJid;
        const phoneLike = normalizedPhone ? `%${normalizedPhone.slice(-10)}` : normalizedRemoteJid;
        const [existing] = await connection.query(
          `SELECT * FROM conversations 
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
          [tenantId, normalizedRemoteJid, lidJid, waJid, normalizedPhone, `+${normalizedPhone}`, phoneLike]
        );
        if (existing.length) {
          conversation = existing[0];
          conversationId = conversation.id;
        } else if (normalizedPhone) {
          const [insertResult] = await connection.query(
            'INSERT INTO conversations (tenant_id, phone_number, remote_jid, contact_name, last_message, last_message_time, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), ?, NOW(), NOW())',
            [tenantId, normalizedPhone, normalizedRemoteJid, normalizedPhone, message || '[Media]', 'waiting']
          );
          conversationId = insertResult.insertId;
          const [created] = await connection.query(
            'SELECT * FROM conversations WHERE id = ? AND tenant_id = ?',
            [conversationId, tenantId]
          );
          conversation = created[0] || null;
        }
      }

      if (!conversation) {
        const [conversations] = await connection.query(
          'SELECT * FROM conversations WHERE id = ? AND tenant_id = ?',
          [conversationId, tenantId]
        );
        if (!conversations.length) {
          return res.status(404).json({
            success: false,
            message: req.t('errors.conversation_not_found')
          });
        }
        conversation = conversations[0];
      }

      // High-level compliance: only reply within recent window and require prior incoming message
      try {
        const [incomingRows] = await connection.query(
          `SELECT created_at 
           FROM whatsapp_messages 
           WHERE conversation_id = ? AND tenant_id = ? AND direction = 'incoming' 
           ORDER BY created_at DESC 
           LIMIT 1`,
          [conversationId, tenantId]
        );
        const lastIncomingAt = incomingRows?.[0]?.created_at ? new Date(incomingRows[0].created_at).getTime() : null;
        const nowTs = Date.now();
        const windowMs = 24 * 60 * 60 * 1000; // 24h window
        if (!lastIncomingAt || (nowTs - lastIncomingAt) > windowMs) {
          const policyMessage = await req.t('whatsapp.errors.customer_care_expired', 'Customer care window expired. Use an approved template.');
          return res.status(403).json({
            success: false,
            message: policyMessage,
            error: 'WhatsApp policy window exceeded'
          });
        }
      } catch (policyErr) {
        logger.warn('Window/opt-in check failed', { error: policyErr.message });
      }

      // Check if user can send message (must be claimed by them or unclaimed)
      if (conversation.is_claimed && conversation.claimed_by_user_id !== userId) {
        return res.status(403).json({
          success: false,
          message: req.t('chat.conversation_claimed_by_other')
        });
      }

      // Content safety: limit links and payload size
      if (message) {
        const urlCount = (message.match(/https?:\/\/|wa\.me\//gi) || []).length;
        if (urlCount > 1) {
          const tooManyLinksMessage = await req.t('validation.too_many_links', 'Message contains too many links.');
          return res.status(403).json({
            success: false,
            message: tooManyLinksMessage,
            error: 'Too many links'
          });
        }
        if (message.length > 1000) {
          const tooLongMessage = await req.t('validation.message_too_long', 'Message is too long.');
          return res.status(403).json({
            success: false,
            message: tooLongMessage,
            error: 'Message too long'
          });
        }
      }

      // Auto-claim if not claimed
      if (!conversation.is_claimed) {
        await connection.query(`
          UPDATE conversations 
          SET claimed_by_user_id = ?, 
              claimed_at = NOW(), 
              is_claimed = TRUE,
              status = 'attended',
              updated_at = NOW()
          WHERE id = ? AND tenant_id = ?
        `, [userId, conversationId, tenantId]);

        // Get user's store for the alert
        const userStore = req.user.store;

        // Emit claim event
        const io = req.app.get('io');
        if (io) {
          const tenantNamespace = io.of(`/tenant/${tenantId}`);
          
          // Emit conversation claimed event
          tenantNamespace.emit('conversation-claimed', {
            conversationId: id,
            claimedByUserId: userId,
            claimedByName: userName,
            claimedByStore: userStore
          });

          // Emit alert to all users about the conversation being attended
          if (userStore) {
            tenantNamespace.emit('conversation-attended-alert', {
              conversationId: id,
              store: userStore,
              message: req.t('chat.message_attended_by_store', { store: userStore })
            });
          }
        }
      }
      
      // Build sender label: *UserName - Store/Department*
      const senderLocation = userStore || userDepartment || 'Support';
      const senderLabel = `*${userName} - ${senderLocation}*`;
      
      // Prepend sender label to message
      const messageWithSender = message ? `${senderLabel}\n${message}` : message;

      // CRITICAL FIX: Use remote_jid from conversation (most reliable)
      let remoteJid = conversation.remote_jid;
      
      // Fallback to phone_number if remote_jid is not set
      if (!remoteJid) {
        const phoneNumber = conversation.phone_number;
        remoteJid = phoneNumber.includes('@') ? phoneNumber : `${phoneNumber}@s.whatsapp.net`;
      }
      
      const contactName = conversation.contact_name || conversation.phone_number;

      logger.info(`Sending message in conversation ${conversationId}`, { 
        tenantId, 
        remoteJid, 
        phoneNumber: conversation.phone_number,
        contactName,
        senderUserId: userId,
        senderName: userName,
        senderStore: userStore,
        senderDepartment: userDepartment
      });

      // Send via WhatsApp
      const { getWhatsAppService } = require('../services/WhatsAppService');
      const whatsappService = getWhatsAppService(req.app.get('io'));

      // Check if WhatsApp is initialized, if not, try to initialize it
      let instance = whatsappService.getInstance(tenantId);
      if (!instance) {
        logger.info(`WhatsApp not initialized for tenant ${tenantId}, initializing...`);
        try {
          await whatsappService.initializeTenant(tenantId);
          instance = whatsappService.getInstance(tenantId);
        } catch (initError) {
          logger.error(`Failed to initialize WhatsApp for tenant ${tenantId}:`, initError);
          return res.status(500).json({
            success: false,
            message: req.t('errors.message_send_failed'),
            error: 'WhatsApp not initialized. Please connect WhatsApp first.'
          });
        }
      }

      const waitFor = async (condition, timeoutMs, intervalMs) => {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
          try {
            if (await condition()) return true;
          } catch (_) {}
          await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
        return false;
      };
      const connectedReady = await waitFor(() => {
        const inst = whatsappService.getInstance(tenantId);
        return !!(inst && inst.connection && inst.connection.isConnected(tenantId));
      }, 10000, 300);
      if (!connectedReady) {
        return res.status(409).json({
          success: false,
          message: req.t('errors.message_send_failed'),
          error: 'WhatsApp not connected'
        });
      }

      let result;
      if (media_url) {
        result = await whatsappService.sendMediaMessage(
          tenantId,
          remoteJid,
          media_url,
          messageWithSender || '',
          conversationId
        );
      } else {
        result = await whatsappService.sendMessage(
          tenantId,
          remoteJid,
          messageWithSender,
          conversationId
        );
      }

      if (!result.success) {
        return res.status(500).json({
          success: false,
          message: req.t('errors.message_send_failed'),
          error: result.error
        });
      }

      // Update the saved message with sender info and WhatsApp message ID
      const [lastMessage] = await connection.query(
        `SELECT id FROM whatsapp_messages 
         WHERE tenant_id = ? AND conversation_id = ? AND direction = 'outgoing' 
         ORDER BY created_at DESC LIMIT 1`,
        [tenantId, conversationId]
      );

      if (lastMessage.length > 0) {
        // CRITICAL FIX: Also save whatsapp_message_id for edit/delete support
        await connection.query(`
          UPDATE whatsapp_messages 
          SET sender_user_id = ?,
              sender_name = ?,
              sender_store = ?,
              sender_department = ?,
              is_bot_message = FALSE,
              whatsapp_message_id = COALESCE(whatsapp_message_id, ?)
          WHERE id = ?
        `, [userId, userName, userStore, userDepartment, result.whatsappMessageId || null, lastMessage[0].id]);
      }

      // Update conversation
      await connection.query(
        'UPDATE conversations SET last_message = ?, last_message_time = NOW(), updated_at = NOW() WHERE id = ?',
        [message || '[Media]', conversationId]
      );

      // CRITICAL FIX: Emit to correct tenant namespace
      const io = req.app.get('io');
      if (io) {
        const tenantNamespace = io.of(`/tenant/${tenantId}`);
        tenantNamespace.emit('message-sent', {
          conversationId: conversationId,
          messageId: lastMessage[0]?.id,
          message: message || '[Media]',
          senderUserId: userId,
          senderName: userName,
          senderStore: userStore,
          senderDepartment: userDepartment,
          timestamp: new Date()
        });
        
        // Also emit new-message for real-time updates
        tenantNamespace.emit('new-message', {
          conversationId: conversationId,
          messageId: lastMessage[0]?.id,
          direction: 'outgoing',
          content: message || '[Media]',
          senderUserId: userId,
          senderName: userName,
          senderStore: userStore,
          senderDepartment: userDepartment,
          timestamp: new Date()
        });
        
        logger.info('Socket events emitted', { tenantId, conversationId: conversationId, messageId: lastMessage[0]?.id });
      }

      logger.info(`Message sent in conversation ${conversationId} for tenant ${tenantId}`);

      res.json({
        success: true,
        message: req.t('chat.message_sent'),
        data: {
          id: lastMessage[0]?.id,
          senderName: userName,
          senderStore: userStore,
          senderDepartment: userDepartment
        }
      });
    } catch (error) {
      logger.error('Error sending message:', error);
      res.status(500).json({
        success: false,
        message: req.t('errors.internal_server_error'),
        error: error.message
      });
    } finally {
      connection.release();
    }
  }

  /**
   * Update conversation status
   * PUT /api/tenant/conversations/:id/status
   */
  static async updateStatus(req, res) {
    const connection = await pool.getConnection();

    try {
      const tenantId = req.user.tenantId;
      const { id } = req.params;
      const { status } = req.body;

      if (!['active', 'archived', 'closed'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: req.t('validation.invalid_status')
        });
      }

      await connection.query(
        'UPDATE conversations SET status = ?, updated_at = NOW() WHERE id = ? AND tenant_id = ?',
        [status, id, tenantId]
      );

      logger.info(`Conversation ${id} status updated to ${status} for tenant ${tenantId}`);

      res.json({
        success: true,
        message: req.t('chat.status_updated')
      });
    } catch (error) {
      logger.error('Error updating conversation status:', error);
      res.status(500).json({
        success: false,
        message: req.t('errors.internal_server_error'),
        error: error.message
      });
    } finally {
      connection.release();
    }
  }

  /**
   * Delete conversation
   * DELETE /api/tenant/conversations/:id
   */
  static async deleteConversation(req, res) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const tenantId = req.user.tenantId;
      const { id } = req.params;

      // Delete messages first
      await connection.query(
        'DELETE FROM whatsapp_messages WHERE conversation_id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      // Delete conversation
      await connection.query(
        'DELETE FROM conversations WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      await connection.commit();

      logger.info(`Conversation ${id} deleted for tenant ${tenantId}`);

      res.json({
        success: true,
        message: req.t('chat.conversation_deleted')
      });
    } catch (error) {
      await connection.rollback();
      logger.error('Error deleting conversation:', error);
      res.status(500).json({
        success: false,
        message: req.t('errors.internal_server_error'),
        error: error.message
      });
    } finally {
      connection.release();
    }
  }

  /**
   * Mark messages as read
   * PUT /api/tenant/conversations/:id/read
   */
  static async markAsRead(req, res) {
    const connection = await pool.getConnection();

    try {
      const tenantId = req.user.tenantId;
      const { id } = req.params;

      await connection.query(`
        UPDATE whatsapp_messages 
        SET status = 'read' 
        WHERE conversation_id = ? AND tenant_id = ? AND direction = 'incoming'
      `, [id, tenantId]);

      res.json({
        success: true,
        message: req.t('chat.marked_as_read')
      });
    } catch (error) {
      logger.error('Error marking as read:', error);
      res.status(500).json({
        success: false,
        message: req.t('errors.internal_server_error'),
        error: error.message
      });
    } finally {
      connection.release();
    }
  }

  /**
   * Get messages for a conversation
   * GET /api/user/conversations/:id/messages
   * 
   * Returns messages with sender info (user name + store/department or bot persona)
   */
  static async getMessages(req, res) {
    const connection = await pool.getConnection();

    try {
      logger.info('getMessages called for conversation:', req.params.id);
      const tenantId = req.user.tenantId;
      const userId = req.user.id;
      const { id } = req.params;
      const { page = 1, limit = 50 } = req.query;
      const offset = (page - 1) * limit;

      // Verify conversation belongs to tenant
      const [conversations] = await connection.query(
        'SELECT id FROM conversations WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (!conversations.length) {
        return res.status(404).json({
          success: false,
          message: req.t('errors.conversation_not_found')
        });
      }

      // Get messages with sender info, filtering out messages deleted for this user
      // Note: Simplified query for MariaDB compatibility
      const [messages] = await connection.query(`
        SELECT 
          id,
          conversation_id,
          phone_number,
          contact_name,
          content as message_text,
          content as body,
          original_content,
          media_url,
          message_type,
          direction,
          status,
          CASE WHEN direction = 'outgoing' THEN 1 ELSE 0 END as is_from_me,
          sender_user_id,
          sender_name,
          sender_store,
          sender_department,
          is_bot_message,
          bot_persona_name,
          is_edited,
          edited_at,
          is_deleted,
          deleted_for_everyone,
          deleted_for_user_ids,
          whatsapp_message_id,
          created_at
        FROM whatsapp_messages
        WHERE conversation_id = ? AND tenant_id = ?
          AND (deleted_for_user_ids IS NULL 
               OR deleted_for_user_ids = '' 
               OR deleted_for_user_ids = '[]'
               OR LOCATE(CONCAT('"', ?, '"'), deleted_for_user_ids) = 0)
        ORDER BY created_at ASC
        LIMIT ? OFFSET ?
      `, [id, tenantId, userId, parseInt(limit), offset]);

      // Get total count
      const [countResult] = await connection.query(
        'SELECT COUNT(*) as total FROM whatsapp_messages WHERE conversation_id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      res.json({
        success: true,
        data: messages,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: countResult[0].total,
          pages: Math.ceil(countResult[0].total / limit)
        }
      });
    } catch (error) {
      logger.error('Error getting messages:', error);
      res.status(500).json({
        success: false,
        message: req.t('errors.internal_server_error'),
        error: error.message
      });
    } finally {
      connection.release();
    }
  }

  /**
   * Transfer conversation to store or department
   * POST /api/user/conversations/:id/transfer
   * 
   * Rules:
   * - Only the user who claimed the conversation can transfer it
   * - Transfer releases the claim and assigns to store/department
   */
  static async transferConversation(req, res) {
    const connection = await pool.getConnection();

    try {
      const tenantId = req.user.tenantId;
      const userId = req.user.id;
      const { id } = req.params;
      const { targetStore, targetDepartment } = req.body;

      if (!targetStore && !targetDepartment) {
        return res.status(400).json({
          success: false,
          message: req.t('chat.transfer_target_required')
        });
      }

      // Verify conversation belongs to tenant and is claimed by this user
      const [conversations] = await connection.query(
        'SELECT * FROM conversations WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (!conversations.length) {
        return res.status(404).json({
          success: false,
          message: req.t('errors.conversation_not_found')
        });
      }

      const conversation = conversations[0];

      // Check if user can transfer (must be claimed by them or be admin)
      if (conversation.is_claimed && conversation.claimed_by_user_id !== userId && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: req.t('chat.cannot_transfer_not_owner')
        });
      }

      // Update conversation - release claim and set transfer target
      if (targetDepartment) {
        await connection.query(`
          UPDATE conversations 
          SET claimed_by_user_id = NULL,
              claimed_at = NULL,
              is_claimed = FALSE,
              transferred_to_store = NULL,
              transferred_to_department = ?,
              transferred_at = NOW(),
              status = 'waiting',
              updated_at = NOW()
          WHERE id = ? AND tenant_id = ?
        `, [targetDepartment, id, tenantId]);
      } else if (targetStore) {
        await connection.query(`
          UPDATE conversations 
          SET claimed_by_user_id = NULL,
              claimed_at = NULL,
              is_claimed = FALSE,
              transferred_to_store = ?,
              transferred_to_department = NULL,
              transferred_at = NOW(),
              status = 'waiting',
              updated_at = NOW()
          WHERE id = ? AND tenant_id = ?
        `, [targetStore, id, tenantId]);
      }

      // Emit socket event for real-time update
      const io = req.app.get('io');
      if (io) {
        const tenantNamespace = io.of(`/tenant/${tenantId}`);
        
        // Emit general transfer event
        tenantNamespace.emit('conversation-transferred', {
          conversationId: id,
          targetStore,
          targetDepartment,
          transferredByUserId: userId,
          transferredByName: req.user.name
        });

        // Emit specific alert to users in the target store/department
        if (targetStore) {
          tenantNamespace.emit('conversation-transfer-alert', {
            conversationId: id,
            targetStore,
            transferredByName: req.user.name,
            message: req.t('chat.message_transferred_to_you')
          });
        } else if (targetDepartment) {
          tenantNamespace.emit('conversation-transfer-alert', {
            conversationId: id,
            targetDepartment,
            transferredByName: req.user.name,
            message: req.t('chat.message_transferred_to_you')
          });
        }
      }

      logger.info(`Conversation ${id} transferred to ${targetStore || targetDepartment} for tenant ${tenantId}`);

      res.json({
        success: true,
        message: req.t('chat.conversation_transferred')
      });
    } catch (error) {
      logger.error('Error transferring conversation:', error);
      res.status(500).json({
        success: false,
        message: req.t('errors.internal_server_error'),
        error: error.message
      });
    } finally {
      connection.release();
    }
  }

  /**
   * Edit a message
   * PUT /api/tenant/conversations/:conversationId/messages/:messageId
   * 
   * Rules:
   * - Only the sender can edit their own messages
   * - Only outgoing messages can be edited
   * - Sends edit notification via WhatsApp if supported
   */
  static async editMessage(req, res) {
    const connection = await pool.getConnection();

    try {
      const tenantId = req.user.tenantId;
      const userId = req.user.id;
      const userName = req.user.name || req.user.username;
      const userStore = req.user.store;
      const userDepartment = req.user.department;
      const { conversationId, messageId } = req.params;
      const { newMessage } = req.body;

      if (!newMessage || !newMessage.trim()) {
        return res.status(400).json({
          success: false,
          message: req.t('validation.message_required')
        });
      }

      // Get the message
      const [messages] = await connection.query(
        `SELECT * FROM whatsapp_messages 
         WHERE id = ? AND conversation_id = ? AND tenant_id = ?`,
        [messageId, conversationId, tenantId]
      );

      if (!messages.length) {
        return res.status(404).json({
          success: false,
          message: req.t('errors.message_not_found')
        });
      }

      const message = messages[0];

      // Check if it's an outgoing message
      if (message.direction !== 'outgoing') {
        return res.status(403).json({
          success: false,
          message: req.t('chat.cannot_edit_received_message')
        });
      }

      // Check if user is the sender (or admin)
      if (message.sender_user_id && message.sender_user_id !== userId && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: req.t('chat.cannot_edit_others_message')
        });
      }

      // Get conversation for WhatsApp details
      const [conversations] = await connection.query(
        'SELECT * FROM conversations WHERE id = ? AND tenant_id = ?',
        [conversationId, tenantId]
      );

      if (!conversations.length) {
        return res.status(404).json({
          success: false,
          message: req.t('errors.conversation_not_found')
        });
      }

      const conversation = conversations[0];
      const remoteJid = conversation.remote_jid || `${conversation.phone_number}@s.whatsapp.net`;

      // Build sender label for the edited message (same format as original send)
      const senderLocation = userStore || userDepartment || 'Support';
      const senderLabel = `*${userName} - ${senderLocation}*`;
      const messageWithSender = `${senderLabel}\n${newMessage.trim()}`;

      // Try to edit via WhatsApp (if supported)
      let whatsappEdited = false;
      try {
        const { getWhatsAppService } = require('../services/WhatsAppService');
        const whatsappService = getWhatsAppService(req.app.get('io'));
        const instance = whatsappService.getInstance(tenantId);
        
        if (instance && message.whatsapp_message_id) {
          const sock = instance.connection.getSocket(tenantId);
          const isConnected = instance.connection.isConnected(tenantId);
          
          if (sock && isConnected) {
            // WhatsApp edit message (if supported by baileys)
            await sock.sendMessage(remoteJid, {
              text: messageWithSender,
              edit: { remoteJid, id: message.whatsapp_message_id }
            });
            whatsappEdited = true;
            logger.info(`Message ${messageId} edited on WhatsApp`, { tenantId, whatsappMessageId: message.whatsapp_message_id });
          } else {
            logger.warn('Cannot edit on WhatsApp: not connected', {
              hasSock: !!sock,
              isConnected
            });
          }
        } else {
          logger.warn('Cannot edit on WhatsApp: missing instance or whatsapp_message_id', {
            hasInstance: !!instance,
            whatsappMessageId: message.whatsapp_message_id
          });
        }
      } catch (waError) {
        logger.warn('Could not edit message on WhatsApp:', waError.message);
      }

      // Update message in database with the full message (including sender label)
      await connection.query(`
        UPDATE whatsapp_messages 
        SET content = ?,
            original_content = COALESCE(original_content, content),
            is_edited = TRUE,
            edited_at = NOW(),
            updated_at = NOW()
        WHERE id = ? AND tenant_id = ?
      `, [messageWithSender, messageId, tenantId]);

      // Emit socket event for real-time update
      const io = req.app.get('io');
      if (io) {
        const tenantNamespace = io.of(`/tenant/${tenantId}`);
        tenantNamespace.emit('message-edited', {
          conversationId: parseInt(conversationId),
          messageId: parseInt(messageId),
          newContent: messageWithSender,
          editedAt: new Date(),
          whatsappEdited
        });
      }

      logger.info(`Message ${messageId} edited in conversation ${conversationId} for tenant ${tenantId}`, { whatsappEdited });

      res.json({
        success: true,
        message: req.t('chat.message_edited'),
        data: {
          messageId,
          newContent: messageWithSender,
          whatsappEdited
        }
      });
    } catch (error) {
      logger.error('Error editing message:', error);
      res.status(500).json({
        success: false,
        message: req.t('errors.internal_server_error'),
        error: error.message
      });
    } finally {
      connection.release();
    }
  }

  /**
   * Delete a message
   * DELETE /api/tenant/conversations/:conversationId/messages/:messageId
   * 
   * Query params:
   * - deleteFor: 'me' | 'everyone'
   * 
   * Rules:
   * - 'me': Soft delete for the user only
   * - 'everyone': Delete for all (sends delete notification via WhatsApp)
   * - Only outgoing messages can be deleted for everyone
   */
  static async deleteMessage(req, res) {
    const connection = await pool.getConnection();

    try {
      const tenantId = req.user.tenantId;
      const userId = req.user.id;
      const { conversationId, messageId } = req.params;
      const { deleteFor = 'me' } = req.query;

      // Get the message
      const [messages] = await connection.query(
        `SELECT * FROM whatsapp_messages 
         WHERE id = ? AND conversation_id = ? AND tenant_id = ?`,
        [messageId, conversationId, tenantId]
      );

      if (!messages.length) {
        return res.status(404).json({
          success: false,
          message: req.t('errors.message_not_found')
        });
      }

      const message = messages[0];

      // Get conversation for WhatsApp details
      const [conversations] = await connection.query(
        'SELECT * FROM conversations WHERE id = ? AND tenant_id = ?',
        [conversationId, tenantId]
      );

      if (!conversations.length) {
        return res.status(404).json({
          success: false,
          message: req.t('errors.conversation_not_found')
        });
      }

      const conversation = conversations[0];
      const remoteJid = conversation.remote_jid || `${conversation.phone_number}@s.whatsapp.net`;

      let whatsappDeleted = false;

      if (deleteFor === 'everyone') {
        // Only outgoing messages can be deleted for everyone
        if (message.direction !== 'outgoing') {
          return res.status(403).json({
            success: false,
            message: req.t('chat.cannot_delete_received_for_everyone')
          });
        }

        // Check if user is the sender (or admin)
        if (message.sender_user_id && message.sender_user_id !== userId && req.user.role !== 'admin') {
          return res.status(403).json({
            success: false,
            message: req.t('chat.cannot_delete_others_message')
          });
        }

        // Try to delete via WhatsApp
        try {
          const { getWhatsAppService } = require('../services/WhatsAppService');
          const whatsappService = getWhatsAppService(req.app.get('io'));
          const instance = whatsappService.getInstance(tenantId);
          
          if (instance && message.whatsapp_message_id) {
            const sock = instance.connection.getSocket(tenantId);
            const isConnected = instance.connection.isConnected(tenantId);
            
            if (sock && isConnected) {
              // WhatsApp delete message - use the correct format for baileys
              const deleteKey = {
                remoteJid: remoteJid,
                id: message.whatsapp_message_id,
                fromMe: true
              };
              
              await sock.sendMessage(remoteJid, { delete: deleteKey });
              whatsappDeleted = true;
              logger.info(`Message ${messageId} deleted on WhatsApp`, { 
                tenantId, 
                whatsappMessageId: message.whatsapp_message_id,
                remoteJid 
              });
            } else {
              logger.warn('Cannot delete on WhatsApp: not connected', {
                hasSock: !!sock,
                isConnected
              });
            }
          } else {
            logger.warn('Cannot delete on WhatsApp: missing instance or whatsapp_message_id', {
              hasInstance: !!instance,
              whatsappMessageId: message.whatsapp_message_id
            });
          }
        } catch (waError) {
          logger.warn('Could not delete message on WhatsApp:', waError.message);
        }

        // Mark as deleted for everyone in database
        await connection.query(`
          UPDATE whatsapp_messages 
          SET is_deleted = TRUE,
              deleted_for_everyone = TRUE,
              deleted_at = NOW(),
              deleted_by_user_id = ?,
              content = '[Message deleted]',
              media_url = NULL,
              updated_at = NOW()
          WHERE id = ? AND tenant_id = ?
        `, [userId, messageId, tenantId]);

        // Emit socket event
        const io = req.app.get('io');
        if (io) {
          const tenantNamespace = io.of(`/tenant/${tenantId}`);
          tenantNamespace.emit('message-deleted', {
            conversationId: parseInt(conversationId),
            messageId: parseInt(messageId),
            deleteFor: 'everyone',
            whatsappDeleted
          });
        }

        logger.info(`Message ${messageId} deleted for everyone in conversation ${conversationId} for tenant ${tenantId}`, { whatsappDeleted });

      } else {
        // Delete for me only - add user ID to the deleted_for_user_ids array
        // First check if the column has a valid JSON array, if not initialize it
        const currentDeletedFor = message.deleted_for_user_ids;
        let deletedForArray = [];
        
        try {
          if (currentDeletedFor) {
            deletedForArray = JSON.parse(currentDeletedFor);
          }
        } catch (e) {
          deletedForArray = [];
        }
        
        // Add user ID if not already present
        if (!deletedForArray.includes(userId)) {
          deletedForArray.push(userId);
        }
        
        await connection.query(`
          UPDATE whatsapp_messages 
          SET deleted_for_user_ids = ?,
              updated_at = NOW()
          WHERE id = ? AND tenant_id = ?
        `, [JSON.stringify(deletedForArray), messageId, tenantId]);

        // Emit socket event only to this user
        const io = req.app.get('io');
        if (io) {
          const tenantNamespace = io.of(`/tenant/${tenantId}`);
          tenantNamespace.emit('message-deleted-for-me', {
            conversationId: parseInt(conversationId),
            messageId: parseInt(messageId),
            userId
          });
        }

        logger.info(`Message ${messageId} deleted for user ${userId} in conversation ${conversationId} for tenant ${tenantId}`);
      }

      res.json({
        success: true,
        message: deleteFor === 'everyone' 
          ? req.t('chat.message_deleted_for_everyone')
          : req.t('chat.message_deleted_for_me'),
        data: {
          messageId,
          deleteFor,
          whatsappDeleted
        }
      });
    } catch (error) {
      logger.error('Error deleting message:', error);
      res.status(500).json({
        success: false,
        message: req.t('errors.internal_server_error'),
        error: error.message
      });
    } finally {
      connection.release();
    }
  }
}

module.exports = ChatController;
