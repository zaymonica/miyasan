/**
 * WelcomeMessage Model
 * Manages welcome messages with tenant isolation
 * Matches 2.0 working implementation
 * 
 * @module models/WelcomeMessage
 */

const { pool } = require('../config/database');
const { logger } = require('../config/logger');

class WelcomeMessage {
  /**
   * Get all welcome messages for a tenant
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<Array>} List of welcome messages
   */
  static async getByTenantId(tenantId) {
    try {
      const [rows] = await pool.query(
        'SELECT * FROM welcome_messages WHERE tenant_id = ? AND active = TRUE ORDER BY order_position ASC',
        [tenantId]
      );
      return rows;
    } catch (error) {
      logger.error('Error getting welcome messages', { tenantId, error: error.message });
      throw error;
    }
  }

  /**
   * Create a welcome message
   * @param {number} tenantId - Tenant ID
   * @param {Object} data - Message data
   * @returns {Promise<Object>} Created message
   */
  static async create(tenantId, data) {
    try {
      const [result] = await pool.query(
        'INSERT INTO welcome_messages (tenant_id, message_text, order_position, active) VALUES (?, ?, ?, TRUE)',
        [tenantId, data.message_text, data.order_position]
      );
      
      return {
        id: result.insertId,
        tenant_id: tenantId,
        message_text: data.message_text,
        order_position: data.order_position,
        active: true
      };
    } catch (error) {
      logger.error('Error creating welcome message', { tenantId, error: error.message });
      throw error;
    }
  }

  /**
   * Delete all welcome messages for a tenant
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<boolean>} Success status
   */
  static async deleteByTenantId(tenantId) {
    try {
      await pool.query(
        'UPDATE welcome_messages SET active = FALSE WHERE tenant_id = ?',
        [tenantId]
      );
      return true;
    } catch (error) {
      logger.error('Error deleting welcome messages', { tenantId, error: error.message });
      throw error;
    }
  }

  /**
   * Save welcome messages (replace all) - matches 2.0 implementation
   * @param {number} tenantId - Tenant ID
   * @param {Array} messages - Array of message objects with text property
   * @returns {Promise<boolean>} Success status
   */
  static async saveAll(tenantId, messages) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Deactivate all existing messages
      await connection.query(
        'UPDATE welcome_messages SET active = FALSE WHERE tenant_id = ?',
        [tenantId]
      );

      // Insert new messages
      for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        await connection.query(
          'INSERT INTO welcome_messages (tenant_id, message_text, order_position, active) VALUES (?, ?, ?, TRUE)',
          [tenantId, message.text, i + 1]
        );
      }

      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      logger.error('Error saving welcome messages', { tenantId, error: error.message });
      throw error;
    } finally {
      connection.release();
    }
  }
}

module.exports = WelcomeMessage;
