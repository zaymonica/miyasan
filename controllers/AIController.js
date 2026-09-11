/**
 * AI Controller - Handles AI configuration (OpenAI)
 * @module controllers/AIController
 */

const BaseController = require('./BaseController');
const { pool } = require('../config/database');
const logger = require('../config/logger');

class AIController extends BaseController {
  static async getConfig(req, res) {
    const connection = await pool.getConnection();
    try {
      const tenantId = req.user.tenantId;

      const [configs] = await connection.query(
        'SELECT * FROM ai_configurations WHERE tenant_id = ?',
        [tenantId]
      );

      res.json({ success: true, data: configs.length ? configs[0] : null });
    } catch (error) {
      logger.error('Error getting AI config:', error);
      res.status(500).json({ success: false, message: req.t('errors.internal_server_error'), error: error.message });
    } finally {
      connection.release();
    }
  }

  static async updateConfig(req, res) {
    const connection = await pool.getConnection();
    try {
      const tenantId = req.user.tenantId;
      const { openai_api_key, model, temperature, max_tokens, system_prompt, is_active } = req.body;

      const [existing] = await connection.query(
        'SELECT id FROM ai_configurations WHERE tenant_id = ?',
        [tenantId]
      );

      if (existing.length) {
        const updates = [];
        const params = [];

        if (openai_api_key) { updates.push('openai_api_key = ?'); params.push(openai_api_key); }
        if (model) { updates.push('model = ?'); params.push(model); }
        if (temperature !== undefined) { updates.push('temperature = ?'); params.push(temperature); }
        if (max_tokens) { updates.push('max_tokens = ?'); params.push(max_tokens); }
        if (system_prompt) { updates.push('system_prompt = ?'); params.push(system_prompt); }
        if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active); }

        if (updates.length > 0) {
          updates.push('updated_at = NOW()');
          params.push(tenantId);
          await connection.query(`UPDATE ai_configurations SET ${updates.join(', ')} WHERE tenant_id = ?`, params);
        }
      } else {
        await connection.query(`
          INSERT INTO ai_configurations (tenant_id, openai_api_key, model, temperature, max_tokens, system_prompt, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        `, [tenantId, openai_api_key || null, model || 'gpt-3.5-turbo', temperature || 0.7, max_tokens || 150, system_prompt || null, is_active !== false]);
      }

      logger.info(`AI config updated for tenant ${tenantId}`);
      res.json({ success: true, message: req.t('ai.config_updated') });
    } catch (error) {
      logger.error('Error updating AI config:', error);
      res.status(500).json({ success: false, message: req.t('errors.internal_server_error'), error: error.message });
    } finally {
      connection.release();
    }
  }

  static async testAI(req, res) {
    try {
      const { message } = req.body;
      // TODO: Implement actual OpenAI API test
      res.json({ success: true, message: req.t('ai.test_successful'), response: 'Test response' });
    } catch (error) {
      logger.error('Error testing AI:', error);
      res.status(500).json({ success: false, message: req.t('errors.internal_server_error'), error: error.message });
    }
  }
}

module.exports = AIController;

