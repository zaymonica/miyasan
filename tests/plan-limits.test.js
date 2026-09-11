/**
 * Plan Limits System Tests
 * Tests resource limit enforcement
 */

const request = require('supertest');
const { pool } = require('../config/database');
const bcrypt = require('bcryptjs');

describe('Plan Limits System', () => {
  let app;
  let tenantId;
  let adminToken;
  let planId;

  beforeAll(async () => {
    // Import app
    app = require('../server');

    // Create test plan with low limits
    const [planResult] = await pool.execute(
      `INSERT INTO subscription_plans (
        name, price, max_stores, max_users, max_departments, 
        max_contacts, max_faqs, max_contact_groups
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['Test Plan', 0, 2, 3, 2, 5, 3, 2]
    );
    planId = planResult.insertId;

    // Create test tenant with the plan
    const [tenantResult] = await pool.execute(
      `INSERT INTO tenants (
        name, subdomain, email, plan_id, status
      ) VALUES (?, ?, ?, ?, ?)`,
      ['Test Tenant', 'testlimits', 'test@limits.com', planId, 'active']
    );
    tenantId = tenantResult.insertId;

    // Create admin user
    const hashedPassword = await bcrypt.hash('test123', 10);
    const [adminResult] = await pool.execute(
      `INSERT INTO admins (tenant_id, email, password, name, role)
       VALUES (?, ?, ?, ?, ?)`,
      [tenantId, 'admin@test.com', hashedPassword, 'Test Admin', 'admin']
    );

    // Login to get token
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@test.com',
        password: 'test123'
      });

    adminToken = loginRes.body.token;
  });

  afterAll(async () => {
    // Cleanup
    await pool.execute('DELETE FROM admins WHERE tenant_id = ?', [tenantId]);
    await pool.execute('DELETE FROM stores WHERE tenant_id = ?', [tenantId]);
    await pool.execute('DELETE FROM users WHERE tenant_id = ?', [tenantId]);
    await pool.execute('DELETE FROM departments WHERE tenant_id = ?', [tenantId]);
    await pool.execute('DELETE FROM tenants WHERE id = ?', [tenantId]);
    await pool.execute('DELETE FROM subscription_plans WHERE id = ?', [planId]);
    await pool.end();
  });

  describe('Store Limits', () => {
    test('Should allow creating stores within limit', async () => {
      // Create first store (limit is 2)
      const res1 = await request(app)
        .post('/api/tenant/stores')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Store 1' });

      expect(res1.status).toBe(201);
      expect(res1.body.success).toBe(true);

      // Create second store
      const res2 = await request(app)
        .post('/api/tenant/stores')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Store 2' });

      expect(res2.status).toBe(201);
      expect(res2.body.success).toBe(true);
    });

    test('Should block creating stores beyond limit', async () => {
      // Try to create third store (should fail)
      const res = await request(app)
        .post('/api/tenant/stores')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Store 3' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Limite');
      expect(res.body.limit).toBeDefined();
      expect(res.body.limit.current).toBe(2);
      expect(res.body.limit.max).toBe(2);
    });
  });

  describe('User Limits', () => {
    test('Should allow creating users within limit', async () => {
      // Create first user (limit is 3)
      const res1 = await request(app)
        .post('/api/tenant/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          username: 'user1',
          password: 'pass123',
          store: 'Store 1'
        });

      expect(res1.status).toBe(201);
      expect(res1.body.success).toBe(true);
    });

    test('Should block creating users beyond limit', async () => {
      // Create users up to limit
      await request(app)
        .post('/api/tenant/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          username: 'user2',
          password: 'pass123',
          store: 'Store 1'
        });

      await request(app)
        .post('/api/tenant/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          username: 'user3',
          password: 'pass123',
          store: 'Store 1'
        });

      // Try to create fourth user (should fail)
      const res = await request(app)
        .post('/api/tenant/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          username: 'user4',
          password: 'pass123',
          store: 'Store 1'
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Limite');
    });
  });

  describe('Department Limits', () => {
    test('Should allow creating departments within limit', async () => {
      // Create first department (limit is 2)
      const res1 = await request(app)
        .post('/api/tenant/departments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Department 1' });

      expect(res1.status).toBe(201);
      expect(res1.body.success).toBe(true);

      // Create second department
      const res2 = await request(app)
        .post('/api/tenant/departments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Department 2' });

      expect(res2.status).toBe(201);
      expect(res2.body.success).toBe(true);
    });

    test('Should block creating departments beyond limit', async () => {
      // Try to create third department (should fail)
      const res = await request(app)
        .post('/api/tenant/departments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Department 3' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Limite');
    });
  });

  describe('Plan Limits API', () => {
    test('Should return plan limits and usage', async () => {
      const res = await request(app)
        .get('/api/tenant/plan-limits')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.plan).toBeDefined();
      expect(res.body.data.limits).toBeDefined();
      expect(res.body.data.usage).toBeDefined();
      expect(res.body.data.percentages).toBeDefined();

      // Check limits
      expect(res.body.data.limits.stores).toBe(2);
      expect(res.body.data.limits.users).toBe(3);
      expect(res.body.data.limits.departments).toBe(2);

      // Check usage
      expect(res.body.data.usage.stores).toBe(2);
      expect(res.body.data.usage.users).toBe(3);
      expect(res.body.data.usage.departments).toBe(2);

      // Check percentages
      expect(res.body.data.percentages.stores).toBe(100);
      expect(res.body.data.percentages.users).toBe(100);
      expect(res.body.data.percentages.departments).toBe(100);
    });

    test('Should return specific resource usage', async () => {
      const res = await request(app)
        .get('/api/tenant/plan-limits/stores')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.resource).toBe('stores');
      expect(res.body.data.current).toBe(2);
      expect(res.body.data.max).toBe(2);
      expect(res.body.data.remaining).toBe(0);
      expect(res.body.data.percentage).toBe(100);
      expect(res.body.data.canCreate).toBe(false);
    });
  });
});
