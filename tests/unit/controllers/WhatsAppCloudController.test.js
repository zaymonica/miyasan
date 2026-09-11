/**
 * WhatsAppCloudController Unit Tests
 * Tests for WhatsApp Cloud API integration
 */

const WhatsAppCloudController = require('../../../controllers/WhatsAppCloudController');
const { pool } = require('../../../config/database');
const axios = require('axios');
const crypto = require('crypto');

// Mock dependencies
jest.mock('../../../config/database');
jest.mock('axios');
jest.mock('crypto');
jest.mock('../../../config/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

describe('WhatsAppCloudController', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();
    
    req = {
      body: {},
      params: {},
      query: {},
      user: { id: 1, tenantId: 1, role: 'admin' },
      tenantId: 1,
      protocol: 'https',
      get: jest.fn(() => 'example.com'),
      headers: {}
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };

    // Mock pool.execute
    pool.execute = jest.fn();
  });

  describe('facebookCallback', () => {
    describe('Manual Connection', () => {
      it('should create new account with manual connection', async () => {
        req.body = {
          manual: true,
          account_name: 'Test Account',
          phone_number_id: '123456',
          phone_number: '+1234567890',
          access_token: 'test_token',
          waba_id: 'waba_123'
        };

        // Mock: no existing account
        pool.execute
          .mockResolvedValueOnce([[]])  // Check existing
          .mockResolvedValueOnce([[{ count: 0 }]])  // Count accounts
          .mockResolvedValueOnce([{ insertId: 1 }]);  // Insert new

        await WhatsAppCloudController.facebookCallback(req, res);

        expect(res.json).toHaveBeenCalledWith({
          success: true,
          message: 'Account connected successfully',
          data: { account_id: 1 }
        });
      });

      it('should update existing account with manual connection', async () => {
        req.body = {
          manual: true,
          account_name: 'Updated Account',
          phone_number_id: '123456',
          phone_number: '+1234567890',
          access_token: 'new_token',
          waba_id: 'waba_123'
        };

        // Mock: existing account found
        pool.execute
          .mockResolvedValueOnce([[{ id: 5 }]])  // Check existing
          .mockResolvedValueOnce([{ affectedRows: 1 }]);  // Update

        await WhatsAppCloudController.facebookCallback(req, res);

        expect(res.json).toHaveBeenCalledWith({
          success: true,
          message: 'Account connected successfully',
          data: { account_id: 5 }
        });
      });

      it('should return error if required fields missing', async () => {
        req.body = {
          manual: true,
          account_name: 'Test'
          // Missing phone_number_id and access_token
        };

        await WhatsAppCloudController.facebookCallback(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          message: 'Account name, phone number ID, and access token are required for manual connection'
        });
      });
    });

    describe('OAuth Flow', () => {
      it('should return error if no tenant ID', async () => {
        req.tenantId = null;
        req.user.tenantId = null;

        await WhatsAppCloudController.facebookCallback(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          message: 'Tenant ID not found in request'
        });
      });

      it('should return error if no code or auth_response', async () => {
        req.body = {};

        await WhatsAppCloudController.facebookCallback(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          message: 'Authorization code or auth response is required'
        });
      });

      it('should return error if embedded signup not enabled', async () => {
        req.body = { code: 'test_code' };

        pool.execute.mockResolvedValueOnce([[
          { setting_key: 'meta_app_id', setting_value: 'app123' },
          { setting_key: 'meta_app_secret', setting_value: 'secret123' },
          { setting_key: 'meta_embedded_signup_enabled', setting_value: '0' }
        ]]);

        await WhatsAppCloudController.facebookCallback(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          message: 'Facebook Embedded Signup is not enabled in system settings'
        });
      });

      it('should return error if Meta credentials missing', async () => {
        req.body = { code: 'test_code' };

        pool.execute.mockResolvedValueOnce([[
          { setting_key: 'meta_embedded_signup_enabled', setting_value: '1' }
        ]]);

        await WhatsAppCloudController.facebookCallback(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          message: 'Meta App credentials are not configured'
        });
      });
    });
  });

  describe('verifyWebhook', () => {
    it('should verify webhook with correct token', () => {
      req.query = {
        'hub.mode': 'subscribe',
        'hub.verify_token': 'test_verify_token',
        'hub.challenge': 'challenge_string'
      };

      process.env.WHATSAPP_VERIFY_TOKEN = 'test_verify_token';

      WhatsAppCloudController.verifyWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith('challenge_string');
    });

    it('should reject webhook with incorrect token', () => {
      req.query = {
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong_token',
        'hub.challenge': 'challenge_string'
      };

      process.env.WHATSAPP_VERIFY_TOKEN = 'test_verify_token';

      WhatsAppCloudController.verifyWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.send).toHaveBeenCalledWith('Forbidden');
    });

    it('should reject if mode is not subscribe', () => {
      req.query = {
        'hub.mode': 'unsubscribe',
        'hub.verify_token': 'test_verify_token',
        'hub.challenge': 'challenge_string'
      };

      process.env.WHATSAPP_VERIFY_TOKEN = 'test_verify_token';

      WhatsAppCloudController.verifyWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.send).toHaveBeenCalledWith('Forbidden');
    });
  });

  describe('exchangeCodeForToken', () => {
    it('should exchange code for access token successfully', async () => {
      const mockResponse = {
        data: {
          access_token: 'test_access_token',
          token_type: 'bearer'
        }
      };

      axios.post.mockResolvedValue(mockResponse);

      const result = await WhatsAppCloudController.exchangeCodeForToken(
        'auth_code',
        'app_id',
        'app_secret',
        'https://example.com/callback'
      );

      expect(result).toEqual(mockResponse.data);
      expect(axios.post).toHaveBeenCalledWith(
        'https://graph.facebook.com/v21.0/oauth/access_token',
        null,
        expect.objectContaining({
          params: expect.objectContaining({
            client_id: 'app_id',
            client_secret: 'app_secret',
            code: 'auth_code',
            redirect_uri: 'https://example.com/callback'
          })
        })
      );
    });

    it('should throw error if token exchange fails', async () => {
      axios.post.mockRejectedValue(new Error('Token exchange failed'));

      await expect(
        WhatsAppCloudController.exchangeCodeForToken(
          'auth_code',
          'app_id',
          'app_secret',
          'https://example.com/callback'
        )
      ).rejects.toThrow('Token exchange failed');
    });
  });

  describe('getWABADetails', () => {
    it('should get WABA details successfully', async () => {
      const mockResponse = {
        data: {
          data: [{
            id: 'waba_123',
            name: 'Test WABA',
            phone_number_id: '123456',
            display_phone_number: '+1234567890'
          }]
        }
      };

      axios.get.mockResolvedValue(mockResponse);

      const result = await WhatsAppCloudController.getWABADetails('test_token');

      expect(result).toEqual(mockResponse.data.data[0]);
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('https://graph.facebook.com'),
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer test_token'
          }
        })
      );
    });

    it('should throw error if no WABA found', async () => {
      axios.get.mockResolvedValue({ data: { data: [] } });

      await expect(
        WhatsAppCloudController.getWABADetails('test_token')
      ).rejects.toThrow();
    });
  });

  describe('sendMessage', () => {
    it('should send text message successfully', async () => {
      const mockResponse = {
        data: {
          messages: [{ id: 'msg_123' }]
        }
      };

      axios.post.mockResolvedValue(mockResponse);

      const result = await WhatsAppCloudController.sendMessage({
        phoneNumberId: '123456',
        accessToken: 'test_token',
        to: '+1234567890',
        message: 'Hello World'
      });

      expect(result).toEqual(mockResponse.data);
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/messages'),
        expect.objectContaining({
          messaging_product: 'whatsapp',
          to: '+1234567890',
          type: 'text',
          text: { body: 'Hello World' }
        }),
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer test_token',
            'Content-Type': 'application/json'
          }
        })
      );
    });

    it('should handle message send failure', async () => {
      axios.post.mockRejectedValue(new Error('Send failed'));

      await expect(
        WhatsAppCloudController.sendMessage({
          phoneNumberId: '123456',
          accessToken: 'test_token',
          to: '+1234567890',
          message: 'Hello'
        })
      ).rejects.toThrow('Send failed');
    });
  });

  describe('normalizeFlowText', () => {
    it('should normalize text correctly', () => {
      const result = WhatsAppCloudController.normalizeFlowText('  Hello   World  ');
      expect(result).toBe('hello world');
    });

    it('should handle empty string', () => {
      const result = WhatsAppCloudController.normalizeFlowText('');
      expect(result).toBe('');
    });

    it('should handle null/undefined', () => {
      expect(WhatsAppCloudController.normalizeFlowText(null)).toBe('');
      expect(WhatsAppCloudController.normalizeFlowText(undefined)).toBe('');
    });

    it('should remove special characters', () => {
      const result = WhatsAppCloudController.normalizeFlowText('Hello! @World#');
      expect(result).toBe('hello world');
    });
  });

  describe('safeJsonParse', () => {
    it('should parse valid JSON', () => {
      const result = WhatsAppCloudController.safeJsonParse('{"key":"value"}', {});
      expect(result).toEqual({ key: 'value' });
    });

    it('should return default value for invalid JSON', () => {
      const result = WhatsAppCloudController.safeJsonParse('invalid json', { default: true });
      expect(result).toEqual({ default: true });
    });

    it('should return default value for null', () => {
      const result = WhatsAppCloudController.safeJsonParse(null, { default: true });
      expect(result).toEqual({ default: true });
    });
  });

  describe('isKeywordTriggerMatch', () => {
    it('should match exact keyword', () => {
      const result = WhatsAppCloudController.isKeywordTriggerMatch(
        'hello',
        'hello world',
        ['hello', 'world']
      );
      expect(result).toBe(true);
    });

    it('should match keyword phrase', () => {
      const result = WhatsAppCloudController.isKeywordTriggerMatch(
        'hello world',
        'hello world everyone',
        ['hello', 'world', 'everyone']
      );
      expect(result).toBe(true);
    });

    it('should not match partial keyword', () => {
      const result = WhatsAppCloudController.isKeywordTriggerMatch(
        'hello',
        'helloworld',
        ['helloworld']
      );
      expect(result).toBe(false);
    });

    it('should handle empty trigger', () => {
      const result = WhatsAppCloudController.isKeywordTriggerMatch(
        '',
        'hello world',
        ['hello', 'world']
      );
      expect(result).toBe(false);
    });
  });

  describe('getStartNode', () => {
    it('should find start node in flow', () => {
      const flow = {
        nodes: [
          { id: '1', type: 'message' },
          { id: '2', type: 'start' },
          { id: '3', type: 'button' }
        ]
      };

      const result = WhatsAppCloudController.getStartNode(flow);
      expect(result).toEqual({ id: '2', type: 'start' });
    });

    it('should return null if no start node', () => {
      const flow = {
        nodes: [
          { id: '1', type: 'message' },
          { id: '3', type: 'button' }
        ]
      };

      const result = WhatsAppCloudController.getStartNode(flow);
      expect(result).toBeNull();
    });

    it('should handle empty nodes array', () => {
      const flow = { nodes: [] };
      const result = WhatsAppCloudController.getStartNode(flow);
      expect(result).toBeNull();
    });
  });

  describe('getNextNodeId', () => {
    it('should get next node from connections', () => {
      const flow = {
        connections: [
          { source: '1', target: '2' },
          { source: '2', target: '3' }
        ]
      };

      const result = WhatsAppCloudController.getNextNodeId(flow, '1');
      expect(result).toBe('2');
    });

    it('should return null if no connection found', () => {
      const flow = {
        connections: [
          { source: '1', target: '2' }
        ]
      };

      const result = WhatsAppCloudController.getNextNodeId(flow, '3');
      expect(result).toBeNull();
    });

    it('should handle empty connections', () => {
      const flow = { connections: [] };
      const result = WhatsAppCloudController.getNextNodeId(flow, '1');
      expect(result).toBeNull();
    });
  });

  describe('parseAudienceNumbers', () => {
    it('should parse comma-separated numbers', () => {
      const result = WhatsAppCloudController.parseAudienceNumbers('+1234567890, +0987654321');
      expect(result).toEqual(['+1234567890', '+0987654321']);
    });

    it('should parse newline-separated numbers', () => {
      const result = WhatsAppCloudController.parseAudienceNumbers('+1234567890\n+0987654321');
      expect(result).toEqual(['+1234567890', '+0987654321']);
    });

    it('should remove duplicates', () => {
      const result = WhatsAppCloudController.parseAudienceNumbers('+1234567890, +1234567890');
      expect(result).toEqual(['+1234567890']);
    });

    it('should handle empty string', () => {
      const result = WhatsAppCloudController.parseAudienceNumbers('');
      expect(result).toEqual([]);
    });

    it('should trim whitespace', () => {
      const result = WhatsAppCloudController.parseAudienceNumbers('  +1234567890  ,  +0987654321  ');
      expect(result).toEqual(['+1234567890', '+0987654321']);
    });
  });
});
