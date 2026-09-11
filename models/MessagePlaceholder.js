/**
 * MessagePlaceholder Model
 * Manages message placeholders with tenant isolation
 * 
 * @module models/MessagePlaceholder
 */

const { pool } = require('../config/database');
const { logger } = require('../config/logger');

class MessagePlaceholder {
  /**
   * Get all placeholders for a tenant
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<Array>} List of placeholders
   */
  static async getByTenantId(tenantId) {
    try {
      const [rows] = await pool.query(
        'SELECT * FROM message_placeholders WHERE tenant_id = ? AND active = TRUE ORDER BY placeholder_key ASC',
        [tenantId]
      );
      return rows;
    } catch (error) {
      logger.error('Error getting placeholders', { tenantId, error: error.message });
      throw error;
    }
  }

  /**
   * Create or update placeholder
   * @param {number} tenantId - Tenant ID
   * @param {Object} data - Placeholder data
   * @returns {Promise<Object>} Created/updated placeholder
   */
  static async upsert(tenantId, data) {
    try {
      await pool.query(
        `INSERT INTO message_placeholders (tenant_id, placeholder_key, placeholder_value, description, active) 
         VALUES (?, ?, ?, ?, TRUE)
         ON DUPLICATE KEY UPDATE 
         placeholder_value = VALUES(placeholder_value),
         description = VALUES(description),
         active = VALUES(active)`,
        [tenantId, data.placeholder_key, data.placeholder_value, data.description || null]
      );

      const [rows] = await pool.query(
        'SELECT * FROM message_placeholders WHERE tenant_id = ? AND placeholder_key = ?',
        [tenantId, data.placeholder_key]
      );

      return rows[0];
    } catch (error) {
      logger.error('Error upserting placeholder', { tenantId, error: error.message });
      throw error;
    }
  }

  /**
   * Delete placeholder
   * @param {number} tenantId - Tenant ID
   * @param {string} placeholderKey - Placeholder key
   * @returns {Promise<boolean>} Success status
   */
  static async delete(tenantId, placeholderKey) {
    try {
      const [result] = await pool.query(
        'DELETE FROM message_placeholders WHERE tenant_id = ? AND placeholder_key = ?',
        [tenantId, placeholderKey]
      );
      return result.affectedRows > 0;
    } catch (error) {
      logger.error('Error deleting placeholder', { tenantId, error: error.message });
      throw error;
    }
  }
}

module.exports = MessagePlaceholder;
