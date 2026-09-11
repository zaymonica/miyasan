/**
 * AI Configuration Controller - Multi-tenant AI Management
 * Handles AI provider configurations with tenant isolation
 */

const crypto = require('crypto');
const { pool } = require('../config/database');
const { logger } = require('../config/logger');
const axios = require('axios');

class AIConfigController {
  /**
   * Get AI configurations for tenant
   * GET /api/tenant/ai-config/settings
   */
  async getSettings(req, res) {
    let connection;
    try {
      const tenantId = req.user.tenantId;

      connection = await pool.getConnection();

      const [settings] = await connection.execute(
        `SELECT 
          id,
          provider,
          model_name,
          persona_name,
          persona_description,
          system_prompt,
          temperature,
          max_tokens,
          active,
          business_hours_start,
          business_hours_end,
          business_days,
          auto_response_enabled,
          response_delay,
          created_at,
          updated_at,
          CASE 
            WHEN api_key IS NOT NULL AND api_key != '' THEN 'configured'
            ELSE 'not_configured'
          END as api_key_status
        FROM ai_configurations 
        WHERE tenant_id = ?
        ORDER BY created_at DESC`,
        [tenantId]
      );

      res.json(settings);
    } catch (error) {
      logger.error('Error fetching AI configurations:', error);
      res.status(500).json({ error: 'Error fetching AI configurations' });
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * Create new AI configuration
   * POST /api/tenant/ai-config/settings
   */
  async createSetting(req, res) {
    let connection;
    try {
      const tenantId = req.user.tenantId;
      const {
        provider,
        model_name,
        api_key,
        persona_name,
        persona_description,
        system_prompt,
        temperature = 0.7,
        max_tokens = 1000,
        business_hours_start = '08:00',
        business_hours_end = '18:00',
        business_days = 'monday,tuesday,wednesday,thursday,friday,saturday',
        auto_response_enabled = true,
        response_delay = 2
      } = req.body;

      // Validation
      if (!provider || !model_name || !api_key || !persona_name) {
        return res.status(400).json({
          error: 'Provider, model, API key and persona name are required'
        });
      }

      if (!['deepseek', 'gpt', 'openai'].includes(provider)) {
        return res.status(400).json({
          error: 'Provider must be "deepseek", "gpt", or "openai"'
        });
      }

      if (!this.isValidTime(business_hours_start) || !this.isValidTime(business_hours_end)) {
        return res.status(400).json({
          error: 'Times must be in HH:MM format'
        });
      }

      // Encrypt API key
      const encryptedApiKey = this.encryptData(api_key);

      connection = await pool.getConnection();

      // Deactivate other configurations if this one is active
      if (req.body.active) {
        await connection.execute(
          'UPDATE ai_configurations SET active = FALSE WHERE tenant_id = ?',
          [tenantId]
        );
      }

      const [result] = await connection.execute(
        `INSERT INTO ai_configurations (
          tenant_id, provider, model_name, api_key, persona_name, persona_description,
          system_prompt, temperature, max_tokens, active,
          business_hours_start, business_hours_end, business_days,
          auto_response_enabled, response_delay
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tenantId, provider, model_name, encryptedApiKey, persona_name, persona_description,
          system_prompt, temperature, max_tokens, req.body.active || false,
          business_hours_start, business_hours_end, business_days,
          auto_response_enabled, response_delay
        ]
      );

      res.json({
        success: true,
        message: 'AI configuration created successfully',
        id: result.insertId
      });
    } catch (error) {
      logger.error('Error creating AI configuration:', error);
      res.status(500).json({ error: 'Error creating AI configuration' });
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * Update AI configuration
   * PUT /api/tenant/ai-config/settings/:id
   */
  async updateSetting(req, res) {
    let connection;
    try {
      const tenantId = req.user.tenantId;
      const { id } = req.params;
      const {
        provider,
        model_name,
        api_key,
        persona_name,
        persona_description,
        system_prompt,
        temperature,
        max_tokens,
        business_hours_start,
        business_hours_end,
        business_days,
        auto_response_enabled,
        response_delay
      } = req.body;

      connection = await pool.getConnection();

      // Verify ownership
      const [existing] = await connection.execute(
        'SELECT id FROM ai_configurations WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (existing.length === 0) {
        return res.status(404).json({ error: 'Configuration not found' });
      }

      // Build update query
      let updateFields = [];
      let updateValues = [];

      if (provider) {
        updateFields.push('provider = ?');
        updateValues.push(provider);
      }

      if (model_name) {
        updateFields.push('model_name = ?');
        updateValues.push(model_name);
      }

      if (api_key) {
        updateFields.push('api_key = ?');
        updateValues.push(this.encryptData(api_key));
      }

      if (persona_name) {
        updateFields.push('persona_name = ?');
        updateValues.push(persona_name);
      }

      if (persona_description !== undefined) {
        updateFields.push('persona_description = ?');
        updateValues.push(persona_description);
      }

      if (system_prompt !== undefined) {
        updateFields.push('system_prompt = ?');
        updateValues.push(system_prompt);
      }

      if (temperature !== undefined) {
        updateFields.push('temperature = ?');
        updateValues.push(temperature);
      }

      if (max_tokens !== undefined) {
        updateFields.push('max_tokens = ?');
        updateValues.push(max_tokens);
      }

      if (business_hours_start) {
        updateFields.push('business_hours_start = ?');
        updateValues.push(business_hours_start);
      }

      if (business_hours_end) {
        updateFields.push('business_hours_end = ?');
        updateValues.push(business_hours_end);
      }

      if (business_days) {
        updateFields.push('business_days = ?');
        updateValues.push(business_days);
      }

      if (auto_response_enabled !== undefined) {
        updateFields.push('auto_response_enabled = ?');
        updateValues.push(auto_response_enabled);
      }

      if (response_delay !== undefined) {
        updateFields.push('response_delay = ?');
        updateValues.push(response_delay);
      }

      if (updateFields.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      updateFields.push('updated_at = CURRENT_TIMESTAMP');
      updateValues.push(id, tenantId);

      await connection.execute(
        `UPDATE ai_configurations SET ${updateFields.join(', ')} WHERE id = ? AND tenant_id = ?`,
        updateValues
      );

      res.json({
        success: true,
        message: 'Configuration updated successfully'
      });
    } catch (error) {
      logger.error('Error updating configuration:', error);
      res.status(500).json({ error: 'Error updating configuration' });
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * Toggle AI configuration active status
   * PATCH /api/tenant/ai-config/settings/:id/toggle
   */
  async toggleSetting(req, res) {
    let connection;
    try {
      const tenantId = req.user.tenantId;
      const { id } = req.params;
      const { active } = req.body;

      if (typeof active !== 'boolean') {
        return res.status(400).json({ error: 'Active status must be boolean' });
      }

      connection = await pool.getConnection();

      // Verify ownership
      const [existing] = await connection.execute(
        'SELECT id FROM ai_configurations WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (existing.length === 0) {
        return res.status(404).json({ error: 'Configuration not found' });
      }

      if (active) {
        // Deactivate all other configurations for this tenant
        await connection.execute(
          'UPDATE ai_configurations SET active = FALSE WHERE tenant_id = ?',
          [tenantId]
        );
      }

      // Activate/deactivate the specific configuration
      await connection.execute(
        'UPDATE ai_configurations SET active = ? WHERE id = ? AND tenant_id = ?',
        [active, id, tenantId]
      );

      res.json({
        success: true,
        message: `Configuration ${active ? 'activated' : 'deactivated'} successfully`
      });
    } catch (error) {
      logger.error('Error toggling configuration:', error);
      res.status(500).json({ error: 'Error toggling configuration' });
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * Delete AI configuration
   * DELETE /api/tenant/ai-config/settings/:id
   */
  async deleteSetting(req, res) {
    let connection;
    try {
      const tenantId = req.user.tenantId;
      const { id } = req.params;

      connection = await pool.getConnection();

      const [result] = await connection.execute(
        'DELETE FROM ai_configurations WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Configuration not found' });
      }

      res.json({
        success: true,
        message: 'Configuration deleted successfully'
      });
    } catch (error) {
      logger.error('Error deleting configuration:', error);
      res.status(500).json({ error: 'Error deleting configuration' });
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * Test AI configuration
   * POST /api/tenant/ai-config/test/:id
   */
  async testConfiguration(req, res) {
    let connection;
    try {
      const tenantId = req.user.tenantId;
      const { id } = req.params;
      const { test_message = 'Hello, this is a connection test.' } = req.body;

      connection = await pool.getConnection();

      const [configs] = await connection.execute(
        'SELECT * FROM ai_configurations WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (configs.length === 0) {
        return res.status(404).json({ error: 'Configuration not found' });
      }

      const config = configs[0];
      const apiKey = this.decryptData(config.api_key);

      let testResult;

      if (config.provider === 'deepseek') {
        testResult = await this.testDeepSeekConnection(apiKey, config, test_message);
      } else if (config.provider === 'gpt' || config.provider === 'openai') {
        testResult = await this.testGPTConnection(apiKey, config, test_message);
      } else {
        return res.status(400).json({ error: 'Provider not supported' });
      }

      res.json(testResult);
    } catch (error) {
      logger.error('Error testing configuration:', error);
      res.status(500).json({ error: 'Error testing configuration' });
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * Get available models by provider
   * GET /api/tenant/ai-config/models/:provider
   */
  async getModels(req, res) {
    try {
      const { provider } = req.params;

      let models = [];

      if (provider === 'deepseek') {
        models = [
          {
            id: 'deepseek-chat',
            name: 'DeepSeek Chat',
            description: 'Main model for general conversations',
            max_tokens: 4096
          },
          {
            id: 'deepseek-coder',
            name: 'DeepSeek Coder',
            description: 'Specialized in programming and code',
            max_tokens: 4096
          }
        ];
      } else if (provider === 'gpt' || provider === 'openai') {
        models = [
          {
            id: 'gpt-3.5-turbo',
            name: 'GPT-3.5 Turbo',
            description: 'Fast and efficient for general conversations',
            max_tokens: 4096
          },
          {
            id: 'gpt-4',
            name: 'GPT-4',
            description: 'Most advanced model with better understanding',
            max_tokens: 8192
          },
          {
            id: 'gpt-4-turbo',
            name: 'GPT-4 Turbo',
            description: 'Optimized version of GPT-4',
            max_tokens: 128000
          }
        ];
      } else {
        return res.status(400).json({ error: 'Provider not supported' });
      }

      res.json(models);
    } catch (error) {
      logger.error('Error fetching models:', error);
      res.status(500).json({ error: 'Error fetching models' });
    }
  }

  /**
   * Get AI usage statistics
   * GET /api/tenant/ai-config/stats
   */
  async getStats(req, res) {
    let connection;
    try {
      const tenantId = req.user.tenantId;

      connection = await pool.getConnection();

      // Total messages from bot today
      const [todayBot] = await connection.execute(
        `SELECT COUNT(*) as count 
         FROM messages 
         WHERE tenant_id = ? AND DATE(timestamp) = CURDATE() 
         AND is_from_bot = TRUE`,
        [tenantId]
      );

      // Total messages from bot this week
      const [weekBot] = await connection.execute(
        `SELECT COUNT(*) as count 
         FROM messages 
         WHERE tenant_id = ? AND timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)
         AND is_from_bot = TRUE`,
        [tenantId]
      );

      // Total conversations with bot messages
      const [conversations] = await connection.execute(
        `SELECT COUNT(DISTINCT conversation_id) as count
         FROM messages 
         WHERE tenant_id = ? AND is_from_bot = TRUE
         AND timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
        [tenantId]
      );

      // Active configuration
      const [activeConfig] = await connection.execute(
        `SELECT provider, model_name, persona_name
         FROM ai_configurations 
         WHERE tenant_id = ? AND active = TRUE
         LIMIT 1`,
        [tenantId]
      );

      res.json({
        today_ai_messages: todayBot[0].count,
        week_ai_messages: weekBot[0].count,
        avg_response_time: 1.2, // Mock value - will be implemented when tracking is added
        active_config: activeConfig.length > 0 ? activeConfig[0] : null
      });
    } catch (error) {
      logger.error('Error fetching statistics:', error);
      res.status(500).json({ error: 'Error fetching statistics' });
    } finally {
      if (connection) connection.release();
    }
  }

  // Helper methods
  encryptData(text) {
    const keyString = process.env.ENCRYPTION_KEY || 'default-key-change-in-production-32';
    const key = crypto.createHash('sha256').update(keyString).digest();
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return iv.toString('hex') + ':' + encrypted;
  }

  decryptData(encryptedText) {
    const keyString = process.env.ENCRYPTION_KEY || 'default-key-change-in-production-32';
    const key = crypto.createHash('sha256').update(keyString).digest();

    const textParts = encryptedText.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encrypted = textParts.join(':');

    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  isValidTime(timeString) {
    return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(timeString);
  }

  async testDeepSeekConnection(apiKey, config, testMessage) {
    try {
      const response = await axios.post(
        'https://api.deepseek.com/v1/chat/completions',
        {
          model: config.model_name,
          messages: [
            {
              role: 'system',
              content: config.system_prompt || 'You are a helpful assistant.'
            },
            {
              role: 'user',
              content: testMessage
            }
          ],
          temperature: parseFloat(config.temperature) || 0.7,
          max_tokens: Math.min(parseInt(config.max_tokens) || 1000, 100)
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      return {
        success: true,
        message: 'Connection with DeepSeek established successfully',
        response: response.data.choices[0].message.content,
        usage: response.data.usage
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message || 'Error connecting with DeepSeek'
      };
    }
  }

  async testGPTConnection(apiKey, config, testMessage) {
    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: config.model_name,
          messages: [
            {
              role: 'system',
              content: config.system_prompt || 'You are a helpful assistant.'
            },
            {
              role: 'user',
              content: testMessage
            }
          ],
          temperature: parseFloat(config.temperature) || 0.7,
          max_tokens: Math.min(parseInt(config.max_tokens) || 1000, 100)
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      return {
        success: true,
        message: 'Connection with OpenAI GPT established successfully',
        response: response.data.choices[0].message.content,
        usage: response.data.usage
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message || 'Error connecting with OpenAI'
      };
    }
  }
}

const aiConfigController = new AIConfigController();

module.exports = {
  getSettings: (req, res) => aiConfigController.getSettings(req, res),
  createSetting: (req, res) => aiConfigController.createSetting(req, res),
  updateSetting: (req, res) => aiConfigController.updateSetting(req, res),
  toggleSetting: (req, res) => aiConfigController.toggleSetting(req, res),
  deleteSetting: (req, res) => aiConfigController.deleteSetting(req, res),
  testConfiguration: (req, res) => aiConfigController.testConfiguration(req, res),
  getModels: (req, res) => aiConfigController.getModels(req, res),
  getStats: (req, res) => aiConfigController.getStats(req, res)
};
