/**
 * WhatsApp Cloud FAQ Controller
 * Handles FAQ management for WhatsApp Cloud accounts
 * 
 * @module controllers/WhatsAppCloudFAQController
 */

const WhatsAppCloudFAQ = require('../models/WhatsAppCloudFAQ');
const { logger } = require('../config/logger');
const { sanitizeInput } = require('../utils/sanitizer');

class WhatsAppCloudFAQController {
  /**
   * List all FAQs for tenant/account
   * GET /api/user/whatsapp-cloud/faqs
   */
  static async list(req, res) {
    try {
      const tenantId = req.tenantId || req.user?.tenantId || 1;
      const { active, accountId } = req.query;

      const faqs = await WhatsAppCloudFAQ.getByTenantId(
        tenantId, 
        accountId ? parseInt(accountId) : null,
        active === 'true'
      );

      res.json({
        success: true,
        data: faqs
      });
    } catch (error) {
      logger.error('Error listing WhatsApp Cloud FAQs', { 
        error: error.message 
      });
      res.status(500).json({
        success: false,
        error: 'Failed to load FAQs'
      });
    }
  }

  /**
   * Get FAQ by ID
   * GET /api/user/whatsapp-cloud/faqs/:id
   */
  static async getById(req, res) {
    try {
      const tenantId = req.tenantId || req.user.tenantId;
      const { id } = req.params;

      const faq = await WhatsAppCloudFAQ.getById(id, tenantId);

      if (!faq) {
        return res.status(404).json({
          success: false,
          error: 'FAQ not found'
        });
      }

      res.json({
        success: true,
        data: faq
      });
    } catch (error) {
      logger.error('Error getting WhatsApp Cloud FAQ', { 
        id: req.params.id,
        tenantId: req.tenantId || req.user.tenantId, 
        error: error.message 
      });
      res.status(500).json({
        success: false,
        error: 'Failed to load FAQ'
      });
    }
  }

  /**
   * Search FAQs
   * GET /api/user/whatsapp-cloud/faqs/search
   */
  static async search(req, res) {
    try {
      const tenantId = req.tenantId || req.user.tenantId;
      const { q, accountId } = req.query;

      if (!q) {
        return res.status(400).json({
          success: false,
          error: 'Search query is required'
        });
      }

      const faqs = await WhatsAppCloudFAQ.search(
        tenantId, 
        sanitizeInput(q),
        accountId ? parseInt(accountId) : null
      );

      res.json({
        success: true,
        data: faqs
      });
    } catch (error) {
      logger.error('Error searching WhatsApp Cloud FAQs', { 
        tenantId: req.tenantId || req.user.tenantId, 
        error: error.message 
      });
      res.status(500).json({
        success: false,
        error: 'Failed to search FAQs'
      });
    }
  }

  /**
   * Create new FAQ
   * POST /api/user/whatsapp-cloud/faqs
   */
  static async create(req, res) {
    try {
      const tenantId = req.tenantId || req.user?.tenantId || 1;

      const { 
        question, 
        answer, 
        keywords,
        emoji, 
        category,
        active, 
        order_position,
        trigger_type,
        account_id
      } = req.body;

      if (!question || !answer) {
        return res.status(400).json({
          success: false,
          error: 'Question and answer are required'
        });
      }

      const data = {
        question: question.trim(),
        answer: answer.trim(),
        keywords: keywords ? keywords.trim() : null,
        emoji: emoji ? emoji.trim() : null,
        category: category || 'general',
        active: active !== false,
        order_position: order_position || 0,
        trigger_type: trigger_type || 'keyword',
        account_id: account_id || null
      };

      const faq = await WhatsAppCloudFAQ.create(tenantId, data);

      res.status(201).json({
        success: true,
        message: 'FAQ created successfully',
        data: faq
      });
    } catch (error) {
      logger.error('Error creating FAQ', { 
        error: error.message,
        stack: error.stack
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to create FAQ: ' + error.message
      });
    }
  }

  /**
   * Update FAQ
   * PUT /api/user/whatsapp-cloud/faqs/:id
   */
  static async update(req, res) {
    try {
      const tenantId = req.tenantId || req.user.tenantId;
      const { id } = req.params;
      const { question, answer, keywords, emoji, category, active, order_position, trigger_type, account_id } = req.body;

      // Check if FAQ exists
      const existing = await WhatsAppCloudFAQ.getById(id, tenantId);
      if (!existing) {
        return res.status(404).json({
          success: false,
          error: 'FAQ not found'
        });
      }

      const data = {};
      if (question !== undefined) data.question = sanitizeInput(question);
      if (answer !== undefined) data.answer = sanitizeInput(answer);
      if (keywords !== undefined) data.keywords = keywords ? sanitizeInput(keywords) : null;
      if (emoji !== undefined) data.emoji = emoji ? sanitizeInput(emoji) : null;
      if (category !== undefined) data.category = sanitizeInput(category);
      if (active !== undefined) data.active = active;
      if (order_position !== undefined) data.order_position = order_position;
      if (trigger_type !== undefined) data.trigger_type = trigger_type;
      if (account_id !== undefined) data.account_id = account_id;

      const faq = await WhatsAppCloudFAQ.update(id, tenantId, data);

      logger.info('WhatsApp Cloud FAQ updated', { 
        tenantId, 
        faqId: id,
        userId: req.user.id 
      });

      res.json({
        success: true,
        message: 'FAQ updated successfully',
        data: faq
      });
    } catch (error) {
      logger.error('Error updating WhatsApp Cloud FAQ', { 
        id: req.params.id,
        tenantId: req.tenantId || req.user.tenantId, 
        error: error.message 
      });
      res.status(500).json({
        success: false,
        error: 'Failed to update FAQ'
      });
    }
  }

  /**
   * Delete FAQ
   * DELETE /api/user/whatsapp-cloud/faqs/:id
   */
  static async delete(req, res) {
    try {
      const tenantId = req.tenantId || req.user.tenantId;
      const { id } = req.params;

      const deleted = await WhatsAppCloudFAQ.delete(id, tenantId);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: 'FAQ not found'
        });
      }

      logger.info('WhatsApp Cloud FAQ deleted', { 
        tenantId, 
        faqId: id,
        userId: req.user.id 
      });

      res.json({
        success: true,
        message: 'FAQ deleted successfully'
      });
    } catch (error) {
      logger.error('Error deleting WhatsApp Cloud FAQ', { 
        id: req.params.id,
        tenantId: req.tenantId || req.user.tenantId, 
        error: error.message 
      });
      res.status(500).json({
        success: false,
        error: 'Failed to delete FAQ'
      });
    }
  }

  /**
   * Toggle FAQ active status
   * PATCH /api/user/whatsapp-cloud/faqs/:id/toggle
   */
  static async toggleActive(req, res) {
    try {
      const tenantId = req.tenantId || req.user.tenantId;
      const { id } = req.params;

      const faq = await WhatsAppCloudFAQ.toggleActive(id, tenantId);

      logger.info('WhatsApp Cloud FAQ status toggled', { 
        tenantId, 
        faqId: id,
        newStatus: faq.active,
        userId: req.user.id 
      });

      res.json({
        success: true,
        message: 'FAQ status updated successfully',
        data: faq
      });
    } catch (error) {
      logger.error('Error toggling WhatsApp Cloud FAQ status', { 
        id: req.params.id,
        tenantId: req.tenantId || req.user.tenantId, 
        error: error.message 
      });
      res.status(500).json({
        success: false,
        error: 'Failed to update FAQ status'
      });
    }
  }

  /**
   * Reorder FAQs
   * POST /api/user/whatsapp-cloud/faqs/reorder
   */
  static async reorder(req, res) {
    try {
      const tenantId = req.tenantId || req.user.tenantId;
      const { order } = req.body;

      if (!Array.isArray(order)) {
        return res.status(400).json({
          success: false,
          error: 'Order must be an array'
        });
      }

      await WhatsAppCloudFAQ.reorder(tenantId, order);

      logger.info('WhatsApp Cloud FAQs reordered', { 
        tenantId, 
        count: order.length,
        userId: req.user.id 
      });

      res.json({
        success: true,
        message: 'FAQs reordered successfully'
      });
    } catch (error) {
      logger.error('Error reordering WhatsApp Cloud FAQs', { 
        tenantId: req.tenantId || req.user.tenantId, 
        error: error.message 
      });
      res.status(500).json({
        success: false,
        error: 'Failed to reorder FAQs'
      });
    }
  }

  /**
   * Get FAQ statistics
   * GET /api/user/whatsapp-cloud/faqs/statistics
   */
  static async getStatistics(req, res) {
    try {
      const tenantId = req.tenantId || req.user.tenantId;
      const { accountId } = req.query;

      const stats = await WhatsAppCloudFAQ.getStatistics(
        tenantId,
        accountId ? parseInt(accountId) : null
      );

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error('Error getting WhatsApp Cloud FAQ statistics', { 
        tenantId: req.tenantId || req.user.tenantId, 
        error: error.message 
      });
      res.status(500).json({
        success: false,
        error: 'Failed to load statistics'
      });
    }
  }

  /**
   * Get FAQ settings
   * GET /api/user/whatsapp-cloud/faqs/settings
   */
  static async getSettings(req, res) {
    try {
      const tenantId = req.tenantId || req.user.tenantId;
      const { accountId } = req.query;

      const settings = await WhatsAppCloudFAQ.getSettings(
        tenantId,
        accountId ? parseInt(accountId) : null
      );

      res.json({
        success: true,
        data: settings
      });
    } catch (error) {
      logger.error('Error getting WhatsApp Cloud FAQ settings', { 
        tenantId: req.tenantId || req.user.tenantId, 
        error: error.message
      });
      res.status(500).json({
        success: false,
        error: 'Failed to load settings'
      });
    }
  }

  /**
   * Save FAQ settings
   * POST /api/user/whatsapp-cloud/faqs/settings
   */
  static async saveSettings(req, res) {
    try {
      const tenantId = req.tenantId || req.user.tenantId;
      const { accountId, ...settings } = req.body;

      // Sanitize text fields
      if (settings.menu_trigger_keyword) {
        settings.menu_trigger_keyword = sanitizeInput(settings.menu_trigger_keyword);
      }
      if (settings.welcome_message) {
        settings.welcome_message = sanitizeInput(settings.welcome_message);
      }
      if (settings.no_match_message) {
        settings.no_match_message = sanitizeInput(settings.no_match_message);
      }
      if (settings.menu_header) {
        settings.menu_header = sanitizeInput(settings.menu_header);
      }
      if (settings.menu_footer) {
        settings.menu_footer = sanitizeInput(settings.menu_footer);
      }

      const savedSettings = await WhatsAppCloudFAQ.saveSettings(
        tenantId,
        settings,
        accountId ? parseInt(accountId) : null
      );

      logger.info('WhatsApp Cloud FAQ settings saved', { 
        tenantId, 
        accountId,
        userId: req.user.id 
      });

      res.json({
        success: true,
        message: 'Settings saved successfully',
        data: savedSettings
      });
    } catch (error) {
      logger.error('Error saving WhatsApp Cloud FAQ settings', { 
        tenantId: req.tenantId || req.user.tenantId, 
        error: error.message
      });
      res.status(500).json({
        success: false,
        error: 'Failed to save settings'
      });
    }
  }
  /**
   * Get FAQ analytics by ID
   * GET /api/user/whatsapp-cloud/faqs/:id/analytics
   */
  static async getFAQAnalytics(req, res) {
    try {
      const tenantId = req.tenantId || req.user.tenantId;
      const { id } = req.params;

      // Get FAQ details
      const faq = await WhatsAppCloudFAQ.getById(id, tenantId);
      if (!faq) {
        return res.status(404).json({
          success: false,
          error: 'FAQ not found'
        });
      }

      // Get recent usage
      const { pool } = require('../config/database');
      const [recentUsage] = await pool.query(
        `SELECT user_message, confidence_score, algorithm_used, intent, created_at
         FROM whatsapp_cloud_faq_usage 
         WHERE tenant_id = ? AND faq_id = ? 
         ORDER BY created_at DESC 
         LIMIT 10`,
        [tenantId, id]
      );

      // Get related failed searches
      const [failedSearches] = await pool.query(
        `SELECT query, search_count, last_searched_at
         FROM whatsapp_cloud_faq_failed_searches 
         WHERE tenant_id = ? 
         AND (query LIKE CONCAT('%', (SELECT question FROM whatsapp_cloud_faqs WHERE id = ? LIMIT 1), '%')
              OR query LIKE CONCAT('%', (SELECT keywords FROM whatsapp_cloud_faqs WHERE id = ? LIMIT 1), '%'))
         ORDER BY search_count DESC 
         LIMIT 5`,
        [tenantId, id, id]
      );

      // Get feedback stats
      const [feedbackStats] = await pool.query(
        `SELECT 
           SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as helpful_count,
           SUM(CASE WHEN rating = 0 THEN 1 ELSE 0 END) as unhelpful_count,
           AVG(rating) as avg_rating,
           COUNT(*) as total_feedback
         FROM whatsapp_cloud_faq_feedback 
         WHERE tenant_id = ? AND faq_id = ?`,
        [tenantId, id]
      );

      const analytics = {
        faq: faq,
        recent_usage: recentUsage || [],
        failed_searches: failedSearches || [],
        helpful_feedback: feedbackStats[0]?.helpful_count || 0,
        unhelpful_feedback: feedbackStats[0]?.unhelpful_count || 0,
        avg_rating: feedbackStats[0]?.avg_rating || 0,
        total_feedback: feedbackStats[0]?.total_feedback || 0
      };

      res.json({
        success: true,
        data: analytics
      });

    } catch (error) {
      logger.error('Error getting FAQ analytics', { 
        id: req.params.id,
        tenantId: req.tenantId || req.user.tenantId, 
        error: error.message 
      });
      res.status(500).json({
        success: false,
        error: 'Failed to load analytics'
      });
    }
  }
}

module.exports = WhatsAppCloudFAQController;
