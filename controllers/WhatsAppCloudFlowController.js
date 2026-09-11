const WhatsAppCloudFlow = require('../models/WhatsAppCloudFlow');
const { logger } = require('../config/logger');

class WhatsAppCloudFlowController {
  static async list(req, res) {
    try {
      const tenantId = req.tenantId || req.user?.tenantId || 1;
      const { accountId } = req.query;
      const flows = await WhatsAppCloudFlow.listByTenant(tenantId, accountId ? String(accountId) : null);
      res.json({ success: true, data: flows });
    } catch (error) {
      logger.error('Error listing flows', { error: error.message });
      res.status(500).json({ success: false, error: 'Failed to load flows' });
    }
  }

  static async save(req, res) {
    try {
      const tenantId = req.tenantId || req.user?.tenantId || 1;
      const flow = req.body || {};
      if (!flow.id || !flow.name) {
        return res.status(400).json({ success: false, error: 'Flow id and name are required' });
      }
      const saved = await WhatsAppCloudFlow.upsert(tenantId, flow);
      res.json({ success: true, data: saved });
    } catch (error) {
      logger.error('Error saving flow', { error: error.message });
      res.status(500).json({ success: false, error: 'Failed to save flow' });
    }
  }

  static async delete(req, res) {
    try {
      const tenantId = req.tenantId || req.user?.tenantId || 1;
      const { flowId } = req.params;
      if (!flowId) {
        return res.status(400).json({ success: false, error: 'Flow id is required' });
      }
      const removed = await WhatsAppCloudFlow.deleteByFlowId(tenantId, flowId);
      if (!removed) {
        return res.status(404).json({ success: false, error: 'Flow not found' });
      }
      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting flow', { error: error.message });
      res.status(500).json({ success: false, error: 'Failed to delete flow' });
    }
  }
}

module.exports = WhatsAppCloudFlowController;
