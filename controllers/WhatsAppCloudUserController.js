/**
 * WhatsApp Cloud User Controller - ENHANCED ROBUST VERSION
 * Handles both WhatsApp Cloud and Web conversations for store/department users
 * Features:
 * - Robust claim/release system with exclusive conversation ownership
 * - Multi-source support (WhatsApp Cloud API + WhatsApp Web)
 * - Advanced media handling (images, videos, PDFs, WooCommerce products, billing)
 * - Conversation transfer system with proper store/department routing
 * - Tag management system
 * - Real-time updates via Socket.IO
 * - Comprehensive error handling and logging
 */

const BaseController = require('./BaseController');
const { pool } = require('../config/database');
const { logger } = require('../config/logger');
const axios = require('axios');
const InvoiceRepository = require('../repositories/InvoiceRepository');
const StripeService = require('../services/stripeService');
const PayPalService = require('../services/paypalService');
const { getWhatsAppService } = require('../services/WhatsAppService');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const tenantId = req.user.tenantId || req.tenantId;
    const uploadPath = path.join(__dirname, '../uploads', `tenant_${tenantId}`);
    
    // Ensure directory exists
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    // Generate unique filename with timestamp and random string
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + extension);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: function (req, file, cb) {
    // Allow all file types for maximum flexibility
    cb(null, true);
  }
});

class WhatsAppCloudUserController extends BaseController {
  /**
   * Get conversations for current user - ENHANCED VERSION
   * Supports both WhatsApp Cloud and WhatsApp Web sources
   * Only shows unclaimed or conversations claimed by this user
   * Implements proper store/department filtering
   * GET /api/user/whatsapp-cloud/conversations
   */
  static async getConversations(req, res) {
    try {
      const userId = req.user.id;
      const tenantId = req.tenantId || req.user.tenantId;
      let storeId = req.user.store_id || null;
      let departmentId = req.user.department_id || null;
      const storeName = req.user.store || null;
      const departmentName = req.user.department || null;
      const accountId = req.query.accountId;
      const source = req.query.source === 'whatsapp_web' ? 'whatsapp_web' : 'whatsapp_cloud';

      logger.info('Enhanced user requesting conversations', {
        userId,
        tenantId,
        storeId,
        departmentId,
        userRole: req.user.role,
        source,
        accountId
      });

      if (!tenantId) {
        logger.error('Tenant ID not found in request', {
          userId,
          user: req.user
        });
        return res.status(400).json({
          success: false,
          message: 'Tenant ID not found'
        });
      }

      let conversations = [];

      if (source === 'whatsapp_web') {
        // Get WhatsApp Web conversations
        const io = req.app.get('io');
        const whatsappService = getWhatsAppService(io);
        
        if (whatsappService) {
          const webConversations = await whatsappService.getWebConversations(tenantId);
          
          // Transform web conversations to match our format
          conversations = webConversations.map(conv => ({
            id: conv.conversationId || conv.id,
            contact_name: conv.name,
            phone_number: conv.phone,
            last_message_text: conv.lastMessage,
            last_message_time: new Date(conv.timestamp),
            unread_count: conv.unreadCount || 0,
            source: 'whatsapp_web',
            stage_id: conv.stageId || 'new',
            tags: conv.tags || [],
            claimed_by_user_id: null, // Web conversations start unclaimed
            claimed_by_name: null,
            account_name: 'WhatsApp Web',
            account_phone: null
          }));
        }
      } else {
        // Get WhatsApp Cloud conversations from database
        let query = `
          SELECT c.*, 
                 u.name as claimed_by_name,
                 a.account_name,
                 a.phone_number as account_phone,
                 ps.stage_name,
                 ps.stage_color
          FROM whatsapp_cloud_conversations c
          LEFT JOIN users u ON c.claimed_by_user_id = u.id
          LEFT JOIN whatsapp_cloud_accounts a ON c.account_id = a.id
          LEFT JOIN pipeline_stages ps ON c.pipeline_stage = ps.stage_key AND ps.tenant_id = c.tenant_id
          WHERE c.tenant_id = ? 
            AND c.source = ?
            AND (
              c.claimed_by_user_id IS NULL 
              OR c.claimed_by_user_id = ?
            )
        `;

        const params = [tenantId, source, userId];

        // Filter by account if specified
        if (accountId && source === 'whatsapp_cloud') {
          query += ` AND c.account_id = ?`;
          params.push(accountId);
        }

        if (!storeId && storeName) {
          const [storeRows] = await pool.execute(
            `SELECT id FROM stores WHERE tenant_id = ? AND name = ? LIMIT 1`,
            [tenantId, storeName]
          );
          storeId = storeRows[0]?.id || null;
        }

        if (!departmentId && departmentName) {
          const [deptRows] = await pool.execute(
            `SELECT id FROM departments WHERE tenant_id = ? AND name = ? LIMIT 1`,
            [tenantId, departmentName]
          );
          departmentId = deptRows[0]?.id || null;
        }

        if (departmentId || departmentName) {
          const deptValues = [];
          if (departmentId) deptValues.push(String(departmentId));
          if (departmentName && !deptValues.includes(String(departmentName))) deptValues.push(String(departmentName));
          query += ` AND c.transferred_to_department IN (${deptValues.map(() => '?').join(', ')})`;
          params.push(...deptValues);
          logger.info('Department filter applied', { userId, departmentId, departmentName });
        } 
        else if (storeId || storeName) {
          const storeValues = [];
          if (storeId) storeValues.push(String(storeId));
          if (storeName && !storeValues.includes(String(storeName))) storeValues.push(String(storeName));
          query += ` AND (
            c.claimed_by_user_id = ?
            OR (
              c.claimed_by_user_id IS NULL
              AND (c.transferred_to_department IS NULL OR c.transferred_to_department = '')
              AND (
                (c.store_id IS NULL AND c.department_id IS NULL AND c.transferred_to_store IS NULL)
                OR c.store_id IN (${storeValues.map(() => '?').join(', ')})
                OR c.transferred_to_store IN (${storeValues.map(() => '?').join(', ')})
              )
            )
          )`;
          params.push(userId, ...storeValues, ...storeValues);
        }

        // Add debug logging for the query
        logger.info('Conversation query debug', {
          userId,
          storeId,
          departmentId,
          query: query.replace(/\s+/g, ' ').trim(),
          params
        });

        query += ` ORDER BY c.last_message_time DESC LIMIT 100`;

        const [rows] = await pool.execute(query, params);
        conversations = rows;
      }

      logger.info('Enhanced conversations loaded', {
        userId,
        tenantId,
        source,
        count: conversations.length
      });

      return res.json({
        success: true,
        data: conversations,
        meta: {
          source,
          count: conversations.length,
          user: {
            id: userId,
            store: req.user.store,
            department: req.user.department
          }
        }
      });
    } catch (error) {
      logger.error('Error getting enhanced user conversations', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id,
        tenantId: req.tenantId || req.user?.tenantId
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to load conversations'
      });
    }
  }

  /**
   * Get WhatsApp Web conversations - ENHANCED VERSION
   * Provides robust connection handling and conversation sync
   * GET /api/user/whatsapp-cloud/web-conversations
   */
  static async getWebConversations(req, res) {
    try {
      const tenantId = req.tenantId || req.user.tenantId;
      const requestId = req.headers['x-request-id'] || `req_${Date.now()}`;
      
      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: 'Tenant ID not found'
        });
      }

      logger.info('Enhanced Web conversations requested', {
        tenantId,
        userId: req.user?.id,
        requestId,
        userStore: req.user?.store,
        userDepartment: req.user?.department
      });

      const io = req.app.get('io');
      const whatsappService = getWhatsAppService(io);
      
      if (!whatsappService) {
        return res.status(503).json({
          success: false,
          message: 'WhatsApp service not available'
        });
      }

      // Get conversations with enhanced error handling
      let conversations = [];
      let connectionStatus = {
        connected: false,
        hasSession: false,
        error: null
      };

      try {
        conversations = await whatsappService.getWebConversations(tenantId);
        
        const normalizedTenantId = Number(tenantId);
        const instance = whatsappService.getInstance?.(normalizedTenantId);
        
        const rawStatus = instance?.connection?.getStatus?.(normalizedTenantId) || null;
        const hasSession = instance?.connection?.stateManager?.hasSession?.(normalizedTenantId) || false;
        const phoneNumber = whatsappService.getPhoneNumber?.(normalizedTenantId) || null;
        const connected = Boolean(
          instance?.connection?.isConnected?.(normalizedTenantId) ||
          rawStatus === 'connected' ||
          hasSession ||
          phoneNumber
        );

        connectionStatus = {
          connected,
          hasSession,
          status: connected ? 'connected' : (rawStatus || 'disconnected'),
          phoneNumber,
          storeStats: instance?.connection?.getStoreStats?.(normalizedTenantId) || null
        };
      } catch (serviceError) {
        logger.error('WhatsApp service error', {
          tenantId,
          error: serviceError.message,
          requestId
        });
        
        connectionStatus.error = serviceError.message;
      }

      logger.info('Enhanced Web conversations response', {
        tenantId,
        userId: req.user?.id,
        requestId,
        connected: connectionStatus.connected,
        hasSession: connectionStatus.hasSession,
        chatsCount: conversations?.length || 0,
        hasError: !!connectionStatus.error
      });

      return res.json({
        success: true,
        data: conversations || [],
        meta: {
          connection: connectionStatus,
          chatsCount: conversations?.length || 0,
          source: 'whatsapp_web',
          user: {
            id: req.user.id,
            store: req.user.store,
            department: req.user.department
          }
        }
      });
    } catch (error) {
      logger.error('Error fetching Enhanced Web WhatsApp conversations', {
        tenantId: req.tenantId || req.user.tenantId,
        error: error.message,
        stack: error.stack
      });
      
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch Web WhatsApp conversations',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Force Web conversations sync - ENHANCED VERSION
   * Provides robust sync with comprehensive error handling
   * POST/GET /api/user/whatsapp-cloud/web-conversations/force-sync
   */
  static async forceWebConversationsSync(req, res) {
    try {
      const tenantId = req.tenantId || req.user.tenantId;
      const requestId = req.headers['x-request-id'] || `sync_${Date.now()}`;
      
      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: 'Tenant ID not found'
        });
      }

      logger.info('Enhanced force web conversations sync requested', {
        tenantId,
        userId: req.user?.id,
        requestId,
        method: req.method
      });

      const io = req.app.get('io');
      const whatsappService = getWhatsAppService(io);
      
      if (!whatsappService) {
        return res.status(503).json({
          success: false,
          message: 'WhatsApp service not available'
        });
      }

      // Perform enhanced sync with timeout and error handling
      let syncResult = false;
      let conversations = [];
      let connectionStatus = {
        connected: false,
        hasSession: false,
        error: null
      };

      try {
        // Set a timeout for the sync operation
        const syncPromise = whatsappService.forceWebSync(tenantId);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Sync timeout after 30 seconds')), 30000)
        );

        syncResult = await Promise.race([syncPromise, timeoutPromise]);
        
        // Get conversations after sync
        conversations = await whatsappService.getWebConversations(tenantId);
        
        const normalizedTenantId = Number(tenantId);
        const instance = whatsappService.getInstance?.(normalizedTenantId);
        
        connectionStatus = {
          connected: instance?.connection?.isConnected?.(normalizedTenantId) || false,
          hasSession: instance?.connection?.stateManager?.hasSession?.(normalizedTenantId) || false,
          phoneNumber: whatsappService.getPhoneNumber?.(normalizedTenantId) || null,
          storeStats: instance?.connection?.getStoreStats?.(normalizedTenantId) || null
        };
      } catch (syncError) {
        logger.error('Enhanced sync error', {
          tenantId,
          error: syncError.message,
          requestId
        });
        
        connectionStatus.error = syncError.message;
        
        // Still try to get existing conversations
        try {
          conversations = await whatsappService.getWebConversations(tenantId);
        } catch (getError) {
          logger.error('Error getting conversations after failed sync', {
            tenantId,
            error: getError.message,
            requestId
          });
        }
      }

      logger.info('Enhanced force web conversations sync response', {
        tenantId,
        userId: req.user?.id,
        requestId,
        syncResult,
        connected: connectionStatus.connected,
        hasSession: connectionStatus.hasSession,
        chatsCount: conversations?.length || 0,
        hasError: !!connectionStatus.error
      });

      return res.json({
        success: true,
        data: conversations || [],
        meta: {
          syncResult,
          connection: connectionStatus,
          chatsCount: conversations?.length || 0,
          source: 'whatsapp_web',
          syncedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('Error forcing Enhanced Web WhatsApp conversations sync', {
        tenantId: req.tenantId || req.user.tenantId,
        error: error.message,
        stack: error.stack
      });
      
      return res.status(500).json({
        success: false,
        message: 'Failed to force Web WhatsApp conversations sync',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Claim a conversation - ENHANCED ROBUST VERSION
   * Implements exclusive conversation ownership with proper validation
   * POST /api/user/whatsapp-cloud/conversations/:id/claim
   */
  static async claimConversation(req, res) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      const conversationId = req.params.id;
      const userId = req.user.id;
      const tenantId = req.tenantId || req.user.tenantId;
      const userStore = req.user.store_id || req.user.store;
      const userDepartment = req.user.department_id || req.user.department;

      logger.info('Enhanced conversation claim attempt', {
        conversationId,
        userId,
        tenantId,
        userStore,
        userDepartment,
        userObject: {
          store: req.user.store,
          store_id: req.user.store_id,
          department: req.user.department,
          department_id: req.user.department_id
        }
      });

      // Check if conversation exists with row-level locking
      const [conversations] = await connection.execute(
        `SELECT c.*, u.name as claimed_by_name, u.store as claimed_by_store, u.department as claimed_by_department
         FROM whatsapp_cloud_conversations c
         LEFT JOIN users u ON c.claimed_by_user_id = u.id
         WHERE c.id = ? AND c.tenant_id = ?
         FOR UPDATE`,
        [conversationId, tenantId]
      );

      if (conversations.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: 'Conversation not found'
        });
      }

      const conversation = conversations[0];

      // ROBUST VALIDATION: Check if already claimed by another user
      if (conversation.claimed_by_user_id && conversation.claimed_by_user_id !== userId) {
        const claimTime = new Date(conversation.claimed_at);
        const now = new Date();
        const minutesSinceClaim = Math.floor((now - claimTime) / 60000);
        
        await connection.rollback();
        return res.status(409).json({
          success: false,
          message: `Conversation is already claimed by ${conversation.claimed_by_name} (${conversation.claimed_by_store || conversation.claimed_by_department}) ${minutesSinceClaim} minutes ago`,
          claimedBy: {
            name: conversation.claimed_by_name,
            store: conversation.claimed_by_store,
            department: conversation.claimed_by_department,
            claimedAt: conversation.claimed_at
          }
        });
      }

      // ROBUST VALIDATION: Check store/department permissions
      const canClaim = WhatsAppCloudUserController.validateConversationAccess(
        conversation, 
        { 
          store: userStore || req.user.store_id, 
          department: userDepartment || req.user.department_id,
          role: req.user.role 
        }
      );

      if (!canClaim.allowed) {
        await connection.rollback();
        return res.status(403).json({
          success: false,
          message: canClaim.reason
        });
      }

      // Claim the conversation with enhanced metadata
      await connection.execute(
        `UPDATE whatsapp_cloud_conversations 
         SET claimed_by_user_id = ?, 
             claimed_at = NOW(), 
             updated_at = NOW(),
             store_id = ?,
             department_id = ?
         WHERE id = ?`,
        [userId, userStore, userDepartment, conversationId]
      );

      // Log the claim action (with error handling)
      try {
        await connection.execute(
          `INSERT INTO conversation_logs (conversation_id, user_id, action, details, created_at)
           VALUES (?, ?, 'claimed', ?, NOW())`,
          [conversationId, userId, JSON.stringify({
            userStore,
            userDepartment,
            claimTime: new Date().toISOString()
          })]
        );
      } catch (logError) {
        logger.warn('Could not log claim action (table may not exist)', {
          error: logError.message,
          conversationId,
          userId
        });
        // Continue without failing - logging is not critical
      }

      await connection.commit();

      logger.info('Enhanced conversation claimed successfully', {
        conversationId,
        userId,
        tenantId,
        userStore,
        userDepartment
      });

      // Emit enhanced WebSocket event
      const io = req.app.get('io');
      if (io) {
        const tenantNamespace = io.of(`/tenant/${tenantId}`);
        tenantNamespace.emit('whatsapp-cloud:conversation-claimed', {
          conversationId,
          userId,
          userName: req.user.name,
          userStore,
          userDepartment,
          timestamp: new Date().toISOString()
        });
        tenantNamespace.emit('conversation-claimed', {
          conversationId,
          userId,
          userName: req.user.name,
          userStore,
          userDepartment,
          timestamp: new Date().toISOString()
        });
      }

      return res.json({
        success: true,
        message: 'Conversation claimed successfully',
        data: {
          conversationId,
          claimedBy: {
            id: userId,
            name: req.user.name,
            store: userStore,
            department: userDepartment
          },
          claimedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      await connection.rollback();
      logger.error('Error in enhanced conversation claim', {
        error: error.message,
        stack: error.stack,
        conversationId: req.params.id,
        userId: req.user.id
      });
      
      return res.status(500).json({
        success: false,
        message: 'Failed to claim conversation'
      });
    } finally {
      connection.release();
    }
  }

  /**
   * Get messages for a conversation - ENHANCED ROBUST VERSION
   * Auto-claims the conversation when opened with proper validation
   * Supports both WhatsApp Cloud and Web sources
   * GET /api/user/whatsapp-cloud/conversations/:id/messages
   */
  static async getMessages(req, res) {
    const connection = await pool.getConnection();
    
    try {
      const conversationId = req.params.id;
      const userId = req.user.id;
      const tenantId = req.tenantId || req.user.tenantId;
      const source = req.query.source || 'whatsapp_cloud';

      logger.info('Enhanced messages request', {
        conversationId,
        userId,
        tenantId,
        source,
        userStore: req.user.store_id || req.user.store,
        userDepartment: req.user.department_id || req.user.department
      });

      if (source === 'whatsapp_web') {
        // Handle WhatsApp Web messages
        return await WhatsAppCloudUserController.getWebMessages(req, res);
      }

      await connection.beginTransaction();

      // Verify access and get conversation with locking
      let conversations;
      try {
        [conversations] = await connection.execute(
          `SELECT c.*, u.name as claimed_by_name 
           FROM whatsapp_cloud_conversations c
           LEFT JOIN users u ON c.claimed_by_user_id = u.id
           WHERE c.id = ? AND c.tenant_id = ?
           FOR UPDATE`,
          [conversationId, tenantId]
        );
      } catch (dbError) {
        logger.error('Database error getting conversation', {
          error: dbError.message,
          conversationId,
          tenantId,
          userId
        });
        await connection.rollback();
        return res.status(500).json({
          success: false,
          message: 'Database error accessing conversation'
        });
      }

      if (conversations.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: 'Conversation not found'
        });
      }

      const conversation = conversations[0];

      // ROBUST VALIDATION: Check if already claimed by another user
      if (conversation.claimed_by_user_id && conversation.claimed_by_user_id !== userId) {
        await connection.rollback();
        return res.status(403).json({
          success: false,
          message: `This conversation is already claimed by ${conversation.claimed_by_name}`,
          claimedBy: conversation.claimed_by_name
        });
      }

      // ROBUST VALIDATION: Check access permissions
      let userForValidation;
      let userStoreId = req.user.store_id || null;
      let userDepartmentId = req.user.department_id || null;
      let userStoreName = req.user.store || null;
      let userDepartmentName = req.user.department || null;
      try {
        if (!userStoreId && userStoreName) {
          const [storeRows] = await connection.execute(
            `SELECT id FROM stores WHERE tenant_id = ? AND name = ? LIMIT 1`,
            [tenantId, userStoreName]
          );
          userStoreId = storeRows[0]?.id || null;
        }

        if (!userDepartmentId && userDepartmentName) {
          const [deptRows] = await connection.execute(
            `SELECT id FROM departments WHERE tenant_id = ? AND name = ? LIMIT 1`,
            [tenantId, userDepartmentName]
          );
          userDepartmentId = deptRows[0]?.id || null;
        }

        if (!userStoreName && userStoreId) {
          const [storeRows] = await connection.execute(
            `SELECT name FROM stores WHERE tenant_id = ? AND id = ? LIMIT 1`,
            [tenantId, userStoreId]
          );
          userStoreName = storeRows[0]?.name || null;
        }

        if (!userDepartmentName && userDepartmentId) {
          const [deptRows] = await connection.execute(
            `SELECT name FROM departments WHERE tenant_id = ? AND id = ? LIMIT 1`,
            [tenantId, userDepartmentId]
          );
          userDepartmentName = deptRows[0]?.name || null;
        }

        userForValidation = {
          store: userStoreName,
          store_id: userStoreId,
          department: userDepartmentName,
          department_id: userDepartmentId,
          role: req.user.role
        };
        
        logger.info('User validation data', {
          userId,
          userData: {
            store_id: req.user.store_id,
            department_id: req.user.department_id,
            store: req.user.store,
            department: req.user.department,
            role: req.user.role
          },
          userForValidation,
          conversationData: {
            id: conversation.id,
            store_id: conversation.store_id,
            department_id: conversation.department_id,
            transferred_to_store: conversation.transferred_to_store,
            transferred_to_department: conversation.transferred_to_department
          }
        });
      } catch (validationError) {
        logger.error('Error preparing user validation data', {
          error: validationError.message,
          user: req.user
        });
        await connection.rollback();
        return res.status(500).json({
          success: false,
          message: 'User validation error'
        });
      }

      const canAccess = WhatsAppCloudUserController.validateConversationAccess(
        conversation, 
        userForValidation
      );

      logger.info('Conversation access validation', {
        conversationId,
        userId,
        conversation: {
          store_id: conversation.store_id,
          department_id: conversation.department_id,
          transferred_to_store: conversation.transferred_to_store,
          transferred_to_department: conversation.transferred_to_department,
          claimed_by_user_id: conversation.claimed_by_user_id
        },
        user: userForValidation,
        canAccess: canAccess
      });

      if (!canAccess.allowed) {
        await connection.rollback();
        return res.status(403).json({
          success: false,
          message: canAccess.reason
        });
      }

      // Auto-claim if not claimed (ROBUST: Only if user has permission)
      if (!conversation.claimed_by_user_id) {
        try {
          await connection.execute(
            `UPDATE whatsapp_cloud_conversations 
             SET claimed_by_user_id = ?, 
                 claimed_at = NOW(),
                 store_id = ?,
                 department_id = ?,
                 updated_at = NOW()
             WHERE id = ?`,
            [userId, userStoreId, userDepartmentId, conversationId]
          );
        } catch (claimError) {
          logger.error('Error auto-claiming conversation', {
            error: claimError.message,
            conversationId,
            userId
          });
          await connection.rollback();
          return res.status(500).json({
            success: false,
            message: 'Failed to claim conversation'
          });
        }

        // Log auto-claim (with error handling for missing table)
        try {
          await connection.execute(
            `INSERT INTO conversation_logs (conversation_id, user_id, action, details, created_at)
             VALUES (?, ?, 'auto_claimed', ?, NOW())`,
            [conversationId, userId, JSON.stringify({
              trigger: 'message_view',
              userStore: req.user.store_id || req.user.store,
              userDepartment: req.user.department_id || req.user.department
            })]
          );
        } catch (logError) {
          logger.warn('Could not log auto-claim action (table may not exist)', {
            error: logError.message,
            conversationId,
            userId
          });
          // Continue without failing - logging is not critical
        }

        // Emit claim event
        const io = req.app.get('io');
        if (io) {
          const tenantNamespace = io.of(`/tenant/${tenantId}`);
          tenantNamespace.emit('whatsapp-cloud:conversation-claimed', {
            conversationId,
            userId,
            userName: req.user.name,
            type: 'auto_claim',
            timestamp: new Date().toISOString()
          });
          tenantNamespace.emit('conversation-claimed', {
            conversationId,
            userId,
            userName: req.user.name,
            type: 'auto_claim',
            timestamp: new Date().toISOString()
          });
        }
      }

      await connection.commit();

      // Get messages with enhanced metadata
      let messages;
      try {
        [messages] = await pool.execute(
          `SELECT m.*, 
                 u.name as sent_by_name,
                 u.store as sent_by_store,
                 u.department as sent_by_department
           FROM whatsapp_cloud_messages m
           LEFT JOIN users u ON m.sent_by_user_id = u.id
           WHERE m.conversation_id = ?
           ORDER BY m.created_at ASC
           LIMIT 1000`,
          [conversationId]
        );
      } catch (messagesError) {
        logger.error('Database error getting messages', {
          error: messagesError.message,
          conversationId,
          userId
        });
        return res.status(500).json({
          success: false,
          message: 'Database error loading messages'
        });
      }

      // Mark conversation as read (with error handling)
      try {
        await pool.execute(
          `UPDATE whatsapp_cloud_conversations 
           SET unread_count = 0, 
               updated_at = NOW()
           WHERE id = ?`,
          [conversationId]
        );
      } catch (updateError) {
        logger.warn('Could not mark conversation as read', {
          error: updateError.message,
          conversationId
        });
        // Continue without failing - this is not critical
      }

      messages = messages.map((message) => ({
        ...message,
        text_content: message.text_content || message.content || message.text_body || message.text || message.message || null,
        timestamp: message.timestamp || message.created_at || message.sent_at || null,
        direction: message.direction || (message.sent_by_user_id ? 'outbound' : 'inbound')
      }));

      logger.info('Enhanced messages loaded', {
        conversationId,
        userId,
        messageCount: messages.length
      });

      return res.json({
        success: true,
        data: messages,
        meta: {
          conversationId,
          messageCount: messages.length,
          source: 'whatsapp_cloud',
          claimedBy: {
            id: userId,
            name: req.user.name,
            store: req.user.store_id || req.user.store,
            department: req.user.department_id || req.user.department
          }
        }
      });
    } catch (error) {
      await connection.rollback();
      logger.error('Error getting enhanced messages', {
        error: error.message,
        stack: error.stack,
        conversationId: req.params.id,
        userId: req.user.id
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to load messages'
      });
    } finally {
      connection.release();
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

      // Validate conversation ID
      if (!conversationId || conversationId === 'null' || conversationId === 'undefined') {
        return res.status(400).json({
          success: false,
          message: 'Invalid conversation ID'
        });
      }

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

      const io = req.app.get('io');
      if (io) {
        const tenantNamespace = io.of(`/tenant/${tenantId}`);
        tenantNamespace.emit('whatsapp-cloud:conversation-released', {
          conversationId,
          userId
        });
        tenantNamespace.emit('conversation-released', {
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
   * Send text message - ENHANCED ROBUST VERSION
   * Supports both WhatsApp Cloud API and WhatsApp Web
   * Includes comprehensive validation and error handling
   * POST /api/user/whatsapp-cloud/conversations/:id/send-message
   */
  static async sendMessage(req, res) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      const conversationId = req.params.id;
      const { message, source = 'whatsapp_cloud' } = req.body;
      const userId = req.user.id;
      const tenantId = req.tenantId || req.user.tenantId;

      logger.info('Enhanced message send request', {
        conversationId,
        userId,
        tenantId,
        messageLength: message?.length,
        source,
        userStore: req.user.store,
        userDepartment: req.user.department
      });

      // ROBUST VALIDATION
      if (!message || message.trim().length === 0) {
        await connection.rollback();
        logger.error('Message validation failed - empty message', { conversationId, userId });
        return res.status(400).json({
          success: false,
          message: 'Message text is required and cannot be empty'
        });
      }

      if (message.length > 4096) {
        await connection.rollback();
        logger.error('Message validation failed - too long', { conversationId, userId, messageLength: message.length });
        return res.status(400).json({
          success: false,
          message: 'Message too long. Maximum 4096 characters allowed.'
        });
      }

      logger.info('Message validation passed', { conversationId, userId });
      const trimmedMessage = message.trim();

      if (source === 'whatsapp_web') {
        let resolvedConversationId = conversationId;
        let webConversation = null;
        if (String(conversationId).includes('@')) {
          const rawJid = String(conversationId);
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
          const [existing] = await connection.execute(
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
            webConversation = existing[0];
            resolvedConversationId = webConversation.id;
          } else if (normalizedPhone) {
            const [insertResult] = await connection.execute(
              'INSERT INTO conversations (tenant_id, phone_number, remote_jid, contact_name, last_message, last_message_time, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), ?, NOW(), NOW())',
              [tenantId, normalizedPhone, normalizedRemoteJid, normalizedPhone, trimmedMessage, 'waiting']
            );
            resolvedConversationId = insertResult.insertId;
            const [created] = await connection.execute(
              'SELECT * FROM conversations WHERE id = ? AND tenant_id = ? LIMIT 1',
              [resolvedConversationId, tenantId]
            );
            webConversation = created[0] || null;
          }
        } else {
          const [webConversations] = await connection.execute(
            `SELECT * FROM conversations WHERE id = ? AND tenant_id = ? LIMIT 1`,
            [conversationId, tenantId]
          );
          webConversation = webConversations[0] || null;
        }

        if (!webConversation) {
          await connection.rollback();
          return res.status(404).json({
            success: false,
            message: 'Conversation not found'
          });
        }
        const targetPhone = webConversation.phone_number || webConversation.remote_jid;
        const sendResult = await WhatsAppCloudUserController.sendWebMessage(
          tenantId,
          targetPhone,
          trimmedMessage,
          conversationId,
          resolvedConversationId,
          {
            senderUserId: userId,
            senderName: req.user.name || null,
            senderStore: req.user.store || null,
            senderDepartment: req.user.department || null,
            metadata: { source: 'whatsapp_web' }
          }
        );

        if (!sendResult.success) {
          await connection.rollback();
          return res.status(500).json({
            success: false,
            message: sendResult.error || 'Failed to send message'
          });
        }

        await connection.commit();

        return res.json({
          success: true,
          message: 'Message sent successfully',
          data: {
            messageId: sendResult.messageId,
            conversationId: resolvedConversationId,
            timestamp: new Date().toISOString(),
            source: 'whatsapp_web'
          }
        });
      }

      // Get conversation and verify claim with locking
      logger.info('Fetching conversation details', { conversationId, tenantId, userId });
      const [conversations] = await connection.execute(
        `SELECT c.*, a.phone_number_id, a.access_token, a.account_name, a.status as account_status
         FROM whatsapp_cloud_conversations c
         LEFT JOIN whatsapp_cloud_accounts a ON c.account_id = a.id
         WHERE c.id = ? AND c.tenant_id = ? AND c.claimed_by_user_id = ?
         FOR UPDATE`,
        [conversationId, tenantId, userId]
      );

      logger.info('Conversation query result', { 
        conversationId, 
        found: conversations.length > 0,
        conversationData: conversations.length > 0 ? {
          id: conversations[0].id,
          accountId: conversations[0].account_id,
          hasPhoneNumberId: !!conversations[0].phone_number_id,
          hasAccessToken: !!conversations[0].access_token,
          accountStatus: conversations[0].account_status
        } : null
      });

      if (conversations.length === 0) {
        await connection.rollback();
        logger.error('Conversation not found or not claimed', { conversationId, tenantId, userId });
        return res.status(403).json({
          success: false,
          message: 'Conversation not found or not claimed by you'
        });
      }

      const conversation = conversations[0];

      // Log conversation details for debugging
      logger.info('Conversation details for message send', {
        conversationId,
        accountId: conversation.account_id,
        phoneNumberId: conversation.phone_number_id,
        hasAccessToken: !!conversation.access_token,
        accountStatus: conversation.account_status,
        contactPhone: conversation.contact_phone
      });

      // Validate account configuration
      logger.info('Starting account validation', { conversationId, accountId: conversation.account_id });
      
      if (!conversation.account_id) {
        await connection.rollback();
        logger.error('Account validation failed - no account_id', { conversationId });
        return res.status(400).json({
          success: false,
          message: 'Conversation has no associated WhatsApp account'
        });
      }

      if (!conversation.phone_number_id) {
        await connection.rollback();
        logger.error('Account validation failed - no phone_number_id', { conversationId, accountId: conversation.account_id });
        return res.status(400).json({
          success: false,
          message: 'WhatsApp account is missing phone_number_id configuration'
        });
      }

      if (!conversation.access_token) {
        await connection.rollback();
        logger.error('Account validation failed - no access_token', { conversationId, accountId: conversation.account_id });
        return res.status(400).json({
          success: false,
          message: 'WhatsApp account is missing access_token configuration'
        });
      }

      if (conversation.account_status !== 'connected') {
        await connection.rollback();
        logger.error('Account validation failed - not connected', { 
          conversationId, 
          accountId: conversation.account_id, 
          status: conversation.account_status 
        });
        return res.status(400).json({
          success: false,
          message: `WhatsApp account is not connected (status: ${conversation.account_status})`
        });
      }

      logger.info('Account validation passed', { conversationId, accountId: conversation.account_id });

      // Handle different sources
      logger.info('Preparing to send message', { conversationId, source });
      let sendResult;
      if (source === 'whatsapp_web') {
        logger.info('Sending via WhatsApp Web', { conversationId });
        sendResult = await WhatsAppCloudUserController.sendWebMessage(
          tenantId,
          conversation.contact_phone,
          message,
          conversationId,
          {
            senderUserId: userId,
            senderName: req.user.name || null,
            senderStore: req.user.store || null,
            senderDepartment: req.user.department || null,
            metadata: { source: 'whatsapp_web' }
          }
        );
      } else {
        logger.info('Sending via WhatsApp Cloud', { conversationId });
        sendResult = await WhatsAppCloudUserController.sendCloudMessage(
          conversation, message, conversationId
        );
      }

      logger.info('Send result received', { 
        conversationId, 
        success: sendResult.success, 
        error: sendResult.error,
        messageId: sendResult.messageId
      });

      if (!sendResult.success) {
        await connection.rollback();
        logger.error('Message send failed', { 
          conversationId, 
          error: sendResult.error,
          details: sendResult.details
        });
        return res.status(500).json({
          success: false,
          message: sendResult.error || 'Failed to send message'
        });
      }

      // Save message to database with enhanced metadata
      logger.info('Saving message to database', { 
        conversationId, 
        messageId: sendResult.messageId,
        tenantId,
        accountId: conversation.account_id
      });
      
      let messageResult;
      try {
        [messageResult] = await connection.execute(
          `INSERT INTO whatsapp_cloud_messages 
           (conversation_id, message_id, direction, message_type, text_content, status, timestamp, sent_by_user_id, created_at)
           VALUES (?, ?, 'outbound', 'text', ?, 'sent', NOW(), ?, NOW())`,
          [
            conversationId, 
            sendResult.messageId || `msg_${Date.now()}`, 
            message.trim(),
            userId
          ]
        );
        
        logger.info('Message saved to database successfully', { 
          conversationId, 
          messageId: messageResult.insertId,
          dbMessageId: sendResult.messageId
        });
      } catch (messageInsertError) {
        logger.error('Error inserting message to database', {
          error: messageInsertError.message,
          stack: messageInsertError.stack,
          conversationId,
          userId,
          tenantId,
          accountId: conversation.account_id
        });
        // Continue without failing - the message was sent successfully
        messageResult = { insertId: Date.now() };
      }

      // Update conversation metadata (with error handling)
      try {
        await connection.execute(
          `UPDATE whatsapp_cloud_conversations 
           SET last_message_text = ?, 
               last_message_time = NOW(), 
               last_message_from = 'business',
               message_count = message_count + 1,
               updated_at = NOW()
           WHERE id = ?`,
          [message.substring(0, 255), conversationId]
        );
      } catch (updateError) {
        logger.warn('Could not update conversation metadata', {
          error: updateError.message,
          conversationId
        });
        // Continue without failing
      }

      // Log the message send action (with error handling)
      try {
        await connection.execute(
          `INSERT INTO conversation_logs (conversation_id, user_id, action, details, created_at)
           VALUES (?, ?, 'message_sent', ?, NOW())`,
          [conversationId, userId, JSON.stringify({
            messageLength: message.length,
            source,
            messageId: sendResult.messageId
          })]
        );
      } catch (logError) {
        logger.warn('Could not log message send action', {
          error: logError.message,
          conversationId,
          userId
        });
        // Continue without failing - logging is not critical
      }

      await connection.commit();

      logger.info('Enhanced message sent successfully', {
        conversationId,
        userId,
        messageId: sendResult.messageId,
        source
      });

      // Emit enhanced WebSocket event
      const io = req.app.get('io');
      if (io) {
        const tenantNamespace = io.of(`/tenant/${tenantId}`);
        tenantNamespace.emit('message-sent', {
          conversationId,
          message: {
            id: messageResult.insertId,
            messageId: sendResult.messageId,
            text: message,
            direction: 'outbound',
            timestamp: new Date().toISOString(),
            sent_by_name: req.user.name,
            sent_by_store: req.user.store,
            sent_by_department: req.user.department,
            source
          }
        });
      }

      return res.json({
        success: true,
        message: 'Message sent successfully',
        data: {
          messageId: sendResult.messageId,
          conversationId,
          timestamp: new Date().toISOString(),
          source
        }
      });
    } catch (error) {
      await connection.rollback();
      logger.error('Error in enhanced message send', {
        error: error.message,
        stack: error.stack,
        conversationId: req.params.id,
        userId: req.user.id
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to send message'
      });
    } finally {
      connection.release();
    }
  }

  /**
   * Add internal note
   * POST /api/user/whatsapp-cloud/conversations/:id/internal-note
   */
  static async addInternalNote(req, res) {
    try {
      const conversationId = req.params.id;
      const { note } = req.body;
      const userId = req.user.id;
      const tenantId = req.tenantId || req.user.tenantId;

      if (!note) {
        return res.status(400).json({
          success: false,
          message: 'Note text is required'
        });
      }

      // Verify access and get conversation with account details
      const [conversations] = await pool.execute(
        `SELECT c.*, a.phone_number_id, a.account_name
         FROM whatsapp_cloud_conversations c
         LEFT JOIN whatsapp_cloud_accounts a ON c.account_id = a.id
         WHERE c.id = ? AND c.tenant_id = ?`,
        [conversationId, tenantId]
      );

      if (conversations.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Conversation not found'
        });
      }

      const conversation = conversations[0];

      // Save internal note
      const [result] = await pool.execute(
        `INSERT INTO whatsapp_cloud_messages 
         (conversation_id, message_id, direction, message_type, text_content, is_internal_note, status, timestamp, sent_by_user_id, created_at)
         VALUES (?, ?, 'outbound', 'text', ?, TRUE, 'sent', NOW(), ?, NOW())`,
        [conversationId, `note_${Date.now()}`, note, userId]
      );

      logger.info('Internal note added', {
        conversationId,
        userId,
        noteId: result.insertId
      });

      return res.json({
        success: true,
        message: 'Internal note added successfully',
        data: {
          noteId: result.insertId
        }
      });
    } catch (error) {
      logger.error('Error adding internal note', {
        error: error.message,
        stack: error.stack
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to add internal note'
      });
    }
  }

  /**
   * Update conversation tags - ENHANCED ROBUST VERSION
   * Supports adding, removing, and managing conversation tags
   * PUT /api/user/whatsapp-cloud/conversations/:id/tags
   */
  static async updateTags(req, res) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      const conversationId = req.params.id;
      const { tags, action = 'replace' } = req.body; // action: 'replace', 'add', 'remove'
      const userId = req.user.id;
      const tenantId = req.tenantId || req.user.tenantId;

      logger.info('Enhanced tags update request', {
        conversationId,
        userId,
        tenantId,
        tags,
        action
      });

      // Permission: tenant admin only
      if (req.user?.role !== 'admin') {
        await connection.rollback();
        return res.status(403).json({
          success: false,
          message: 'Only tenant admins can edit tags'
        });
      }

      // ROBUST VALIDATION
      if (!Array.isArray(tags)) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: 'Tags must be an array'
        });
      }

      // Validate tag format and length
      const validTags = tags.filter(tag => {
        return typeof tag === 'string' && 
               tag.trim().length > 0 && 
               tag.trim().length <= 50 &&
               /^[a-zA-Z0-9\s\-_]+$/.test(tag.trim());
      }).map(tag => tag.trim().toLowerCase());

      if (validTags.length !== tags.length) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: 'Invalid tag format. Tags must be 1-50 characters, alphanumeric with spaces, hyphens, and underscores only.'
        });
      }

      // Verify conversation exists and user has access
      const [conversations] = await connection.execute(
        `SELECT c.*, c.tags as current_tags
         FROM whatsapp_cloud_conversations c
         WHERE c.id = ? AND c.tenant_id = ?
         FOR UPDATE`,
        [conversationId, tenantId]
      );

      if (conversations.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: 'Conversation not found'
        });
      }

      const conversation = conversations[0];
      let currentTags = [];
      
      try {
        currentTags = conversation.current_tags ? JSON.parse(conversation.current_tags) : [];
      } catch (e) {
        currentTags = [];
      }

      // Apply tag action
      let newTags = [];
      switch (action) {
        case 'add':
          newTags = [...new Set([...currentTags, ...validTags])];
          break;
        case 'remove':
          newTags = currentTags.filter(tag => !validTags.includes(tag));
          break;
        case 'replace':
        default:
          newTags = [...new Set(validTags)];
          break;
      }

      // Limit to maximum 3 tags
      if (newTags.length > 3) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: 'Maximum 3 tags allowed per conversation'
        });
      }

      // Update conversation tags
      await connection.execute(
        `UPDATE whatsapp_cloud_conversations 
         SET tags = ?, updated_at = NOW()
         WHERE id = ? AND tenant_id = ?`,
        [JSON.stringify(newTags), conversationId, tenantId]
      );

      // Log tag update
      await connection.execute(
        `INSERT INTO conversation_logs (conversation_id, user_id, action, details, created_at)
         VALUES (?, ?, 'tags_updated', ?, NOW())`,
        [conversationId, userId, JSON.stringify({
          action,
          previousTags: currentTags,
          newTags,
          addedTags: validTags
        })]
      );

      await connection.commit();

      logger.info('Enhanced tags updated successfully', {
        conversationId,
        userId,
        previousCount: currentTags.length,
        newCount: newTags.length,
        action
      });

      // Emit WebSocket event
      const io = req.app.get('io');
      if (io) {
        const tenantNamespace = io.of(`/tenant/${tenantId}`);
        tenantNamespace.emit('conversation-tags-updated', {
          conversationId,
          tags: newTags,
          action,
          updatedBy: req.user.name,
          timestamp: new Date().toISOString()
        });
      }

      return res.json({
        success: true,
        message: 'Tags updated successfully',
        data: {
          conversationId,
          tags: newTags,
          action,
          previousTags: currentTags
        }
      });
    } catch (error) {
      await connection.rollback();
      logger.error('Error updating enhanced tags', {
        error: error.message,
        stack: error.stack,
        conversationId: req.params.id,
        userId: req.user.id
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to update tags'
      });
    } finally {
      connection.release();
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

      if (!['low', 'normal', 'high', 'urgent'].includes(priority)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid priority value'
        });
      }

      await pool.execute(
        `UPDATE whatsapp_cloud_conversations 
         SET priority = ?, updated_at = NOW()
         WHERE id = ? AND tenant_id = ?`,
        [priority, conversationId, tenantId]
      );

      return res.json({
        success: true,
        message: 'Priority updated successfully'
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
      const { stage } = req.body;
      const tenantId = req.tenantId || req.user.tenantId;

      if (!stage) {
        return res.status(400).json({
          success: false,
          message: 'Stage is required'
        });
      }

      await pool.execute(
        `UPDATE whatsapp_cloud_conversations 
         SET stage_id = ?, pipeline_stage = ?, updated_at = NOW()
         WHERE id = ? AND tenant_id = ?`,
        [stage, stage, conversationId, tenantId]
      );

      logger.info('Conversation stage updated', {
        conversationId,
        stage,
        tenantId
      });

      return res.json({
        success: true,
        message: 'Stage updated successfully'
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

  /**
   * Get WhatsApp Cloud accounts for current user
   * GET /api/user/whatsapp-cloud/accounts
   */
  static async getAccounts(req, res) {
    try {
      const tenantId = req.tenantId || req.user.tenantId;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: 'Tenant ID not found'
        });
      }

      // Get all accounts for the tenant
      const query = `
        SELECT id, account_name, phone_number, status, webhook_verified, waba_id as business_account_id
        FROM whatsapp_cloud_accounts
        WHERE tenant_id = ?
        ORDER BY account_name ASC
      `;

      const [accounts] = await pool.execute(query, [tenantId]);
      const normalizedAccounts = accounts.map(account => {
        const isConnected = account.status === 'connected' && account.webhook_verified;
        return {
          ...account,
          connection_status: isConnected ? 'connected' : 'disconnected'
        };
      });

      return res.json({
        success: true,
        data: normalizedAccounts
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
   * Get pipeline stages for current tenant (read-only)
   * GET /api/user/whatsapp-cloud/pipeline-stages
   */
  static async getPipelineStages(req, res) {
    try {
      const tenantId = req.tenantId || req.user.tenantId;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: 'Tenant ID not found'
        });
      }

      const [stages] = await pool.execute(`
        SELECT stage_key, stage_name, stage_color, stage_icon, stage_order
        FROM pipeline_stages
        WHERE tenant_id = ? AND active = TRUE
        ORDER BY stage_order ASC
      `, [tenantId]);

      return res.json({
        success: true,
        data: stages
      });
    } catch (error) {
      logger.error('Error getting pipeline stages', {
        error: error.message,
        stack: error.stack
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to load pipeline stages'
      });
    }
  }

  /**
   * Get stores for transfer
   * GET /api/user/whatsapp-cloud/stores
   */
  static async getStores(req, res) {
    try {
      const tenantId = req.tenantId || req.user.tenantId;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: 'Tenant ID not found'
        });
      }

      const [stores] = await pool.execute(`
        SELECT id, name, description
        FROM stores
        WHERE tenant_id = ? AND is_active = TRUE
        ORDER BY name ASC
      `, [tenantId]);

      return res.json({
        success: true,
        data: stores
      });
    } catch (error) {
      logger.error('Error getting stores', {
        error: error.message,
        stack: error.stack
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to load stores'
      });
    }
  }

  /**
   * Get departments for transfer
   * GET /api/user/whatsapp-cloud/departments
   */
  static async getDepartments(req, res) {
    try {
      const tenantId = req.tenantId || req.user.tenantId;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: 'Tenant ID not found'
        });
      }

      const [departments] = await pool.execute(`
        SELECT id, name, description
        FROM departments
        WHERE tenant_id = ? AND is_active = TRUE
        ORDER BY name ASC
      `, [tenantId]);

      return res.json({
        success: true,
        data: departments
      });
    } catch (error) {
      logger.error('Error getting departments', {
        error: error.message,
        stack: error.stack
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to load departments'
      });
    }
  }

  // ============================================================================
  // ENHANCED AUXILIARY METHODS - ROBUST IMPLEMENTATIONS
  // ============================================================================

  /**
   * Validate conversation access based on user store/department
   * @param {Object} conversation - Conversation object
   * @param {Object} user - User object with store/department
   * @returns {Object} { allowed: boolean, reason: string }
   */
  static validateConversationAccess(conversation, user) {
    try {
      // Admin users can access any conversation
      if (user.role === 'admin') {
        return { allowed: true, reason: 'Admin access' };
      }

      const hasStore = !!(user.store || user.store_id);
      const hasDepartment = !!(user.department || user.department_id);
      if (!hasStore && !hasDepartment) {
        return { allowed: true, reason: 'User without assignment' };
      }

      // If conversation is not assigned to any store/department, allow access (stores only)
      if (!conversation.store_id && !conversation.department_id && 
          !conversation.transferred_to_store && !conversation.transferred_to_department) {
        return user.department
          ? { allowed: false, reason: 'This conversation is not assigned to your department' }
          : { allowed: true, reason: 'Unassigned conversation' };
      }

      // Check department access (departments only see transferred conversations)
      if (user.department || user.department_id) {
        const departmentValue = user.department ? String(user.department) : null;
        const departmentIdValue = user.department_id ? String(user.department_id) : null;
        const transferredValue = conversation.transferred_to_department !== null && conversation.transferred_to_department !== undefined
          ? String(conversation.transferred_to_department)
          : '';
        if (transferredValue && (transferredValue === departmentValue || transferredValue === departmentIdValue)) {
          return { allowed: true, reason: 'Department transfer match' };
        }
        return { 
          allowed: false, 
          reason: 'This conversation is not transferred to your department' 
        };
      }

      // Check store access (stores see unassigned conversations and their store conversations)
      if (user.store) {
        // Store users can access:
        // 1. Unassigned conversations (no store_id, no department_id, no transfers)
        // 2. Conversations assigned to their store
        // 3. Conversations transferred to their store
        // IMPORTANT: Stores cannot see conversations transferred to departments
        
        // If conversation was transferred to a department, store cannot access it
        if (conversation.transferred_to_department) {
          return { 
            allowed: false, 
            reason: 'This conversation was transferred to a department' 
          };
        }
        
        const isUnassigned = !conversation.store_id && !conversation.department_id && 
                           !conversation.transferred_to_store && !conversation.transferred_to_department;
        const storeValue = String(user.store);
        const storeIdValue = user.store_id ? String(user.store_id) : null;
        const storedStoreId = conversation.store_id !== null && conversation.store_id !== undefined
          ? String(conversation.store_id)
          : '';
        const storedTransferredStore = conversation.transferred_to_store !== null && conversation.transferred_to_store !== undefined
          ? String(conversation.transferred_to_store)
          : '';
        const isStoreConversation = (storedStoreId && (storedStoreId === storeValue || (storeIdValue && storedStoreId === storeIdValue))) || 
                                  (storedTransferredStore && (storedTransferredStore === storeValue || (storeIdValue && storedTransferredStore === storeIdValue)));
        const hasNoDepartment = !conversation.department_id && !conversation.transferred_to_department;
        
        if (isUnassigned || (isStoreConversation && hasNoDepartment)) {
          return { allowed: true, reason: 'Store access' };
        }
        return { 
          allowed: false, 
          reason: 'This conversation is not available to your store' 
        };
      }

      return { allowed: false, reason: 'No store or department assigned to user' };
    } catch (error) {
      logger.error('Error validating conversation access', { error: error.message });
      return { allowed: false, reason: 'Access validation error' };
    }
  }

  /**
   * Send message via WhatsApp Cloud API
   * @param {Object} conversation - Conversation with account details
   * @param {string} message - Message text
   * @param {string} conversationId - Conversation ID
   * @returns {Object} { success: boolean, messageId?: string, error?: string }
   */
  static async sendCloudMessage(conversation, message, conversationId) {
    try {
      logger.info('Attempting to send Cloud message', {
        conversationId,
        phoneNumberId: conversation.phone_number_id,
        hasAccessToken: !!conversation.access_token,
        contactPhone: conversation.contact_phone,
        messageLength: message?.length
      });

      // Validate required fields
      if (!conversation.phone_number_id) {
        return {
          success: false,
          error: 'Missing phone_number_id in conversation account'
        };
      }

      if (!conversation.access_token) {
        return {
          success: false,
          error: 'Missing access_token in conversation account'
        };
      }

      if (!conversation.contact_phone) {
        return {
          success: false,
          error: 'Missing contact_phone in conversation'
        };
      }

      // Check customer care window (last inbound within 24h)
      const [lastInboundRows] = await pool.execute(
        `SELECT timestamp, created_at FROM whatsapp_cloud_messages 
         WHERE conversation_id = ? AND direction = 'inbound' 
         ORDER BY COALESCE(timestamp, created_at) DESC LIMIT 1`,
        [conversationId]
      );
      
      let lastInbound = null;
      let hoursSinceLastInbound = null;
      
      if (lastInboundRows.length > 0) {
        const timestamp = lastInboundRows[0].timestamp || lastInboundRows[0].created_at;
        // Handle both Unix timestamp formats (seconds or milliseconds)
        if (timestamp > 1000000000000) {
          // Timestamp in milliseconds
          lastInbound = new Date(timestamp);
        } else {
          // Timestamp in seconds (convert to milliseconds)
          lastInbound = new Date(timestamp * 1000);
        }
        hoursSinceLastInbound = (Date.now() - lastInbound.getTime()) / (1000 * 60 * 60);
      }
      
      logger.info('Customer care window check', {
        conversationId,
        rawTimestamp: lastInboundRows.length > 0 ? lastInboundRows[0].timestamp : null,
        lastInbound: lastInbound?.toISOString(),
        hoursSinceLastInbound,
        withinWindow: hoursSinceLastInbound ? hoursSinceLastInbound < 24 : false
      });

      if (!lastInbound || hoursSinceLastInbound > 24) {
        return {
          success: false,
          error: `Customer care window expired. Last inbound message was ${hoursSinceLastInbound ? Math.round(hoursSinceLastInbound) : 'never'} hours ago. Please use an approved template.`
        };
      }

      // Normalize destination phone (digits only, international format)
      let toPhone = String(conversation.contact_phone || '').trim();
      toPhone = toPhone.replace(/[^\d]/g, '');

      if (!toPhone) {
        return {
          success: false,
          error: 'Invalid phone number'
        };
      }

      logger.info('Sending message to WhatsApp Cloud API', {
        conversationId,
        phoneNumberId: conversation.phone_number_id,
        toPhone,
        apiUrl: `https://graph.facebook.com/v18.0/${conversation.phone_number_id}/messages`
      });

      // Send via WhatsApp Cloud API with retry logic
      let response;
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        try {
          attempts++;
          
          logger.info(`WhatsApp Cloud API attempt ${attempts}`, {
            conversationId,
            phoneNumberId: conversation.phone_number_id,
            toPhone
          });

          response = await axios.post(
            `https://graph.facebook.com/v18.0/${conversation.phone_number_id}/messages`,
            {
              messaging_product: 'whatsapp',
              to: toPhone,
              type: 'text',
              text: { body: message }
            },
            {
              headers: {
                'Authorization': `Bearer ${conversation.access_token}`,
                'Content-Type': 'application/json'
              },
              timeout: 15000 // 15 second timeout
            }
          );
          
          logger.info('WhatsApp Cloud API success', {
            conversationId,
            messageId: response.data.messages?.[0]?.id,
            attempt: attempts
          });
          
          break; // Success, exit retry loop
        } catch (apiError) {
          const errorDetails = {
            status: apiError.response?.status,
            statusText: apiError.response?.statusText,
            data: apiError.response?.data,
            message: apiError.message,
            code: apiError.code
          };
          
          logger.warn(`WhatsApp Cloud API attempt ${attempts} failed`, {
            error: errorDetails,
            conversationId,
            toPhone,
            phoneNumberId: conversation.phone_number_id
          });

          if (attempts >= maxAttempts) {
            let errorMessage = 'Failed to send message';
            
            if (apiError.code === 'ECONNABORTED') {
              errorMessage = 'Request timeout - WhatsApp API is not responding';
            } else if (apiError.response?.data?.error?.message) {
              errorMessage = apiError.response.data.error.message;
            } else if (apiError.message) {
              errorMessage = apiError.message;
            }
            
            return {
              success: false,
              error: errorMessage,
              details: apiError.response?.data
            };
          }

          // Wait before retry (exponential backoff: 1s, 2s, 4s)
          const delay = Math.pow(2, attempts - 1) * 1000;
          logger.info(`Waiting ${delay}ms before retry ${attempts + 1}`, { conversationId });
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      if (!response?.data?.messages?.[0]?.id) {
        return {
          success: false,
          error: 'Invalid response from WhatsApp API'
        };
      }

      return {
        success: true,
        messageId: response.data.messages[0].id
      };
    } catch (error) {
      logger.error('Error in sendCloudMessage', { 
        error: error.message, 
        stack: error.stack,
        conversationId,
        phoneNumberId: conversation?.phone_number_id,
        hasAccessToken: !!conversation?.access_token
      });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Send media message via WhatsApp Cloud API
   * @param {Object} conversation - Conversation object with account details
   * @param {Object} file - Uploaded file object
   * @param {string} mediaType - Type of media (image, video, audio, document)
   * @param {string} caption - Optional caption
   * @param {string} conversationId - Conversation ID for logging
   * @returns {Object} { success: boolean, whatsappMessageId?: string, error?: string }
   */
  static async sendCloudMediaMessage(conversation, file, mediaType, caption, conversationId) {
    try {
      logger.info('Attempting to send Cloud media message', {
        conversationId,
        phoneNumberId: conversation.phone_number_id,
        hasAccessToken: !!conversation.access_token,
        contactPhone: conversation.contact_phone,
        mediaType,
        fileName: file.filename,
        fileSize: file.size,
        hasCaption: !!caption
      });

      // Validate required fields
      if (!conversation.phone_number_id) {
        return {
          success: false,
          error: 'Missing phone_number_id in conversation account'
        };
      }

      if (!conversation.access_token) {
        return {
          success: false,
          error: 'Missing access_token in conversation account'
        };
      }

      if (!conversation.contact_phone) {
        return {
          success: false,
          error: 'Missing contact_phone in conversation'
        };
      }

      // Normalize destination phone
      let toPhone = String(conversation.contact_phone || '').trim();
      if (toPhone && !toPhone.startsWith('+')) {
        toPhone = `+${toPhone}`;
      }

      if (!toPhone) {
        return {
          success: false,
          error: 'Invalid phone number'
        };
      }

      // Step 1: Upload media to Facebook
      const FormData = require('form-data');
      const fs = require('fs');
      
      const uploadFormData = new FormData();
      uploadFormData.append('file', fs.createReadStream(file.path), {
        filename: file.filename,
        contentType: file.mimetype
      });
      uploadFormData.append('type', file.mimetype);
      uploadFormData.append('messaging_product', 'whatsapp');

      logger.info('Uploading media to Facebook', {
        conversationId,
        phoneNumberId: conversation.phone_number_id,
        uploadUrl: `https://graph.facebook.com/v18.0/${conversation.phone_number_id}/media`
      });

      let uploadResponse;
      try {
        // Log início do upload
        logger.info('Starting media upload to Facebook', {
          conversationId,
          fileSize: fs.statSync(file.path).size,
          mimeType: file.mimetype
        });

        uploadResponse = await axios.post(
          `https://graph.facebook.com/v18.0/${conversation.phone_number_id}/media`,
          uploadFormData,
          {
            headers: {
              'Authorization': `Bearer ${conversation.access_token}`,
              ...uploadFormData.getHeaders()
            },
            timeout: 45000, // Reduzido de 60 para 45 segundos
            maxContentLength: 50 * 1024 * 1024, // 50MB limit
            maxBodyLength: 50 * 1024 * 1024
          }
        );
      } catch (uploadError) {
        logger.error('Media upload failed', {
          conversationId,
          error: uploadError.response?.data || uploadError.message,
          status: uploadError.response?.status,
          timeout: uploadError.code === 'ECONNABORTED'
        });
        return {
          success: false,
          error: uploadError.code === 'ECONNABORTED' 
            ? 'Upload timeout - file may be too large or connection slow'
            : `Media upload failed: ${uploadError.response?.data?.error?.message || uploadError.message}`
        };
      }

      const mediaId = uploadResponse.data.id;
      logger.info('Media uploaded successfully', {
        conversationId,
        mediaId
      });

      // Step 2: Send message with media
      const messagePayload = {
        messaging_product: 'whatsapp',
        to: toPhone,
        type: mediaType,
        [mediaType]: {
          id: mediaId
        }
      };

      // Add caption if provided (audio captions are not supported by Cloud API)
      if (caption && caption.trim() && mediaType !== 'audio') {
        messagePayload[mediaType].caption = caption.trim();
      }

      logger.info('Sending media message to WhatsApp Cloud API', {
        conversationId,
        phoneNumberId: conversation.phone_number_id,
        toPhone,
        mediaId,
        hasCaption: !!caption
      });

      let messageResponse;
      try {
        messageResponse = await axios.post(
          `https://graph.facebook.com/v18.0/${conversation.phone_number_id}/messages`,
          messagePayload,
          {
            headers: {
              'Authorization': `Bearer ${conversation.access_token}`,
              'Content-Type': 'application/json'
            },
            timeout: 20000 // Reduzido de 30 para 20 segundos
          }
        );
      } catch (messageError) {
        logger.error('Media message send failed', {
          conversationId,
          error: messageError.response?.data || messageError.message,
          status: messageError.response?.status,
          timeout: messageError.code === 'ECONNABORTED'
        });
        return {
          success: false,
          error: messageError.code === 'ECONNABORTED'
            ? 'Message send timeout - please try again'
            : `Message send failed: ${messageError.response?.data?.error?.message || messageError.message}`
        };
      }

      const whatsappMessageId = messageResponse.data.messages[0].id;
      logger.info('Media message sent successfully', {
        conversationId,
        whatsappMessageId
      });

      return {
        success: true,
        whatsappMessageId
      };

    } catch (error) {
      logger.error('Error in sendCloudMediaMessage', { 
        error: error.message, 
        stack: error.stack,
        conversationId,
        phoneNumberId: conversation?.phone_number_id,
        hasAccessToken: !!conversation?.access_token
      });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Send message via WhatsApp Web
   * @param {number} tenantId - Tenant ID
   * @param {string} phoneNumber - Phone number
   * @param {string} message - Message text
   * @param {string} conversationId - Conversation ID
   * @returns {Object} { success: boolean, messageId?: string, error?: string }
   */
  static async sendWebMessage(tenantId, phoneNumber, message, conversationId, options = {}) {
    try {
      const io = require('../server').io; // Get io from server
      const whatsappService = getWhatsAppService(io);
      
      if (!whatsappService) {
        return {
          success: false,
          error: 'WhatsApp service not available'
        };
      }

      const result = await whatsappService.sendMessage(tenantId, phoneNumber, message, conversationId, options);
      
      return {
        success: result.success,
        messageId: result.whatsappMessageId,
        error: result.error
      };
    } catch (error) {
      logger.error('Error in sendWebMessage', { error: error.message, tenantId, conversationId });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get WhatsApp Web messages for a conversation
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  static async getWebMessages(req, res) {
    try {
      const conversationId = req.params.id;
      const tenantId = req.tenantId || req.user.tenantId;
      logger.info('Getting WhatsApp Web messages', {
        conversationId,
        tenantId,
        userId: req.user.id
      });

      const page = Math.max(1, parseInt(req.query.page || '1', 10));
      const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || '50', 10)));
      const offset = (page - 1) * limit;

      let resolvedConversationId = conversationId;
      if (String(conversationId).includes('@')) {
        const rawJid = String(conversationId);
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
        const [existing] = await pool.query(
          `SELECT id FROM conversations 
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
          resolvedConversationId = existing[0].id;
        } else if (normalizedPhone) {
          const [insertResult] = await pool.query(
            'INSERT INTO conversations (tenant_id, phone_number, remote_jid, contact_name, last_message, last_message_time, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), ?, NOW(), NOW())',
            [tenantId, normalizedPhone, normalizedRemoteJid, normalizedPhone, '', 'waiting']
          );
          resolvedConversationId = insertResult.insertId;
        }
      } else {
        const [conversations] = await pool.query(
          'SELECT id FROM conversations WHERE id = ? AND tenant_id = ? LIMIT 1',
          [conversationId, tenantId]
        );
        if (conversations.length === 0) {
          return res.status(404).json({
            success: false,
            message: 'Conversation not found'
          });
        }
      }

      const [[countRow]] = await pool.query(
        'SELECT COUNT(*) as total FROM whatsapp_messages WHERE tenant_id = ? AND conversation_id = ?',
        [tenantId, resolvedConversationId]
      );

      const [messages] = await pool.query(
        `SELECT * FROM whatsapp_messages
         WHERE tenant_id = ? AND conversation_id = ?
         ORDER BY created_at ASC
         LIMIT ? OFFSET ?`,
        [tenantId, resolvedConversationId, limit, offset]
      );

      const formattedMessages = messages.map(message => ({
        ...message,
        direction: message.direction === 'outgoing' ? 'outbound' : 'inbound',
        text_content: message.content,
        sent_by_user_id: message.sender_user_id || null,
        sent_by_name: message.sender_name || null,
        sent_by_store: message.sender_store || null,
        sent_by_department: message.sender_department || null
      }));

      return res.json({
        success: true,
        data: formattedMessages,
        pagination: {
          page,
          pages: Math.max(1, Math.ceil((countRow?.total || 0) / limit)),
          total: countRow?.total || 0,
          limit
        },
        meta: {
          source: 'whatsapp_web',
          conversationId: resolvedConversationId,
          messageCount: formattedMessages.length
        }
      });
    } catch (error) {
      logger.error('Error getting WhatsApp Web messages', {
        error: error.message,
        conversationId: req.params.id
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to load WhatsApp Web messages'
      });
    }
  }

  /**
   * Upload and send media file - ENHANCED ROBUST VERSION
   * Supports images, videos, documents, audio files
   * POST /api/user/whatsapp-cloud/conversations/:id/send-media
   */
  static async sendMediaMessage(req, res) {
    const uploadSingle = upload.single('media');
    
    uploadSingle(req, res, async (uploadError) => {
      if (uploadError) {
        logger.error('Media upload error', { error: uploadError.message });
        return res.status(400).json({
          success: false,
          message: 'File upload failed: ' + uploadError.message
        });
      }

      const connection = await pool.getConnection();
      
      try {
        await connection.beginTransaction();
        
        const conversationId = req.params.id;
        const { caption = '', source = 'whatsapp_cloud' } = req.body;
        const userId = req.user.id;
        const tenantId = req.tenantId || req.user.tenantId;
        const file = req.file;

        if (!file) {
          await connection.rollback();
          return res.status(400).json({
            success: false,
            message: 'No media file provided'
          });
        }

        logger.info('Enhanced media send request', {
          conversationId,
          userId,
          tenantId,
          fileName: file.filename,
          fileSize: file.size,
          mimeType: file.mimetype,
          source
        });

        if (source === 'whatsapp_web') {
          let resolvedConversationId = conversationId;
          let webConversation = null;
          if (String(conversationId).includes('@')) {
            const rawJid = String(conversationId);
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
            const [existing] = await connection.execute(
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
              webConversation = existing[0];
              resolvedConversationId = webConversation.id;
            } else if (normalizedPhone) {
              const [insertResult] = await connection.execute(
                'INSERT INTO conversations (tenant_id, phone_number, remote_jid, contact_name, last_message, last_message_time, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), ?, NOW(), NOW())',
                [tenantId, normalizedPhone, normalizedRemoteJid, normalizedPhone, caption || '[Media]', 'waiting']
              );
              resolvedConversationId = insertResult.insertId;
              const [created] = await connection.execute(
                'SELECT * FROM conversations WHERE id = ? AND tenant_id = ? LIMIT 1',
                [resolvedConversationId, tenantId]
              );
              webConversation = created[0] || null;
            }
          } else {
            const [webConversations] = await connection.execute(
              `SELECT * FROM conversations WHERE id = ? AND tenant_id = ? LIMIT 1`,
              [conversationId, tenantId]
            );
            webConversation = webConversations[0] || null;
          }
          if (!webConversation) {
            await connection.rollback();
            return res.status(404).json({
              success: false,
              message: 'Conversation not found'
            });
          }
          let mediaType = 'document';
          if (file.mimetype.startsWith('image/')) mediaType = 'image';
          else if (file.mimetype.startsWith('audio/')) mediaType = 'audio';

          const mediaUrl = `/uploads/tenant_${tenantId}/${file.filename}`;
          const io = req.app.get('io');
          const whatsappService = getWhatsAppService(io);
          const sendResult = await whatsappService.sendMediaMessage(
            tenantId,
            webConversation.phone_number || webConversation.remote_jid,
            file.path,
            caption,
            resolvedConversationId,
            {
              senderUserId: userId,
              senderName: req.user.name || null,
              senderStore: req.user.store || null,
              senderDepartment: req.user.department || null,
              metadata: { source: 'whatsapp_web' },
              mediaUrl,
              mediaSize: file.size
            }
          );

          if (!sendResult.success) {
            await connection.rollback();
            return res.status(500).json({
              success: false,
              message: sendResult.error || 'Failed to send media'
            });
          }

          await connection.commit();

          return res.json({
            success: true,
            message: 'Media sent successfully',
            data: {
              messageId: sendResult.whatsappMessageId || sendResult.messageId,
              mediaType,
              mediaUrl,
              fileSize: file.size,
              source: 'whatsapp_web',
              conversationId: resolvedConversationId
            }
          });
        }

        // Verify conversation and claim
        const [conversations] = await connection.execute(
          `SELECT c.*, a.phone_number_id, a.access_token
           FROM whatsapp_cloud_conversations c
           LEFT JOIN whatsapp_cloud_accounts a ON c.account_id = a.id
           WHERE c.id = ? AND c.tenant_id = ? AND c.claimed_by_user_id = ?
           FOR UPDATE`,
          [conversationId, tenantId, userId]
        );

        if (conversations.length === 0) {
          await connection.rollback();
          return res.status(403).json({
            success: false,
            message: 'Conversation not found or not claimed by you'
          });
        }

        const conversation = conversations[0];

        // Determine media type
        let mediaType = 'document';
        if (file.mimetype.startsWith('image/')) mediaType = 'image';
        // else if (file.mimetype.startsWith('video/')) mediaType = 'video'; // DISABLED: Video upload temporarily disabled
        else if (file.mimetype.startsWith('audio/')) mediaType = 'audio';

        const trimmedCaption = caption ? caption.trim() : '';
        const shouldSendCaptionAsText = source !== 'whatsapp_web' && mediaType === 'audio' && trimmedCaption;
        const cloudCaption = shouldSendCaptionAsText ? '' : caption;

        // Send media based on source
        let sendResult;
        if (source === 'whatsapp_web') {
          const io = req.app.get('io');
          const whatsappService = getWhatsAppService(io);
          sendResult = await whatsappService.sendMediaMessage(
            tenantId, 
            conversation.contact_phone, 
            file.path, 
            caption, 
            conversationId
          );
        } else {
          // Send via WhatsApp Cloud API - REAL IMPLEMENTATION
          sendResult = await WhatsAppCloudUserController.sendCloudMediaMessage(
            conversation, 
            file, 
            mediaType, 
            cloudCaption, 
            conversationId
          );
        }

        if (!sendResult.success) {
          await connection.rollback();
          return res.status(500).json({
            success: false,
            message: sendResult.error || 'Failed to send media'
          });
        }

        // Save media message to database
        const mediaUrl = `/uploads/tenant_${tenantId}/${file.filename}`;
        
        const insertQuery = `INSERT INTO whatsapp_cloud_messages 
           (conversation_id, message_id, direction, message_type, text_content, media_url, filename, caption, status, timestamp, sent_by_user_id, created_at)
           VALUES (?, ?, 'outbound', ?, ?, ?, ?, ?, 'sent', NOW(), ?, NOW())`;
        
        const mediaTextContent = shouldSendCaptionAsText ? `[${mediaType.toUpperCase()}]` : (caption || '[Media]');
        const mediaCaption = shouldSendCaptionAsText ? null : (caption || null);
        const insertParams = [
          conversationId,
          sendResult.whatsappMessageId || sendResult.messageId,
          mediaType,
          mediaTextContent,
          mediaUrl,
          file.originalname,
          mediaCaption,
          userId
        ];
        
        const [messageResult] = await connection.execute(insertQuery, insertParams);

        let captionMessageId = null;
        if (shouldSendCaptionAsText) {
          const captionSendResult = await WhatsAppCloudUserController.sendCloudMessage(
            conversation,
            trimmedCaption,
            conversationId
          );

          if (captionSendResult.success) {
            captionMessageId = captionSendResult.messageId || `msg_${Date.now()}`;
            await connection.execute(
              `INSERT INTO whatsapp_cloud_messages 
               (conversation_id, message_id, direction, message_type, text_content, status, timestamp, sent_by_user_id, created_at)
               VALUES (?, ?, 'outbound', 'text', ?, 'sent', NOW(), ?, NOW())`,
              [
                conversationId,
                captionMessageId,
                trimmedCaption,
                userId
              ]
            );
          }
        }

        const lastMessageText = shouldSendCaptionAsText
          ? (captionMessageId ? trimmedCaption : `[${mediaType.toUpperCase()}]`)
          : (caption || `[${mediaType.toUpperCase()}]`);

        // Update conversation
        await connection.execute(
          `UPDATE whatsapp_cloud_conversations 
           SET last_message_text = ?, 
               last_message_time = NOW(), 
               last_message_from = 'business',
               updated_at = NOW()
           WHERE id = ?`,
          [lastMessageText, conversationId]
        );

        await connection.commit();

        logger.info('Enhanced media sent successfully', {
          conversationId,
          userId,
          mediaType,
          fileSize: file.size
        });

        // Emit WebSocket event
        const io = req.app.get('io');
        if (io) {
          const tenantNamespace = io.of(`/tenant/${tenantId}`);
          tenantNamespace.emit('media-message-sent', {
            conversationId,
            message: {
              id: messageResult ? messageResult.insertId : null,
              messageId: sendResult.whatsappMessageId || sendResult.messageId,
              mediaType,
              mediaUrl,
              caption,
              direction: 'outbound',
              timestamp: new Date().toISOString(),
              sent_by_name: req.user.name
            }
          });
        }

        return res.json({
          success: true,
          message: 'Media sent successfully',
          data: {
            messageId: sendResult.whatsappMessageId || sendResult.messageId,
            mediaType,
            mediaUrl,
            fileSize: file.size
          }
        });
      } catch (error) {
        await connection.rollback();
        logger.error('Error sending enhanced media', {
          error: error.message,
          stack: error.stack,
          conversationId: req.params.id,
          userId: req.user.id,
          tenantId: req.tenantId || req.user.tenantId,
          fileName: req.file?.filename,
          fileSize: req.file?.size,
          mimeType: req.file?.mimetype
        });

        return res.status(500).json({
          success: false,
          message: 'Failed to send media: ' + error.message
        });
      } finally {
        connection.release();
      }
    });
  }

  /**
   * Send WooCommerce product - ENHANCED VERSION
   * Shares product information with customer
   * POST /api/user/whatsapp-cloud/conversations/:id/send-product
   */
  static async sendProductMessage(req, res) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      const conversationId = req.params.id;
      const { productId, productData, customMessage, source = 'whatsapp_cloud' } = req.body;
      const userId = req.user.id;
      const tenantId = req.tenantId || req.user.tenantId;

      logger.info('Enhanced product send request', {
        conversationId,
        userId,
        tenantId,
        productId,
        hasCustomMessage: !!customMessage
      });

      // Validate input
      if (!productId && !productData) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: 'Product ID or product data is required'
        });
      }

      let conversation = null;
      if (source !== 'whatsapp_web') {
        const [conversations] = await connection.execute(
          `SELECT c.*, a.phone_number_id, a.access_token, a.account_name, a.status as account_status
           FROM whatsapp_cloud_conversations c
           LEFT JOIN whatsapp_cloud_accounts a ON c.account_id = a.id
           WHERE c.id = ? AND c.tenant_id = ? AND c.claimed_by_user_id = ?
           FOR UPDATE`,
          [conversationId, tenantId, userId]
        );

        if (conversations.length === 0) {
          await connection.rollback();
          return res.status(403).json({
            success: false,
            message: 'Conversation not found or not claimed by you'
          });
        }

        conversation = conversations[0];
      }

      // Get or validate product data
      let product = productData;
      const resolvedProductId = productId || productData?.id || productData?.wc_product_id || null;
      if (resolvedProductId) {
        const [products] = await connection.execute(
          `SELECT 
             id, wc_product_id, name, description, short_description, sku, price, regular_price, sale_price,
             stock_status, image_url, thumbnail_url, permalink
           FROM woocommerce_products
           WHERE tenant_id = ? AND is_active = TRUE AND (id = ? OR wc_product_id = ?)
           LIMIT 1`,
          [tenantId, resolvedProductId, resolvedProductId]
        );
        if (products.length > 0) {
          const row = products[0];
          product = {
            id: row.id,
            wc_product_id: row.wc_product_id,
            name: row.name,
            description: row.short_description || row.description || '',
            price: row.price,
            regular_price: row.regular_price,
            sale_price: row.sale_price,
            stock_status: row.stock_status,
            sku: row.sku,
            permalink: row.permalink,
            images: row.thumbnail_url || row.image_url ? [{ src: row.thumbnail_url || row.image_url }] : []
          };
        }
      }

      // Validate required product fields
      if (!product.name || !product.price) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: 'Product must have name and price'
        });
      }

      // Format product message
      const productMessage = WhatsAppCloudUserController.formatProductMessage(product, customMessage);

      if (source === 'whatsapp_web') {
        let resolvedConversationId = conversationId;
        let webConversation = null;
        if (String(conversationId).includes('@')) {
          const rawJid = String(conversationId);
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
          const [existing] = await connection.execute(
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
            webConversation = existing[0];
            resolvedConversationId = webConversation.id;
          } else if (normalizedPhone) {
            const [insertResult] = await connection.execute(
              'INSERT INTO conversations (tenant_id, phone_number, remote_jid, contact_name, last_message, last_message_time, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), ?, NOW(), NOW())',
              [tenantId, normalizedPhone, normalizedRemoteJid, normalizedPhone, productMessage, 'waiting']
            );
            resolvedConversationId = insertResult.insertId;
            const [created] = await connection.execute(
              'SELECT * FROM conversations WHERE id = ? AND tenant_id = ? LIMIT 1',
              [resolvedConversationId, tenantId]
            );
            webConversation = created[0] || null;
          }
        } else {
          const [webConversations] = await connection.execute(
            `SELECT * FROM conversations WHERE id = ? AND tenant_id = ? LIMIT 1`,
            [conversationId, tenantId]
          );
          webConversation = webConversations[0] || null;
        }
        if (!webConversation) {
          await connection.rollback();
          return res.status(404).json({
            success: false,
            message: 'Conversation not found'
          });
        }
        const sendResult = await WhatsAppCloudUserController.sendWebMessage(
          tenantId,
          webConversation.phone_number || webConversation.remote_jid,
          productMessage,
          resolvedConversationId,
          {
            senderUserId: userId,
            senderName: req.user.name || null,
            senderStore: req.user.store || null,
            senderDepartment: req.user.department || null,
            metadata: { source: 'whatsapp_web', productId: product.id || product.wc_product_id || null }
          }
        );

        if (!sendResult.success) {
          await connection.rollback();
          return res.status(500).json({
            success: false,
            message: sendResult.error || 'Failed to send product'
          });
        }

        await connection.commit();

        return res.json({
          success: true,
          message: 'Product sent successfully',
          data: {
            messageId: sendResult.messageId,
            product,
            productMessage,
            source: 'whatsapp_web',
            conversationId: resolvedConversationId
          }
        });
      }

      // Send product message
      const sendResult = await WhatsAppCloudUserController.sendCloudMessage(
        conversation, 
        productMessage, 
        conversationId
      );

      if (!sendResult.success) {
        await connection.rollback();
        return res.status(500).json({
          success: false,
          message: sendResult.error || 'Failed to send product'
        });
      }

      // Save product message to database
      const [messageResult] = await connection.execute(
        `INSERT INTO whatsapp_cloud_messages 
         (tenant_id, account_id, conversation_id, message_id, from_phone, to_phone, direction, message_type, text_body, 
          status, timestamp, sent_by_user_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'outbound', 'product', ?, 'sent', ?, ?, NOW())`,
        [
          tenantId,
          conversation.account_id,
          conversationId,
          sendResult.messageId,
          conversation.phone_number_id,
          conversation.contact_phone,
          productMessage,
          Math.floor(Date.now() / 1000),
          userId
        ]
      );

      // Update conversation
      await connection.execute(
        `UPDATE whatsapp_cloud_conversations 
         SET last_message_text = ?, 
             last_message_time = NOW(), 
             last_message_from = 'business',
             updated_at = NOW()
         WHERE id = ?`,
        [`Product: ${product.name}`, conversationId]
      );

      await connection.commit();

      logger.info('Enhanced product sent successfully', {
        conversationId,
        userId,
        productId,
        productName: product.name
      });

      // Emit WebSocket event
      const io = req.app.get('io');
      if (io) {
        const tenantNamespace = io.of(`/tenant/${tenantId}`);
        tenantNamespace.emit('product-message-sent', {
          conversationId,
          message: {
            id: messageResult.insertId,
            messageId: sendResult.messageId,
            product,
            direction: 'outbound',
            timestamp: new Date().toISOString(),
            sent_by_name: req.user.name
          }
        });
      }

      return res.json({
        success: true,
        message: 'Product sent successfully',
        data: {
          messageId: sendResult.messageId,
          product,
          productMessage
        }
      });

    } catch (error) {
      await connection.rollback();
      logger.error('Error sending enhanced product', {
        error: error.message,
        stack: error.stack,
        conversationId: req.params.id,
        userId: req.user.id
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to send product'
      });
    } finally {
      connection.release();
    }
  }

  /**
   * Send invoice/payment link - ENHANCED VERSION
   * Creates and sends payment request to customer
   * POST /api/user/whatsapp-cloud/conversations/:id/send-invoice
   */
  static async sendInvoiceMessage(req, res) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      const conversationId = req.params.id;
      const { 
        amount, 
        currency, 
        description, 
        paymentMethod
      } = req.body;
      const userId = req.user.id;
      const tenantId = req.tenantId || req.user.tenantId;

      let resolvedCurrency = currency;
      if (!resolvedCurrency) {
        const [currencyRows] = await connection.execute(
          'SELECT code FROM currencies WHERE is_default = TRUE AND active = TRUE ORDER BY id LIMIT 1'
        );
        resolvedCurrency = currencyRows?.[0]?.code || 'USD';
      }
      resolvedCurrency = String(resolvedCurrency).toUpperCase();

      logger.info('Enhanced invoice send request', {
        conversationId,
        userId,
        tenantId,
        amount,
        currency: resolvedCurrency,
        paymentMethod
      });

      // Validate input
      if (!amount || amount <= 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: 'Valid amount is required'
        });
      }

      if (!description) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: 'Description is required'
        });
      }

      // Get conversation and verify claim
      const [conversations] = await connection.execute(
        `SELECT c.*, a.phone_number_id, a.access_token, a.account_name, a.status as account_status
         FROM whatsapp_cloud_conversations c
         LEFT JOIN whatsapp_cloud_accounts a ON c.account_id = a.id
         WHERE c.id = ? AND c.tenant_id = ? AND c.claimed_by_user_id = ?
         FOR UPDATE`,
        [conversationId, tenantId, userId]
      );

      if (conversations.length === 0) {
        await connection.rollback();
        return res.status(403).json({
          success: false,
          message: 'Conversation not found or not claimed by you'
        });
      }

      const conversation = conversations[0];

      if (!paymentMethod || !['stripe', 'paypal'].includes(String(paymentMethod).toLowerCase())) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: 'Payment method must be stripe or paypal'
        });
      }

      const normalizedMethod = String(paymentMethod).toLowerCase();
      const invoiceNumber = `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
      const invoiceRepository = new InvoiceRepository();
      const gateway = await invoiceRepository.getTenantPaymentGateway(tenantId, normalizedMethod);

      if (!gateway) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: `${normalizedMethod.toUpperCase()} is not configured`
        });
      }

      let paymentResult;
      if (normalizedMethod === 'stripe') {
        if (!gateway.stripe_secret_key) {
          await connection.rollback();
          return res.status(400).json({
            success: false,
            message: 'Stripe is not configured'
          });
        }
        const stripeService = new StripeService(gateway.stripe_secret_key);
        paymentResult = await stripeService.createPayment({
          amount,
          currency: resolvedCurrency,
          description,
          customer_name: conversation.contact_name,
          customer_phone: conversation.contact_phone,
          reference_id: invoiceNumber
        });
      } else {
        if (!gateway.paypal_client_id || !gateway.paypal_client_secret) {
          await connection.rollback();
          return res.status(400).json({
            success: false,
            message: 'PayPal is not configured'
          });
        }
        const sandboxMode = gateway.sandbox_mode !== false && gateway.sandbox_mode !== 0;
        const paypalService = new PayPalService(gateway.paypal_client_id, gateway.paypal_client_secret, sandboxMode);
        paymentResult = await paypalService.createPayment({
          amount,
          currency: resolvedCurrency,
          description,
          customer_name: conversation.contact_name,
          customer_phone: conversation.contact_phone,
          reference_id: invoiceNumber
        });
      }

      if (!paymentResult?.success) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: paymentResult?.error || 'Failed to create payment link'
        });
      }

      const invoice = {
        number: invoiceNumber,
        amount,
        currency: resolvedCurrency,
        description,
        paymentLink: paymentResult.payment_url,
        paymentMethod: normalizedMethod,
        customerInfo: {
          name: conversation.contact_name,
          phone: conversation.contact_phone
        }
      };

      const invoiceMessage = WhatsAppCloudUserController.formatInvoiceMessage(invoice);

      // Send invoice message
      const sendResult = await WhatsAppCloudUserController.sendCloudMessage(
        conversation, 
        invoiceMessage, 
        conversationId
      );

      if (!sendResult.success) {
        await connection.rollback();
        return res.status(500).json({
          success: false,
          message: sendResult.error || 'Failed to send invoice'
        });
      }

      // Save invoice message to database
      const [messageResult] = await connection.execute(
        `INSERT INTO whatsapp_cloud_messages 
         (tenant_id, account_id, conversation_id, message_id, from_phone, to_phone, direction, message_type, text_body, 
          status, timestamp, sent_by_user_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'outbound', 'invoice', ?, 'sent', ?, ?, NOW())`,
        [
          tenantId,
          conversation.account_id,
          conversationId,
          sendResult.messageId,
          conversation.phone_number_id,
          conversation.contact_phone,
          invoiceMessage,
          Math.floor(Date.now() / 1000),
          userId
        ]
      );

      // Update conversation
      await connection.execute(
        `UPDATE whatsapp_cloud_conversations 
         SET last_message_text = ?, 
             last_message_time = NOW(), 
             last_message_from = 'business',
             updated_at = NOW()
         WHERE id = ?`,
        [`Invoice: ${resolvedCurrency} ${amount}`, conversationId]
      );

      await connection.commit();

      logger.info('Enhanced invoice sent successfully', {
        conversationId,
        userId,
        invoiceNumber,
        amount,
        currency: resolvedCurrency,
        paymentMethod: normalizedMethod
      });

      // Emit WebSocket event
      const io = req.app.get('io');
      if (io) {
        const tenantNamespace = io.of(`/tenant/${tenantId}`);
        tenantNamespace.emit('invoice-message-sent', {
          conversationId,
          message: {
            id: messageResult.insertId,
            messageId: sendResult.messageId,
            invoice,
            paymentMethod: normalizedMethod,
            direction: 'outbound',
            timestamp: new Date().toISOString(),
            sent_by_name: req.user.name
          }
        });
      }

      return res.json({
        success: true,
        message: 'Payment link sent successfully',
        data: {
          messageId: sendResult.messageId,
          invoice,
          invoiceMessage
        }
      });

    } catch (error) {
      await connection.rollback();
      logger.error('Error sending enhanced invoice', {
        error: error.message,
        stack: error.stack,
        conversationId: req.params.id,
        userId: req.user.id
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to send invoice'
      });
    } finally {
      connection.release();
    }
  }

  // ============================================
  // HELPER METHODS FOR PRODUCTS & BILLING
  // ============================================

  /**
   * Format product message for WhatsApp
   */
  static formatProductMessage(product, customMessage = '') {
    const priceText = product.sale_price 
      ? `~~$${product.regular_price}~~ *$${product.sale_price}*` 
      : `*$${product.price}*`;

    const stockText = product.stock_status === 'instock' 
      ? '✅ In Stock' 
      : '❌ Out of Stock';

    let message = `🛍️ *${product.name}*\n\n`;
    
    if (product.description) {
      message += `${product.description}\n\n`;
    }
    
    message += `💰 Price: ${priceText}\n`;
    message += `📦 ${stockText}\n`;
    
    if (product.sku) {
      message += `🏷️ SKU: ${product.sku}\n`;
    }

    if (customMessage) {
      message += `\n💬 ${customMessage}`;
    }

    if (product.permalink) {
      message += `\n\n🔗 View Product: ${product.permalink}`;
    }

    return message;
  }

  /**
   * Format invoice message for WhatsApp
   */
  static formatInvoiceMessage(invoice) {
    const methodLabel = invoice.paymentMethod === 'paypal' ? 'PayPal' : 'Stripe';
    let message = `💳 *Payment Link #${invoice.number}*\n\n`;
    message += `📝 ${invoice.description}\n\n`;
    message += `💰 *Total: ${invoice.currency} ${invoice.amount}*\n`;
    message += `🔗 ${invoice.paymentLink}\n`;
    message += `🧾 ${methodLabel}`;
    return message;
  }

  /**
   * Health check endpoint for debugging
   * GET /api/user/whatsapp-cloud/health
   */
  static async healthCheck(req, res) {
    try {
      const userId = req.user.id;
      const tenantId = req.tenantId || req.user.tenantId;
      
      logger.info('Health check request', {
        userId,
        tenantId,
        user: {
          id: req.user.id,
          name: req.user.name,
          role: req.user.role,
          store: req.user.store,
          store_id: req.user.store_id,
          department: req.user.department,
          department_id: req.user.department_id
        }
      });

      // Test basic database connection
      const [testResult] = await pool.execute('SELECT 1 as test');
      
      // Test conversations table
      const [conversationsTest] = await pool.execute(
        'SELECT COUNT(*) as count FROM whatsapp_cloud_conversations WHERE tenant_id = ?',
        [tenantId]
      );

      return res.json({
        success: true,
        data: {
          userId,
          tenantId,
          user: req.user,
          database: {
            connected: true,
            conversationsCount: conversationsTest[0].count
          },
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('Health check error', {
        error: error.message,
        stack: error.stack
      });

      return res.status(500).json({
        success: false,
        message: 'Health check failed',
        error: error.message
      });
    }
  }

  /**
   * Get conversation notes
   * GET /api/user/whatsapp-cloud/conversations/:conversationId/notes
   */
  static async getConversationNotes(req, res) {
    try {
      const userId = req.user.id;
      const tenantId = req.tenantId || req.user.tenantId;
      const conversationId = req.params.conversationId;

      logger.info('Getting conversation notes', {
        userId,
        tenantId,
        conversationId
      });

      // Get conversation to verify access and get contact phone
      const [conversations] = await pool.execute(`
        SELECT contact_phone, claimed_by_user_id, store_id, department_id
        FROM whatsapp_cloud_conversations 
        WHERE id = ? AND tenant_id = ?
      `, [conversationId, tenantId]);

      if (conversations.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Conversation not found'
        });
      }

      const conversation = conversations[0];
      const contactPhone = conversation.contact_phone;

      // Get all notes for this contact phone (conversation history)
      const [notes] = await pool.execute(`
        SELECT 
          cn.*,
          u.name as created_by_user_name
        FROM conversation_notes cn
        LEFT JOIN users u ON cn.created_by_user_id = u.id
        WHERE cn.tenant_id = ? AND cn.contact_phone = ?
        ORDER BY cn.created_at DESC
      `, [tenantId, contactPhone]);

      return res.json({
        success: true,
        data: notes.map(note => ({
          id: note.id,
          noteText: note.note_text,
          noteType: note.note_type,
          createdBy: note.created_by_name || note.created_by_user_name || 'System',
          createdAt: note.created_at,
          transferFrom: note.transfer_from_department || note.transfer_from_store,
          transferTo: note.transfer_to_department || note.transfer_to_store,
          isVisible: note.is_visible_to_users
        }))
      });
    } catch (error) {
      logger.error('Error getting conversation notes', {
        error: error.message,
        stack: error.stack,
        conversationId: req.params.conversationId
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to get conversation notes'
      });
    }
  }

  /**
   * Add conversation note
   * POST /api/user/whatsapp-cloud/conversations/:conversationId/notes
   */
  static async addConversationNote(req, res) {
    try {
      const userId = req.user.id;
      const userName = req.user.name;
      const tenantId = req.tenantId || req.user.tenantId;
      const conversationId = req.params.conversationId;
      const { noteText, noteType = 'general' } = req.body;

      if (!noteText || !noteText.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Note text is required'
        });
      }

      if (req.user.role !== 'admin' && noteType !== 'transfer') {
        return res.status(403).json({
          success: false,
          message: 'Only transfer notes are allowed for users'
        });
      }

      logger.info('Adding conversation note', {
        userId,
        tenantId,
        conversationId,
        noteType
      });

      // Get conversation to verify access and get contact phone
      const [conversations] = await pool.execute(`
        SELECT contact_phone, claimed_by_user_id, store_id, department_id
        FROM whatsapp_cloud_conversations 
        WHERE id = ? AND tenant_id = ?
      `, [conversationId, tenantId]);

      if (conversations.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Conversation not found'
        });
      }

      const conversation = conversations[0];
      const contactPhone = conversation.contact_phone;

      // Insert note
      const [result] = await pool.execute(`
        INSERT INTO conversation_notes (
          tenant_id, conversation_id, contact_phone, note_text, note_type,
          created_by_user_id, created_by_name, is_visible_to_users
        ) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)
      `, [tenantId, conversationId, contactPhone, noteText.trim(), noteType, userId, userName]);

      // Get the created note
      const [newNote] = await pool.execute(`
        SELECT * FROM conversation_notes WHERE id = ?
      `, [result.insertId]);

      // Emit WebSocket event
      const io = req.app.get('io');
      if (io) {
        const tenantNamespace = io.of(`/tenant/${tenantId}`);
        tenantNamespace.emit('conversation-note-added', {
          conversationId,
          contactPhone,
          note: {
            id: newNote[0].id,
            noteText: newNote[0].note_text,
            noteType: newNote[0].note_type,
            createdBy: userName,
            createdAt: newNote[0].created_at
          }
        });
      }

      return res.json({
        success: true,
        message: 'Note added successfully',
        data: {
          id: newNote[0].id,
          noteText: newNote[0].note_text,
          noteType: newNote[0].note_type,
          createdBy: userName,
          createdAt: newNote[0].created_at
        }
      });
    } catch (error) {
      logger.error('Error adding conversation note', {
        error: error.message,
        stack: error.stack,
        conversationId: req.params.conversationId
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to add note'
      });
    }
  }

  /**
   * Enhanced transfer conversation with note creation
   * PUT /api/user/whatsapp-cloud/conversations/:conversationId/transfer
   */
  static async transferConversationEnhanced(req, res) {
    try {
      const userId = req.user.id;
      const userName = req.user.name;
      const tenantId = req.tenantId || req.user.tenantId;
      const userStoreId = req.user.store_id;
      const userDepartmentId = req.user.department_id;
      const userRole = req.user.role;
      const conversationId = req.params.conversationId;
      const { newStoreId, newDepartmentId, reason } = req.body;

      // Log request details for debugging
      logger.info('Transfer request received', {
        userId,
        tenantId,
        conversationId,
        newStoreId,
        newDepartmentId,
        hasReason: !!reason,
        params: req.params,
        body: req.body,
        url: req.url,
        method: req.method
      });

      // Validate conversation ID
      if (!conversationId || conversationId === 'null' || conversationId === 'undefined') {
        return res.status(400).json({
          success: false,
          message: 'Invalid conversation ID'
        });
      }

      logger.info('Enhanced conversation transfer', {
        userId,
        tenantId,
        conversationId,
        newStoreId,
        newDepartmentId,
        hasReason: !!reason
      });

      // Get conversation details (Cloud first, fallback to Web table)
      const [cloudColumnRows] = await pool.execute(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'whatsapp_cloud_conversations'`
      );
      const cloudColumns = new Set(cloudColumnRows.map(row => row.COLUMN_NAME));
      const cloudSelectFields = ['contact_phone', 'contact_name', 'claimed_by_user_id'];
      if (cloudColumns.has('store_id')) cloudSelectFields.push('store_id');
      if (cloudColumns.has('department_id')) cloudSelectFields.push('department_id');
      let conversationTable = 'whatsapp_cloud_conversations';
      let [conversations] = await pool.execute(
        `SELECT ${cloudSelectFields.join(', ')}
         FROM whatsapp_cloud_conversations 
         WHERE id = ? AND tenant_id = ?`,
        [conversationId, tenantId]
      );

      if (conversations.length === 0) {
        conversationTable = 'conversations';
        [conversations] = await pool.execute(`
          SELECT phone_number as contact_phone, contact_name, assigned_store, assigned_department, claimed_by_user_id
          FROM conversations
          WHERE id = ? AND tenant_id = ?
        `, [conversationId, tenantId]);
      }

      if (conversations.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Conversation not found'
        });
      }

      const conversation = conversations[0];

      let resolvedStoreId = newStoreId || null;
      let resolvedDepartmentId = newDepartmentId || null;

      if (resolvedStoreId && !/^\d+$/.test(String(resolvedStoreId))) {
        const [storeRows] = await pool.execute(
          `SELECT id FROM stores WHERE tenant_id = ? AND name = ? LIMIT 1`,
          [tenantId, String(resolvedStoreId)]
        );
        resolvedStoreId = storeRows[0]?.id || null;
      }

      if (resolvedDepartmentId && !/^\d+$/.test(String(resolvedDepartmentId))) {
        const [deptRows] = await pool.execute(
          `SELECT id FROM departments WHERE tenant_id = ? AND name = ? LIMIT 1`,
          [tenantId, String(resolvedDepartmentId)]
        );
        resolvedDepartmentId = deptRows[0]?.id || null;
      }

      if (!resolvedStoreId && !resolvedDepartmentId) {
        return res.status(400).json({
          success: false,
          message: 'Destination store or department is required'
        });
      }

      if (resolvedStoreId && resolvedDepartmentId) {
        return res.status(400).json({
          success: false,
          message: 'Transfer must be to a store or a department, not both'
        });
      }

      // Get current store/department names
      let fromStoreName = null, fromDepartmentName = null;
      let toStoreName = null, toDepartmentName = null;

      if (conversationTable === 'conversations') {
        fromStoreName = conversation.assigned_store || null;
        fromDepartmentName = conversation.assigned_department || null;
      } else {
        if (conversation.store_id) {
          const [fromStore] = await pool.execute(`
            SELECT name FROM stores WHERE id = ? AND tenant_id = ?
          `, [conversation.store_id, tenantId]);
          fromStoreName = fromStore[0]?.name;
        }

        if (conversation.department_id) {
          const [fromDept] = await pool.execute(`
            SELECT name FROM departments WHERE id = ? AND tenant_id = ?
          `, [conversation.department_id, tenantId]);
          fromDepartmentName = fromDept[0]?.name;
        }
      }

      if (resolvedStoreId) {
        const [toStore] = await pool.execute(`
          SELECT name FROM stores WHERE id = ? AND tenant_id = ?
        `, [resolvedStoreId, tenantId]);
        toStoreName = toStore[0]?.name;
      }

      if (resolvedDepartmentId) {
        const [toDept] = await pool.execute(`
          SELECT name FROM departments WHERE id = ? AND tenant_id = ?
        `, [resolvedDepartmentId, tenantId]);
        toDepartmentName = toDept[0]?.name;
      }

      // Determine next state based on transfer type
      let nextStoreId, nextDepartmentId, nextTransferredStore, nextTransferredDepartment;
      
      if (conversation.claimed_by_user_id && conversation.claimed_by_user_id !== userId && userRole !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Conversation is claimed by another user'
        });
      }

      if (resolvedStoreId) {
        // Transfer to store: assign to store, clear department
        nextStoreId = resolvedStoreId;
        nextDepartmentId = null;
        nextTransferredStore = resolvedStoreId;
        nextTransferredDepartment = null;
      } else if (resolvedDepartmentId) {
        nextStoreId = null;
        nextDepartmentId = null;
        nextTransferredStore = null;
        nextTransferredDepartment = resolvedDepartmentId;
      }

      // Update conversation with transfer tracking
      logger.info('Transferring conversation', {
        conversationId,
        fromStoreId: conversation.store_id,
        fromDepartmentId: conversation.department_id,
        toStoreId: nextStoreId,
        toDepartmentId: nextDepartmentId,
        transferredToStore: nextTransferredStore,
        transferredToDepartment: nextTransferredDepartment,
        userId
      });

      if (conversationTable === 'whatsapp_cloud_conversations') {
        const updateFields = [];
        const updateValues = [];
        if (cloudColumns.has('store_id')) {
          updateFields.push('store_id = ?');
          updateValues.push(nextStoreId);
        }
        if (cloudColumns.has('department_id')) {
          updateFields.push('department_id = ?');
          updateValues.push(nextDepartmentId);
        }
        if (cloudColumns.has('transferred_to_store')) {
          updateFields.push('transferred_to_store = ?');
          updateValues.push(nextTransferredStore);
        }
        if (cloudColumns.has('transferred_to_department')) {
          updateFields.push('transferred_to_department = ?');
          updateValues.push(nextTransferredDepartment);
        }
        if (cloudColumns.has('transferred_at')) {
          updateFields.push('transferred_at = NOW()');
        }
        if (cloudColumns.has('transferred_by_user_id')) {
          updateFields.push('transferred_by_user_id = ?');
          updateValues.push(userId);
        }
        if (cloudColumns.has('claimed_by_user_id')) {
          updateFields.push('claimed_by_user_id = NULL');
        }
        if (cloudColumns.has('claimed_at')) {
          updateFields.push('claimed_at = NULL');
        }
        if (cloudColumns.has('updated_at')) {
          updateFields.push('updated_at = NOW()');
        }
        if (updateFields.length > 0) {
          updateValues.push(conversationId, tenantId);
          await pool.execute(
            `UPDATE whatsapp_cloud_conversations 
             SET ${updateFields.join(', ')}
             WHERE id = ? AND tenant_id = ?`,
            updateValues
          );
        }
      } else {
        const targetStoreName = toStoreName || (resolvedStoreId ? String(resolvedStoreId) : null);
        const targetDepartmentName = toDepartmentName || (resolvedDepartmentId ? String(resolvedDepartmentId) : null);
        await pool.execute(`
          UPDATE conversations
          SET assigned_store = ?, 
              assigned_department = ?, 
              transferred_to_store = ?,
              transferred_to_department = ?,
              transferred_at = NOW(),
              claimed_by_user_id = NULL, 
              claimed_at = NULL,
              is_claimed = FALSE,
              updated_at = NOW()
          WHERE id = ? AND tenant_id = ?
        `, [
          targetStoreName, 
          targetDepartmentName,
          targetStoreName,
          targetDepartmentName,
          conversationId, 
          tenantId
        ]);
      }

      // Create transfer note if reason provided
      if (reason && reason.trim()) {
        await pool.execute(`
          INSERT INTO conversation_notes (
            tenant_id, conversation_id, contact_phone, note_text, note_type,
            created_by_user_id, created_by_name, 
            transfer_from_store, transfer_to_store,
            transfer_from_department, transfer_to_department,
            is_visible_to_users
          ) VALUES (?, ?, ?, ?, 'transfer', ?, ?, ?, ?, ?, ?, TRUE)
        `, [
          tenantId, conversationId, conversation.contact_phone, reason.trim(),
          userId, userName, fromStoreName, toStoreName, fromDepartmentName, toDepartmentName
        ]);
      }

      // Emit WebSocket events
      const io = req.app.get('io');
      if (io) {
        const tenantNamespace = io.of(`/tenant/${tenantId}`);
        
        // Emit transfer event
        tenantNamespace.emit('conversation-transferred', {
          conversationId,
          fromStore: fromStoreName,
          toStore: toStoreName,
          fromDepartment: fromDepartmentName,
          toDepartment: toDepartmentName,
          transferredBy: userName,
          reason: reason?.trim()
        });

        // Emit conversation update
        tenantNamespace.emit('conversation-updated', {
          conversationId,
          updates: {
            store_id: newStoreId,
            department_id: newDepartmentId,
            claimed_by_user_id: null
          }
        });
      }

      return res.json({
        success: true,
        message: 'Conversation transferred successfully'
      });
    } catch (error) {
      logger.error('Error transferring conversation', {
        error: error.message,
        stack: error.stack,
        conversationId: req.params.conversationId
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to transfer conversation'
      });
    }
  }

  /**
   * Get enhanced transfer options with robust store/department loading
   * GET /api/user/whatsapp-cloud/transfer-options
   */
  static async getTransferOptions(req, res) {
    try {
      const tenantId = req.tenantId || req.user.tenantId;

      logger.info('Getting enhanced transfer options', { tenantId });

      // Get all active stores for this tenant
      const [stores] = await pool.execute(`
        SELECT id, name, description, address, phone, email, active
        FROM stores 
        WHERE tenant_id = ? AND active = TRUE
        ORDER BY name ASC
      `, [tenantId]);

      // Get all active departments for this tenant
      const [departments] = await pool.execute(`
        SELECT id, name, description, active
        FROM departments 
        WHERE tenant_id = ? AND active = TRUE
        ORDER BY name ASC
      `, [tenantId]);

      return res.json({
        success: true,
        data: {
          stores: stores.map(store => ({
            id: store.id,
            name: store.name,
            description: store.description,
            address: store.address,
            phone: store.phone,
            email: store.email
          })),
          departments: departments.map(dept => ({
            id: dept.id,
            name: dept.name,
            description: dept.description
          }))
        }
      });
    } catch (error) {
      logger.error('Error getting transfer options', {
        error: error.message,
        stack: error.stack
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to get transfer options'
      });
    }
  }
  /**
   * Get pipeline stages for current tenant (read-only for users)
   * GET /api/user/whatsapp-cloud/pipeline-stages
   */
  static async getPipelineStages(req, res) {
    try {
      const tenantId = req.tenantId || req.user.tenantId;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: 'Tenant ID not found'
        });
      }

      logger.info('User requesting pipeline stages', {
        userId: req.user.id,
        tenantId
      });

      const [stages] = await pool.execute(`
        SELECT id, stage_key, stage_name, stage_color, stage_icon, stage_order, is_default, active
        FROM pipeline_stages
        WHERE tenant_id = ? AND active = TRUE
        ORDER BY stage_order ASC
      `, [tenantId]);

      logger.info('Pipeline stages loaded for user', {
        tenantId,
        stagesCount: stages.length
      });

      return res.json({
        success: true,
        data: stages
      });
    } catch (error) {
      logger.error('Error getting pipeline stages for user', {
        error: error.message,
        stack: error.stack,
        tenantId: req.tenantId || req.user.tenantId
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to load pipeline stages'
      });
    }
  }
}

module.exports = WhatsAppCloudUserController;
