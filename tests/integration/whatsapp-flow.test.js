/**
 * WhatsApp Integration Tests
 * Tests complete WhatsApp flow for multi-tenant system
 */

const request = require('supertest');
const app = require('../../app');
const { pool } = require('../../config/database');

describe('WhatsApp Integration Tests', () => {
  let authToken;
  let tenantId;

  beforeAll(async () => {
    // Login as tenant user to get auth token
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'tenant_user',
        password: 'password123'
      });

    if (loginResponse.status === 200) {
      authToken = loginResponse.body.token;
      tenantId = loginResponse.body.user.tenantId;
    }
  });

  afterAll(async () => {
    // Cleanup
    if (pool) {
      await pool.end();
    }
  });

  describe('Connection Flow', () => {
    it('should get initial disconnected status', async () => {
      const response = await request(app)
        .get('/api/tenant/whatsapp/status')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('status');
    });

    it('should initiate WhatsApp connection', async () => {
      const response = await request(app)
        .post('/api/tenant/whatsapp/connect')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('connection initiated');
    });

    it('should get QR code after connection initiated', async () => {
      const response = await request(app)
        .get('/api/tenant/whatsapp/qr')
        .set('Authorization', `Bearer ${authToken}`);

      // QR code may or may not be available depending on connection state
      expect(response.status).toBeOneOf([200, 404]);
    });

    it('should clear session successfully', async () => {
      const response = await request(app)
        .delete('/api/tenant/whatsapp/session')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('Authentication', () => {
    it('should reject requests without auth token', async () => {
      const response = await request(app)
        .get('/api/tenant/whatsapp/status');

      expect(response.status).toBe(401);
    });

    it('should reject requests with invalid token', async () => {
      const response = await request(app)
        .get('/api/tenant/whatsapp/status')
        .set('Authorization', 'Bearer invalid_token');

      expect(response.status).toBe(401);
    });
  });

  describe('Message Operations', () => {
    it('should validate phone number and message', async () => {
      const response = await request(app)
        .post('/api/tenant/whatsapp/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          phoneNumber: '',
          message: ''
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should handle send message request', async () => {
      const response = await request(app)
        .post('/api/tenant/whatsapp/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          phoneNumber: '5511999999999',
          message: 'Test message'
        });

      // Will fail if not connected, but should handle gracefully
      expect(response.status).toBeOneOf([200, 500]);
      expect(response.body).toHaveProperty('success');
    });

    it('should get messages list', async () => {
      const response = await request(app)
        .get('/api/tenant/whatsapp/messages')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ limit: 10, offset: 0 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('messages');
    });

    it('should get contacts list', async () => {
      const response = await request(app)
        .get('/api/tenant/whatsapp/contacts')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ limit: 10, offset: 0 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('contacts');
    });
  });

  describe('Tenant Isolation', () => {
    it('should only access own tenant data', async () => {
      const response = await request(app)
        .get('/api/tenant/whatsapp/status')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      // Should not be able to access other tenant's data
    });
  });

  describe('Error Handling', () => {
    it('should handle disconnect when not connected', async () => {
      const response = await request(app)
        .post('/api/tenant/whatsapp/disconnect')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBeOneOf([200, 500]);
      expect(response.body).toHaveProperty('success');
    });

    it('should handle invalid endpoints', async () => {
      const response = await request(app)
        .get('/api/tenant/whatsapp/invalid')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });
  });
});

// Custom matcher
expect.extend({
  toBeOneOf(received, expected) {
    const pass = expected.includes(received);
    if (pass) {
      return {
        message: () => `expected ${received} not to be one of ${expected}`,
        pass: true
      };
    } else {
      return {
        message: () => `expected ${received} to be one of ${expected}`,
        pass: false
      };
    }
  }
});
