/**
 * AIConfigController Unit Tests
 */

const AIConfigController = require('../../../controllers/AIConfigController');

// Mock dependencies
jest.mock('../../../config/database', () => ({
  pool: {
    getConnection: jest.fn()
  }
}));

jest.mock('../../../config/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

jest.mock('axios');

const { pool } = require('../../../config/database');
const axios = require('axios');

describe('AIConfigController', () => {
  let mockConnection;
  let mockReq;
  let mockRes;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConnection = {
      execute: jest.fn(),
      query: jest.fn(),
      release: jest.fn()
    };

    pool.getConnection.mockResolvedValue(mockConnection);

    mockReq = {
      user: { tenantId: 1, id: 1 },
      params: {},
      body: {},
      query: {}
    };

    mockRes = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis()
    };
  });

  describe('getSettings', () => {
    it('should return AI configurations for tenant', async () => {
      const mockSettings = [
        { id: 1, provider: 'deepseek', model_name: 'deepseek-chat', active: true }
      ];
      mockConnection.execute.mockResolvedValue([mockSettings]);

      await AIConfigController.getSettings(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(mockSettings);
      expect(mockConnection.release).toHaveBeenCalled();
    });

    it('should handle errors', async () => {
      mockConnection.execute.mockRejectedValue(new Error('DB error'));

      await AIConfigController.getSettings(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Error fetching AI configurations' });
    });
  });

  describe('createSetting', () => {
    it('should create new AI configuration', async () => {
      mockReq.body = {
        provider: 'deepseek',
        model_name: 'deepseek-chat',
        api_key: 'test-key',
        persona_name: 'Test Bot',
        active: true
      };

      mockConnection.execute
        .mockResolvedValueOnce([]) // deactivate others
        .mockResolvedValueOnce([{ insertId: 1 }]); // insert

      await AIConfigController.createSetting(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'AI configuration created successfully',
        id: 1
      });
    });

    it('should validate required fields', async () => {
      mockReq.body = { provider: 'deepseek' };

      await AIConfigController.createSetting(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Provider, model, API key and persona name are required'
      });
    });

    it('should validate provider', async () => {
      mockReq.body = {
        provider: 'invalid',
        model_name: 'test',
        api_key: 'key',
        persona_name: 'Bot'
      };

      await AIConfigController.createSetting(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Provider must be "deepseek", "gpt", or "openai"'
      });
    });
  });

  describe('updateSetting', () => {
    it('should update AI configuration', async () => {
      mockReq.params.id = '1';
      mockReq.body = { persona_name: 'Updated Bot' };

      mockConnection.execute
        .mockResolvedValueOnce([[{ id: 1 }]]) // verify ownership
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // update

      await AIConfigController.updateSetting(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Configuration updated successfully'
      });
    });

    it('should return 404 if configuration not found', async () => {
      mockReq.params.id = '999';
      mockReq.body = { persona_name: 'Test' };
      mockConnection.execute.mockResolvedValue([[]]);

      await AIConfigController.updateSetting(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Configuration not found' });
    });

    it('should return 400 if no fields to update', async () => {
      mockReq.params.id = '1';
      mockReq.body = {};
      mockConnection.execute.mockResolvedValue([[{ id: 1 }]]);

      await AIConfigController.updateSetting(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'No fields to update' });
    });
  });

  describe('toggleSetting', () => {
    it('should toggle configuration active status', async () => {
      mockReq.params.id = '1';
      mockReq.body = { active: true };

      mockConnection.execute
        .mockResolvedValueOnce([[{ id: 1 }]]) // verify ownership
        .mockResolvedValueOnce([]) // deactivate others
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // activate

      await AIConfigController.toggleSetting(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Configuration activated successfully'
      });
    });

    it('should validate active is boolean', async () => {
      mockReq.params.id = '1';
      mockReq.body = { active: 'yes' };

      await AIConfigController.toggleSetting(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Active status must be boolean' });
    });
  });

  describe('deleteSetting', () => {
    it('should delete AI configuration', async () => {
      mockReq.params.id = '1';
      mockConnection.execute.mockResolvedValue([{ affectedRows: 1 }]);

      await AIConfigController.deleteSetting(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Configuration deleted successfully'
      });
    });

    it('should return 404 if configuration not found', async () => {
      mockReq.params.id = '999';
      mockConnection.execute.mockResolvedValue([{ affectedRows: 0 }]);

      await AIConfigController.deleteSetting(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Configuration not found' });
    });
  });

  describe('getModels', () => {
    it('should return deepseek models', async () => {
      mockReq.params.provider = 'deepseek';

      await AIConfigController.getModels(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 'deepseek-chat' }),
          expect.objectContaining({ id: 'deepseek-coder' })
        ])
      );
    });

    it('should return gpt models', async () => {
      mockReq.params.provider = 'gpt';

      await AIConfigController.getModels(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 'gpt-3.5-turbo' }),
          expect.objectContaining({ id: 'gpt-4' })
        ])
      );
    });

    it('should return 400 for unsupported provider', async () => {
      mockReq.params.provider = 'invalid';

      await AIConfigController.getModels(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Provider not supported' });
    });
  });

  describe('getStats', () => {
    it('should return AI usage statistics', async () => {
      mockConnection.execute
        .mockResolvedValueOnce([[{ count: 10 }]]) // today bot
        .mockResolvedValueOnce([[{ count: 50 }]]) // week bot
        .mockResolvedValueOnce([[{ count: 20 }]]) // conversations
        .mockResolvedValueOnce([[{ provider: 'deepseek', model_name: 'deepseek-chat' }]]); // active config

      await AIConfigController.getStats(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        today_ai_messages: 10,
        week_ai_messages: 50,
        avg_response_time: 1.2,
        active_config: { provider: 'deepseek', model_name: 'deepseek-chat' }
      });
    });
  });

  describe('testConfiguration', () => {
    it('should return 404 if configuration not found', async () => {
      mockReq.params.id = '999';
      mockConnection.execute.mockResolvedValue([[]]);

      await AIConfigController.testConfiguration(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Configuration not found' });
    });

    it('should handle test errors gracefully', async () => {
      mockReq.params.id = '1';
      mockReq.body = { test_message: 'Hello' };

      const mockConfig = {
        id: 1,
        provider: 'deepseek',
        model_name: 'deepseek-chat',
        api_key: 'abc123:encrypted',
        system_prompt: 'You are helpful',
        temperature: 0.7,
        max_tokens: 1000
      };

      mockConnection.execute.mockResolvedValue([[mockConfig]]);

      await AIConfigController.testConfiguration(mockReq, mockRes);

      // Should return some response (success or error)
      expect(mockRes.json).toHaveBeenCalled();
    });
  });
});
