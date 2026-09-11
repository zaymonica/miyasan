/**
 * Complete Flow Integration Tests
 * Tests end-to-end user journeys
 */

const request = require('supertest');
const app = require('../../app');
const { pool } = require('../../config/database');

describe('Complete Flow Tests', () => {
  let superAdminToken;
  let tenantId;
  let planId;
  let tenantAdminToken;

  describe('Super Admin Flow', () => {
    test('Super admin can login', async () => {
      const res = await request(app)
        .post('/api/auth/superadmin/login')
        .send({
          email: process.env.SUPER_ADMIN_EMAIL || 'admin@saas.misayan.cloud',
          password: process.env.SUPER_ADMIN_PASSWORD || 'ChangeThisPassword123!'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      
      superAdminToken = res.body.data.token;
    });

    test('Super admin can view dashboard', async () => {
      const res = await request(app)
        .get('/api/superadmin/dashboard')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.tenants).toBeDefined();
      expect(res.body.data.revenue).toBeDefined();
    });

    test('Super admin can create subscription plan', async () => {
      const res = await request(app)
        .post('/api/superadmin/plans')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          name: 'Test Plan',
          description: 'Test plan description',
          price: 49.99,
          currency: 'USD',
          billing_period: 'monthly',
          max_users: 10,
          max_conversations: 1000,
          max_messages_per_month: 10000,
          features: { whatsapp: true, ai: true }
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      
      planId = res.body.data.id;
    });

    test('Super admin can create tenant', async () => {
      const res = await request(app)
        .post('/api/superadmin/tenants')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          name: 'Test Company',
          subdomain: 'testcompany',
          email: 'test@company.com',
          phone: '+1234567890',
          plan_id: planId,
          admin_name: 'Test Admin',
          admin_email: 'admin@testcompany.com',
          admin_password: 'TestPass123!'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.tenant).toBeDefined();
      
      tenantId = res.body.data.tenant.id;
    });
  });

  describe('Tenant Admin Flow', () => {
    test('Tenant admin can login', async () => {
      const res = await request(app)
        .post('/api/auth/admin/login')
        .send({
          email: 'admin@testcompany.com',
          password: 'TestPass123!',
          subdomain: 'testcompany'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      
      tenantAdminToken = res.body.data.token;
    });

    test('Tenant admin can view dashboard', async () => {
      const res = await request(app)
        .get('/api/tenant/dashboard')
        .set('Authorization', `Bearer ${tenantAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.metrics).toBeDefined();
    });

    test('Tenant admin can create contact', async () => {
      const res = await request(app)
        .post('/api/tenant/contacts')
        .set('Authorization', `Bearer ${tenantAdminToken}`)
        .send({
          name: 'John Doe',
          phone: '+1234567890',
          email: 'john@example.com'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    test('Tenant admin can create FAQ', async () => {
      const res = await request(app)
        .post('/api/tenant/faqs')
        .set('Authorization', `Bearer ${tenantAdminToken}`)
        .send({
          question: 'What are your hours?',
          answer: 'We are open 9-5 Monday to Friday',
          emoji: '🕐'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    test('Tenant admin can view contacts', async () => {
      const res = await request(app)
        .get('/api/tenant/contacts')
        .set('Authorization', `Bearer ${tenantAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('Landing Page Flow', () => {
    test('Public can view landing page settings', async () => {
      const res = await request(app)
        .get('/api/landing/settings');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.plans).toBeDefined();
    });

    test('Landing page shows created plan', async () => {
      const res = await request(app)
        .get('/api/landing/settings');

      const testPlan = res.body.data.plans.find(p => p.name === 'Test Plan');
      expect(testPlan).toBeDefined();
      expect(testPlan.price).toBe('49.99');
    });
  });

  describe('Cleanup', () => {
    test('Super admin can delete tenant', async () => {
      const res = await request(app)
        .delete(`/api/superadmin/tenants/${tenantId}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('Super admin can delete plan', async () => {
      const res = await request(app)
        .delete(`/api/superadmin/plans/${planId}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
