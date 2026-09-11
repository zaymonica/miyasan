/**
 * Invoice Routes Integration Tests
 */

const request = require('supertest');
const app = require('../../server');
const { pool } = require('../../config/database');
const jwt = require('jsonwebtoken');

describe('Invoice Routes Integration Tests', () => {
  let authToken;
  let tenantId;
  let userId;
  let invoiceId;
  let clientEmail;

  beforeAll(async () => {
    // Create test tenant
    const [tenantResult] = await pool.execute(
      `INSERT INTO tenants (name, subdomain, email, status) 
       VALUES ('Test Tenant', 'test-invoices', 'test@invoices.com', 'active')`
    );
    tenantId = tenantResult.insertId;

    // Create test user
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash('testpass123', 10);
    const [userResult] = await pool.execute(
      `INSERT INTO users (tenant_id, username, email, password, role) 
       VALUES (?, 'testuser', 'user@test.com', ?, 'admin')`,
      [tenantId, hashedPassword]
    );
    userId = userResult.insertId;

    // Generate auth token
    authToken = jwt.sign(
      { id: userId, tenantId, role: 'admin' },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );

    clientEmail = 'client@test.com';
  });

  afterAll(async () => {
    // Cleanup
    await pool.execute('DELETE FROM invoices WHERE tenant_id = ?', [tenantId]);
    await pool.execute('DELETE FROM invoice_clients WHERE tenant_id = ?', [tenantId]);
    await pool.execute('DELETE FROM users WHERE id = ?', [userId]);
    await pool.execute('DELETE FROM tenants WHERE id = ?', [tenantId]);
    await pool.end();
  });

  describe('POST /api/invoices/admin', () => {
    it('should create invoice successfully', async () => {
      const invoiceData = {
        type: 'invoice',
        title: 'Test Invoice',
        description: 'Test description',
        currency: 'USD',
        tax_rate: 10,
        discount_type: 'fixed',
        discount_value: 50,
        payment_method: 'paypal',
        client: {
          name: 'John Doe',
          email: clientEmail,
          phone: '+5511999999999',
          company_name: 'Acme Corp'
        },
        items: [
          {
            description: 'Frontend Development',
            quantity: 1,
            unit_price: 2000
          },
          {
            description: 'Backend Development',
            quantity: 1,
            unit_price: 3000
          }
        ]
      };

      const response = await request(app)
        .post('/api/invoices/admin')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invoiceData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.invoice).toBeDefined();
      expect(response.body.invoice.invoice_number).toMatch(/^INV-\d{4}-\d{5}$/);
      expect(response.body.invoice.title).toBe('Test Invoice');
      expect(response.body.invoice.items).toHaveLength(2);
      expect(parseFloat(response.body.invoice.subtotal)).toBe(5000);
      expect(parseFloat(response.body.invoice.tax_amount)).toBe(500);
      expect(parseFloat(response.body.invoice.discount_amount)).toBe(50);
      expect(parseFloat(response.body.invoice.total_amount)).toBe(5450);

      invoiceId = response.body.invoice.id;
    });

    it('should return 400 if no items provided', async () => {
      const response = await request(app)
        .post('/api/invoices/admin')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          type: 'invoice',
          title: 'Test',
          client: { name: 'John', email: 'john@test.com', phone: '+5511999999999' },
          items: []
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('item');
    });

    it('should return 401 without auth token', async () => {
      await request(app)
        .post('/api/invoices/admin')
        .send({
          type: 'invoice',
          title: 'Test',
          client: { name: 'John', email: 'john@test.com', phone: '+5511999999999' },
          items: [{ description: 'Item', quantity: 1, unit_price: 100 }]
        })
        .expect(401);
    });
  });

  describe('GET /api/invoices/admin', () => {
    it('should list invoices', async () => {
      const response = await request(app)
        .get('/api/invoices/admin')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.invoices).toBeDefined();
      expect(Array.isArray(response.body.invoices)).toBe(true);
      expect(response.body.pagination).toBeDefined();
    });

    it('should filter by type', async () => {
      const response = await request(app)
        .get('/api/invoices/admin?type=invoice')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      response.body.invoices.forEach(inv => {
        expect(inv.type).toBe('invoice');
      });
    });

    it('should filter by status', async () => {
      const response = await request(app)
        .get('/api/invoices/admin?status=draft')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      response.body.invoices.forEach(inv => {
        expect(inv.status).toBe('draft');
      });
    });

    it('should search invoices', async () => {
      const response = await request(app)
        .get('/api/invoices/admin?search=Test')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/invoices/admin/:id', () => {
    it('should get invoice by id', async () => {
      const response = await request(app)
        .get(`/api/invoices/admin/${invoiceId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.invoice).toBeDefined();
      expect(response.body.invoice.id).toBe(invoiceId);
      expect(response.body.invoice.items).toBeDefined();
      expect(response.body.invoice.logs).toBeDefined();
    });

    it('should return 404 for non-existent invoice', async () => {
      const response = await request(app)
        .get('/api/invoices/admin/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /api/invoices/admin/:id/status', () => {
    it('should update invoice status', async () => {
      const response = await request(app)
        .put(`/api/invoices/admin/${invoiceId}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'sent' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('updated');

      // Verify status was updated
      const [rows] = await pool.execute(
        'SELECT status FROM invoices WHERE id = ?',
        [invoiceId]
      );
      expect(rows[0].status).toBe('sent');
    });

    it('should return 400 for invalid status', async () => {
      await request(app)
        .put(`/api/invoices/admin/${invoiceId}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'invalid_status' })
        .expect(400);
    });
  });

  describe('GET /api/invoices/admin/statistics', () => {
    it('should return statistics', async () => {
      const response = await request(app)
        .get('/api/invoices/admin/statistics')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.statistics).toBeDefined();
      expect(response.body.statistics.total_invoices).toBeDefined();
      expect(response.body.statistics.total_paid).toBeDefined();
    });
  });

  describe('POST /api/invoices/admin/:id/convert-to-invoice', () => {
    let quoteId;

    beforeAll(async () => {
      // Create a quote
      const quoteData = {
        type: 'quote',
        title: 'Test Quote',
        currency: 'USD',
        client: {
          name: 'Jane Doe',
          email: 'jane@test.com',
          phone: '+5511888888888'
        },
        items: [
          { description: 'Service', quantity: 1, unit_price: 1000 }
        ]
      };

      const response = await request(app)
        .post('/api/invoices/admin')
        .set('Authorization', `Bearer ${authToken}`)
        .send(quoteData);

      quoteId = response.body.invoice.id;

      // Update quote to accepted
      await pool.execute(
        'UPDATE invoices SET status = ? WHERE id = ?',
        ['accepted', quoteId]
      );
    });

    it('should convert quote to invoice', async () => {
      const response = await request(app)
        .post(`/api/invoices/admin/${quoteId}/convert-to-invoice`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.invoice).toBeDefined();
      expect(response.body.invoice.type).toBe('invoice');
      expect(response.body.invoice.invoice_number).toMatch(/^INV-/);
    });
  });

  describe('Public Routes', () => {
    let invoiceNumber;

    beforeAll(async () => {
      // Get invoice number
      const [rows] = await pool.execute(
        'SELECT invoice_number FROM invoices WHERE id = ?',
        [invoiceId]
      );
      invoiceNumber = rows[0].invoice_number;
    });

    describe('GET /api/invoices/public/:invoice_number', () => {
      it('should get invoice with valid email', async () => {
        const response = await request(app)
          .get(`/api/invoices/public/${invoiceNumber}?email=${clientEmail}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.invoice).toBeDefined();
        expect(response.body.invoice.invoice_number).toBe(invoiceNumber);
      });

      it('should return 401 with invalid email', async () => {
        const response = await request(app)
          .get(`/api/invoices/public/${invoiceNumber}?email=wrong@email.com`)
          .expect(401);

        expect(response.body.success).toBe(false);
      });

      it('should return 404 for non-existent invoice', async () => {
        const response = await request(app)
          .get('/api/invoices/public/INV-9999-99999?email=test@test.com')
          .expect(404);

        expect(response.body.success).toBe(false);
      });
    });

    describe('POST /api/invoices/public/:invoice_number/accept', () => {
      it('should accept invoice', async () => {
        const response = await request(app)
          .post(`/api/invoices/public/${invoiceNumber}/accept`)
          .send({ email: clientEmail })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toContain('accepted');

        // Verify status
        const [rows] = await pool.execute(
          'SELECT status FROM invoices WHERE invoice_number = ?',
          [invoiceNumber]
        );
        expect(rows[0].status).toBe('accepted');
      });
    });

    describe('POST /api/invoices/public/:invoice_number/reject', () => {
      let rejectInvoiceNumber;

      beforeAll(async () => {
        // Create another invoice to reject
        const invoiceData = {
          type: 'invoice',
          title: 'Invoice to Reject',
          currency: 'USD',
          client: {
            name: 'Test Client',
            email: 'reject@test.com',
            phone: '+5511777777777'
          },
          items: [{ description: 'Item', quantity: 1, unit_price: 500 }]
        };

        const response = await request(app)
          .post('/api/invoices/admin')
          .set('Authorization', `Bearer ${authToken}`)
          .send(invoiceData);

        rejectInvoiceNumber = response.body.invoice.invoice_number;

        // Update to sent
        await pool.execute(
          'UPDATE invoices SET status = ? WHERE invoice_number = ?',
          ['sent', rejectInvoiceNumber]
        );
      });

      it('should reject invoice with reason', async () => {
        const response = await request(app)
          .post(`/api/invoices/public/${rejectInvoiceNumber}/reject`)
          .send({
            email: 'reject@test.com',
            reason: 'This is a valid rejection reason with more than 10 characters'
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toContain('Rejection');

        // Verify status and reason
        const [rows] = await pool.execute(
          'SELECT status, rejection_reason FROM invoices WHERE invoice_number = ?',
          [rejectInvoiceNumber]
        );
        expect(rows[0].status).toBe('rejected');
        expect(rows[0].rejection_reason).toBeDefined();
      });

      it('should return 400 if reason too short', async () => {
        await request(app)
          .post(`/api/invoices/public/${rejectInvoiceNumber}/reject`)
          .send({
            email: 'reject@test.com',
            reason: 'Short'
          })
          .expect(400);
      });
    });

    describe('POST /api/invoices/public/:invoice_number/mark-paid', () => {
      it('should mark invoice as paid', async () => {
        const response = await request(app)
          .post(`/api/invoices/public/${invoiceNumber}/mark-paid`)
          .send({ email: clientEmail })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toContain('confirmation');

        // Verify status
        const [rows] = await pool.execute(
          'SELECT status FROM invoices WHERE invoice_number = ?',
          [invoiceNumber]
        );
        expect(rows[0].status).toBe('paid');
      });
    });

    describe('GET /api/invoices/public/client/list', () => {
      it('should list client invoices', async () => {
        const response = await request(app)
          .get(`/api/invoices/public/client/list?email=${clientEmail}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.invoices).toBeDefined();
        expect(Array.isArray(response.body.invoices)).toBe(true);
      });

      it('should return 400 without email', async () => {
        await request(app)
          .get('/api/invoices/public/client/list')
          .expect(400);
      });
    });
  });

  describe('Rate Limiting', () => {
    it('should rate limit public endpoints', async () => {
      const invoiceNumber = 'INV-2024-00001';
      
      // Make many requests
      const requests = [];
      for (let i = 0; i < 101; i++) {
        requests.push(
          request(app)
            .get(`/api/invoices/public/${invoiceNumber}?email=test@test.com`)
        );
      }

      const responses = await Promise.all(requests);
      
      // At least one should be rate limited
      const rateLimited = responses.some(r => r.status === 429);
      expect(rateLimited).toBe(true);
    }, 30000); // Increase timeout for this test
  });
});
