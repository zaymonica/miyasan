/**
 * Payment Model Unit Tests
 */

const Payment = require('../../../models/Payment');

// Mock dependencies
jest.mock('../../../config/database', () => ({
  pool: {
    execute: jest.fn(),
    getConnection: jest.fn()
  }
}));

const { pool } = require('../../../config/database');

describe('Payment Model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return all payments for tenant', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, amount: 99.99, status: 'completed' },
        { id: 2, amount: 49.99, status: 'pending' }
      ]]);

      const payments = await Payment.findAll(1);

      expect(payments).toHaveLength(2);
    });

    it('should filter by status', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, amount: 99.99, status: 'completed' }
      ]]);

      const payments = await Payment.findAll(1, { status: 'completed' });

      expect(payments).toHaveLength(1);
    });
  });

  describe('findById', () => {
    it('should return payment by id', async () => {
      pool.execute.mockResolvedValue([[{
        id: 1,
        amount: 99.99,
        currency: 'USD',
        status: 'completed'
      }]]);

      const payment = await Payment.findById(1, 1);

      expect(payment).toEqual(expect.objectContaining({
        id: 1,
        amount: 99.99
      }));
    });

    it('should return null if payment not found', async () => {
      pool.execute.mockResolvedValue([[]]);

      const payment = await Payment.findById(1, 999);

      expect(payment).toBeNull();
    });
  });

  describe('findByExternalId', () => {
    it('should return payment by external id', async () => {
      pool.execute.mockResolvedValue([[{
        id: 1,
        external_id: 'pay_123',
        amount: 99.99
      }]]);

      const payment = await Payment.findByExternalId(1, 'pay_123');

      expect(payment.external_id).toBe('pay_123');
    });
  });

  describe('create', () => {
    it('should create new payment', async () => {
      pool.execute.mockResolvedValue([{ insertId: 1 }]);

      const payment = await Payment.create(1, {
        amount: 99.99,
        currency: 'USD',
        payment_method: 'stripe',
        status: 'pending'
      });

      expect(payment.id).toBe(1);
    });
  });

  describe('update', () => {
    it('should update payment', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await Payment.update(1, 1, {
        status: 'completed'
      });

      expect(result).toBe(true);
    });
  });

  describe('updateStatus', () => {
    it('should update payment status', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await Payment.updateStatus(1, 1, 'completed');

      expect(result).toBe(true);
    });
  });

  describe('getByDateRange', () => {
    it('should return payments in date range', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, amount: 99.99, created_at: '2024-12-01' },
        { id: 2, amount: 49.99, created_at: '2024-12-15' }
      ]]);

      const payments = await Payment.getByDateRange(1, '2024-12-01', '2024-12-31');

      expect(payments).toHaveLength(2);
    });
  });

  describe('getTotalByStatus', () => {
    it('should return total amount by status', async () => {
      pool.execute.mockResolvedValue([[{ total: 500.00 }]]);

      const total = await Payment.getTotalByStatus(1, 'completed');

      expect(total).toBe(500.00);
    });
  });

  describe('getStats', () => {
    it('should return payment statistics', async () => {
      pool.execute.mockResolvedValue([[{
        total_count: 100,
        total_amount: 5000.00,
        completed_count: 90,
        pending_count: 10
      }]]);

      const stats = await Payment.getStats(1);

      expect(stats).toEqual(expect.objectContaining({
        total_count: 100,
        total_amount: 5000.00
      }));
    });
  });

  describe('refund', () => {
    it('should mark payment as refunded', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await Payment.refund(1, 1);

      expect(result).toBe(true);
    });
  });
});
