/**
 * WhatsAppMessage Model
 * Manages WhatsApp messages with tenant isolation
 * 
 * @module models/WhatsAppMessage
 */

const { pool } = require('../config/database');
const { logger } = require('../config/logger');

class WhatsAppMessage {
  /**
   * Create new message
   * @param {number} tenantId - Tenant ID
   * @param {Object} data - Message data
   * @returns {Promise<Object>} Created message
   */
  static async create(tenantId, data) {
    try {
      const [result] = await pool.query(
        `INSERT INTO whatsapp_messages 
        (tenant_id, connection_id, phone_number, contact_name, message_type, content, 
         media_url, media_mimetype, media_size, caption, direction, status, 
         whatsapp_message_id, conversation_id, quoted_message_id, metadata) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tenantId,
          data.connection_id || null,
          data.phone_number,
          data.contact_name || null,
          data.message_type || 'text',
          data.content || null,
          data.media_url || null,
          data.media_mimetype || null,
          data.media_size || null,
          data.caption || null,
          data.direction,
          data.status || 'pending',
          data.whatsapp_message_id || null,
          data.conversation_id || null,
          data.quoted_message_id || null,
          data.metadata ? JSON.stringify(data.metadata) : null
        ]
      );

      return await this.getById(tenantId, result.insertId);
    } catch (error) {
      logger.error('Error creating WhatsApp message', { tenantId, error: error.message });
      throw error;
    }
  }

  /**
   * Get message by ID
   * @param {number} tenantId - Tenant ID
   * @param {number} id - Message ID
   * @returns {Promise<Object|null>} Message data or null
   */
  static async getById(tenantId, id) {
    try {
      const [rows] = await pool.query(
        `SELECT * FROM whatsapp_messages WHERE tenant_id = ? AND id = ? LIMIT 1`,
        [tenantId, id]
      );
      
      if (rows[0] && rows[0].metadata) {
        rows[0].metadata = JSON.parse(rows[0].metadata);
      }
      
      return rows[0] || null;
    } catch (error) {
      logger.error('Error getting message by ID', { tenantId, id, error: error.message });
      throw error;
    }
  }

  /**
   * Get messages by phone number
   * @param {number} tenantId - Tenant ID
   * @param {string} phoneNumber - Phone number
   * @param {Object} options - Query options (limit, offset, order)
   * @returns {Promise<Array>} Array of messages
   */
  static async getByPhoneNumber(tenantId, phoneNumber, options = {}) {
    try {
      const limit = options.limit || 50;
      const offset = options.offset || 0;
      const order = options.order || 'DESC';

      const [rows] = await pool.query(
        `SELECT * FROM whatsapp_messages 
        WHERE tenant_id = ? AND phone_number = ? 
        ORDER BY created_at ${order} 
        LIMIT ? OFFSET ?`,
        [tenantId, phoneNumber, limit, offset]
      );

      return rows.map(row => {
        if (row.metadata) {
          row.metadata = JSON.parse(row.metadata);
        }
        return row;
      });
    } catch (error) {
      logger.error('Error getting messages by phone', { tenantId, phoneNumber, error: error.message });
      throw error;
    }
  }

  /**
   * Get messages by conversation ID
   * @param {number} tenantId - Tenant ID
   * @param {number} conversationId - Conversation ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of messages
   */
  static async getByConversationId(tenantId, conversationId, options = {}) {
    try {
      const limit = options.limit || 50;
      const offset = options.offset || 0;
      const order = options.order || 'ASC';

      const [rows] = await pool.query(
        `SELECT * FROM whatsapp_messages 
        WHERE tenant_id = ? AND conversation_id = ? 
        ORDER BY created_at ${order} 
        LIMIT ? OFFSET ?`,
        [tenantId, conversationId, limit, offset]
      );

      return rows.map(row => {
        if (row.metadata) {
          row.metadata = JSON.parse(row.metadata);
        }
        return row;
      });
    } catch (error) {
      logger.error('Error getting messages by conversation', { tenantId, conversationId, error: error.message });
      throw error;
    }
  }

  /**
   * Update message status
   * @param {number} tenantId - Tenant ID
   * @param {number} id - Message ID
   * @param {string} status - New status
   * @returns {Promise<Object>} Updated message
   */
  static async updateStatus(tenantId, id, status) {
    try {
      await pool.query(
        `UPDATE whatsapp_messages SET status = ? WHERE tenant_id = ? AND id = ?`,
        [status, tenantId, id]
      );

      return await this.getById(tenantId, id);
    } catch (error) {
      logger.error('Error updating message status', { tenantId, id, status, error: error.message });
      throw error;
    }
  }

  /**
   * Update message by WhatsApp message ID
   * @param {number} tenantId - Tenant ID
   * @param {string} whatsappMessageId - WhatsApp message ID
   * @param {Object} data - Data to update
   * @returns {Promise<Object|null>} Updated message or null
   */
  static async updateByWhatsAppId(tenantId, whatsappMessageId, data) {
    try {
      const updates = [];
      const values = [];

      if (data.status !== undefined) {
        updates.push('status = ?');
        values.push(data.status);
      }
      if (data.error_message !== undefined) {
        updates.push('error_message = ?');
        values.push(data.error_message);
      }

      if (updates.length === 0) {
        return null;
      }

      values.push(tenantId, whatsappMessageId);

      await pool.query(
        `UPDATE whatsapp_messages SET ${updates.join(', ')} 
        WHERE tenant_id = ? AND whatsapp_message_id = ?`,
        values
      );

      const [rows] = await pool.query(
        `SELECT * FROM whatsapp_messages 
        WHERE tenant_id = ? AND whatsapp_message_id = ? LIMIT 1`,
        [tenantId, whatsappMessageId]
      );

      return rows[0] || null;
    } catch (error) {
      logger.error('Error updating message by WhatsApp ID', { tenantId, whatsappMessageId, error: error.message });
      throw error;
    }
  }

  /**
   * Get recent messages
   * @param {number} tenantId - Tenant ID
   * @param {number} limit - Number of messages to retrieve
   * @returns {Promise<Array>} Array of recent messages
   */
  static async getRecent(tenantId, limit = 20) {
    try {
      const [rows] = await pool.query(
        `SELECT * FROM whatsapp_messages 
        WHERE tenant_id = ? 
        ORDER BY created_at DESC 
        LIMIT ?`,
        [tenantId, limit]
      );

      return rows.map(row => {
        if (row.metadata) {
          row.metadata = JSON.parse(row.metadata);
        }
        return row;
      });
    } catch (error) {
      logger.error('Error getting recent messages', { tenantId, error: error.message });
      throw error;
    }
  }

  /**
   * Count messages by tenant
   * @param {number} tenantId - Tenant ID
   * @param {Object} filters - Optional filters
   * @returns {Promise<number>} Message count
   */
  static async count(tenantId, filters = {}) {
    try {
      let query = 'SELECT COUNT(*) as count FROM whatsapp_messages WHERE tenant_id = ?';
      const params = [tenantId];

      if (filters.direction) {
        query += ' AND direction = ?';
        params.push(filters.direction);
      }
      if (filters.status) {
        query += ' AND status = ?';
        params.push(filters.status);
      }
      if (filters.phone_number) {
        query += ' AND phone_number = ?';
        params.push(filters.phone_number);
      }
      if (filters.date_from) {
        query += ' AND created_at >= ?';
        params.push(filters.date_from);
      }
      if (filters.date_to) {
        query += ' AND created_at <= ?';
        params.push(filters.date_to);
      }

      const [rows] = await pool.query(query, params);
      return rows[0].count;
    } catch (error) {
      logger.error('Error counting messages', { tenantId, error: error.message });
      throw error;
    }
  }

  /**
   * Get message statistics
   * @param {number} tenantId - Tenant ID
   * @param {Object} filters - Optional filters
   * @returns {Promise<Object>} Message statistics
   */
  static async getStats(tenantId, filters = {}) {
    try {
      const [rows] = await pool.query(
        `SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN direction = 'incoming' THEN 1 ELSE 0 END) as incoming,
          SUM(CASE WHEN direction = 'outgoing' THEN 1 ELSE 0 END) as outgoing,
          SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
          SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
          SUM(CASE WHEN status = 'read' THEN 1 ELSE 0 END) as read,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN message_type != 'text' THEN 1 ELSE 0 END) as media
        FROM whatsapp_messages 
        WHERE tenant_id = ?
        ${filters.date_from ? 'AND created_at >= ?' : ''}
        ${filters.date_to ? 'AND created_at <= ?' : ''}`,
        [
          tenantId,
          ...(filters.date_from ? [filters.date_from] : []),
          ...(filters.date_to ? [filters.date_to] : [])
        ]
      );

      return rows[0];
    } catch (error) {
      logger.error('Error getting message stats', { tenantId, error: error.message });
      throw error;
    }
  }

  /**
   * Delete old messages
   * @param {number} tenantId - Tenant ID
   * @param {number} daysToKeep - Number of days to keep
   * @returns {Promise<number>} Number of deleted messages
   */
  static async deleteOld(tenantId, daysToKeep = 90) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const [result] = await pool.query(
        `DELETE FROM whatsapp_messages 
        WHERE tenant_id = ? AND created_at < ?`,
        [tenantId, cutoffDate]
      );

      logger.info('Old messages deleted', { tenantId, deleted: result.affectedRows, daysToKeep });
      return result.affectedRows;
    } catch (error) {
      logger.error('Error deleting old messages', { tenantId, error: error.message });
      throw error;
    }
  }

  /**
   * Search messages
   * @param {number} tenantId - Tenant ID
   * @param {string} searchTerm - Search term
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Array of matching messages
   */
  static async search(tenantId, searchTerm, options = {}) {
    try {
      const limit = options.limit || 50;
      const offset = options.offset || 0;

      const [rows] = await pool.query(
        `SELECT * FROM whatsapp_messages 
        WHERE tenant_id = ? AND (
          content LIKE ? OR 
          phone_number LIKE ? OR 
          contact_name LIKE ?
        )
        ORDER BY created_at DESC 
        LIMIT ? OFFSET ?`,
        [tenantId, `%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`, limit, offset]
      );

      return rows.map(row => {
        if (row.metadata) {
          row.metadata = JSON.parse(row.metadata);
        }
        return row;
      });
    } catch (error) {
      logger.error('Error searching messages', { tenantId, searchTerm, error: error.message });
      throw error;
    }
  }
}

module.exports = WhatsAppMessage;
