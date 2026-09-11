/**
 * Tenant Dashboard Controller
 * 
 * Handles dashboard metrics and statistics for tenant admin
 * Adapted for multi-tenant SaaS
 * 
 * @module controllers/TenantDashboardController
 */

const BaseController = require('./BaseController');
const { pool } = require('../config/database');
const { logger } = require('../config/logger');

class TenantDashboardController extends BaseController {
  /**
   * Get dashboard metrics for tenant
   * GET /api/tenant/dashboard
   */
  static async getMetrics(req, res) {
    const connection = await pool.getConnection();

    try {
      const tenantId = req.tenantId || req.user?.tenantId;

      // Today's messages
      const [todayLegacy] = await connection.query(`
        SELECT COUNT(*) as count 
        FROM whatsapp_messages 
        WHERE tenant_id = ? AND DATE(created_at) = CURDATE()
      `, [tenantId]);
      const [todayCloud] = await connection.query(`
        SELECT COUNT(*) as count 
        FROM whatsapp_cloud_messages 
        WHERE tenant_id = ? AND DATE(created_at) = CURDATE()
      `, [tenantId]);

      // Total messages this month
      const [monthMessages] = await connection.query(`
        SELECT COUNT(*) as count 
        FROM whatsapp_messages 
        WHERE tenant_id = ? 
          AND MONTH(created_at) = MONTH(CURDATE())
          AND YEAR(created_at) = YEAR(CURDATE())
      `, [tenantId]);

      // Active conversations
      const [activeLegacy] = await connection.query(`
        SELECT COUNT(*) as count 
        FROM conversations 
        WHERE tenant_id = ? AND status = 'active'
      `, [tenantId]);
      const [activeCloud] = await connection.query(`
        SELECT COUNT(*) as count 
        FROM whatsapp_cloud_conversations 
        WHERE tenant_id = ? AND status = 'active'
      `, [tenantId]);

      // Total contacts
      const [totalContacts] = await connection.query(`
        SELECT COUNT(*) as count 
        FROM contacts 
        WHERE tenant_id = ?
      `, [tenantId]);

      // Unique contacts today
      const [uniqueContacts] = await connection.query(`
        SELECT COUNT(DISTINCT phone_number) as count 
        FROM whatsapp_messages 
        WHERE tenant_id = ? AND DATE(created_at) = CURDATE()
      `, [tenantId]);

      // Peak hours (last 7 days)
      const [hourlyStats] = await connection.query(`
        SELECT 
          HOUR(created_at) as hour,
          COUNT(*) as message_count
        FROM whatsapp_messages 
        WHERE tenant_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        GROUP BY HOUR(created_at)
        ORDER BY hour
      `, [tenantId]);

      // Conversations by status
      const [conversationStats] = await connection.query(`
        SELECT 
          COALESCE(status, 'active') as status,
          COUNT(*) as count
        FROM conversations
        WHERE tenant_id = ?
        GROUP BY status
      `, [tenantId]);

      // Total messages per day (last 7 days)
      const [dailyMessages] = await connection.query(`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as count
        FROM whatsapp_messages
        WHERE tenant_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        GROUP BY DATE(created_at)
        ORDER BY date
      `, [tenantId]);

      // Recent conversations (last 10)
      const [recentConversations] = await connection.query(`
        SELECT 
          c.*,
          co.name as contact_name,
          co.phone as phone_number,
          (SELECT COUNT(*) FROM whatsapp_messages m WHERE m.conversation_id = c.id) as message_count,
          (SELECT created_at FROM whatsapp_messages m WHERE m.conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_at
        FROM conversations c
        LEFT JOIN contacts co ON c.contact_id = co.id
        WHERE c.tenant_id = ?
        ORDER BY c.updated_at DESC
        LIMIT 10
      `, [tenantId]);

      // Get usage stats (from billing)
      const [usageStats] = await connection.query(`
        SELECT 
          messages_sent,
          month
        FROM usage_tracking
        WHERE tenant_id = ? AND month = DATE_FORMAT(CURDATE(), '%Y-%m')
      `, [tenantId]);

      // Get plan limits
      const [planLimits] = await connection.query(`
        SELECT 
          sp.max_messages_per_month,
          sp.max_users,
          sp.max_conversations,
          sp.name as plan_name
        FROM subscriptions s
        JOIN subscription_plans sp ON s.plan_id = sp.id
        WHERE s.tenant_id = ? AND s.status = 'active'
        ORDER BY s.created_at DESC
        LIMIT 1
      `, [tenantId]);

      const usage = usageStats[0] || { messages_sent: 0 };
      const limits = planLimits[0] || { 
        max_messages_per_month: 10000, 
        max_users: 5, 
        max_conversations: 1000,
        plan_name: 'Free'
      };

      const usagePercentage = limits.max_messages_per_month > 0
        ? ((usage.messages_sent / limits.max_messages_per_month) * 100).toFixed(2)
        : 0;

      // Get waiting conversations count
      const [waitingLegacy] = await connection.query(`
        SELECT COUNT(*) as count 
        FROM conversations 
        WHERE tenant_id = ? AND status = 'waiting'
      `, [tenantId]);
      const [waitingCloud] = await connection.query(`
        SELECT COUNT(*) as count 
        FROM whatsapp_cloud_conversations 
        WHERE tenant_id = ? AND status = 'waiting'
      `, [tenantId]);

      // Get invoice counts (pending, accepted, paid)
      const [invoicesPending] = await connection.query(`
        SELECT COUNT(*) as count 
        FROM invoices 
        WHERE tenant_id = ? AND status = 'pending'
      `, [tenantId]);

      const [invoicesAccepted] = await connection.query(`
        SELECT COUNT(*) as count 
        FROM invoices 
        WHERE tenant_id = ? AND status = 'accepted'
      `, [tenantId]);

      const [invoicesPaid] = await connection.query(`
        SELECT COUNT(*) as count 
        FROM invoices 
        WHERE tenant_id = ? AND status = 'paid'
      `, [tenantId]);

      logger.info(`Dashboard metrics loaded for tenant ${tenantId}`);

      res.json({
        success: true,
        data: {
          todayMessages: (todayLegacy[0]?.count || 0) + (todayCloud[0]?.count || 0),
          todayMessagesWeb: todayLegacy[0]?.count || 0,
          todayMessagesCloud: todayCloud[0]?.count || 0,
          waitingConversations: (waitingLegacy[0]?.count || 0) + (waitingCloud[0]?.count || 0),
          waitingConversationsWeb: waitingLegacy[0]?.count || 0,
          waitingConversationsCloud: waitingCloud[0]?.count || 0,
          activeConversations: (activeLegacy[0]?.count || 0) + (activeCloud[0]?.count || 0),
          activeConversationsWeb: activeLegacy[0]?.count || 0,
          activeConversationsCloud: activeCloud[0]?.count || 0,
          invoicesPending: invoicesPending[0]?.count || 0,
          invoicesAccepted: invoicesAccepted[0]?.count || 0,
          invoicesPaid: invoicesPaid[0]?.count || 0
        }
      });
    } catch (error) {
      logger.error('Error getting dashboard metrics:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    } finally {
      connection.release();
    }
  }

  /**
   * Get WhatsApp connection status
   * GET /api/tenant/dashboard/whatsapp-status
   */
  static async getWhatsAppStatus(req, res) {
    try {
      const tenantId = req.tenantId || req.user?.tenantId;
      console.log('Getting WhatsApp status for tenant:', tenantId);
      
      const { getWhatsAppService } = require('../services/WhatsAppService');
      const io = req.app.get('io');
      console.log('IO instance:', io ? 'exists' : 'missing');
      
      const whatsappService = getWhatsAppService(io);
      console.log('WhatsApp service:', whatsappService ? 'exists' : 'missing');

      const status = whatsappService.getStatus(tenantId);
      console.log('Status:', status);

      res.json({
        success: true,
        data: status
      });
    } catch (error) {
      console.error('Error getting WhatsApp status:', error);
      res.status(500).json({
        success: false,
        message: 'Error getting WhatsApp status',
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Initialize WhatsApp connection
   * POST /api/tenant/dashboard/whatsapp-init
   */
  static async initWhatsApp(req, res) {
    try {
      const tenantId = req.tenantId || req.user?.tenantId;
      console.log('Initializing WhatsApp for tenant:', tenantId);
      
      const { getWhatsAppService } = require('../services/WhatsAppService');
      const io = req.app.get('io');
      console.log('IO instance:', io ? 'exists' : 'missing');
      
      const whatsappService = getWhatsAppService(io);
      console.log('WhatsApp service:', whatsappService ? 'exists' : 'missing');

      await whatsappService.initializeTenant(tenantId);

      logger.info(`WhatsApp initialized for tenant ${tenantId}`);

      res.json({
        success: true,
        message: 'WhatsApp initialization started'
      });
    } catch (error) {
      console.error('Error initializing WhatsApp:', error);
      console.error('Stack:', error.stack);
      res.status(500).json({
        success: false,
        message: 'Error initializing WhatsApp',
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Disconnect WhatsApp
   * POST /api/tenant/dashboard/whatsapp-disconnect
   */
  static async disconnectWhatsApp(req, res) {
    try {
      const tenantId = req.tenantId || req.user?.tenantId;
      const { getWhatsAppService } = require('../services/WhatsAppService');
      const whatsappService = getWhatsAppService(req.app.get('io'));

      await whatsappService.disconnect(tenantId);

      logger.info(`WhatsApp disconnected for tenant ${tenantId}`);

      res.json({
        success: true,
        message: 'WhatsApp disconnected successfully'
      });
    } catch (error) {
      console.error('Error disconnecting WhatsApp:', error);
      res.status(500).json({
        success: false,
        message: 'Error disconnecting WhatsApp',
        error: error.message
      });
    }
  }

  /**
   * Get QR code for WhatsApp connection
   * GET /api/tenant/dashboard/whatsapp-qr
   */
  static async getQRCode(req, res) {
    try {
      const tenantId = req.tenantId || req.user?.tenantId;
      const { getWhatsAppService } = require('../services/WhatsAppService');
      const whatsappService = getWhatsAppService(req.app.get('io'));

      const qr = whatsappService.getQRCode(tenantId);

      res.json({
        success: true,
        data: { qr }
      });
    } catch (error) {
      console.error('Error getting QR code:', error);
      res.status(500).json({
        success: false,
        message: 'Error getting QR code',
        error: error.message
      });
    }
  }

  /**
   * Get hourly message statistics
   * GET /api/tenant/dashboard/hourly-messages
   */
  static async getHourlyMessages(req, res) {
    const connection = await pool.getConnection();

    try {
      const tenantId = req.tenantId || req.user?.tenantId;

      // Get messages per hour for last 24 hours
      const [hourlyData] = await connection.query(`
        SELECT 
          HOUR(created_at) as hour,
          COUNT(*) as count
        FROM whatsapp_messages
        WHERE tenant_id = ? 
          AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
        GROUP BY HOUR(created_at)
        ORDER BY hour
      `, [tenantId]);

      // Fill missing hours with 0
      const hours = Array.from({ length: 24 }, (_, i) => i);
      const data = hours.map(hour => {
        const found = hourlyData.find(d => d.hour === hour);
        return {
          hour,
          count: found ? found.count : 0
        };
      });

      res.json({
        success: true,
        data
      });
    } catch (error) {
      logger.error('Error getting hourly messages:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    } finally {
      connection.release();
    }
  }
}

module.exports = TenantDashboardController;


