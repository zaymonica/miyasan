/**
 * Load Testing
 * Tests system performance under load
 */

const request = require('supertest');
const app = require('../../app');

describe('Load Tests', () => {
  let authToken;

  beforeAll(async () => {
    // Login as super admin
    const res = await request(app)
      .post('/api/auth/superadmin/login')
      .send({
        email: process.env.SUPER_ADMIN_EMAIL || 'admin@saas.misayan.cloud',
        password: process.env.SUPER_ADMIN_PASSWORD || 'ChangeThisPassword123!'
      });

    authToken = res.body.data.token;
  });

  describe('Concurrent Requests', () => {
    test('Handle 50 concurrent dashboard requests', async () => {
      const requests = Array(50).fill().map(() =>
        request(app)
          .get('/api/superadmin/dashboard')
          .set('Authorization', `Bearer ${authToken}`)
      );

      const responses = await Promise.all(requests);
      
      responses.forEach(res => {
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      });
    }, 30000);

    test('Handle 100 concurrent authentication requests', async () => {
      const requests = Array(100).fill().map(() =>
        request(app)
          .get('/api/auth/verify')
          .set('Authorization', `Bearer ${authToken}`)
      );

      const responses = await Promise.all(requests);
      
      const successCount = responses.filter(r => r.status === 200).length;
      expect(successCount).toBeGreaterThan(90); // Allow 10% failure rate
    }, 30000);
  });

  describe('Response Times', () => {
    test('Dashboard loads in under 1 second', async () => {
      const start = Date.now();
      
      const res = await request(app)
        .get('/api/superadmin/dashboard')
        .set('Authorization', `Bearer ${authToken}`);

      const duration = Date.now() - start;

      expect(res.status).toBe(200);
      expect(duration).toBeLessThan(1000);
    });

    test('API endpoints respond in under 500ms', async () => {
      const endpoints = [
        '/api/superadmin/plans',
        '/api/superadmin/currencies',
        '/api/landing/settings'
      ];

      for (const endpoint of endpoints) {
        const start = Date.now();
        
        await request(app)
          .get(endpoint)
          .set('Authorization', `Bearer ${authToken}`);

        const duration = Date.now() - start;
        expect(duration).toBeLessThan(500);
      }
    });
  });

  describe('Memory Usage', () => {
    test('Memory usage stays stable under load', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Make 1000 requests
      for (let i = 0; i < 1000; i++) {
        await request(app)
          .get('/api/auth/verify')
          .set('Authorization', `Bearer ${authToken}`);
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB

      // Memory increase should be less than 50MB
      expect(memoryIncrease).toBeLessThan(50);
    }, 60000);
  });

  describe('Rate Limiting', () => {
    test('Rate limiter blocks excessive requests', async () => {
      const requests = Array(150).fill().map(() =>
        request(app)
          .post('/api/auth/superadmin/login')
          .send({ email: 'test@test.com', password: 'wrong' })
      );

      const responses = await Promise.all(requests);
      
      const blockedCount = responses.filter(r => r.status === 429).length;
      expect(blockedCount).toBeGreaterThan(0);
    }, 30000);
  });
});
