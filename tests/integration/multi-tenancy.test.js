/**
 * Multi-Tenancy Integration Tests
 * Tests tenant isolation and data segregation
 */

const request = require('supertest');
const app = require('../../app');
const { pool } = require('../../config/database');

describe('Multi-Tenancy Tests', () => {
  let tenant1Token, tenant2Token;
  let tenant1Id, tenant2Id;

  beforeAll(async () => {
    // Create test tenants
    const [tenant1] = await pool.execute(
      `INSERT INTO tenants (name, subdomain, email, status) 
       VALUES ('Tenant 1', 'tenant1test', 'tenant1@test.com', 'active')`
    );
    tenant1Id = tenant1.insertId;

    const [tenant2] = await pool.execute(
      `INSERT INTO tenants (name, subdomain, email, status) 
       VALUES ('Tenant 2', 'tenant2test', 'tenant2@test.com', 'active')`
    );
    tenant2Id = tenant2.insertId;

    // Create admin users for each tenant
    const bcrypt = require('bcryptjs');
    const password = await bcrypt.hash('test123', 12);

    await pool.execute(
      `INSERT INTO admins (tenant_id, username, email, password, name) 
       VALUES (?, 'admin1', 'admin1@test.com', ?, 'Admin 1')`,
      [tenant1Id, password]
    );

    await pool.execute(
      `INSERT INTO admins (tenant_id, username, email, password, name) 
       VALUES (?, 'admin2', 'admin2@test.com', ?, 'Admin 2')`,
      [tenant2Id, password]
    );

    // Login both tenants
    const res1 = await request(app)
      .post('/api/auth/admin/login')
      .send({ email: 'admin1@test.com', password: 'test123', subdomain: 'tenant1test' });
    tenant1Token = res1.body.data.token;

    const res2 = await request(app)
      .post('/api/auth/admin/login')
      .send({ email: 'admin2@test.com', password: 'test123', subdomain: 'tenant2test' });
    tenant2Token = res2.body.data.token;
  });

  afterAll(async () => {
    // Cleanup
    await pool.execute('DELETE FROM tenants WHERE id IN (?, ?)', [tenant1Id, tenant2Id]);
    await pool.end();
  });

  describe('Data Isolation', () => {
    test('Tenant 1 cannot access Tenant 2 data', async () => {
      // Create contact for Tenant 2
      await request(app)
        .post('/api/tenant/contacts')
        .set('Authorization', `Bearer ${tenant2Token}`)
        .send({ name: 'Contact T2', phone: '+1234567890' });

      // Try to access from Tenant 1
      const res = await request(app)
        .get('/api/tenant/contacts')
        .set('Authorization', `Bearer ${tenant1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    test('Tenant 2 cannot access Tenant 1 data', async () => {
      // Create contact for Tenant 1
      await request(app)
        .post('/api/tenant/contacts')
        .set('Authorization', `Bearer ${tenant1Token}`)
        .send({ name: 'Contact T1', phone: '+0987654321' });

      // Try to access from Tenant 2
      const res = await request(app)
        .get('/api/tenant/contacts')
        .set('Authorization', `Bearer ${tenant2Token}`);

      expect(res.status).toBe(200);
      const hasT1Contact = res.body.data.some(c => c.phone === '+0987654321');
      expect(hasT1Contact).toBe(false);
    });
  });

  describe('Tenant Context', () => {
    test('Requests without tenant context are rejected', async () => {
      const res = await request(app)
        .get('/api/tenant/contacts')
        .set('Authorization', 'Bearer invalid_token');

      expect(res.status).toBe(401);
    });

    test('Tenant ID is correctly extracted from token', async () => {
      const res = await request(app)
        .get('/api/tenant/dashboard')
        .set('Authorization', `Bearer ${tenant1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Resource Limits', () => {
    test('Tenant cannot exceed max users limit', async () => {
      // Set low limit
      await pool.execute('UPDATE tenants SET max_users = 1 WHERE id = ?', [tenant1Id]);

      // Try to create second user
      const res = await request(app)
        .post('/api/tenant/users')
        .set('Authorization', `Bearer ${tenant1Token}`)
        .send({ username: 'user2', password: 'test123', name: 'User 2' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('limit');
    });
  });
});
