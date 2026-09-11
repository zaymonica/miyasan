/**
 * WhatsAppConnection Model
 * Manages WhatsApp connection data with tenant isolation
 * 
 * @module models/WhatsAppConnection
 */

const { pool } = require('../config/database');
const { logger } = require('../config/logger');

class WhatsAppConnection {
  /**
   * Get connection by tenant ID
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<Object|null>} Connection data or null
   */
  static async getByTenantId(tenantId) {
    try {
      if (tenantId === undefined || tenantId === null) {
        logger.error('getByTenantId called with invalid tenantId', { tenantId });
        return null;
      }
      
      const query = 'SELECT * FROM whatsapp_connections WHERE tenant_id = ?';
      logger.info('Executing SELECT query', { query, params: [tenantId] });
      const [rows] = await pool.query(query, [tenantId]);
      return rows.length > 0 ? rows[0] : null;
    } catch (error) {
      logger.error('Error getting WhatsApp connection', { tenantId, error: error.message, stack: error.stack });
      throw error;
    }
  }

  /**
   * Create or update connection
   * @param {number} tenantId - Tenant ID
   * @param {Object} data - Connection data
   * @returns {Promise<Object>} Created/updated connection
   */
  static async upsert(tenantId, data) {
    try {
      const existing = await this.getByTenantId(tenantId);
      
      if (existing) {
        return await this.update(tenantId, data);
      } else {
        return await this.create(tenantId, data);
      }
    } catch (error) {
      logger.error('Error upserting WhatsApp connection', { tenantId, error: error.message });
      throw error;
    }
  }

  /**
   * Create new connection
   * @param {number} tenantId - Tenant ID
   * @param {Object} data - Connection data
   * @returns {Promise<Object>} Created connection
   */
  static async create(tenantId, data) {
    try {
      // Validate tenantId (allow 0 for superadmin)
      if (tenantId === undefined || tenantId === null) {
        throw new Error('tenantId is required');
      }

      logger.info('Creating WhatsApp connection', { tenantId, data });

      const [result] = await pool.query(
        `INSERT INTO whatsapp_connections 
        (tenant_id, phone_number, status, qr_code, session_id, connection_attempts, error_message) 
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          tenantId,
          data.phone_number || null,
          data.status || 'disconnected',
          data.qr_code || null,
          data.session_id || null,
          data.connection_attempts || 0,
          data.error_message || null
        ]
      );

      logger.info('WhatsApp connection created', { tenantId, insertId: result.insertId });

      return await this.getByTenantId(tenantId);
    } catch (error) {
      logger.error('Error creating WhatsApp connection', { 
        tenantId, 
        error: error.message,
        stack: error.stack,
        data 
      });
      throw error;
    }
  }

  /**
   * Update connection
   * @param {number} tenantId - Tenant ID
   * @param {Object} data - Connection data to update
   * @returns {Promise<Object>} Updated connection
   */
  static async update(tenantId, data) {
    try {
      // Validate inputs (allow 0 for superadmin)
      if (tenantId === undefined || tenantId === null) {
        throw new Error('tenantId is required');
      }

      if (!data || typeof data !== 'object') {
        throw new Error('data must be an object');
      }

      logger.info('WhatsAppConnection.update called', { tenantId, data });
      
      // Check if connection exists
      const existing = await this.getByTenantId(tenantId);
      
      if (!existing) {
        logger.info('Connection does not exist, creating new one');
        // Create new connection if it doesn't exist
        return await this.create(tenantId, data);
      }

      const updates = [];
      const values = [];

      if (data.phone_number !== undefined) {
        updates.push('phone_number = ?');
        values.push(data.phone_number);
      }
      if (data.status !== undefined) {
        updates.push('status = ?');
        values.push(data.status);
      }
      if (data.qr_code !== undefined) {
        updates.push('qr_code = ?');
        values.push(data.qr_code);
      }
      if (data.session_id !== undefined) {
        updates.push('session_id = ?');
        values.push(data.session_id);
      }
      if (data.connection_attempts !== undefined) {
        updates.push('connection_attempts = ?');
        values.push(data.connection_attempts);
      }
      if (data.error_message !== undefined) {
        updates.push('error_message = ?');
        values.push(data.error_message);
      }
      if (data.last_connected_at !== undefined) {
        updates.push('last_connected_at = ?');
        values.push(data.last_connected_at);
      }

      if (updates.length === 0) {
        logger.info('No fields to update, returning existing connection');
        return await this.getByTenantId(tenantId);
      }

      values.push(tenantId);

      const query = `UPDATE whatsapp_connections SET ${updates.join(', ')} WHERE tenant_id = ?`;
      logger.info('Executing UPDATE query', { query, values, updates, valuesCount: values.length });

      await pool.query(query, values);

      logger.info('WhatsApp connection updated successfully', { tenantId });

      return await this.getByTenantId(tenantId);
    } catch (error) {
      logger.error('Error updating WhatsApp connection', { 
        tenantId, 
        error: error.message,
        stack: error.stack,
        data 
      });
      throw error;
    }
  }

  /**
   * Update connection status
   * @param {number} tenantId - Tenant ID
   * @param {string} status - New status
   * @param {Object} additionalData - Additional data to update
   * @returns {Promise<Object>} Updated connection
   */
  static async updateStatus(tenantId, status, additionalData = {}) {
    try {
      const data = { status, ...additionalData };
      
      if (status === 'connected') {
        data.last_connected_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
        data.connection_attempts = 0;
        data.error_message = null;
      }

      return await this.update(tenantId, data);
    } catch (error) {
      logger.error('Error updating connection status', { tenantId, status, error: error.message });
      throw error;
    }
  }

  /**
   * Increment connection attempts
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<Object>} Updated connection
   */
  static async incrementAttempts(tenantId) {
    try {
      await pool.query(
        `UPDATE whatsapp_connections 
        SET connection_attempts = connection_attempts + 1 
        WHERE tenant_id = ?`,
        [tenantId]
      );

      return await this.getByTenantId(tenantId);
    } catch (error) {
      logger.error('Error incrementing connection attempts', { tenantId, error: error.message });
      throw error;
    }
  }

  /**
   * Delete connection
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<boolean>} Success status
   */
  static async delete(tenantId) {
    try {
      await pool.query(
        `DELETE FROM whatsapp_connections WHERE tenant_id = ?`,
        [tenantId]
      );
      return true;
    } catch (error) {
      logger.error('Error deleting WhatsApp connection', { tenantId, error: error.message });
      throw error;
    }
  }

  /**
   * Get connection by ID
   * @param {number} id - Connection ID
   * @returns {Promise<Object|null>} Connection data or null
   */
  static async getById(id) {
    try {
      const [rows] = await pool.query(
        `SELECT * FROM whatsapp_connections WHERE id = ? LIMIT 1`,
        [id]
      );
      return rows[0] || null;
    } catch (error) {
      logger.error('Error getting connection by ID', { id, error: error.message });
      throw error;
    }
  }

  /**
   * Get all active connections
   * @returns {Promise<Array>} Array of active connections
   */
  static async getAllActive() {
    try {
      const [rows] = await pool.query(
        `SELECT * FROM whatsapp_connections WHERE status = 'connected' ORDER BY last_connected_at DESC`
      );
      return rows;
    } catch (error) {
      logger.error('Error getting active connections', { error: error.message });
      throw error;
    }
  }

  /**
   * Check if tenant has active connection
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<boolean>} True if connected
   */
  static async isConnected(tenantId) {
    try {
      const connection = await this.getByTenantId(tenantId);
      if (!connection) {
        return false;
      }
      return connection.status === 'connected';
    } catch (error) {
      logger.error('Error checking connection status', { tenantId, error: error.message });
      return false;
    }
  }

  /**
   * Get connection statistics
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<Object>} Connection statistics
   */
  static async getStats(tenantId) {
    try {
      const connection = await this.getByTenantId(tenantId);
      
      if (!connection) {
        return {
          exists: false,
          status: 'disconnected',
          uptime: 0,
          attempts: 0
        };
      }

      let uptime = 0;
      if (connection.status === 'connected' && connection.last_connected_at) {
        uptime = Date.now() - new Date(connection.last_connected_at).getTime();
      }

      return {
        exists: true,
        status: connection.status,
        phone_number: connection.phone_number,
        uptime: uptime,
        attempts: connection.connection_attempts,
        last_connected: connection.last_connected_at,
        created_at: connection.created_at
      };
    } catch (error) {
      logger.error('Error getting connection stats', { tenantId, error: error.message });
      throw error;
    }
  }
}

module.exports = WhatsAppConnection;
