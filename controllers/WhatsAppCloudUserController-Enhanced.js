/**
 * WhatsApp Cloud User Controller - Enhanced
 * Handles WhatsApp Cloud conversations for store/department users
 * Includes claim/release system, message management, and pipeline operations
 * 
 * @version 2.0.0
 * @author Misayan Team
 */

const BaseController = require('./BaseController');
const { pool } = require('../config/database');
const { logger } = require('../config/logger');
const axios = require('axios');

class WhatsAppCloudUserController extends BaseController {
  /**
   * Get accounts for current user
   * GET /api/user/whatsapp-cloud/accounts
   */
  static async getAccounts(req, res) {
    try {
      const tenantId = req.tenantId || req.user.tenantId;
      
      const [accounts] = await pool.execute(
        `SELECT id, account_name, phone_number, status, created_at
         FROM whatsapp_cloud_accounts
         WHERE tenant_id = ?
         ORDER BY created_at DESC`,
        [tenantId]
      );
      
      return res.json({
        success: true,
        data: accounts
      });
    } catch (error) {
      logger.error('Error getting accounts', {
        error: error.message,
        stack: error.stack
      });
      
      return res.status(500).json({
        success: false,
        message: 'Failed to load accounts'
      });
    }
  }

  /**
   * Get conversations for current user
   * Only shows unclaimed or user's claimed conversations
   * GET /api/user/whatsapp-cloud/conversations
   */
  static async getConversations(req, res) {
    try {
      const userId = req.user.id;
      const tenantId = req.tenantId || req.user.tenantId;
      const storeId = req.user.store_id;
      const departmentId = req.user.department_id;
      const accountId = req.query.accountId;
      const search = req.query.search;

      logger.info('User requesting conversations', {
        userId,
        tenantId,
        storeId,
        departmentId,
        userRole: req.user.role
      });

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: 'Tenant ID not found'
        });
      }

      // Build query based on user role
      let query = `
        SELECT c.*, 
               u.name as claimed_by_name,
               a.account_name,
               a.phone_number as account_phone
        FROM whatsapp_cloud_conversations c
        LEFT JOIN users u ON c.claimed_by_user_id = u.id
        LEFT JOIN whatsapp_cloud_accounts a ON c.account_id = a.id
        WHERE c.tenant_id = ? 
          AND c.source = 'whatsapp_cloud'
          AND (
            c.claimed_by_user_id IS NULL 
            OR c.claimed_by_user_id = ?
            OR TIMESTAMPDIFF(MINUTE, c.claimed_at, NOW()) > 5
          )
      `;

      const params = [tenantId, userId];

      // Filter by account if specified
      if (accountId) {
        query += ` AND c.account_id = ?`;
        params.push(accountId);
      }

      // Filter by store if user has store_id
      if (storeId) {
        query += ` AND (c.store_id = ? OR c.store_id IS NULL)`;
        params.push(storeId);
      }

      // Filter by department if user has department_id
      if (departmentId) {
        query += ` AND (c.department_id = ? OR c.department_id IS NULL)`;
        params.push(departmentId);
      }

      // Search filter
      if (search) {
        query += ` AND (c.contact_name LIKE ? OR c.contact_phone LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`);
      }

      query += ` ORDER BY c.last_message_time DESC LIMIT 100`;

      const [conversations] = await pool.execute(query, params);

      // Auto-release expired claims
      for (const conv of conversations) {
        if (conv.claimed_by_user_id && 
            conv.claimed_by_user_id !== userId &&
            conv.claimed_at) {
          const minutesSinceClaim = Math.floor(
            (Date.now() - new Date(conv.claimed_at).getTime()) / 60000
          );
          if (minutesSinceClaim > 5) {
            await pool.execute(
              'UPDATE whatsapp_cloud_conversations SET claimed_by_user_id = NULL, claimed_at = NULL WHERE id = ?',
              [conv.id]
            );
            conv.claimed_by_user_id = null;
            conv.claimed_at = null;
          }
        }
      }

      return res.json({
        success: true,
        data: conversations
      });
    } catch (error) {
      logger.error('Error getting user conversations', {
        error: error.message,
        stack: error.stack
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to load conversations'
      });
    }
  }

  /**
   * Get conversation details
   * GET /api/user/whatsapp-cloud/conversations/:id
   */
  static async getConversation(req, res) {
    try {
      const conversationId = req.params.id;
      const tenantId = req.tenantId || req.user.tenantId;

      const [conversations] = await pool.execute(
        `SELECT * FROM whatsapp_cloud_conversations 
         WHERE id = ? AND tenant_id = ?`,
        [conversationId, tenantId]
      );

      if (conversations.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Conversation not found'
        });
      }

      return res.json({
        success: true,
        data: conversations[0]
      });
    } catch (error) {
      logger.error('Error getting conversation', {
        error: error.message,
        stack: error.stack
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to load conversation'
      });
    }
  }

  /**
   * Claim a conversation
   * POST /api/user/whatsapp-cloud/conversations/:id/claim
   */
  static async claimConversation(req, res) {
    try {
      const conversationId = req.params.id;
      const userId = req.user.id;
      const tenantId = req.tenantId || req.user.tenantId;

      // Check if conversation exists and is not claimed
      const [conversations] = await pool.execute(
        `SELECT * FROM whatsapp_cloud_conversations 
         WHERE id = ? AND tenant_id = ?`,
        [conversationId, tenantId]
      );

      if (conversations.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Conversation not found'
        });
      }

      const conversation = conversations[0];

      // Check if already claimed by another user (and not expired)
      if (conversation.claimed_by_user_id && 
          conversation.claimed_by_user_id !== userId) {
        const minutesSinceClaim = Math.floor(
          (Date.now() - new Date(conversation.claimed_at).getTime()) / 60000
        );
        
        if (minutesSinceClaim <= 5) {
          return res.status(409).json({
            success: false,
            message: 'Conversation is already claimed by another user'
          });
        }
      }

      // Claim the conversation
      await pool.execute(
        `UPDATE whatsapp_cloud_conversations 
         SET claimed_by_user_id = ?, claimed_at = NOW(), updated_at = NOW()
         WHERE id = ?`,
        [userId, conversationId]
      );

      logger.info('Conversation claimed', {
        conversationId,
        userId,
        tenantId
      });

      // Emit WebSocket event
      if (req.io) {
        req.io.to(`tenant_${tenantId}`).emit('whatsapp-cloud:conversation-claimed', {
          conversationId,
          userId,
          userName: req.user.name
        });
      }

      return res.json({
        success: true,
        message: 'Conversation claimed successfully'
      });
    } catch (error) {
      logger.error('Error claiming conversation', {
        error: error.message,
        stack: error.stack
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to claim conversation'
      });
    }
  }

  /**
   * Release a conversation
   * POST /api/user/whatsapp-cloud/conversations/:id/release
   */
  static async releaseConversation(req, res) {
    try {
      const conversationId = req.params.id;
      const userId = req.user.id;
      const tenantId = req.tenantId || req.user.tenantId;

      // Verify user owns the claim
      const [conversations] = await pool.execute(
        `SELECT * FROM whatsapp_cloud_conversations 
         WHERE id = ? AND tenant_id = ? AND claimed_by_user_id = ?`,
        [conversationId, tenantId, userId]
      );

      if (conversations.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Conversation not found or not claimed by you'
        });
      }

      // Release the conversation
      await pool.execute(
        `UPDATE whatsapp_cloud_conversations 
         SET claimed_by_user_id = NULL, claimed_at = NULL, updated_at = NOW()
         WHERE id = ?`,
        [conversationId]
      );

      logger.info('Conversation released', {
        conversationId,
        userId,
        tenantId
      });

      // Emit WebSocket event
      if (req.io) {
        req.io.to(`tenant_${tenantId}`).emit('whatsapp-cloud:conversation-released', {
          conversationId,
          userId
        });
      }

      return res.json({
        success: true,
        message: 'Conversation released successfully'
      });
    } catch (error) {
      logger.error('Error releasing conversation', {
        error: error.message,
        stack: error.stack
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to release conversation'
      });
    }
  }

  /**
   * Get messages for a conversation
   * Auto-claims the conversation when opened
   * GET /api/user/whatsapp-cloud/conversations/:id/messages
   */
  static async getMessages(req, res) {
    try {
      const conversationId = req.params.id;
      const userId = req.user.id;
      const tenantId = req.tenantId || req.user.tenantId;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const offset = (page - 1) * limit;

      // Verify access and auto-claim
      const [conversations] = await pool.execute(
        `SELECT * FROM whatsapp_cloud_conversations 
         WHERE id = ? AND tenant_id = ?`,
        [conversationId, tenantId]
      );

      if (conversations.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Conversation not found'
        });
      }

      const conversation = conversations[0];

      // Auto-claim if not claimed or claim expired
      if (!conversation.claimed_by_user_id || 
          (conversation.claimed_at && 
           Math.floor((Date.now() - new Date(conversation.claimed_at).getTime()) / 60000) > 5)) {
        await pool.execute(
          `UPDATE whatsapp_cloud_conversations 
           SET claimed_by_user_id = ?, claimed_at = NOW()
           WHERE id = ?`,
          [userId, conversationId]
        );

        // Emit claim event
        if (req.io) {
          req.io.to(`tenant_${tenantId}`).emit('whatsapp-cloud:conversation-claimed', {
            conversationId,
            userId,
            userName: req.user.name
          });
        }
      }

      // Get total count
      const [countResult] = await pool.execute(
        `SELECT COUNT(*) as total FROM whatsapp_cloud_messages WHERE conversation_id = ?`,
        [conversationId]
      );
      const total = countResult[0].total;

      // Get messages with pagination
      const [messages] = await pool.execute(
        `SELECT m.*, u.name as sent_by_name
         FROM whatsapp_cloud_messages m
         LEFT JOIN users u ON m.sent_by_user_id = u.id
         WHERE m.conversation_id = ?
         ORDER BY m.created_at ASC
         LIMIT ? OFFSET ?`,
        [conversationId, limit, offset]
      );

      // Mark as read
      await pool.execute(
        `UPDATE whatsapp_cloud_conversations 
         SET unread_count = 0, updated_at = NOW()
         WHERE id = ?`,
        [conversationId]
      );

      return res.json({
        success: true,
        data: messages,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      logger.error('Error getting messages', {
        error: error.message,
        stack: error.stack
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to load messages'
      });
    }
  }

  /**
   * Send text message
   * POST /api/user/whatsapp-cloud/conversations/:id/send-message
   */
  static async sendMessage(req, res) {
    try {
      const conversationId = req.params.id;
      const { content } = req.body;
      const userId = req.user.id;
      const tenantId = req.tenantId || req.user.tenantId;

      if (!content || !content.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Message content is required'
        });
      }

      // Get conversation and verify claim
      const [conversations] = await pool.execute(
        `SELECT c.*, a.phone_number_id, a.access_token
         FROM whatsapp_cloud_conversations c
         JOIN whatsapp_cloud_accounts a ON c.account_id = a.id
         WHERE c.id = ? AND c.tenant_id = ? AND c.claimed_by_user_id = ?`,
        [conversationId, tenantId, userId]
      );

      if (conversations.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'Conversation not found or not claimed by you'
        });
      }

      const conversation = conversations[0];

      // Send via WhatsApp Cloud API
      const response = await axios.post(
        `https://graph.facebook.com/v18.0/${conversation.phone_number_id}/messages`,
        {
          messaging_product: 'whatsapp',
          to: conversation.contact_phone,
          type: 'text',
          text: { body: content }
        },
        {
          headers: {
            'Authorization': `Bearer ${conversation.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      // Save message to database
      const messageId = response.data.messages[0].id;
      await pool.execute(
        `INSERT INTO whatsapp_cloud_messages 
         (conversation_id, message_id, direction, message_type, content, status, timestamp, sent_by_user_id, created_at)
         VALUES (?, ?, 'outbound', 'text', ?, 'sent', NOW(), ?, NOW())`,
        [conversationId, messageId, content, userId]
      );

      // Update conversation
      await pool.execute(
        `UPDATE whatsapp_cloud_conversations 
         SET last_message = ?, last_message_time = NOW(), last_message_from = 'business', updated_at = NOW()
         WHERE id = ?`,
        [content, conversationId]
      );

      logger.info('Message sent', {
        conversationId,
        userId,
        messageId
      });

      // Emit WebSocket event
      if (req.io) {
        req.io.to(`tenant_${tenantId}`).emit('whatsapp-cloud:new-message', {
          conversationId,
          message: {
            id: messageId,
            conversation_id: conversationId,
            content,
            direction: 'outbound',
            message_type: 'text',
            timestamp: new Date(),
            sent_by_user_id: userId,
            sent_by_name: req.user.name,
            status: 'sent'
          }
        });
      }

      return res.json({
        success: true,
        message: 'Message sent successfully',
        data: {
          id: messageId,
          conversation_id: conversationId,
          content,
          direction: 'outbound',
          message_type: 'text',
          timestamp: new Date(),
          sent_by_user_id: userId,
          sent_by_name: req.user.name,
          status: 'sent'
        }
      });
    } catch (error) {
      logger.error('Error sending message', {
        error: error.message,
        stack: error.stack,
        response: error.response?.data
      });

      return res.status(500).json({
        success: false,
        message: error.response?.data?.error?.message || 'Failed to send message'
      });
    }
  }

  /**
   * Add internal note
   * POST /api/user/whatsapp-cloud/conversations/:id/internal-note
   */
  static async addInternalNote(req, res) {
    try {
      const conversationId = req.params.id;
      const { note_text } = req.body;
      const userId = req.user.id;
      const tenantId = req.tenantId || req.user.tenantId;

      if (!note_text || !note_text.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Note text is required'
        });
      }

      // Verify conversation exists
      const [conversations] = await pool.execute(
        `SELECT * FROM whatsapp_cloud_conversations 
         WHERE id = ? AND tenant_id = ?`,
        [conversationId, tenantId]
      );

      if (conversations.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Conversation not found'
        });
      }

      // Save internal note
      const [result] = await pool.execute(
        `INSERT INTO whatsapp_cloud_internal_notes 
         (conversation_id, user_id, note_text, created_at)
         VALUES (?, ?, ?, NOW())`,
        [conversationId, userId, note_text]
      );

      logger.info('Internal note added', {
        conversationId,
        userId,
        noteId: result.insertId
      });

      return res.json({
        success: true,
        message: 'Note added successfully',
        data: {
          id: result.insertId,
          conversation_id: conversationId,
          user_id: userId,
          note_text,
          created_at: new Date()
        }
      });
    } catch (error) {
      logger.error('Error adding internal note', {
        error: error.message,
        stack: error.stack
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to add note'
      });
    }
  }

  /**
   * Transfer conversation to department
   * PUT /api/user/whatsapp-cloud/conversations/:id/transfer
   */
  static async transferConversation(req, res) {
    try {
      const conversationId = req.params.id;
      const { department_id } = req.body;
      const userId = req.user.id;
      const tenantId = req.tenantId || req.user.tenantId;

      if (!department_id) {
        return res.status(400).json({
          success: false,
          message: 'Department ID is required'
        });
      }

      // Verify conversation exists
      const [conversations] = await pool.execute(
        `SELECT * FROM whatsapp_cloud_conversations 
         WHERE id = ? AND tenant_id = ?`,
        [conversationId, tenantId]
      );

      if (conversations.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Conversation not found'
        });
      }

      // Update conversation
      await pool.execute(
        `UPDATE whatsapp_cloud_conversations 
         SET department_id = ?, claimed_by_user_id = NULL, claimed_at = NULL, updated_at = NOW()
         WHERE id = ?`,
        [department_id, conversationId]
      );

      logger.info('Conversation transferred', {
        conversationId,
        departmentId: department_id,
        transferredBy: userId
      });

      // Emit WebSocket event
      if (req.io) {
        req.io.to(`tenant_${tenantId}`).emit('whatsapp-cloud:conversation-transferred', {
          conversationId,
          departmentId: department_id,
          transferredBy: userId
        });
      }

      return res.json({
        success: true,
        message: 'Conversation transferred successfully'
      });
    } catch (error) {
      logger.error('Error transferring conversation', {
        error: error.message,
        stack: error.stack
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to transfer conversation'
      });
    }
  }

  /**
   * Update conversation tags
   * PUT /api/user/whatsapp-cloud/conversations/:id/tags
   */
  static async updateTags(req, res) {
    try {
      const conversationId = req.params.id;
      const { tags } = req.body;
      const tenantId = req.tenantId || req.user.tenantId;

      if (!Array.isArray(tags)) {
        return res.status(400).json({
          success: false,
          message: 'Tags must be an array'
        });
      }

      // Verify conversation exists
      const [conversations] = await pool.execute(
        `SELECT * FROM whatsapp_cloud_conversations 
         WHERE id = ? AND tenant_id = ?`,
        [conversationId, tenantId]
      );

      if (conversations.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Conversation not found'
        });
      }

      // Update tags
      const tagsJson = JSON.stringify(tags);
      await pool.execute(
        `UPDATE whatsapp_cloud_conversations 
         SET tags = ?, updated_at = NOW()
         WHERE id = ?`,
        [tagsJson, conversationId]
      );

      logger.info('Conversation tags updated', {
        conversationId,
        tags
      });

      return res.json({
        success: true,
        message: 'Tags updated successfully',
        data: { tags }
      });
    } catch (error) {
      logger.error('Error updating tags', {
        error: error.message,
        stack: error.stack
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to update tags'
      });
    }
  }

  /**
   * Update conversation priority
   * PUT /api/user/whatsapp-cloud/conversations/:id/priority
   */
  static async updatePriority(req, res) {
    try {
      const conversationId = req.params.id;
      const { priority } = req.body;
      const tenantId = req.tenantId || req.user.tenantId;

      const validPriorities = ['low', 'medium', 'high'];
      if (!validPriorities.includes(priority)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid priority value'
        });
      }

      // Verify conversation exists
      const [conversations] = await pool.execute(
        `SELECT * FROM whatsapp_cloud_conversations 
         WHERE id = ? AND tenant_id = ?`,
        [conversationId, tenantId]
      );

      if (conversations.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Conversation not found'
        });
      }

      // Update priority
      await pool.execute(
        `UPDATE whatsapp_cloud_conversations 
         SET priority = ?, updated_at = NOW()
         WHERE id = ?`,
        [priority, conversationId]
      );

      logger.info('Conversation priority updated', {
        conversationId,
        priority
      });

      return res.json({
        success: true,
        message: 'Priority updated successfully',
        data: { priority }
      });
    } catch (error) {
      logger.error('Error updating priority', {
        error: error.message,
        stack: error.stack
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to update priority'
      });
    }
  }

  /**
   * Update conversation stage (pipeline)
   * PUT /api/user/whatsapp-cloud/conversations/:id/stage
   */
  static async updateStage(req, res) {
    try {
      const conversationId = req.params.id;
      const { stageId } = req.body;
      const tenantId = req.tenantId || req.user.tenantId;

      const validStages = ['unassigned', 'new', 'negotiation', 'won', 'lost'];
      if (!validStages.includes(stageId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid stage value'
        });
      }

      // Verify conversation exists
      const [conversations] = await pool.execute(
        `SELECT * FROM whatsapp_cloud_conversations 
         WHERE id = ? AND tenant_id = ?`,
        [conversationId, tenantId]
      );

      if (conversations.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Conversation not found'
        });
      }

      // Update stage
      await pool.execute(
        `UPDATE whatsapp_cloud_conversations 
         SET stage_id = ?, updated_at = NOW()
         WHERE id = ?`,
        [stageId, conversationId]
      );

      logger.info('Conversation stage updated', {
        conversationId,
        stageId
      });

      // Emit WebSocket event
      if (req.io) {
        req.io.to(`tenant_${tenantId}`).emit('whatsapp-cloud:conversation-stage-updated', {
          conversationId,
          stageId
        });
      }

      return res.json({
        success: true,
        message: 'Stage updated successfully',
        data: { stageId }
      });
    } catch (error) {
      logger.error('Error updating stage', {
        error: error.message,
        stack: error.stack
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to update stage'
      });
    }
  }
}

module.exports = WhatsAppCloudUserController;
