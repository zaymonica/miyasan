/**
 * FAQ Model
 * Manages FAQ data with tenant isolation
 * 
 * @module models/FAQ
 */

const { pool } = require('../config/database');
const { logger } = require('../config/logger');

class FAQ {
  /**
   * Get all FAQs for a tenant
   * @param {number} tenantId - Tenant ID
   * @param {boolean} activeOnly - Return only active FAQs
   * @returns {Promise<Array>} List of FAQs
   */
  static async getByTenantId(tenantId, activeOnly = false) {
    try {
      let query = 'SELECT * FROM faqs WHERE tenant_id = ?';
      const params = [tenantId];

      if (activeOnly) {
        query += ' AND active = TRUE';
      }

      query += ' ORDER BY order_position ASC, created_at DESC';

      const [rows] = await pool.query(query, params);
      return rows;
    } catch (error) {
      logger.error('Error getting FAQs', { tenantId, error: error.message });
      throw error;
    }
  }

  /**
   * Get FAQ by ID
   * @param {number} id - FAQ ID
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<Object|null>} FAQ data or null
   */
  static async getById(id, tenantId) {
    try {
      const [rows] = await pool.query(
        'SELECT * FROM faqs WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );
      return rows.length > 0 ? rows[0] : null;
    } catch (error) {
      logger.error('Error getting FAQ by ID', { id, tenantId, error: error.message });
      throw error;
    }
  }

  /**
   * Search FAQs
   * @param {number} tenantId - Tenant ID
   * @param {string} searchTerm - Search term
   * @returns {Promise<Array>} Matching FAQs
   */
  static async search(tenantId, searchTerm) {
    try {
      const term = `%${searchTerm}%`;
      const [rows] = await pool.query(
        `SELECT * FROM faqs 
         WHERE tenant_id = ? 
         AND (question LIKE ? OR answer LIKE ?) 
         AND active = TRUE 
         ORDER BY order_position ASC`,
        [tenantId, term, term]
      );
      return rows;
    } catch (error) {
      logger.error('Error searching FAQs', { tenantId, searchTerm, error: error.message });
      throw error;
    }
  }

  /**
   * Create new FAQ
   * @param {number} tenantId - Tenant ID
   * @param {Object} data - FAQ data
   * @returns {Promise<Object>} Created FAQ
   */
  static async create(tenantId, data) {
    try {
      const [result] = await pool.query(
        `INSERT INTO faqs (tenant_id, question, answer, emoji, placeholder_key, active, order_position, reaction_time, response_time, schedule_hours, schedule_days) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tenantId,
          data.question,
          data.answer,
          data.emoji || null,
          data.placeholder_key || null,
          data.active !== false,
          data.order_position || 0,
          data.reaction_time || 3,
          data.response_time || 7,
          data.schedule_hours || '08:00-18:00',
          data.schedule_days || 'monday,tuesday,wednesday,thursday,friday,saturday'
        ]
      );

      return await this.getById(result.insertId, tenantId);
    } catch (error) {
      logger.error('Error creating FAQ', { tenantId, error: error.message });
      throw error;
    }
  }

  /**
   * Update FAQ
   * @param {number} id - FAQ ID
   * @param {number} tenantId - Tenant ID
   * @param {Object} data - FAQ data to update
   * @returns {Promise<Object>} Updated FAQ
   */
  static async update(id, tenantId, data) {
    try {
      const updates = [];
      const values = [];

      if (data.question !== undefined) {
        updates.push('question = ?');
        values.push(data.question);
      }
      if (data.answer !== undefined) {
        updates.push('answer = ?');
        values.push(data.answer);
      }
      if (data.emoji !== undefined) {
        updates.push('emoji = ?');
        values.push(data.emoji);
      }
      if (data.placeholder_key !== undefined) {
        updates.push('placeholder_key = ?');
        values.push(data.placeholder_key);
      }
      if (data.active !== undefined) {
        updates.push('active = ?');
        values.push(data.active);
      }
      if (data.order_position !== undefined) {
        updates.push('order_position = ?');
        values.push(data.order_position);
      }
      if (data.reaction_time !== undefined) {
        updates.push('reaction_time = ?');
        values.push(data.reaction_time);
      }
      if (data.response_time !== undefined) {
        updates.push('response_time = ?');
        values.push(data.response_time);
      }
      if (data.schedule_hours !== undefined) {
        updates.push('schedule_hours = ?');
        values.push(data.schedule_hours);
      }
      if (data.schedule_days !== undefined) {
        updates.push('schedule_days = ?');
        values.push(data.schedule_days);
      }

      if (updates.length === 0) {
        return await this.getById(id, tenantId);
      }

      values.push(id, tenantId);

      await pool.query(
        `UPDATE faqs SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`,
        values
      );

      return await this.getById(id, tenantId);
    } catch (error) {
      logger.error('Error updating FAQ', { id, tenantId, error: error.message });
      throw error;
    }
  }

  /**
   * Delete FAQ
   * @param {number} id - FAQ ID
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<boolean>} Success status
   */
  static async delete(id, tenantId) {
    try {
      const [result] = await pool.query(
        'DELETE FROM faqs WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );
      return result.affectedRows > 0;
    } catch (error) {
      logger.error('Error deleting FAQ', { id, tenantId, error: error.message });
      throw error;
    }
  }

  /**
   * Toggle FAQ active status
   * @param {number} id - FAQ ID
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<Object>} Updated FAQ
   */
  static async toggleActive(id, tenantId) {
    try {
      const faq = await this.getById(id, tenantId);
      if (!faq) {
        throw new Error('FAQ not found');
      }

      await pool.query(
        'UPDATE faqs SET active = ? WHERE id = ? AND tenant_id = ?',
        [!faq.active, id, tenantId]
      );

      return await this.getById(id, tenantId);
    } catch (error) {
      logger.error('Error toggling FAQ status', { id, tenantId, error: error.message });
      throw error;
    }
  }

  /**
   * Reorder FAQs
   * @param {number} tenantId - Tenant ID
   * @param {Array} order - Array of FAQ IDs in new order
   * @returns {Promise<boolean>} Success status
   */
  static async reorder(tenantId, order) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      for (let i = 0; i < order.length; i++) {
        await connection.query(
          'UPDATE faqs SET order_position = ? WHERE id = ? AND tenant_id = ?',
          [i, order[i], tenantId]
        );
      }

      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      logger.error('Error reordering FAQs', { tenantId, error: error.message });
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Get FAQ statistics for tenant
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<Object>} Statistics
   */
  static async getStatistics(tenantId) {
    try {
      const [rows] = await pool.query(
        `SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN active = TRUE THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN active = FALSE THEN 1 ELSE 0 END) as inactive
         FROM faqs 
         WHERE tenant_id = ?`,
        [tenantId]
      );

      return {
        total: rows[0].total || 0,
        active: rows[0].active || 0,
        inactive: rows[0].inactive || 0
      };
    } catch (error) {
      logger.error('Error getting FAQ statistics', { tenantId, error: error.message });
      throw error;
    }
  }
}

module.exports = FAQ;
