/**
 * Conversations Controller - ROBUST VERSION
 * Manages conversations monitoring for tenant admins
 * Admin can view all conversations but cannot send messages
 * 
 * Features:
 * - View all conversations (admin monitoring)
 * - See sender info (user name + store/department or bot persona)
 * - Statistics dashboard
 * - ROBUST store and department lookup with multiple fallback strategies
 * - Full i18n support
 * 
 * @module controllers/ConversationsController
 */

const { pool } = require('../config/database');
const { logger } = require('../config/logger');
const { asyncHandler } = require('../middleware/errorHandler');

class ConversationsController {
  /**
   * Get all conversations for tenant (admin monitoring - view all)
   * GET /api/tenant/conversations/admin
   * 
   * ROBUST FEATURES:
   * - Multiple store lookup strategies (by ID, by name from user, by name from conversation)
   * - Multiple department lookup strategies (by ID, by name from user, by name from conversation)
   * - Proper tenant isolation
   * - Enriched response with resolved store and department data
   */
  static getConversations = asyncHandler(async (req, res) => {
    const tenantId = req.user.tenantId;
    const { status, assigned_user_id, search, limit = 50, offset = 0 } = req.query;

    try {
      let query = `
        SELECT 
          c.id,
          c.tenant_id,
          c.contact_id,
          c.phone_number,
          c.contact_name,
          c.last_message,
          c.last_message_time,
          c.status,
          c.assigned_user_id,
          c.assigned_store,
          c.assigned_department,
          c.is_claimed,
          c.claimed_by_user_id,
          c.claimed_at,
          c.transferred_to_store,
          c.transferred_to_department,
          c.transferred_at,
          c.created_at,
          c.updated_at,
          
          -- Assigned user information
          u.name as assigned_user_name,
          u.email as assigned_user_email,
          u.role as assigned_user_role,
          u.store_id as assigned_user_store_id,
          u.department_id as assigned_user_department_id,
          u.store as assigned_user_store_name,
          u.department as assigned_user_department_name,
          
          -- Claimed by user information
          cu.name as claimed_by_name,
          cu.email as claimed_by_email,
          cu.role as claimed_by_role,
          cu.store_id as claimed_by_store_id,
          cu.department_id as claimed_by_department_id,
          cu.store as claimed_by_store_name,
          cu.department as claimed_by_department_name,
          
          -- Store information (ROBUST lookup by ID or name)
          COALESCE(
            s_assigned.name,
            s_claimed.name,
            c.assigned_store,
            c.transferred_to_store
          ) as effective_store_name,
          
          COALESCE(
            s_assigned.id,
            s_claimed.id
          ) as effective_store_id,
          
          -- Department information (ROBUST lookup by ID or name)
          COALESCE(
            d_assigned.name,
            d_claimed.name,
            c.assigned_department,
            c.transferred_to_department
          ) as effective_department_name,
          
          COALESCE(
            d_assigned.id,
            d_claimed.id
          ) as effective_department_id,
          
          -- Message statistics
          (SELECT COUNT(*) FROM whatsapp_messages m WHERE m.conversation_id = c.id) as message_count,
          (SELECT COUNT(*) FROM whatsapp_messages m WHERE m.conversation_id = c.id AND m.status != 'read' AND m.direction = 'incoming') as unread_count
          
        FROM conversations c
        
        -- Join assigned user
        LEFT JOIN users u ON c.assigned_user_id = u.id AND u.tenant_id = c.tenant_id
        
        -- Join claimed by user
        LEFT JOIN users cu ON c.claimed_by_user_id = cu.id AND cu.tenant_id = c.tenant_id
        
        -- ROBUST: Join stores with multiple lookup strategies
        -- Strategy 1: Lookup by assigned user's store_id
        -- Strategy 2: Lookup by conversation's assigned_store name
        LEFT JOIN stores s_assigned ON (
          (u.store_id IS NOT NULL AND s_assigned.id = u.store_id AND s_assigned.tenant_id = c.tenant_id)
          OR
          (c.assigned_store IS NOT NULL AND s_assigned.name = c.assigned_store AND s_assigned.tenant_id = c.tenant_id)
        )
        
        -- ROBUST: Join stores for claimed conversations
        -- Strategy 1: Lookup by claimed user's store_id
        -- Strategy 2: Lookup by conversation's transferred_to_store name
        LEFT JOIN stores s_claimed ON (
          (cu.store_id IS NOT NULL AND s_claimed.id = cu.store_id AND s_claimed.tenant_id = c.tenant_id)
          OR
          (c.transferred_to_store IS NOT NULL AND s_claimed.name = c.transferred_to_store AND s_claimed.tenant_id = c.tenant_id)
        )
        
        -- ROBUST: Join departments with multiple lookup strategies
        -- Strategy 1: Lookup by assigned user's department_id
        -- Strategy 2: Lookup by conversation's assigned_department name
        LEFT JOIN departments d_assigned ON (
          (u.department_id IS NOT NULL AND d_assigned.id = u.department_id AND d_assigned.tenant_id = c.tenant_id)
          OR
          (c.assigned_department IS NOT NULL AND d_assigned.name = c.assigned_department AND d_assigned.tenant_id = c.tenant_id)
        )
        
        -- ROBUST: Join departments for claimed conversations
        -- Strategy 1: Lookup by claimed user's department_id
        -- Strategy 2: Lookup by conversation's transferred_to_department name
        LEFT JOIN departments d_claimed ON (
          (cu.department_id IS NOT NULL AND d_claimed.id = cu.department_id AND d_claimed.tenant_id = c.tenant_id)
          OR
          (c.transferred_to_department IS NOT NULL AND d_claimed.name = c.transferred_to_department AND d_claimed.tenant_id = c.tenant_id)
        )
        
        WHERE c.tenant_id = ?
      `;
      const params = [tenantId];

      // Filter by status
      if (status) {
        query += ` AND c.status = ?`;
        params.push(status);
      }

      // Filter by assigned user
      if (assigned_user_id) {
        query += ` AND c.assigned_user_id = ?`;
        params.push(assigned_user_id);
      }

      // Search by contact name or phone
      if (search) {
        query += ` AND (c.contact_name LIKE ? OR c.phone_number LIKE ?)`;
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm);
      }

      query += ` ORDER BY c.last_message_time DESC LIMIT ? OFFSET ?`;
      params.push(parseInt(limit), parseInt(offset));

      const [conversations] = await pool.query(query, params);

      // Enrich conversations with resolved store and department data
      const enrichedConversations = conversations.map(conv => ({
        ...conv,
        store: {
          id: conv.effective_store_id,
          name: conv.effective_store_name
        },
        department: {
          id: conv.effective_department_id,
          name: conv.effective_department_name
        },
        assigned_user: conv.assigned_user_id ? {
          id: conv.assigned_user_id,
          name: conv.assigned_user_name,
          email: conv.assigned_user_email,
          role: conv.assigned_user_role,
          store_id: conv.assigned_user_store_id,
          department_id: conv.assigned_user_department_id,
          store: conv.assigned_user_store_name,
          department: conv.assigned_user_department_name
        } : null,
        claimed_by: conv.claimed_by_user_id ? {
          id: conv.claimed_by_user_id,
          name: conv.claimed_by_name,
          email: conv.claimed_by_email,
          role: conv.claimed_by_role,
          store_id: conv.claimed_by_store_id,
          department_id: conv.claimed_by_department_id,
          store: conv.claimed_by_store_name,
          department: conv.claimed_by_department_name
        } : null
      }));

      logger.info('Conversations retrieved for monitoring', { 
        tenantId, 
        count: conversations.length,
        filters: { status, assigned_user_id, search }
      });

      return res.json({
        success: true,
        data: enrichedConversations,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: enrichedConversations.length
        }
      });
    } catch (error) {
      logger.error('Error getting conversations', { 
        tenantId, 
        error: error.message,
        stack: error.stack
      });
      return res.status(500).json({
        success: false,
        error: 'Failed to load conversations',
        message: error.message
      });
    }
  });

  /**
   * Get single conversation with messages (includes sender info)
   * GET /api/tenant/conversations/:id
   * 
   * ROBUST FEATURES:
   * - Enhanced store/department lookup for conversation
   * - Enhanced store/department lookup for each message sender
   * - Complete sender information including user, store, department, and bot data
   */
  static getConversation = asyncHandler(async (req, res) => {
    const tenantId = req.user.tenantId;
    const { id } = req.params;

    try {
      // Get conversation details with ROBUST store/department lookup
      const [conversations] = await pool.query(`
        SELECT 
          c.*,
          
          -- Assigned user information
          u.name as assigned_user_name,
          u.email as assigned_user_email,
          u.role as assigned_user_role,
          u.store_id as assigned_user_store_id,
          u.department_id as assigned_user_department_id,
          u.store as assigned_user_store_name,
          u.department as assigned_user_department_name,
          
          -- Claimed by user information
          cu.name as claimed_by_name,
          cu.email as claimed_by_email,
          cu.role as claimed_by_role,
          cu.store_id as claimed_by_store_id,
          cu.department_id as claimed_by_department_id,
          cu.store as claimed_by_store_name,
          cu.department as claimed_by_department_name,
          
          -- ROBUST: Store information with multiple lookup strategies
          COALESCE(
            s_assigned.name,
            s_claimed.name,
            s_transferred.name,
            c.assigned_store,
            c.transferred_to_store
          ) as effective_store_name,
          
          COALESCE(
            s_assigned.id,
            s_claimed.id,
            s_transferred.id
          ) as effective_store_id,
          
          COALESCE(
            s_assigned.description,
            s_claimed.description,
            s_transferred.description
          ) as effective_store_description,
          
          -- ROBUST: Department information with multiple lookup strategies
          COALESCE(
            d_assigned.name,
            d_claimed.name,
            d_transferred.name,
            c.assigned_department,
            c.transferred_to_department
          ) as effective_department_name,
          
          COALESCE(
            d_assigned.id,
            d_claimed.id,
            d_transferred.id
          ) as effective_department_id,
          
          COALESCE(
            d_assigned.description,
            d_claimed.description,
            d_transferred.description
          ) as effective_department_description
          
        FROM conversations c
        
        -- Join assigned user
        LEFT JOIN users u ON c.assigned_user_id = u.id AND u.tenant_id = c.tenant_id
        
        -- Join claimed by user
        LEFT JOIN users cu ON c.claimed_by_user_id = cu.id AND cu.tenant_id = c.tenant_id
        
        -- ROBUST: Join stores with multiple strategies
        LEFT JOIN stores s_assigned ON (
          (u.store_id IS NOT NULL AND s_assigned.id = u.store_id AND s_assigned.tenant_id = c.tenant_id)
          OR
          (c.assigned_store IS NOT NULL AND s_assigned.name = c.assigned_store AND s_assigned.tenant_id = c.tenant_id)
        )
        
        LEFT JOIN stores s_claimed ON (
          cu.store_id IS NOT NULL AND s_claimed.id = cu.store_id AND s_claimed.tenant_id = c.tenant_id
        )
        
        LEFT JOIN stores s_transferred ON (
          c.transferred_to_store IS NOT NULL AND s_transferred.name = c.transferred_to_store AND s_transferred.tenant_id = c.tenant_id
        )
        
        -- ROBUST: Join departments with multiple strategies
        LEFT JOIN departments d_assigned ON (
          (u.department_id IS NOT NULL AND d_assigned.id = u.department_id AND d_assigned.tenant_id = c.tenant_id)
          OR
          (c.assigned_department IS NOT NULL AND d_assigned.name = c.assigned_department AND d_assigned.tenant_id = c.tenant_id)
        )
        
        LEFT JOIN departments d_claimed ON (
          cu.department_id IS NOT NULL AND d_claimed.id = cu.department_id AND d_claimed.tenant_id = c.tenant_id
        )
        
        LEFT JOIN departments d_transferred ON (
          c.transferred_to_department IS NOT NULL AND d_transferred.name = c.transferred_to_department AND d_transferred.tenant_id = c.tenant_id
        )
        
        WHERE c.id = ? AND c.tenant_id = ?
      `, [id, tenantId]);

      if (conversations.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Conversation not found'
        });
      }

      const conversation = conversations[0];

      // Get messages for this conversation with ROBUST sender store/department info
      const [messages] = await pool.query(`
        SELECT 
          m.id,
          m.tenant_id,
          m.connection_id,
          m.phone_number,
          m.contact_name,
          m.message_type,
          m.content as message_text,
          m.media_url,
          m.direction,
          m.status,
          m.created_at as timestamp,
          m.conversation_id,
          m.sender_user_id,
          m.sender_name,
          m.sender_store,
          m.sender_department,
          m.is_bot_message,
          m.bot_persona_name,
          CASE WHEN m.is_bot_message = 1 THEN 1 ELSE 0 END as is_from_bot,
          
          -- User information
          u.name as user_name,
          u.email as user_email,
          u.role as user_role,
          u.store_id as user_store_id,
          u.department_id as user_department_id,
          
          -- ROBUST: Store information for message sender
          COALESCE(
            s_user.name,
            m.sender_store
          ) as effective_sender_store_name,
          
          COALESCE(
            s_user.id
          ) as effective_sender_store_id,
          
          -- ROBUST: Department information for message sender
          COALESCE(
            d_user.name,
            m.sender_department
          ) as effective_sender_department_name,
          
          COALESCE(
            d_user.id
          ) as effective_sender_department_id
          
        FROM whatsapp_messages m
        
        -- Join user who sent the message
        LEFT JOIN users u ON m.sender_user_id = u.id AND u.tenant_id = m.tenant_id
        
        -- ROBUST: Join store by user's store_id or by sender_store name
        LEFT JOIN stores s_user ON (
          (u.store_id IS NOT NULL AND s_user.id = u.store_id AND s_user.tenant_id = m.tenant_id)
          OR
          (m.sender_store IS NOT NULL AND s_user.name = m.sender_store AND s_user.tenant_id = m.tenant_id)
        )
        
        -- ROBUST: Join department by user's department_id or by sender_department name
        LEFT JOIN departments d_user ON (
          (u.department_id IS NOT NULL AND d_user.id = u.department_id AND d_user.tenant_id = m.tenant_id)
          OR
          (m.sender_department IS NOT NULL AND d_user.name = m.sender_department AND d_user.tenant_id = m.tenant_id)
        )
        
        WHERE m.conversation_id = ? AND m.tenant_id = ?
        ORDER BY m.created_at ASC
      `, [id, tenantId]);

      // Enrich messages with resolved sender data
      const enrichedMessages = messages.map(msg => ({
        ...msg,
        sender: {
          user_id: msg.sender_user_id,
          user_name: msg.user_name || msg.sender_name,
          user_email: msg.user_email,
          user_role: msg.user_role,
          store: {
            id: msg.effective_sender_store_id,
            name: msg.effective_sender_store_name
          },
          department: {
            id: msg.effective_sender_department_id,
            name: msg.effective_sender_department_name
          },
          is_bot: msg.is_from_bot === 1,
          bot_persona: msg.bot_persona_name
        }
      }));

      // Enrich conversation with resolved data
      const enrichedConversation = {
        ...conversation,
        store: {
          id: conversation.effective_store_id,
          name: conversation.effective_store_name,
          description: conversation.effective_store_description
        },
        department: {
          id: conversation.effective_department_id,
          name: conversation.effective_department_name,
          description: conversation.effective_department_description
        },
        assigned_user: conversation.assigned_user_id ? {
          id: conversation.assigned_user_id,
          name: conversation.assigned_user_name,
          email: conversation.assigned_user_email,
          role: conversation.assigned_user_role,
          store_id: conversation.assigned_user_store_id,
          department_id: conversation.assigned_user_department_id,
          store: conversation.assigned_user_store_name,
          department: conversation.assigned_user_department_name
        } : null,
        claimed_by: conversation.claimed_by_user_id ? {
          id: conversation.claimed_by_user_id,
          name: conversation.claimed_by_name,
          email: conversation.claimed_by_email,
          role: conversation.claimed_by_role,
          store_id: conversation.claimed_by_store_id,
          department_id: conversation.claimed_by_department_id,
          store: conversation.claimed_by_store_name,
          department: conversation.claimed_by_department_name
        } : null
      };

      logger.info('Conversation details retrieved', { 
        tenantId, 
        conversationId: id,
        messageCount: messages.length,
        storeResolved: !!enrichedConversation.store.id,
        departmentResolved: !!enrichedConversation.department.id
      });

      return res.json({
        success: true,
        data: {
          conversation: enrichedConversation,
          messages: enrichedMessages
        }
      });
    } catch (error) {
      logger.error('Error getting conversation details', { 
        tenantId, 
        conversationId: id,
        error: error.message,
        stack: error.stack
      });
      return res.status(500).json({
        success: false,
        error: 'Failed to load conversation',
        message: error.message
      });
    }
  });

  /**
   * Get conversation statistics
   * GET /api/tenant/conversations/stats
   * 
   * ROBUST FEATURES:
   * - Stats by store with proper resolution
   * - Stats by department with proper resolution
   * - Top users with store/department information
   */
  static getStats = asyncHandler(async (req, res) => {
    const tenantId = req.user.tenantId;

    try {
      const [stats] = await pool.query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'waiting' THEN 1 ELSE 0 END) as waiting,
          SUM(CASE WHEN status = 'attended' THEN 1 ELSE 0 END) as attended,
          SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) as archived,
          SUM(CASE WHEN is_claimed = 1 THEN 1 ELSE 0 END) as claimed
        FROM conversations
        WHERE tenant_id = ?
      `, [tenantId]);

      // Get messages count with bot/user breakdown
      const [messageStats] = await pool.query(`
        SELECT 
          COUNT(*) as total_messages,
          SUM(CASE WHEN is_bot_message = 1 THEN 1 ELSE 0 END) as bot_messages,
          SUM(CASE WHEN direction = 'outgoing' AND is_bot_message = 0 THEN 1 ELSE 0 END) as user_messages,
          SUM(CASE WHEN direction = 'incoming' THEN 1 ELSE 0 END) as customer_messages
        FROM whatsapp_messages
        WHERE tenant_id = ?
      `, [tenantId]);

      // ROBUST: Get top users by conversations claimed with store and department info
      const [topUsers] = await pool.query(`
        SELECT 
          u.id,
          u.name,
          u.email,
          u.role,
          u.store_id,
          u.department_id,
          u.store as store_name,
          u.department as department_name,
          s.name as resolved_store_name,
          d.name as resolved_department_name,
          COUNT(c.id) as conversation_count,
          SUM(CASE WHEN c.status = 'active' THEN 1 ELSE 0 END) as active_conversations,
          SUM(CASE WHEN c.status = 'closed' THEN 1 ELSE 0 END) as closed_conversations
        FROM users u
        LEFT JOIN conversations c ON u.id = c.claimed_by_user_id AND u.tenant_id = c.tenant_id
        LEFT JOIN stores s ON u.store_id = s.id AND s.tenant_id = u.tenant_id
        LEFT JOIN departments d ON u.department_id = d.id AND d.tenant_id = u.tenant_id
        WHERE u.tenant_id = ? AND u.active = 1
        GROUP BY u.id, u.name, u.email, u.role, u.store_id, u.department_id, u.store, u.department, s.name, d.name
        ORDER BY conversation_count DESC
        LIMIT 5
      `, [tenantId]);

      // ROBUST: Get stats by store
      const [storeStats] = await pool.query(`
        SELECT 
          COALESCE(s.id, 0) as store_id,
          COALESCE(s.name, c.assigned_store, 'Unassigned') as store_name,
          COUNT(c.id) as conversation_count,
          SUM(CASE WHEN c.status = 'active' THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN c.status = 'closed' THEN 1 ELSE 0 END) as closed
        FROM conversations c
        LEFT JOIN users u ON c.claimed_by_user_id = u.id AND c.tenant_id = u.tenant_id
        LEFT JOIN stores s ON (
          (u.store_id IS NOT NULL AND s.id = u.store_id AND s.tenant_id = c.tenant_id)
          OR
          (c.assigned_store IS NOT NULL AND s.name = c.assigned_store AND s.tenant_id = c.tenant_id)
        )
        WHERE c.tenant_id = ?
        GROUP BY store_id, store_name
        ORDER BY conversation_count DESC
      `, [tenantId]);

      // ROBUST: Get stats by department
      const [departmentStats] = await pool.query(`
        SELECT 
          COALESCE(d.id, 0) as department_id,
          COALESCE(d.name, c.assigned_department, 'Unassigned') as department_name,
          COUNT(c.id) as conversation_count,
          SUM(CASE WHEN c.status = 'active' THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN c.status = 'closed' THEN 1 ELSE 0 END) as closed
        FROM conversations c
        LEFT JOIN users u ON c.claimed_by_user_id = u.id AND c.tenant_id = u.tenant_id
        LEFT JOIN departments d ON (
          (u.department_id IS NOT NULL AND d.id = u.department_id AND d.tenant_id = c.tenant_id)
          OR
          (c.assigned_department IS NOT NULL AND d.name = c.assigned_department AND d.tenant_id = c.tenant_id)
        )
        WHERE c.tenant_id = ?
        GROUP BY department_id, department_name
        ORDER BY conversation_count DESC
      `, [tenantId]);

      // Enrich top users with resolved store/department names
      const enrichedTopUsers = topUsers.map(user => ({
        ...user,
        store: {
          id: user.store_id,
          name: user.resolved_store_name || user.store_name
        },
        department: {
          id: user.department_id,
          name: user.resolved_department_name || user.department_name
        }
      }));

      logger.info('Conversation statistics retrieved', { 
        tenantId,
        total_conversations: stats[0].total,
        total_messages: messageStats[0].total_messages
      });

      return res.json({
        success: true,
        data: {
          conversations: stats[0],
          messages: messageStats[0],
          topUsers: enrichedTopUsers,
          byStore: storeStats,
          byDepartment: departmentStats
        }
      });
    } catch (error) {
      logger.error('Error getting conversation stats', { 
        tenantId, 
        error: error.message,
        stack: error.stack
      });
      return res.status(500).json({
        success: false,
        error: 'Failed to load statistics',
        message: error.message
      });
    }
  });

  /**
   * Get list of all stores for tenant
   * GET /api/tenant/conversations/stores
   */
  static getStores = asyncHandler(async (req, res) => {
    const tenantId = req.user.tenantId;

    try {
      const [stores] = await pool.query(`
        SELECT 
          id,
          name,
          description,
          address,
          phone,
          email,
          created_at,
          updated_at
        FROM stores
        WHERE tenant_id = ?
        ORDER BY name ASC
      `, [tenantId]);

      logger.info('Stores list retrieved', { 
        tenantId,
        count: stores.length
      });

      return res.json({
        success: true,
        data: stores
      });
    } catch (error) {
      logger.error('Error getting stores', { 
        tenantId, 
        error: error.message
      });
      return res.status(500).json({
        success: false,
        error: 'Failed to load stores'
      });
    }
  });

  /**
   * Get list of all departments for tenant
   * GET /api/tenant/conversations/departments
   */
  static getDepartments = asyncHandler(async (req, res) => {
    const tenantId = req.user.tenantId;

    try {
      const [departments] = await pool.query(`
        SELECT 
          id,
          name,
          description,
          created_at,
          updated_at
        FROM departments
        WHERE tenant_id = ?
        ORDER BY name ASC
      `, [tenantId]);

      logger.info('Departments list retrieved', { 
        tenantId,
        count: departments.length
      });

      return res.json({
        success: true,
        data: departments
      });
    } catch (error) {
      logger.error('Error getting departments', { 
        tenantId, 
        error: error.message
      });
      return res.status(500).json({
        success: false,
        error: 'Failed to load departments'
      });
    }
  });

  /**
   * Clear conversation notes history (admin only)
   * DELETE /api/tenant/conversations/:id/notes
   */
  static clearConversationNotes = asyncHandler(async (req, res) => {
    const tenantId = req.user.tenantId;
    const { id } = req.params;

    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Only admin can clear conversation notes'
      });
    }

    try {
      const [conversations] = await pool.query(
        `SELECT contact_phone FROM whatsapp_cloud_conversations WHERE id = ? AND tenant_id = ?`,
        [id, tenantId]
      );

      if (conversations.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Conversation not found'
        });
      }

      const contactPhone = conversations[0].contact_phone;

      await pool.query(
        `DELETE FROM conversation_notes WHERE tenant_id = ? AND contact_phone = ?`,
        [tenantId, contactPhone]
      );

      return res.json({
        success: true,
        message: 'Conversation notes cleared successfully'
      });
    } catch (error) {
      logger.error('Error clearing conversation notes', {
        tenantId,
        conversationId: id,
        error: error.message,
        stack: error.stack
      });
      return res.status(500).json({
        success: false,
        error: 'Failed to clear conversation notes'
      });
    }
  });
}

module.exports = ConversationsController;
