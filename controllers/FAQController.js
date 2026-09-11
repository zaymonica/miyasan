/**
 * FAQ Controller
 * Handles FAQ management for multi-tenant system
 * 
 * @module controllers/FAQController
 */

const FAQ = require('../models/FAQ');
const WelcomeMessage = require('../models/WelcomeMessage');
const MessagePlaceholder = require('../models/MessagePlaceholder');
const { logger } = require('../config/logger');
const { sanitizeInput } = require('../utils/sanitizer');

class FAQController {
  /**
   * List all FAQs for tenant
   * GET /api/tenant/faqs
   */
  static async list(req, res) {
    try {
      const tenantId = req.user.tenantId;
      const { active } = req.query;

      const faqs = await FAQ.getByTenantId(tenantId, active === 'true');

      res.json({
        success: true,
        data: faqs
      });
    } catch (error) {
      logger.error('Error listing FAQs', { 
        tenantId: req.user.tenantId, 
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
   * GET /api/tenant/faqs/:id
   */
  static async getById(req, res) {
    try {
      const tenantId = req.user.tenantId;
      const { id } = req.params;

      const faq = await FAQ.getById(id, tenantId);

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
      logger.error('Error getting FAQ', { 
        id: req.params.id,
        tenantId: req.user.tenantId, 
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
   * GET /api/tenant/faqs/search
   */
  static async search(req, res) {
    try {
      const tenantId = req.user.tenantId;
      const { q } = req.query;

      if (!q) {
        return res.status(400).json({
          success: false,
          error: 'Search query is required'
        });
      }

      const faqs = await FAQ.search(tenantId, sanitizeInput(q));

      res.json({
        success: true,
        data: faqs
      });
    } catch (error) {
      logger.error('Error searching FAQs', { 
        tenantId: req.user.tenantId, 
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
   * POST /api/tenant/faqs
   */
  static async create(req, res) {
    try {
      const tenantId = req.user.tenantId;
      const { 
        question, 
        answer, 
        emoji, 
        placeholder_key, 
        active, 
        order_position,
        reaction_time,
        response_time,
        schedule_hours,
        schedule_days
      } = req.body;

      logger.info('Creating FAQ', { tenantId, body: req.body });

      // Validation
      if (!question || !answer) {
        logger.warn('FAQ validation failed: missing question or answer', { question: !!question, answer: !!answer });
        return res.status(400).json({
          success: false,
          error: 'Question and answer are required'
        });
      }

      if (question.length < 5 || question.length > 500) {
        logger.warn('FAQ validation failed: question length', { length: question.length });
        return res.status(400).json({
          success: false,
          error: 'Question must be between 5 and 500 characters'
        });
      }

      if (answer.length < 10) {
        logger.warn('FAQ validation failed: answer length', { length: answer.length });
        return res.status(400).json({
          success: false,
          error: 'Answer must be at least 10 characters'
        });
      }

      const data = {
        question: sanitizeInput(question),
        answer: sanitizeInput(answer),
        emoji: emoji ? sanitizeInput(emoji) : null,
        placeholder_key: placeholder_key ? sanitizeInput(placeholder_key) : null,
        active: active !== false,
        order_position: order_position || 0,
        reaction_time: reaction_time || 3,
        response_time: response_time || 7,
        schedule_hours: schedule_hours ? sanitizeInput(schedule_hours) : null,
        schedule_days: schedule_days ? sanitizeInput(schedule_days) : null
      };

      const faq = await FAQ.create(tenantId, data);

      logger.info('FAQ created', { 
        tenantId, 
        faqId: faq.id,
        userId: req.user.id 
      });

      res.status(201).json({
        success: true,
        message: 'FAQ created successfully',
        data: faq
      });
    } catch (error) {
      logger.error('Error creating FAQ', { 
        tenantId: req.user.tenantId, 
        error: error.message,
        stack: error.stack
      });
      res.status(500).json({
        success: false,
        error: 'Failed to create FAQ'
      });
    }
  }

  /**
   * Update FAQ
   * PUT /api/tenant/faqs/:id
   */
  static async update(req, res) {
    try {
      const tenantId = req.user.tenantId;
      const { id } = req.params;
      const { question, answer, emoji, placeholder_key, active, order_position } = req.body;

      // Check if FAQ exists
      const existing = await FAQ.getById(id, tenantId);
      if (!existing) {
        return res.status(404).json({
          success: false,
          error: 'FAQ not found'
        });
      }

      const data = {};
      if (question !== undefined) data.question = sanitizeInput(question);
      if (answer !== undefined) data.answer = sanitizeInput(answer);
      if (emoji !== undefined) data.emoji = emoji ? sanitizeInput(emoji) : null;
      if (placeholder_key !== undefined) data.placeholder_key = placeholder_key ? sanitizeInput(placeholder_key) : null;
      if (active !== undefined) data.active = active;
      if (order_position !== undefined) data.order_position = order_position;

      const faq = await FAQ.update(id, tenantId, data);

      logger.info('FAQ updated', { 
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
      logger.error('Error updating FAQ', { 
        id: req.params.id,
        tenantId: req.user.tenantId, 
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
   * DELETE /api/tenant/faqs/:id
   */
  static async delete(req, res) {
    try {
      const tenantId = req.user.tenantId;
      const { id } = req.params;

      const deleted = await FAQ.delete(id, tenantId);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: 'FAQ not found'
        });
      }

      logger.info('FAQ deleted', { 
        tenantId, 
        faqId: id,
        userId: req.user.id 
      });

      res.json({
        success: true,
        message: 'FAQ deleted successfully'
      });
    } catch (error) {
      logger.error('Error deleting FAQ', { 
        id: req.params.id,
        tenantId: req.user.tenantId, 
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
   * PATCH /api/tenant/faqs/:id/toggle
   */
  static async toggleActive(req, res) {
    try {
      const tenantId = req.user.tenantId;
      const { id } = req.params;

      const faq = await FAQ.toggleActive(id, tenantId);

      logger.info('FAQ status toggled', { 
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
      logger.error('Error toggling FAQ status', { 
        id: req.params.id,
        tenantId: req.user.tenantId, 
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
   * POST /api/tenant/faqs/reorder
   */
  static async reorder(req, res) {
    try {
      const tenantId = req.user.tenantId;
      const { order } = req.body;

      if (!Array.isArray(order)) {
        return res.status(400).json({
          success: false,
          error: 'Order must be an array'
        });
      }

      await FAQ.reorder(tenantId, order);

      logger.info('FAQs reordered', { 
        tenantId, 
        count: order.length,
        userId: req.user.id 
      });

      res.json({
        success: true,
        message: 'FAQs reordered successfully'
      });
    } catch (error) {
      logger.error('Error reordering FAQs', { 
        tenantId: req.user.tenantId, 
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
   * GET /api/tenant/faqs/statistics
   */
  static async getStatistics(req, res) {
    try {
      const tenantId = req.user.tenantId;

      const stats = await FAQ.getStatistics(tenantId);

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error('Error getting FAQ statistics', { 
        tenantId: req.user.tenantId, 
        error: error.message 
      });
      res.status(500).json({
        success: false,
        error: 'Failed to load statistics'
      });
    }
  }

  /**
   * Get welcome messages
   * GET /api/tenant/faqs/welcome-messages
   */
  static async getWelcomeMessages(req, res) {
    try {
      const tenantId = req.user.tenantId;

      const messages = await WelcomeMessage.getByTenantId(tenantId);

      res.json(messages);
    } catch (error) {
      logger.error('Error getting welcome messages', { 
        tenantId: req.user.tenantId, 
        error: error.message
      });
      res.status(500).json({
        success: false,
        error: 'Failed to load welcome messages'
      });
    }
  }

  /**
   * Save welcome messages
   * POST /api/tenant/faqs/welcome-messages
   */
  static async saveWelcomeMessages(req, res) {
    try {
      const tenantId = req.user.tenantId;
      const { messages } = req.body;

      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Messages are required'
        });
      }

      // Sanitize and filter messages
      const sanitizedMessages = messages
        .filter(msg => msg.text && msg.text.trim())
        .map(msg => ({
          text: sanitizeInput(msg.text)
        }));

      // Save messages
      await WelcomeMessage.saveAll(tenantId, sanitizedMessages);

      logger.info('Welcome messages saved', { 
        tenantId, 
        count: sanitizedMessages.length,
        userId: req.user.id 
      });

      res.json({
        success: true,
        message: 'Welcome messages updated'
      });
    } catch (error) {
      logger.error('Error saving welcome messages', { 
        tenantId: req.user.tenantId, 
        error: error.message
      });
      res.status(500).json({
        success: false,
        error: 'Failed to save welcome messages'
      });
    }
  }

  /**
   * Get placeholders
   * GET /api/tenant/faqs/placeholders
   */
  static async getPlaceholders(req, res) {
    try {
      const tenantId = req.user.tenantId;

      const placeholders = await MessagePlaceholder.getByTenantId(tenantId);

      res.json(placeholders);
    } catch (error) {
      logger.error('Error getting placeholders', { 
        tenantId: req.user.tenantId, 
        error: error.message 
      });
      res.status(500).json({
        success: false,
        error: 'Failed to load placeholders'
      });
    }
  }
}

module.exports = FAQController;
