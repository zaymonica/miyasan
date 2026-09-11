const crypto = require('crypto');
const { pool } = require('../config/database');

class ApiIntegrationController {
  static async getApiKeys(req, res) {
    try {
      const tenantId = req.tenantId || req.user?.tenantId;
      const [rows] = await pool.execute(
        `SELECT id, key_name, key_prefix, is_active, created_at, last_used_at, revoked_at
         FROM tenant_api_keys
         WHERE tenant_id = ?
         ORDER BY created_at DESC`,
        [tenantId]
      );

      return res.json({
        success: true,
        data: rows.map(row => ({
          ...row,
          is_active: Boolean(row.is_active)
        }))
      });
    } catch (error) {
      console.error('Error loading API keys:', error);
      return res.status(500).json({ success: false, message: 'Error loading API keys' });
    }
  }

  static async createApiKey(req, res) {
    try {
      const tenantId = req.tenantId || req.user?.tenantId;
      const { name } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json({ success: false, message: 'Key name is required' });
      }

      const rawKey = `tk_${crypto.randomBytes(24).toString('hex')}`;
      const keyPrefix = rawKey.slice(0, 10);
      const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

      const [result] = await pool.execute(
        `INSERT INTO tenant_api_keys (tenant_id, key_name, key_prefix, key_hash)
         VALUES (?, ?, ?, ?)`,
        [tenantId, name.trim(), keyPrefix, keyHash]
      );

      return res.status(201).json({
        success: true,
        data: {
          id: result.insertId,
          name: name.trim(),
          key: rawKey,
          prefix: keyPrefix
        }
      });
    } catch (error) {
      console.error('Error creating API key:', error);
      return res.status(500).json({ success: false, message: 'Error creating API key' });
    }
  }

  static async revokeApiKey(req, res) {
    try {
      const tenantId = req.tenantId || req.user?.tenantId;
      const { id } = req.params;

      const [result] = await pool.execute(
        `UPDATE tenant_api_keys
         SET is_active = FALSE, revoked_at = NOW()
         WHERE id = ? AND tenant_id = ?`,
        [id, tenantId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: 'API key not found' });
      }

      return res.json({ success: true });
    } catch (error) {
      console.error('Error revoking API key:', error);
      return res.status(500).json({ success: false, message: 'Error revoking API key' });
    }
  }

  static async getWebhooks(req, res) {
    try {
      const tenantId = req.tenantId || req.user?.tenantId;
      const [rows] = await pool.execute(
        `SELECT id, event_type, webhook_url, secret_key, is_active, created_at, last_triggered_at
         FROM tenant_webhooks
         WHERE tenant_id = ?
         ORDER BY created_at DESC`,
        [tenantId]
      );

      return res.json({
        success: true,
        data: rows.map(row => ({
          ...row,
          is_active: Boolean(row.is_active)
        }))
      });
    } catch (error) {
      console.error('Error loading webhooks:', error);
      return res.status(500).json({ success: false, message: 'Error loading webhooks' });
    }
  }

  static async createWebhook(req, res) {
    try {
      const tenantId = req.tenantId || req.user?.tenantId;
      const { event_type, webhook_url, secret_key, is_active } = req.body;

      if (!event_type || !webhook_url) {
        return res.status(400).json({ success: false, message: 'Event type and URL are required' });
      }

      const normalizedEventType = event_type.trim();
      const allowedEvents = [
        'conversation.created',
        'conversation.closed',
        'message.received',
        'message.sent',
        'payment.received'
      ];

      if (!allowedEvents.includes(normalizedEventType)) {
        return res.status(400).json({ success: false, message: 'Invalid event type' });
      }

      const secret = secret_key && secret_key.trim()
        ? secret_key.trim()
        : crypto.randomBytes(24).toString('hex');

      const [result] = await pool.execute(
        `INSERT INTO tenant_webhooks (tenant_id, event_type, webhook_url, secret_key, is_active)
         VALUES (?, ?, ?, ?, ?)`,
        [tenantId, normalizedEventType, webhook_url.trim(), secret, is_active !== false]
      );

      return res.status(201).json({
        success: true,
        data: {
          id: result.insertId,
          event_type: normalizedEventType,
          webhook_url: webhook_url.trim(),
          secret_key: secret,
          is_active: is_active !== false
        }
      });
    } catch (error) {
      console.error('Error creating webhook:', error);
      return res.status(500).json({ success: false, message: 'Error creating webhook' });
    }
  }

  static async updateWebhook(req, res) {
    try {
      const tenantId = req.tenantId || req.user?.tenantId;
      const { id } = req.params;
      const { webhook_url, secret_key, is_active } = req.body;

      const updates = [];
      const params = [];

      if (webhook_url !== undefined) {
        updates.push('webhook_url = ?');
        params.push(webhook_url.trim());
      }
      if (secret_key !== undefined) {
        updates.push('secret_key = ?');
        params.push(secret_key.trim());
      }
      if (is_active !== undefined) {
        updates.push('is_active = ?');
        params.push(is_active ? true : false);
      }

      if (updates.length === 0) {
        return res.status(400).json({ success: false, message: 'No fields to update' });
      }

      params.push(id, tenantId);

      const [result] = await pool.execute(
        `UPDATE tenant_webhooks
         SET ${updates.join(', ')}, updated_at = NOW()
         WHERE id = ? AND tenant_id = ?`,
        params
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: 'Webhook not found' });
      }

      return res.json({ success: true });
    } catch (error) {
      console.error('Error updating webhook:', error);
      return res.status(500).json({ success: false, message: 'Error updating webhook' });
    }
  }

  static async deleteWebhook(req, res) {
    try {
      const tenantId = req.tenantId || req.user?.tenantId;
      const { id } = req.params;

      const [result] = await pool.execute(
        'DELETE FROM tenant_webhooks WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: 'Webhook not found' });
      }

      return res.json({ success: true });
    } catch (error) {
      console.error('Error deleting webhook:', error);
      return res.status(500).json({ success: false, message: 'Error deleting webhook' });
    }
  }
}

module.exports = ApiIntegrationController;
