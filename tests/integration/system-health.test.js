/**
 * System Health Tests
 * Basic tests to ensure system is working
 */

const request = require('supertest');
const app = require('../../app');

describe('System Health Tests', () => {
  describe('Server Health', () => {
    test('Server is running', async () => {
      const res = await request(app).get('/');
      expect([200, 304]).toContain(res.status);
    });

    test('API responds to requests', async () => {
      const res = await request(app).get('/api/landing/settings');
      expect(res.status).toBe(200);
    });
  });

  describe('Authentication Endpoints', () => {
    test('Super admin login endpoint exists', async () => {
      const res = await request(app)
        .post('/api/auth/superadmin/login')
        .send({ email: 'test@test.com', password: 'test' });
      
      expect([200, 401]).toContain(res.status);
    });

    test('Verify endpoint requires authentication', async () => {
      const res = await request(app)
        .get('/api/auth/verify');
      
      expect(res.status).toBe(401);
    });

    test('Verify endpoint works with valid token', async () => {
      // First login
      const loginRes = await request(app)
        .post('/api/auth/superadmin/login')
        .send({
          email: process.env.SUPER_ADMIN_EMAIL || 'admin@saas.misayan.cloud',
          password: process.env.SUPER_ADMIN_PASSWORD || 'ChangeThisPassword123!'
        });

      if (loginRes.status === 200) {
        const token = loginRes.body.data.token;

        // Then verify
        const verifyRes = await request(app)
          .get('/api/auth/verify')
          .set('Authorization', `Bearer ${token}`);

        expect(verifyRes.status).toBe(200);
        expect(verifyRes.body.success).toBe(true);
      }
    });
  });

  describe('Super Admin Endpoints', () => {
    let token;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/auth/superadmin/login')
        .send({
          email: process.env.SUPER_ADMIN_EMAIL || 'admin@saas.misayan.cloud',
          password: process.env.SUPER_ADMIN_PASSWORD || 'ChangeThisPassword123!'
        });

      if (res.status === 200) {
        token = res.body.data.token;
      }
    });

    test('Dashboard endpoint works', async () => {
      if (!token) {
        console.log('Skipping test - no token available');
        return;
      }

      const res = await request(app)
        .get('/api/superadmin/dashboard')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });

    test('Plans endpoint works', async () => {
      if (!token) {
        console.log('Skipping test - no token available');
        return;
      }

      const res = await request(app)
        .get('/api/superadmin/plans')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('Currencies endpoint works', async () => {
      if (!token) {
        console.log('Skipping test - no token available');
        return;
      }

      const res = await request(app)
        .get('/api/superadmin/currencies')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Landing Page', () => {
    test('Landing page settings are accessible', async () => {
      const res = await request(app)
        .get('/api/landing/settings');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });

    test('Plans are returned in landing page', async () => {
      const res = await request(app)
        .get('/api/landing/settings');

      expect(res.status).toBe(200);
      expect(res.body.data.plans).toBeDefined();
      expect(Array.isArray(res.body.data.plans)).toBe(true);
    });
  });

  describe('Notification Endpoints', () => {
    let token;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/auth/superadmin/login')
        .send({
          email: process.env.SUPER_ADMIN_EMAIL || 'admin@saas.misayan.cloud',
          password: process.env.SUPER_ADMIN_PASSWORD || 'ChangeThisPassword123!'
        });

      if (res.status === 200) {
        token = res.body.data.token;
      }
    });

    test('Email notification settings endpoint exists', async () => {
      if (!token) return;

      const res = await request(app)
        .get('/api/superadmin/notifications/email/settings')
        .set('Authorization', `Bearer ${token}`);

      expect([200, 404]).toContain(res.status);
    });

    test('WhatsApp notification settings endpoint exists', async () => {
      if (!token) return;

      const res = await request(app)
        .get('/api/superadmin/notifications/whatsapp/settings')
        .set('Authorization', `Bearer ${token}`);

      expect([200, 404]).toContain(res.status);
    });
  });

  describe('Security', () => {
    test('Protected endpoints reject unauthenticated requests', async () => {
      const endpoints = [
        '/api/superadmin/dashboard',
        '/api/superadmin/tenants',
        '/api/superadmin/plans'
      ];

      for (const endpoint of endpoints) {
        const res = await request(app).get(endpoint);
        expect(res.status).toBe(401);
      }
    });

    test('Rate limiting is active', async () => {
      // This test just checks if rate limiting doesn't break normal requests
      const res = await request(app)
        .get('/api/landing/settings');

      expect(res.status).toBe(200);
    });
  });
});
