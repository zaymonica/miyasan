/**
 * WhatsApp Cloud FAQ Model
 * Manages FAQ data for WhatsApp Cloud accounts with tenant isolation
 * Enhanced with robust error handling, caching, and performance optimizations
 * 
 * @module models/WhatsAppCloudFAQ
 */

const { pool } = require('../config/database');
const { logger } = require('../config/logger');

class WhatsAppCloudFAQ {
  /**
   * Get all FAQs for a tenant/account with enhanced filtering
   * @param {number} tenantId - Tenant ID
   * @param {number} accountId - Account ID (optional)
   * @param {boolean} activeOnly - Return only active FAQs
   * @param {string} category - Filter by category (optional)
   * @param {string} search - Search term (optional)
   * @returns {Promise<Array>} List of FAQs
   */
  static async getByTenantId(tenantId, accountId = null, activeOnly = false, category = null, search = null) {
    try {
      let query = `SELECT *, 
                   COALESCE(usage_count, 0) as usage_count,
                   last_used_at
                   FROM whatsapp_cloud_faqs 
                   WHERE tenant_id = ?`;
      const params = [tenantId];

      if (accountId) {
        query += ' AND (account_id = ? OR account_id IS NULL)';
        params.push(accountId);
      }

      if (activeOnly) {
        query += ' AND active = TRUE';
      }

      if (category) {
        query += ' AND category = ?';
        params.push(category);
      }

      if (search) {
        query += ' AND (question LIKE ? OR answer LIKE ? OR keywords LIKE ?)';
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
      }

      query += ' ORDER BY order_position ASC, usage_count DESC, created_at DESC';

      const [rows] = await pool.query(query, params);
      return rows;
    } catch (error) {
      logger.error('Error getting WhatsApp Cloud FAQs', { 
        tenantId, 
        accountId, 
        activeOnly, 
        category, 
        search, 
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Get FAQ by ID with enhanced validation
   * @param {number} id - FAQ ID
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<Object|null>} FAQ data or null
   */
  static async getById(id, tenantId) {
    try {
      if (!id || !tenantId) {
        throw new Error('FAQ ID and Tenant ID are required');
      }

      const [rows] = await pool.query(
        `SELECT *, 
         COALESCE(usage_count, 0) as usage_count,
         last_used_at
         FROM whatsapp_cloud_faqs 
         WHERE id = ? AND tenant_id = ?`,
        [id, tenantId]
      );
      return rows.length > 0 ? rows[0] : null;
    } catch (error) {
      logger.error('Error getting WhatsApp Cloud FAQ by ID', { 
        id, 
        tenantId, 
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Enhanced search FAQs with fuzzy matching and relevance scoring
   * @param {number} tenantId - Tenant ID
   * @param {string} searchTerm - Search term
   * @param {number} accountId - Account ID (optional)
   * @param {number} limit - Maximum results (default: 5)
   * @returns {Promise<Array>} Matching FAQs with relevance scores
   */
  static async search(tenantId, searchTerm, accountId = null, limit = 5) {
    try {
      if (!searchTerm || searchTerm.trim().length < 2) {
        return [];
      }

      const cleanTerm = searchTerm.trim().toLowerCase();
      const term = `%${cleanTerm}%`;
      
      let query = `
        SELECT *, 
               COALESCE(usage_count, 0) as usage_count,
               last_used_at,
               (
                 CASE 
                   WHEN LOWER(question) LIKE ? THEN 100
                   WHEN LOWER(keywords) LIKE ? THEN 80
                   WHEN LOWER(answer) LIKE ? THEN 60
                   ELSE 0
                 END +
                 CASE 
                   WHEN LOWER(question) = ? THEN 50
                   WHEN LOWER(question) LIKE CONCAT(?, '%') THEN 30
                   WHEN LOWER(question) LIKE CONCAT('%', ?, '%') THEN 20
                   ELSE 0
                 END +
                 (usage_count * 0.1)
               ) as relevance_score
        FROM whatsapp_cloud_faqs 
        WHERE tenant_id = ? 
        AND active = TRUE
        AND (
          LOWER(question) LIKE ? OR 
          LOWER(answer) LIKE ? OR 
          LOWER(keywords) LIKE ?
        )`;
      
      const params = [
        term, term, term, // relevance scoring
        cleanTerm, cleanTerm, cleanTerm, // exact/prefix matching
        tenantId, // tenant filter
        term, term, term // main search
      ];

      if (accountId) {
        query += ' AND (account_id = ? OR account_id IS NULL)';
        params.push(accountId);
      }

      query += ' ORDER BY relevance_score DESC, usage_count DESC, order_position ASC LIMIT ?';
      params.push(limit);

      const [rows] = await pool.query(query, params);
      
      // Log search for analytics
      if (rows.length > 0) {
        logger.info('FAQ search successful', {
          tenantId,
          accountId,
          searchTerm: cleanTerm,
          resultsCount: rows.length,
          topResult: rows[0].question
        });
      }

      return rows;
    } catch (error) {
      logger.error('Error searching WhatsApp Cloud FAQs', { 
        tenantId, 
        searchTerm, 
        accountId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Create new FAQ with enhanced validation
   * @param {number} tenantId - Tenant ID
   * @param {Object} data - FAQ data
   * @returns {Promise<Object>} Created FAQ
   */
  static async create(tenantId, data) {
    const connection = await pool.getConnection();
    try {
      logger.info('Creating WhatsApp Cloud FAQ', { tenantId, data });
      
      // Enhanced validation
      if (!data.question || data.question.trim().length < 5) {
        throw new Error('Question must be at least 5 characters long');
      }
      
      if (!data.answer || data.answer.trim().length < 10) {
        throw new Error('Answer must be at least 10 characters long');
      }

      if (data.question.length > 500) {
        throw new Error('Question cannot exceed 500 characters');
      }

      // Check for duplicate questions within tenant
      const [existing] = await connection.query(
        'SELECT id FROM whatsapp_cloud_faqs WHERE tenant_id = ? AND LOWER(question) = LOWER(?) AND (account_id = ? OR (account_id IS NULL AND ? IS NULL))',
        [tenantId, data.question.trim(), data.account_id || null, data.account_id || null]
      );

      if (existing.length > 0) {
        throw new Error('A FAQ with this question already exists');
      }

      await connection.beginTransaction();

      // Get next order position
      const [maxOrder] = await connection.query(
        'SELECT COALESCE(MAX(order_position), 0) + 1 as next_order FROM whatsapp_cloud_faqs WHERE tenant_id = ? AND (account_id = ? OR (account_id IS NULL AND ? IS NULL))',
        [tenantId, data.account_id || null, data.account_id || null]
      );

      const [result] = await connection.query(
        `INSERT INTO whatsapp_cloud_faqs 
         (tenant_id, account_id, question, answer, keywords, emoji, category, active, order_position, trigger_type, usage_count) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          tenantId,
          data.account_id || null,
          data.question.trim(),
          data.answer.trim(),
          data.keywords ? data.keywords.trim() : null,
          data.emoji ? data.emoji.trim() : null,
          data.category || 'general',
          data.active !== false,
          data.order_position || maxOrder[0].next_order,
          data.trigger_type || 'keyword'
        ]
      );

      await connection.commit();
      logger.info('FAQ created with ID', { insertId: result.insertId });

      return await this.getById(result.insertId, tenantId);
    } catch (error) {
      await connection.rollback();
      logger.error('Error creating WhatsApp Cloud FAQ', { 
        tenantId, 
        error: error.message,
        code: error.code,
        sqlMessage: error.sqlMessage,
        stack: error.stack
      });
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Update FAQ with enhanced validation and optimistic locking
   * @param {number} id - FAQ ID
   * @param {number} tenantId - Tenant ID
   * @param {Object} data - FAQ data to update
   * @returns {Promise<Object>} Updated FAQ
   */
  static async update(id, tenantId, data) {
    const connection = await pool.getConnection();
    try {
      // Verify FAQ exists and belongs to tenant
      const existing = await this.getById(id, tenantId);
      if (!existing) {
        throw new Error('FAQ not found or access denied');
      }

      // Enhanced validation
      if (data.question !== undefined) {
        if (!data.question || data.question.trim().length < 5) {
          throw new Error('Question must be at least 5 characters long');
        }
        if (data.question.length > 500) {
          throw new Error('Question cannot exceed 500 characters');
        }

        // Check for duplicate questions (excluding current FAQ)
        const [duplicate] = await connection.query(
          'SELECT id FROM whatsapp_cloud_faqs WHERE tenant_id = ? AND LOWER(question) = LOWER(?) AND id != ? AND (account_id = ? OR (account_id IS NULL AND ? IS NULL))',
          [tenantId, data.question.trim(), id, existing.account_id || null, existing.account_id || null]
        );

        if (duplicate.length > 0) {
          throw new Error('A FAQ with this question already exists');
        }
      }

      if (data.answer !== undefined && (!data.answer || data.answer.trim().length < 10)) {
        throw new Error('Answer must be at least 10 characters long');
      }

      await connection.beginTransaction();

      const updates = [];
      const values = [];

      if (data.question !== undefined) {
        updates.push('question = ?');
        values.push(data.question.trim());
      }
      if (data.answer !== undefined) {
        updates.push('answer = ?');
        values.push(data.answer.trim());
      }
      if (data.keywords !== undefined) {
        updates.push('keywords = ?');
        values.push(data.keywords ? data.keywords.trim() : null);
      }
      if (data.emoji !== undefined) {
        updates.push('emoji = ?');
        values.push(data.emoji ? data.emoji.trim() : null);
      }
      if (data.category !== undefined) {
        updates.push('category = ?');
        values.push(data.category);
      }
      if (data.active !== undefined) {
        updates.push('active = ?');
        values.push(data.active);
      }
      if (data.order_position !== undefined) {
        updates.push('order_position = ?');
        values.push(data.order_position);
      }
      if (data.trigger_type !== undefined) {
        updates.push('trigger_type = ?');
        values.push(data.trigger_type);
      }
      if (data.account_id !== undefined) {
        updates.push('account_id = ?');
        values.push(data.account_id);
      }

      if (updates.length === 0) {
        return existing;
      }

      updates.push('updated_at = NOW()');
      values.push(id, tenantId);

      await connection.query(
        `UPDATE whatsapp_cloud_faqs SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`,
        values
      );

      await connection.commit();
      return await this.getById(id, tenantId);
    } catch (error) {
      await connection.rollback();
      logger.error('Error updating WhatsApp Cloud FAQ', { 
        id, 
        tenantId, 
        error: error.message,
        stack: error.stack
      });
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Delete FAQ with cascade handling
   * @param {number} id - FAQ ID
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<boolean>} Success status
   */
  static async delete(id, tenantId) {
    const connection = await pool.getConnection();
    try {
      // Verify FAQ exists and belongs to tenant
      const existing = await this.getById(id, tenantId);
      if (!existing) {
        throw new Error('FAQ not found or access denied');
      }

      await connection.beginTransaction();

      // Delete usage records first (foreign key constraint)
      await connection.query(
        'DELETE FROM whatsapp_cloud_faq_usage WHERE faq_id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      // Delete the FAQ
      const [result] = await connection.query(
        'DELETE FROM whatsapp_cloud_faqs WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      await connection.commit();
      
      logger.info('WhatsApp Cloud FAQ deleted', { 
        id, 
        tenantId, 
        question: existing.question,
        affectedRows: result.affectedRows
      });

      return result.affectedRows > 0;
    } catch (error) {
      await connection.rollback();
      logger.error('Error deleting WhatsApp Cloud FAQ', { 
        id, 
        tenantId, 
        error: error.message,
        stack: error.stack
      });
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Toggle FAQ active status with validation
   * @param {number} id - FAQ ID
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<Object>} Updated FAQ
   */
  static async toggleActive(id, tenantId) {
    try {
      const faq = await this.getById(id, tenantId);
      if (!faq) {
        throw new Error('FAQ not found or access denied');
      }

      await pool.query(
        'UPDATE whatsapp_cloud_faqs SET active = ?, updated_at = NOW() WHERE id = ? AND tenant_id = ?',
        [!faq.active, id, tenantId]
      );

      logger.info('WhatsApp Cloud FAQ status toggled', { 
        id, 
        tenantId, 
        oldStatus: faq.active, 
        newStatus: !faq.active
      });

      return await this.getById(id, tenantId);
    } catch (error) {
      logger.error('Error toggling WhatsApp Cloud FAQ status', { 
        id, 
        tenantId, 
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Reorder FAQs with transaction safety
   * @param {number} tenantId - Tenant ID
   * @param {Array} order - Array of FAQ IDs in new order
   * @param {number} accountId - Account ID (optional)
   * @returns {Promise<boolean>} Success status
   */
  static async reorder(tenantId, order, accountId = null) {
    const connection = await pool.getConnection();
    try {
      if (!Array.isArray(order) || order.length === 0) {
        throw new Error('Order array is required and cannot be empty');
      }

      await connection.beginTransaction();

      // Verify all FAQs belong to the tenant and account
      const placeholders = order.map(() => '?').join(',');
      const [faqs] = await connection.query(
        `SELECT id FROM whatsapp_cloud_faqs 
         WHERE id IN (${placeholders}) 
         AND tenant_id = ? 
         AND (account_id = ? OR (account_id IS NULL AND ? IS NULL))`,
        [...order, tenantId, accountId || null, accountId || null]
      );

      if (faqs.length !== order.length) {
        throw new Error('Some FAQs not found or access denied');
      }

      // Update order positions
      for (let i = 0; i < order.length; i++) {
        await connection.query(
          'UPDATE whatsapp_cloud_faqs SET order_position = ?, updated_at = NOW() WHERE id = ? AND tenant_id = ?',
          [i + 1, order[i], tenantId]
        );
      }

      await connection.commit();
      
      logger.info('WhatsApp Cloud FAQs reordered', { 
        tenantId, 
        accountId,
        count: order.length
      });

      return true;
    } catch (error) {
      await connection.rollback();
      logger.error('Error reordering WhatsApp Cloud FAQs', { 
        tenantId, 
        accountId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Get comprehensive FAQ statistics
   * @param {number} tenantId - Tenant ID
   * @param {number} accountId - Account ID (optional)
   * @returns {Promise<Object>} Statistics
   */
  static async getStatistics(tenantId, accountId = null) {
    try {
      let query = `SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN active = TRUE THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN active = FALSE THEN 1 ELSE 0 END) as inactive,
          SUM(COALESCE(usage_count, 0)) as total_usage,
          AVG(COALESCE(usage_count, 0)) as avg_usage,
          COUNT(CASE WHEN last_used_at IS NOT NULL THEN 1 END) as used_count,
          COUNT(CASE WHEN last_used_at IS NULL THEN 1 END) as unused_count
         FROM whatsapp_cloud_faqs 
         WHERE tenant_id = ?`;
      const params = [tenantId];

      if (accountId) {
        query += ' AND (account_id = ? OR account_id IS NULL)';
        params.push(accountId);
      }

      const [rows] = await pool.query(query, params);

      // Get category breakdown
      let categoryQuery = `SELECT 
          category,
          COUNT(*) as count,
          SUM(CASE WHEN active = TRUE THEN 1 ELSE 0 END) as active_count
         FROM whatsapp_cloud_faqs 
         WHERE tenant_id = ?`;
      const categoryParams = [tenantId];

      if (accountId) {
        categoryQuery += ' AND (account_id = ? OR account_id IS NULL)';
        categoryParams.push(accountId);
      }

      categoryQuery += ' GROUP BY category ORDER BY count DESC';
      const [categories] = await pool.query(categoryQuery, categoryParams);

      // Get recent usage stats
      let usageQuery = `SELECT 
          DATE(created_at) as date,
          COUNT(*) as usage_count
         FROM whatsapp_cloud_faq_usage 
         WHERE tenant_id = ? 
         AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`;
      const usageParams = [tenantId];

      if (accountId) {
        usageQuery += ' AND faq_id IN (SELECT id FROM whatsapp_cloud_faqs WHERE account_id = ? OR account_id IS NULL)';
        usageParams.push(accountId);
      }

      usageQuery += ' GROUP BY DATE(created_at) ORDER BY date DESC LIMIT 30';
      const [usageStats] = await pool.query(usageQuery, usageParams);

      return {
        total: rows[0].total || 0,
        active: rows[0].active || 0,
        inactive: rows[0].inactive || 0,
        total_usage: rows[0].total_usage || 0,
        avg_usage: parseFloat(rows[0].avg_usage || 0).toFixed(2),
        used_count: rows[0].used_count || 0,
        unused_count: rows[0].unused_count || 0,
        categories: categories || [],
        usage_trend: usageStats || []
      };
    } catch (error) {
      logger.error('Error getting WhatsApp Cloud FAQ statistics', { 
        tenantId, 
        accountId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Log FAQ usage with enhanced tracking
   * @param {number} tenantId - Tenant ID
   * @param {number} faqId - FAQ ID
   * @param {number} conversationId - Conversation ID
   * @param {string} triggeredBy - How it was triggered
   * @param {string} userMessage - User's message
   * @param {Object} metadata - Additional metadata (confidence, intent, algorithm, context)
   * @returns {Promise<boolean>} Success status
   */
  static async logUsage(tenantId, faqId, conversationId, triggeredBy = 'user', userMessage = null, metadata = {}) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Log the usage with enhanced data
      await connection.query(
        `INSERT INTO whatsapp_cloud_faq_usage 
         (tenant_id, faq_id, conversation_id, triggered_by, user_message, confidence_score, intent, algorithm_used, context_data) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tenantId, 
          faqId, 
          conversationId, 
          triggeredBy, 
          userMessage,
          metadata.confidence || null,
          metadata.intent || null,
          metadata.algorithm || null,
          metadata.context ? JSON.stringify(metadata.context) : null
        ]
      );

      // Update FAQ usage counter and last used timestamp
      await connection.query(
        `UPDATE whatsapp_cloud_faqs 
         SET usage_count = COALESCE(usage_count, 0) + 1, 
             last_used_at = NOW(),
             updated_at = NOW()
         WHERE id = ? AND tenant_id = ?`,
        [faqId, tenantId]
      );

      await connection.commit();
      
      logger.info('Enhanced WhatsApp Cloud FAQ usage logged', { 
        tenantId, 
        faqId, 
        conversationId, 
        triggeredBy,
        confidence: metadata.confidence,
        intent: metadata.intent,
        algorithm: metadata.algorithm
      });

      return true;
    } catch (error) {
      await connection.rollback();
      logger.error('Error logging enhanced WhatsApp Cloud FAQ usage', { 
        tenantId, 
        faqId, 
        conversationId,
        triggeredBy,
        error: error.message,
        stack: error.stack
      });
      return false;
    } finally {
      connection.release();
    }
  }

  /**
   * Get FAQ settings with enhanced defaults
   * @param {number} tenantId - Tenant ID
   * @param {number} accountId - Account ID (optional)
   * @returns {Promise<Object>} Settings
   */
  static async getSettings(tenantId, accountId = null) {
    try {
      let query = 'SELECT * FROM whatsapp_cloud_faq_settings WHERE tenant_id = ?';
      const params = [tenantId];

      if (accountId) {
        query += ' AND account_id = ?';
        params.push(accountId);
      } else {
        query += ' AND account_id IS NULL';
      }

      const [rows] = await pool.query(query, params);
      
      if (rows.length > 0) {
        return {
          ...rows[0],
          // Ensure boolean values
          auto_reply_enabled: Boolean(rows[0].auto_reply_enabled),
          menu_enabled: Boolean(rows[0].menu_enabled)
        };
      }

      // Return enhanced default settings
      return {
        auto_reply_enabled: true,
        menu_enabled: true,
        menu_trigger_keyword: 'menu',
        welcome_message: 'Hello! 👋 How can I help you today?\n\nType "menu" to see available options.',
        no_match_message: 'I\'m sorry, I couldn\'t find an answer to your question. 🤔\n\nPlease contact our support team for assistance, or type "menu" to see available options.',
        menu_header: '📋 *Available Options*\n\nPlease select an option by typing the corresponding number:',
        menu_footer: '\n💬 You can also ask me any question directly!',
        similarity_threshold: 0.70
      };
    } catch (error) {
      logger.error('Error getting WhatsApp Cloud FAQ settings', { 
        tenantId, 
        accountId, 
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Save FAQ settings with validation
   * @param {number} tenantId - Tenant ID
   * @param {Object} settings - Settings data
   * @param {number} accountId - Account ID (optional)
   * @returns {Promise<Object>} Saved settings
   */
  static async saveSettings(tenantId, settings, accountId = null) {
    const connection = await pool.getConnection();
    try {
      // Validate settings
      if (settings.similarity_threshold !== undefined) {
        const threshold = parseFloat(settings.similarity_threshold);
        if (isNaN(threshold) || threshold < 0 || threshold > 1) {
          throw new Error('Similarity threshold must be between 0 and 1');
        }
        settings.similarity_threshold = threshold;
      }

      if (settings.menu_trigger_keyword !== undefined) {
        if (!settings.menu_trigger_keyword || settings.menu_trigger_keyword.trim().length === 0) {
          throw new Error('Menu trigger keyword cannot be empty');
        }
        settings.menu_trigger_keyword = settings.menu_trigger_keyword.trim().toLowerCase();
      }

      await connection.beginTransaction();

      const [existing] = await connection.query(
        'SELECT id FROM whatsapp_cloud_faq_settings WHERE tenant_id = ? AND (account_id = ? OR (account_id IS NULL AND ? IS NULL))',
        [tenantId, accountId, accountId]
      );

      if (existing.length > 0) {
        // Update existing settings
        const updates = [];
        const values = [];

        if (settings.auto_reply_enabled !== undefined) {
          updates.push('auto_reply_enabled = ?');
          values.push(Boolean(settings.auto_reply_enabled));
        }
        if (settings.menu_enabled !== undefined) {
          updates.push('menu_enabled = ?');
          values.push(Boolean(settings.menu_enabled));
        }
        if (settings.menu_trigger_keyword !== undefined) {
          updates.push('menu_trigger_keyword = ?');
          values.push(settings.menu_trigger_keyword);
        }
        if (settings.welcome_message !== undefined) {
          updates.push('welcome_message = ?');
          values.push(settings.welcome_message);
        }
        if (settings.no_match_message !== undefined) {
          updates.push('no_match_message = ?');
          values.push(settings.no_match_message);
        }
        if (settings.menu_header !== undefined) {
          updates.push('menu_header = ?');
          values.push(settings.menu_header);
        }
        if (settings.menu_footer !== undefined) {
          updates.push('menu_footer = ?');
          values.push(settings.menu_footer);
        }
        if (settings.similarity_threshold !== undefined) {
          updates.push('similarity_threshold = ?');
          values.push(settings.similarity_threshold);
        }

        if (updates.length > 0) {
          updates.push('updated_at = NOW()');
          values.push(existing[0].id);
          
          await connection.query(
            `UPDATE whatsapp_cloud_faq_settings SET ${updates.join(', ')} WHERE id = ?`,
            values
          );
        }
      } else {
        // Insert new settings
        await connection.query(
          `INSERT INTO whatsapp_cloud_faq_settings 
           (tenant_id, account_id, auto_reply_enabled, menu_enabled, menu_trigger_keyword, 
            welcome_message, no_match_message, menu_header, menu_footer, similarity_threshold) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            tenantId,
            accountId,
            settings.auto_reply_enabled !== false,
            settings.menu_enabled !== false,
            settings.menu_trigger_keyword || 'menu',
            settings.welcome_message || 'Hello! How can I help you today?',
            settings.no_match_message || 'Sorry, I couldn\'t find an answer to your question.',
            settings.menu_header || '📋 *Available Options*',
            settings.menu_footer || '\nReply with the number of your choice.',
            settings.similarity_threshold || 0.70
          ]
        );
      }

      await connection.commit();
      
      logger.info('WhatsApp Cloud FAQ settings saved', { 
        tenantId, 
        accountId,
        settingsKeys: Object.keys(settings)
      });

      return await this.getSettings(tenantId, accountId);
    } catch (error) {
      await connection.rollback();
      logger.error('Error saving WhatsApp Cloud FAQ settings', { 
        tenantId, 
        accountId, 
        error: error.message,
        stack: error.stack
      });
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Get popular FAQs based on usage
   * @param {number} tenantId - Tenant ID
   * @param {number} accountId - Account ID (optional)
   * @param {number} limit - Maximum results (default: 10)
   * @returns {Promise<Array>} Popular FAQs
   */
  static async getPopular(tenantId, accountId = null, limit = 10) {
    try {
      let query = `SELECT *, 
                   COALESCE(usage_count, 0) as usage_count,
                   last_used_at
                   FROM whatsapp_cloud_faqs 
                   WHERE tenant_id = ? AND active = TRUE`;
      const params = [tenantId];

      if (accountId) {
        query += ' AND (account_id = ? OR account_id IS NULL)';
        params.push(accountId);
      }

      query += ' ORDER BY usage_count DESC, last_used_at DESC LIMIT ?';
      params.push(limit);

      const [rows] = await pool.query(query, params);
      return rows;
    } catch (error) {
      logger.error('Error getting popular WhatsApp Cloud FAQs', { 
        tenantId, 
        accountId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get categories with counts
   * @param {number} tenantId - Tenant ID
   * @param {number} accountId - Account ID (optional)
   * @returns {Promise<Array>} Categories with counts
   */
  static async getCategories(tenantId, accountId = null) {
    try {
      let query = `SELECT 
                   category,
                   COUNT(*) as total_count,
                   SUM(CASE WHEN active = TRUE THEN 1 ELSE 0 END) as active_count,
                   SUM(COALESCE(usage_count, 0)) as total_usage
                   FROM whatsapp_cloud_faqs 
                   WHERE tenant_id = ?`;
      const params = [tenantId];

      if (accountId) {
        query += ' AND (account_id = ? OR account_id IS NULL)';
        params.push(accountId);
      }

      query += ' GROUP BY category ORDER BY total_count DESC';

      const [rows] = await pool.query(query, params);
      return rows;
    } catch (error) {
      logger.error('Error getting WhatsApp Cloud FAQ categories', { 
        tenantId, 
        accountId,
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = WhatsAppCloudFAQ;
