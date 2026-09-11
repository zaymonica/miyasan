const ApiIntegrationController = require('../../../controllers/ApiIntegrationController');

jest.mock('../../../config/database', () => ({
  pool: {
    execute: jest.fn()
  }
}));

jest.mock('crypto', () => ({
  randomBytes: jest.fn(),
  createHash: jest.fn()
}));

const { pool } = require('../../../config/database');
const crypto = require('crypto');

describe('ApiIntegrationController', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      body: {},
      params: {},
      tenantId: 1,
      user: { tenantId: 1 }
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('getApiKeys', () => {
    it('should return api keys list', async () => {
      pool.execute.mockResolvedValue([[{
        id: 1,
        key_name: 'Key A',
        key_prefix: 'tk_123456',
        is_active: 1
      }]]);

      await ApiIntegrationController.getApiKeys(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [{
          id: 1,
          key_name: 'Key A',
          key_prefix: 'tk_123456',
          is_active: true
        }]
      });
    });

    it('should handle database errors', async () => {
      pool.execute.mockRejectedValue(new Error('db'));

      await ApiIntegrationController.getApiKeys(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Error loading API keys' });
    });
  });

  describe('createApiKey', () => {
    it('should reject empty key name', async () => {
      req.body = { name: '   ' };

      await ApiIntegrationController.createApiKey(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Key name is required' });
    });

    it('should create api key successfully', async () => {
      req.body = { name: 'My Key' };
      crypto.randomBytes.mockReturnValue(Buffer.from('abcd', 'utf8'));
      crypto.createHash.mockReturnValue({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('hash123')
      });
      pool.execute.mockResolvedValue([{ insertId: 10 }]);

      await ApiIntegrationController.createApiKey(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          id: 10,
          name: 'My Key',
          key: expect.stringMatching(/^tk_/),
          prefix: expect.any(String)
        }
      });
    });

    it('should handle errors', async () => {
      req.body = { name: 'My Key' };
      crypto.randomBytes.mockReturnValue(Buffer.from('abcd', 'utf8'));
      crypto.createHash.mockReturnValue({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('hash123')
      });
      pool.execute.mockRejectedValue(new Error('db'));

      await ApiIntegrationController.createApiKey(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Error creating API key' });
    });
  });

  describe('revokeApiKey', () => {
    it('should return 404 when key not found', async () => {
      req.params = { id: 5 };
      pool.execute.mockResolvedValue([{ affectedRows: 0 }]);

      await ApiIntegrationController.revokeApiKey(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'API key not found' });
    });

    it('should revoke api key', async () => {
      req.params = { id: 5 };
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      await ApiIntegrationController.revokeApiKey(req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('getWebhooks', () => {
    it('should return webhooks list', async () => {
      pool.execute.mockResolvedValue([[{
        id: 1,
        event_type: 'message.received',
        webhook_url: 'https://example.com',
        is_active: 0
      }]]);

      await ApiIntegrationController.getWebhooks(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [{
          id: 1,
          event_type: 'message.received',
          webhook_url: 'https://example.com',
          is_active: false
        }]
      });
    });
  });

  describe('createWebhook', () => {
    it('should validate required fields', async () => {
      req.body = { webhook_url: 'https://example.com' };

      await ApiIntegrationController.createWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Event type and URL are required' });
    });

    it('should validate event type', async () => {
      req.body = { event_type: 'invalid', webhook_url: 'https://example.com' };

      await ApiIntegrationController.createWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Invalid event type' });
    });

    it('should create webhook', async () => {
      req.body = { event_type: 'message.received', webhook_url: 'https://example.com' };
      crypto.randomBytes.mockReturnValue(Buffer.from('secret', 'utf8'));
      pool.execute.mockResolvedValue([{ insertId: 2 }]);

      await ApiIntegrationController.createWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          id: 2,
          event_type: 'message.received',
          webhook_url: 'https://example.com',
          secret_key: expect.any(String),
          is_active: true
        }
      });
    });
  });

  describe('updateWebhook', () => {
    it('should reject empty updates', async () => {
      req.params = { id: 1 };
      req.body = {};

      await ApiIntegrationController.updateWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'No fields to update' });
    });

    it('should update webhook', async () => {
      req.params = { id: 1 };
      req.body = { webhook_url: 'https://example.com' };
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      await ApiIntegrationController.updateWebhook(req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('should return 404 if webhook not found', async () => {
      req.params = { id: 1 };
      req.body = { webhook_url: 'https://example.com' };
      pool.execute.mockResolvedValue([{ affectedRows: 0 }]);

      await ApiIntegrationController.updateWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Webhook not found' });
    });
  });

  describe('deleteWebhook', () => {
    it('should return 404 if webhook not found', async () => {
      req.params = { id: 1 };
      pool.execute.mockResolvedValue([{ affectedRows: 0 }]);

      await ApiIntegrationController.deleteWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Webhook not found' });
    });

    it('should delete webhook', async () => {
      req.params = { id: 1 };
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      await ApiIntegrationController.deleteWebhook(req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });
});
