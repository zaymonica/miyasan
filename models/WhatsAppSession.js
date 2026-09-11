/**
 * WhatsAppSession Model
 * Manages WhatsApp session data with tenant isolation
 * 
 * @module models/WhatsAppSession
 */

const { pool } = require('../config/database');
const { logger } = require('../config/logger');

class WhatsAppSession {
  static async create(tenantId, data) {
    try {
      const [result] = await pool.query(
        `INSERT INTO whatsapp_sessions 
        (tenant_id, session_id, session_data, phone_number, device_info, expires_at) 
        VALUES (?, ?, ?, ?, ?, ?)`,
        [
          tenantId,
          data.session_id,
          data.session_data || null,
          data.phone_number || null,
          data.device_info ? JSON.stringify(data.device_info) : null,
          data.expires_at || null
        ]
      );
      return await this.getById(tenantId, result.insertId);
    } catch (error) {
      logger.error('Error creating session', { tenantId, error: error.message });
      throw error;
    }
  }

  static async getById(tenantId, id) {
    try {
      const [rows] = await pool.query(
        `SELECT * FROM whatsapp_sessions WHERE tenant_id = ? AND id = ? LIMIT 1`,
        [tenantId, id]
      );
      if (rows[0] && rows[0].device_info) rows[0].device_info = JSON.parse(rows[0].device_info);
      return rows[0] || null;
    } catch (error) {
      logger.error('Error getting session', { tenantId, id, error: error.message });
      throw error;
    }
  }

  static async getBySessionId(tenantId, sessionId) {
    try {
      const [rows] = await pool.query(
        `SELECT * FROM whatsapp_sessions WHERE tenant_id = ? AND session_id = ? LIMIT 1`,
        [tenantId, sessionId]
      );
      if (rows[0] && rows[0].device_info) rows[0].device_info = JSON.parse(rows[0].device_info);
      return rows[0] || null;
    } catch (error) {
      logger.error('Error getting session by ID', { tenantId, sessionId, error: error.message });
      throw error;
    }
  }

  static async update(tenantId, sessionId, data) {
    try {
      const updates = [];
      const values = [];
      if (data.session_data !== undefined) {
        updates.push('session_data = ?');
        values.push(data.session_data);
      }
      if (data.phone_number !== undefined) {
        updates.push('phone_number = ?');
        values.push(data.phone_number);
      }
      if (data.device_info !== undefined) {
        updates.push('device_info = ?');
        values.push(JSON.stringify(data.device_info));
      }
      if (data.is_active !== undefined) {
        updates.push('is_active = ?');
        values.push(data.is_active);
      }
      if (data.last_activity_at !== undefined) {
        updates.push('last_activity_at = ?');
        values.push(data.last_activity_at);
      }
      if (updates.length === 0) return await this.getBySessionId(tenantId, sessionId);
      values.push(tenantId, sessionId);
      await pool.query(
        `UPDATE whatsapp_sessions SET ${updates.join(', ')} WHERE tenant_id = ? AND session_id = ?`,
        values
      );
      return await this.getBySessionId(tenantId, sessionId);
    } catch (error) {
      logger.error('Error updating session', { tenantId, sessionId, error: error.message });
      throw error;
    }
  }

  static async delete(tenantId, sessionId) {
    try {
      await pool.query(`DELETE FROM whatsapp_sessions WHERE tenant_id = ? AND session_id = ?`, [tenantId, sessionId]);
      return true;
    } catch (error) {
      logger.error('Error deleting session', { tenantId, sessionId, error: error.message });
      throw error;
    }
  }

  static async cleanExpired() {
    try {
      const [result] = await pool.query(
        `DELETE FROM whatsapp_sessions WHERE expires_at IS NOT NULL AND expires_at < NOW()`
      );
      logger.info('Expired sessions cleaned', { deleted: result.affectedRows });
      return result.affectedRows;
    } catch (error) {
      logger.error('Error cleaning expired sessions', { error: error.message });
      throw error;
    }
  }
}

module.exports = WhatsAppSession;
