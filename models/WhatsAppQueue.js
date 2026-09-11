/**
 * WhatsAppQueue Model
 * Manages WhatsApp message queue with tenant isolation
 * 
 * @module models/WhatsAppQueue
 */

const { pool } = require('../config/database');
const { logger } = require('../config/logger');

class WhatsAppQueue {
  static async create(tenantId, data) {
    try {
      const [result] = await pool.query(
        `INSERT INTO whatsapp_message_queue 
        (tenant_id, connection_id, phone_number, message_type, content, media_path, 
         caption, priority, scheduled_at, metadata) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tenantId,
          data.connection_id || null,
          data.phone_number,
          data.message_type || 'text',
          data.content || null,
          data.media_path || null,
          data.caption || null,
          data.priority || 0,
          data.scheduled_at || null,
          data.metadata ? JSON.stringify(data.metadata) : null
        ]
      );
      return await this.getById(tenantId, result.insertId);
    } catch (error) {
      logger.error('Error creating queue item', { tenantId, error: error.message });
      throw error;
    }
  }

  static async getById(tenantId, id) {
    try {
      const [rows] = await pool.query(
        `SELECT * FROM whatsapp_message_queue WHERE tenant_id = ? AND id = ? LIMIT 1`,
        [tenantId, id]
      );
      if (rows[0] && rows[0].metadata) rows[0].metadata = JSON.parse(rows[0].metadata);
      return rows[0] || null;
    } catch (error) {
      logger.error('Error getting queue item', { tenantId, id, error: error.message });
      throw error;
    }
  }

  static async getPending(tenantId, limit = 10) {
    try {
      const [rows] = await pool.query(
        `SELECT * FROM whatsapp_message_queue 
        WHERE tenant_id = ? AND status = 'pending' 
        AND (scheduled_at IS NULL OR scheduled_at <= NOW())
        ORDER BY priority DESC, created_at ASC 
        LIMIT ?`,
        [tenantId, limit]
      );
      return rows.map(row => {
        if (row.metadata) row.metadata = JSON.parse(row.metadata);
        return row;
      });
    } catch (error) {
      logger.error('Error getting pending queue items', { tenantId, error: error.message });
      throw error;
    }
  }

  static async updateStatus(tenantId, id, status, errorMessage = null) {
    try {
      const updates = ['status = ?'];
      const values = [status];
      
      if (status === 'processing' || status === 'sent' || status === 'failed') {
        updates.push('processed_at = NOW()');
      }
      if (status === 'failed') {
        updates.push('attempts = attempts + 1');
        if (errorMessage) {
          updates.push('error_message = ?');
          values.push(errorMessage);
        }
      }
      
      values.push(tenantId, id);
      
      await pool.query(
        `UPDATE whatsapp_message_queue SET ${updates.join(', ')} WHERE tenant_id = ? AND id = ?`,
        values
      );
      return await this.getById(tenantId, id);
    } catch (error) {
      logger.error('Error updating queue status', { tenantId, id, status, error: error.message });
      throw error;
    }
  }

  static async delete(tenantId, id) {
    try {
      await pool.query(`DELETE FROM whatsapp_message_queue WHERE tenant_id = ? AND id = ?`, [tenantId, id]);
      return true;
    } catch (error) {
      logger.error('Error deleting queue item', { tenantId, id, error: error.message });
      throw error;
    }
  }

  static async count(tenantId, status = null) {
    try {
      let query = 'SELECT COUNT(*) as count FROM whatsapp_message_queue WHERE tenant_id = ?';
      const params = [tenantId];
      if (status) {
        query += ' AND status = ?';
        params.push(status);
      }
      const [rows] = await pool.query(query, params);
      return rows[0].count;
    } catch (error) {
      logger.error('Error counting queue items', { tenantId, error: error.message });
      throw error;
    }
  }

  static async cleanOld(tenantId, daysToKeep = 7) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      const [result] = await pool.query(
        `DELETE FROM whatsapp_message_queue 
        WHERE tenant_id = ? AND status IN ('sent', 'failed') AND processed_at < ?`,
        [tenantId, cutoffDate]
      );
      return result.affectedRows;
    } catch (error) {
      logger.error('Error cleaning old queue items', { tenantId, error: error.message });
      throw error;
    }
  }
}

module.exports = WhatsAppQueue;
