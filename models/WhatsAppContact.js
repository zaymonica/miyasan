/**
 * WhatsAppContact Model
 * Manages WhatsApp contacts with tenant isolation
 * 
 * @module models/WhatsAppContact
 */

const { pool } = require('../config/database');
const { logger } = require('../config/logger');

class WhatsAppContact {
  /**
   * Create or update contact
   * @param {number} tenantId - Tenant ID
   * @param {Object} data - Contact data
   * @returns {Promise<Object>} Created/updated contact
   */
  static async upsert(tenantId, data) {
    try {
      const existing = await this.getByPhoneNumber(tenantId, data.phone_number);
      
      if (existing) {
        return await this.update(tenantId, data.phone_number, data);
      } else {
        return await this.create(tenantId, data);
      }
    } catch (error) {
      logger.error('Error upserting contact', { tenantId, error: error.message });
      throw error;
    }
  }

  /**
   * Create new contact
   * @param {number} tenantId - Tenant ID
   * @param {Object} data - Contact data
   * @returns {Promise<Object>} Created contact
   */
  static async create(tenantId, data) {
    try {
      const [result] = await pool.query(
        `INSERT INTO whatsapp_contacts 
        (tenant_id, phone_number, name, profile_picture_url, status_message, 
         is_business, is_blocked, last_message_at, message_count, metadata) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tenantId,
          data.phone_number,
          data.name || null,
          data.profile_picture_url || null,
          data.status_message || null,
          data.is_business || false,
          data.is_blocked || false,
          data.last_message_at || null,
          data.message_count || 0,
          data.metadata ? JSON.stringify(data.metadata) : null
        ]
      );

      return await this.getById(tenantId, result.insertId);
    } catch (error) {
      logger.error('Error creating contact', { tenantId, error: error.message });
      throw error;
    }
  }

  /**
   * Get contact by ID
   * @param {number} tenantId - Tenant ID
   * @param {number} id - Contact ID
   * @returns {Promise<Object|null>} Contact data or null
   */
  static async getById(tenantId, id) {
    try {
      const [rows] = await pool.query(
        `SELECT * FROM whatsapp_contacts WHERE tenant_id = ? AND id = ? LIMIT 1`,
        [tenantId, id]
      );
      
      if (rows[0] && rows[0].metadata) {
        rows[0].metadata = JSON.parse(rows[0].metadata);
      }
      
      return rows[0] || null;
    } catch (error) {
      logger.error('Error getting contact by ID', { tenantId, id, error: error.message });
      throw error;
    }
  }

  /**
   * Get contact by phone number
   * @param {number} tenantId - Tenant ID
   * @param {string} phoneNumber - Phone number
   * @returns {Promise<Object|null>} Contact data or null
   */
  static async getByPhoneNumber(tenantId, phoneNumber) {
    try {
      const [rows] = await pool.query(
        `SELECT * FROM whatsapp_contacts WHERE tenant_id = ? AND phone_number = ? LIMIT 1`,
        [tenantId, phoneNumber]
      );
      
      if (rows[0] && rows[0].metadata) {
        rows[0].metadata = JSON.parse(rows[0].metadata);
      }
      
      return rows[0] || null;
    } catch (error) {
      logger.error('Error getting contact by phone', { tenantId, phoneNumber, error: error.message });
      throw error;
    }
  }

  /**
   * Get all contacts for tenant
   * @param {number} tenantId - Tenant ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of contacts
   */
  static async getAll(tenantId, options = {}) {
    try {
      const limit = options.limit || 100;
      const offset = options.offset || 0;
      const orderBy = options.orderBy || 'last_message_at';
      const order = options.order || 'DESC';

      const [rows] = await pool.query(
        `SELECT * FROM whatsapp_contacts 
        WHERE tenant_id = ? 
        ORDER BY ${orderBy} ${order} 
        LIMIT ? OFFSET ?`,
        [tenantId, limit, offset]
      );

      return rows.map(row => {
        if (row.metadata) {
          row.metadata = JSON.parse(row.metadata);
        }
        return row;
      });
    } catch (error) {
      logger.error('Error getting all contacts', { tenantId, error: error.message });
      throw error;
    }
  }

  /**
   * Update contact
   * @param {number} tenantId - Tenant ID
   * @param {string} phoneNumber - Phone number
   * @param {Object} data - Data to update
   * @returns {Promise<Object>} Updated contact
   */
  static async update(tenantId, phoneNumber, data) {
    try {
      const updates = [];
      const values = [];

      if (data.name !== undefined) {
        updates.push('name = ?');
        values.push(data.name);
      }
      if (data.profile_picture_url !== undefined) {
        updates.push('profile_picture_url = ?');
        values.push(data.profile_picture_url);
      }
      if (data.status_message !== undefined) {
        updates.push('status_message = ?');
        values.push(data.status_message);
      }
      if (data.is_business !== undefined) {
        updates.push('is_business = ?');
        values.push(data.is_business);
      }
      if (data.is_blocked !== undefined) {
        updates.push('is_blocked = ?');
        values.push(data.is_blocked);
      }
      if (data.last_message_at !== undefined) {
        updates.push('last_message_at = ?');
        values.push(data.last_message_at);
      }
      if (data.message_count !== undefined) {
        updates.push('message_count = ?');
        values.push(data.message_count);
      }
      if (data.metadata !== undefined) {
        updates.push('metadata = ?');
        values.push(JSON.stringify(data.metadata));
      }

      if (updates.length === 0) {
        return await this.getByPhoneNumber(tenantId, phoneNumber);
      }

      values.push(tenantId, phoneNumber);

      await pool.query(
        `UPDATE whatsapp_contacts SET ${updates.join(', ')} 
        WHERE tenant_id = ? AND phone_number = ?`,
        values
      );

      return await this.getByPhoneNumber(tenantId, phoneNumber);
    } catch (error) {
      logger.error('Error updating contact', { tenantId, phoneNumber, error: error.message });
      throw error;
    }
  }

  /**
   * Increment message count
   * @param {number} tenantId - Tenant ID
   * @param {string} phoneNumber - Phone number
   * @returns {Promise<Object>} Updated contact
   */
  static async incrementMessageCount(tenantId, phoneNumber) {
    try {
      await pool.query(
        `UPDATE whatsapp_contacts 
        SET message_count = message_count + 1, last_message_at = NOW() 
        WHERE tenant_id = ? AND phone_number = ?`,
        [tenantId, phoneNumber]
      );

      return await this.getByPhoneNumber(tenantId, phoneNumber);
    } catch (error) {
      logger.error('Error incrementing message count', { tenantId, phoneNumber, error: error.message });
      throw error;
    }
  }

  /**
   * Block/unblock contact
   * @param {number} tenantId - Tenant ID
   * @param {string} phoneNumber - Phone number
   * @param {boolean} blocked - Block status
   * @returns {Promise<Object>} Updated contact
   */
  static async setBlocked(tenantId, phoneNumber, blocked) {
    try {
      await pool.query(
        `UPDATE whatsapp_contacts SET is_blocked = ? WHERE tenant_id = ? AND phone_number = ?`,
        [blocked, tenantId, phoneNumber]
      );

      return await this.getByPhoneNumber(tenantId, phoneNumber);
    } catch (error) {
      logger.error('Error setting blocked status', { tenantId, phoneNumber, blocked, error: error.message });
      throw error;
    }
  }

  /**
   * Search contacts
   * @param {number} tenantId - Tenant ID
   * @param {string} searchTerm - Search term
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Array of matching contacts
   */
  static async search(tenantId, searchTerm, options = {}) {
    try {
      const limit = options.limit || 50;
      const offset = options.offset || 0;

      const [rows] = await pool.query(
        `SELECT * FROM whatsapp_contacts 
        WHERE tenant_id = ? AND (
          name LIKE ? OR 
          phone_number LIKE ?
        )
        ORDER BY last_message_at DESC 
        LIMIT ? OFFSET ?`,
        [tenantId, `%${searchTerm}%`, `%${searchTerm}%`, limit, offset]
      );

      return rows.map(row => {
        if (row.metadata) {
          row.metadata = JSON.parse(row.metadata);
        }
        return row;
      });
    } catch (error) {
      logger.error('Error searching contacts', { tenantId, searchTerm, error: error.message });
      throw error;
    }
  }

  /**
   * Count contacts
   * @param {number} tenantId - Tenant ID
   * @param {Object} filters - Optional filters
   * @returns {Promise<number>} Contact count
   */
  static async count(tenantId, filters = {}) {
    try {
      let query = 'SELECT COUNT(*) as count FROM whatsapp_contacts WHERE tenant_id = ?';
      const params = [tenantId];

      if (filters.is_blocked !== undefined) {
        query += ' AND is_blocked = ?';
        params.push(filters.is_blocked);
      }
      if (filters.is_business !== undefined) {
        query += ' AND is_business = ?';
        params.push(filters.is_business);
      }

      const [rows] = await pool.query(query, params);
      return rows[0].count;
    } catch (error) {
      logger.error('Error counting contacts', { tenantId, error: error.message });
      throw error;
    }
  }

  /**
   * Get contact statistics
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<Object>} Contact statistics
   */
  static async getStats(tenantId) {
    try {
      const [rows] = await pool.query(
        `SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN is_business = 1 THEN 1 ELSE 0 END) as business,
          SUM(CASE WHEN is_blocked = 1 THEN 1 ELSE 0 END) as blocked,
          SUM(message_count) as total_messages,
          AVG(message_count) as avg_messages_per_contact
        FROM whatsapp_contacts 
        WHERE tenant_id = ?`,
        [tenantId]
      );

      return rows[0];
    } catch (error) {
      logger.error('Error getting contact stats', { tenantId, error: error.message });
      throw error;
    }
  }

  /**
   * Delete contact
   * @param {number} tenantId - Tenant ID
   * @param {string} phoneNumber - Phone number
   * @returns {Promise<boolean>} Success status
   */
  static async delete(tenantId, phoneNumber) {
    try {
      await pool.query(
        `DELETE FROM whatsapp_contacts WHERE tenant_id = ? AND phone_number = ?`,
        [tenantId, phoneNumber]
      );
      return true;
    } catch (error) {
      logger.error('Error deleting contact', { tenantId, phoneNumber, error: error.message });
      throw error;
    }
  }

  /**
   * Get recent contacts
   * @param {number} tenantId - Tenant ID
   * @param {number} limit - Number of contacts to retrieve
   * @returns {Promise<Array>} Array of recent contacts
   */
  static async getRecent(tenantId, limit = 20) {
    try {
      const [rows] = await pool.query(
        `SELECT * FROM whatsapp_contacts 
        WHERE tenant_id = ? 
        ORDER BY last_message_at DESC 
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
      logger.error('Error getting recent contacts', { tenantId, error: error.message });
      throw error;
    }
  }
}

module.exports = WhatsAppContact;
