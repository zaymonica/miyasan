/**
 * WhatsAppGroup Model
 * Manages WhatsApp group data with tenant isolation
 * 
 * @module models/WhatsAppGroup
 */

const { pool } = require('../config/database');
const { logger } = require('../config/logger');

class WhatsAppGroup {
  static async create(tenantId, data) {
    try {
      const [result] = await pool.query(
        `INSERT INTO whatsapp_groups 
        (tenant_id, connection_id, group_jid, group_name, group_description, 
         group_picture_url, participant_count, is_admin, created_by, metadata) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tenantId,
          data.connection_id || null,
          data.group_jid,
          data.group_name || null,
          data.group_description || null,
          data.group_picture_url || null,
          data.participant_count || 0,
          data.is_admin || false,
          data.created_by || null,
          data.metadata ? JSON.stringify(data.metadata) : null
        ]
      );
      return await this.getById(tenantId, result.insertId);
    } catch (error) {
      logger.error('Error creating group', { tenantId, error: error.message });
      throw error;
    }
  }

  static async getById(tenantId, id) {
    try {
      const [rows] = await pool.query(
        `SELECT * FROM whatsapp_groups WHERE tenant_id = ? AND id = ? LIMIT 1`,
        [tenantId, id]
      );
      if (rows[0] && rows[0].metadata) rows[0].metadata = JSON.parse(rows[0].metadata);
      return rows[0] || null;
    } catch (error) {
      logger.error('Error getting group', { tenantId, id, error: error.message });
      throw error;
    }
  }

  static async getByJid(tenantId, groupJid) {
    try {
      const [rows] = await pool.query(
        `SELECT * FROM whatsapp_groups WHERE tenant_id = ? AND group_jid = ? LIMIT 1`,
        [tenantId, groupJid]
      );
      if (rows[0] && rows[0].metadata) rows[0].metadata = JSON.parse(rows[0].metadata);
      return rows[0] || null;
    } catch (error) {
      logger.error('Error getting group by JID', { tenantId, groupJid, error: error.message });
      throw error;
    }
  }

  static async getAll(tenantId, options = {}) {
    try {
      const limit = options.limit || 50;
      const offset = options.offset || 0;
      const [rows] = await pool.query(
        `SELECT * FROM whatsapp_groups WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [tenantId, limit, offset]
      );
      return rows.map(row => {
        if (row.metadata) row.metadata = JSON.parse(row.metadata);
        return row;
      });
    } catch (error) {
      logger.error('Error getting all groups', { tenantId, error: error.message });
      throw error;
    }
  }

  static async update(tenantId, groupJid, data) {
    try {
      const updates = [];
      const values = [];
      if (data.group_name !== undefined) {
        updates.push('group_name = ?');
        values.push(data.group_name);
      }
      if (data.group_description !== undefined) {
        updates.push('group_description = ?');
        values.push(data.group_description);
      }
      if (data.group_picture_url !== undefined) {
        updates.push('group_picture_url = ?');
        values.push(data.group_picture_url);
      }
      if (data.participant_count !== undefined) {
        updates.push('participant_count = ?');
        values.push(data.participant_count);
      }
      if (data.is_admin !== undefined) {
        updates.push('is_admin = ?');
        values.push(data.is_admin);
      }
      if (data.metadata !== undefined) {
        updates.push('metadata = ?');
        values.push(JSON.stringify(data.metadata));
      }
      if (updates.length === 0) return await this.getByJid(tenantId, groupJid);
      values.push(tenantId, groupJid);
      await pool.query(
        `UPDATE whatsapp_groups SET ${updates.join(', ')} WHERE tenant_id = ? AND group_jid = ?`,
        values
      );
      return await this.getByJid(tenantId, groupJid);
    } catch (error) {
      logger.error('Error updating group', { tenantId, groupJid, error: error.message });
      throw error;
    }
  }

  static async delete(tenantId, groupJid) {
    try {
      await pool.query(`DELETE FROM whatsapp_groups WHERE tenant_id = ? AND group_jid = ?`, [tenantId, groupJid]);
      return true;
    } catch (error) {
      logger.error('Error deleting group', { tenantId, groupJid, error: error.message });
      throw error;
    }
  }

  static async count(tenantId) {
    try {
      const [rows] = await pool.query(
        `SELECT COUNT(*) as count FROM whatsapp_groups WHERE tenant_id = ?`,
        [tenantId]
      );
      return rows[0].count;
    } catch (error) {
      logger.error('Error counting groups', { tenantId, error: error.message });
      throw error;
    }
  }
}

module.exports = WhatsAppGroup;
