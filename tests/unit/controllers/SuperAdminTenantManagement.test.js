/**
 * Super Admin Tenant Management Tests
 * Tests for tenant CRUD operations and resource management
 */

const request = require('supertest');
const app = require('../../../app');
const { pool } = require('../../../config/database');

describe('Super Admin - Tenant Management', () => {
  let superAdminToken;
  let testTenantId;
  let testPlanId;

  beforeAll(async () => {
    // Login as super admin
    const loginResponse = await request(app)
      .post('/api/superadmin/login')
      .send({
        email: process.env.SUPER_ADMIN_EMAIL || 'admin@saas.misayan.cloud',
        password: process.env.SUPER_ADMIN_PASSWORD || 'ChangeThisPassword123!'
      });

    superAdminToken = loginResponse.body.token;

    // Get a test plan
    const [plans] = await pool.execute('SELECT id FROM subscription_plans LIMIT 1');
    testPlanId = plans[0].id;
  });

  afterAll(async () => {
    // Cleanup test tenant
    if (testTenantId) {
      await pool.execute('DELETE FROM tenants WHERE id = ?', [testTenantId]);
    }
    await pool.end();
  });

  describe('GET /api/superadmin/tenants', () => {
    it('should get all tenants with pagination', async () => {
      const response = await request(app)
        .get('/api/superadmin/tenants')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .query({ page: 1, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.tenants).toBeDefined();
      expect(response.body.pagination).toBeDefined();
      expect(response.body.pagination.page).toBe(1);
    });

    it('should filter tenants by status', async () => {
      const response = await request(app)
        .get('/api/superadmin/tenants')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .query({ status: 'active' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should search tenants', async () => {
      const response = await request(app)
        .get('/api/superadmin/tenants')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .query({ search: 'test' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /api/superadmin/tenants', () => {
    it('should create a new tenant', async () => {
      const response = await request(app)
        .post('/api/superadmin/tenants')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          name: 'Test Tenant',
          subdomain: `test-${Date.now()}`,
          email: `test-${Date.now()}@example.com`,
          phone: '+1234567890',
          company_name: 'Test Company',
          plan_id: testPlanId,
          admin_username: `admin-${Date.now()}`,
          admin_password: 'TestPassword123!',
          admin_email: `admin-${Date.now()}@example.com`
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.tenant_id).toBeDefined();
      testTenantId = response.body.tenant_id;
    });

    it('should fail with duplicate subdomain', async () => {
      const subdomain = `duplicate-${Date.now()}`;
      
      // Create first tenant
      await request(app)
        .post('/api/superadmin/tenants')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          name: 'First Tenant',
          subdomain,
          email: `first-${Date.now()}@example.com`,
          plan_id: testPlanId,
          admin_username: `admin1-${Date.now()}`,
          admin_password: 'TestPassword123!'
        });

      // Try to create second tenant with same subdomain
      const response = await request(app)
        .post('/api/superadmin/tenants')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          name: 'Second Tenant',
          subdomain,
          email: `second-${Date.now()}@example.com`,
          plan_id: testPlanId,
          admin_username: `admin2-${Date.now()}`,
          admin_password: 'TestPassword123!'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should fail with missing required fields', async () => {
      const response = await request(app)
        .post('/api/superadmin/tenants')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          name: 'Incomplete Tenant'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/superadmin/tenants/:id', () => {
    it('should get tenant details', async () => {
      const response = await request(app)
        .get(`/api/superadmin/tenants/${testTenantId}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.tenant).toBeDefined();
      expect(response.body.statistics).toBeDefined();
    });

    it('should return 404 for non-existent tenant', async () => {
      const response = await request(app)
        .get('/api/superadmin/tenants/999999')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /api/superadmin/tenants/:id', () => {
    it('should update tenant information', async () => {
      const response = await request(app)
        .put(`/api/superadmin/tenants/${testTenantId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          name: 'Updated Tenant Name',
          phone: '+9876543210'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should update tenant status', async () => {
      const response = await request(app)
        .put(`/api/superadmin/tenants/${testTenantId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          status: 'suspended'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should update tenant resource limits', async () => {
      const response = await request(app)
        .put(`/api/superadmin/tenants/${testTenantId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          max_users: 10,
          max_conversations: 2000,
          max_messages_per_month: 20000
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/superadmin/tenants/:id/usage', () => {
    it('should get tenant usage statistics', async () => {
      const response = await request(app)
        .get(`/api/superadmin/tenants/${testTenantId}/usage`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.limits).toBeDefined();
      expect(response.body.current).toBeDefined();
      expect(response.body.percentages).toBeDefined();
    });
  });

  describe('PUT /api/superadmin/tenants/:id/features/:feature', () => {
    it('should toggle tenant feature', async () => {
      const response = await request(app)
        .put(`/api/superadmin/tenants/${testTenantId}/features/ai_enabled`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          enabled: true
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should fail with invalid feature name', async () => {
      const response = await request(app)
        .put(`/api/superadmin/tenants/${testTenantId}/features/invalid_feature`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          enabled: true
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/superadmin/tenants/:id/reset-messages', () => {
    it('should reset tenant message counter', async () => {
      const response = await request(app)
        .post(`/api/superadmin/tenants/${testTenantId}/reset-messages`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('DELETE /api/superadmin/tenants/:id', () => {
    it('should delete tenant', async () => {
      // Create a tenant to delete
      const createResponse = await request(app)
        .post('/api/superadmin/tenants')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          name: 'Tenant to Delete',
          subdomain: `delete-${Date.now()}`,
          email: `delete-${Date.now()}@example.com`,
          plan_id: testPlanId,
          admin_username: `admin-delete-${Date.now()}`,
          admin_password: 'TestPassword123!'
        });

      const tenantToDelete = createResponse.body.tenant_id;

      const response = await request(app)
        .delete(`/api/superadmin/tenants/${tenantToDelete}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should return 404 for non-existent tenant', async () => {
      const response = await request(app)
        .delete('/api/superadmin/tenants/999999')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Authorization', () => {
    it('should deny access without token', async () => {
      const response = await request(app)
        .get('/api/superadmin/tenants');

      expect(response.status).toBe(401);
    });

    it('should deny access with invalid token', async () => {
      const response = await request(app)
        .get('/api/superadmin/tenants')
        .set('Authorization', 'Bearer invalid_token');

      expect(response.status).toBe(401);
    });
  });
});
