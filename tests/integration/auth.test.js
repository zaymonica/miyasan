/**
 * Authentication Integration Tests
 * Tests the complete authentication flow
 */

const request = require('supertest');
const { app } = require('../../server');
const { pool } = require('../../config/database');

describe('Authentication Integration Tests', () => {
  beforeAll(async () => {
    // Setup test database if needed
    // This would typically connect to a test database
  });

  afterAll(async () => {
    // Cleanup
    if (pool && pool.end) {
      await pool.end();
    }
  });

  describe('POST /api/auth/superadmin/login', () => {
    it('should return 400 for missing credentials', async () => {
      const response = await request(app)
        .post('/api/auth/superadmin/login')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should return 401 for invalid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/superadmin/login')
        .send({
          email: 'wrong@email.com',
          password: 'wrongpassword'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/auth/verify', () => {
    it('should return 401 without token', async () => {
      const response = await request(app)
        .get('/api/auth/verify');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should return 401 with invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/verify')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });
});
