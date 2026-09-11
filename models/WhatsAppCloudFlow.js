const { pool } = require('../config/database');
const { logger } = require('../config/logger');

class WhatsAppCloudFlow {
  static async listByTenant(tenantId, accountId = null) {
    try {
      let query = 'SELECT * FROM whatsapp_cloud_flows WHERE tenant_id = ?';
      const params = [tenantId];
      if (accountId) {
        query += ' AND (account_id = ? OR account_id IS NULL)';
        params.push(accountId);
      }
      query += ' ORDER BY updated_at DESC';
      const [rows] = await pool.query(query, params);
      return rows.map(row => ({
        id: row.flow_id,
        name: row.name,
        description: row.description || '',
        active: !!row.active,
        trigger: row.trigger_type || 'keyword',
        triggerValue: row.trigger_value || '',
        accountId: row.account_id,
        nodes: row.nodes ? JSON.parse(row.nodes) : [],
        connections: row.connections ? JSON.parse(row.connections) : [],
        createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now()
      }));
    } catch (error) {
      logger.error('Error listing WhatsApp Cloud flows', { tenantId, accountId, error: error.message });
      throw error;
    }
  }

  static async upsert(tenantId, flow) {
    try {
      const payload = [
        flow.id,
        tenantId,
        flow.accountId || null,
        flow.name,
        flow.description || '',
        flow.active ? 1 : 0,
        flow.trigger || 'keyword',
        flow.triggerValue || '',
        JSON.stringify(flow.nodes || []),
        JSON.stringify(flow.connections || [])
      ];

      await pool.query(
        `INSERT INTO whatsapp_cloud_flows 
         (flow_id, tenant_id, account_id, name, description, active, trigger_type, trigger_value, nodes, connections)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           account_id = VALUES(account_id),
           name = VALUES(name),
           description = VALUES(description),
           active = VALUES(active),
           trigger_type = VALUES(trigger_type),
           trigger_value = VALUES(trigger_value),
           nodes = VALUES(nodes),
           connections = VALUES(connections)`,
        payload
      );

      return flow;
    } catch (error) {
      logger.error('Error saving WhatsApp Cloud flow', { tenantId, flowId: flow?.id, error: error.message });
      throw error;
    }
  }

  static async deleteByFlowId(tenantId, flowId) {
    try {
      const [result] = await pool.query(
        'DELETE FROM whatsapp_cloud_flows WHERE tenant_id = ? AND flow_id = ?',
        [tenantId, flowId]
      );
      return result.affectedRows > 0;
    } catch (error) {
      logger.error('Error deleting WhatsApp Cloud flow', { tenantId, flowId, error: error.message });
      throw error;
    }
  }
}

module.exports = WhatsAppCloudFlow;
