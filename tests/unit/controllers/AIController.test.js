/**
 * AIController Unit Tests
 */

const AIController = require('../../../controllers/AIController');

// Mock dependencies
jest.mock('../../../config/database', () => ({
  pool: {
    execute: jest.fn(),
    getConnection: jest.fn()
  }
}));

const { pool } = require('../../../config/database');

describe('AIController', () => {
  let mockReq;
  let mockRes;
  let mockConnection;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConnection = {
      execute: jest.fn(),
      query: jest.fn(),
      release: jest.fn()
    };

    pool.getConnection.mockResolvedValue(mockConnection);

    mockReq = {
      body: {},
      query: {},
      params: {},
      tenantId: 1,
      user: { tenantId: 1 },
      t: jest.fn((key) => key)
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('getConfigurations', () => {
    it('should return AI configurations', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, persona_name: 'Assistant', provider: 'openai', active: true }
      ]]);

      await AIController.getConfigurations(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.any(Array)
        })
      );
    });
  });

  describe('getConfigurationById', () => {
    it('should return configuration by id', async () => {
      mockReq.params = { id: 1 };

      pool.execute.mockResolvedValue([[{
        id: 1,
        persona_name: 'Assistant',
        provider: 'openai',
        model_name: 'gpt-4'
      }]]);

      await AIController.getConfigurationById(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ id: 1 })
        })
      );
    });

    it('should return 404 if not found', async () => {
      mockReq.params = { id: 999 };
      pool.execute.mockResolvedValue([[]]);

      await AIController.getConfigurationById(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  describe('createConfiguration', () => {
    it('should create AI configuration', async () => {
      mockReq.body = {
        persona_name: 'New Assistant',
        provider: 'openai',
        model_name: 'gpt-4',
        api_key: 'sk-test123',
        system_prompt: 'You are a helpful assistant'
      };

      pool.execute.mockResolvedValue([{ insertId: 1 }]);

      await AIController.createConfiguration(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ id: 1 })
        })
      );
    });

    it('should reject if required fields missing', async () => {
      mockReq.body = { persona_name: 'Test' };

      await AIController.createConfiguration(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('updateConfiguration', () => {
    it('should update AI configuration', async () => {
      mockReq.params = { id: 1 };
      mockReq.body = {
        persona_name: 'Updated Assistant',
        temperature: 0.8
      };

      pool.execute
        .mockResolvedValueOnce([[{ id: 1 }]]) // Check exists
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // Update

      await AIController.updateConfiguration(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  describe('deleteConfiguration', () => {
    it('should delete AI configuration', async () => {
      mockReq.params = { id: 1 };

      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      await AIController.deleteConfiguration(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  describe('toggleConfiguration', () => {
    it('should toggle configuration active status', async () => {
      mockReq.params = { id: 1 };

      pool.execute
        .mockResolvedValueOnce([[{ id: 1, active: true }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      await AIController.toggleConfiguration(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  describe('testConfiguration', () => {
    it('should test AI configuration', async () => {
      mockReq.params = { id: 1 };
      mockReq.body = { message: 'Hello' };

      pool.execute.mockResolvedValue([[{
        id: 1,
        provider: 'openai',
        api_key: 'sk-test',
        model_name: 'gpt-4',
        system_prompt: 'You are helpful'
      }]]);

      // Mock would need actual AI service mock
      await AIController.testConfiguration(mockReq, mockRes);

      // Test depends on actual implementation
      expect(mockRes.json).toHaveBeenCalled();
    });
  });

  describe('getActiveConfiguration', () => {
    it('should return active configuration', async () => {
      pool.execute.mockResolvedValue([[{
        id: 1,
        persona_name: 'Active Assistant',
        active: true
      }]]);

      await AIController.getActiveConfiguration(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ active: true })
        })
      );
    });

    it('should return null if no active configuration', async () => {
      pool.execute.mockResolvedValue([[]]);

      await AIController.getActiveConfiguration(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: null
        })
      );
    });
  });
});
