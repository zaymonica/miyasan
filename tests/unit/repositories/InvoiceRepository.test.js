/**
 * InvoiceRepository Unit Tests
 */

// Mock dependencies before requiring the module
jest.mock('../../../config/database', () => ({
  pool: {
    getConnection: jest.fn()
  }
}));

jest.mock('../../../config/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

const InvoiceRepository = require('../../../repositories/InvoiceRepository');
const { pool } = require('../../../config/database');

describe('InvoiceRepository', () => {
  let mockConnection;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConnection = {
      execute: jest.fn(),
      query: jest.fn(),
      release: jest.fn(),
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn()
    };

    pool.getConnection.mockResolvedValue(mockConnection);
  });

  describe('createOrGetClient', () => {
    it('should return existing client id', async () => {
      mockConnection.execute.mockResolvedValueOnce([[{ id: 1 }]]);
      mockConnection.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await InvoiceRepository.createOrGetClient(1, {
        email: 'test@test.com',
        name: 'Test Client'
      });

      expect(result).toBe(1);
    });

    it('should create new client if not exists', async () => {
      mockConnection.execute.mockResolvedValueOnce([[]]);
      mockConnection.execute.mockResolvedValueOnce([{ insertId: 5 }]);

      const result = await InvoiceRepository.createOrGetClient(1, {
        email: 'new@test.com',
        name: 'New Client',
        phone: '123456'
      });

      expect(result).toBe(5);
    });
  });

  describe('generateInvoiceNumber', () => {
    it('should generate first invoice number', async () => {
      mockConnection.execute.mockResolvedValue([[]]);

      const result = await InvoiceRepository.generateInvoiceNumber(1, 'invoice');
      const year = new Date().getFullYear();

      expect(result).toBe(`INV-${year}-00001`);
    });

    it('should increment invoice number', async () => {
      const year = new Date().getFullYear();
      mockConnection.execute.mockResolvedValue([[{ invoice_number: `INV-${year}-00005` }]]);

      const result = await InvoiceRepository.generateInvoiceNumber(1, 'invoice');

      expect(result).toBe(`INV-${year}-00006`);
    });

    it('should use QUO prefix for quotes', async () => {
      mockConnection.execute.mockResolvedValue([[]]);

      const result = await InvoiceRepository.generateInvoiceNumber(1, 'quote');
      const year = new Date().getFullYear();

      expect(result).toBe(`QUO-${year}-00001`);
    });
  });

  describe('getInvoiceById', () => {
    it('should return null if invoice not found', async () => {
      mockConnection.execute.mockResolvedValue([[]]);

      const result = await InvoiceRepository.getInvoiceById(1, 999);

      expect(result).toBeNull();
    });

    it('should return invoice with items and logs', async () => {
      const mockInvoice = { id: 1, invoice_number: 'INV-2025-00001' };
      const mockItems = [{ id: 1, description: 'Item 1' }];
      const mockLogs = [{ id: 1, action: 'created' }];

      mockConnection.execute
        .mockResolvedValueOnce([[mockInvoice]])
        .mockResolvedValueOnce([mockItems])
        .mockResolvedValueOnce([mockLogs]);

      const result = await InvoiceRepository.getInvoiceById(1, 1);

      expect(result).toEqual({
        ...mockInvoice,
        items: mockItems,
        logs: mockLogs
      });
    });
  });

  describe('getInvoiceByNumber', () => {
    it('should return null if not found', async () => {
      mockConnection.execute.mockResolvedValue([[]]);

      const result = await InvoiceRepository.getInvoiceByNumber(1, 'INV-2025-99999');

      expect(result).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('should update status to sent', async () => {
      mockConnection.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await InvoiceRepository.updateStatus(1, 1, 'sent', {
        actor_type: 'admin',
        actor_id: 1
      });

      expect(result).toBe(true);
      expect(mockConnection.commit).toHaveBeenCalled();
    });

    it('should update status to paid', async () => {
      mockConnection.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await InvoiceRepository.updateStatus(1, 1, 'paid');

      expect(result).toBe(true);
    });

    it('should rollback on error', async () => {
      mockConnection.execute.mockRejectedValue(new Error('DB error'));

      await expect(InvoiceRepository.updateStatus(1, 1, 'sent')).rejects.toThrow();
      expect(mockConnection.rollback).toHaveBeenCalled();
    });
  });

  describe('rejectInvoice', () => {
    it('should reject invoice with reason', async () => {
      mockConnection.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await InvoiceRepository.rejectInvoice(1, 1, 'Too expensive');

      expect(result).toBe(true);
      expect(mockConnection.commit).toHaveBeenCalled();
    });
  });

  describe('sanitizeSortField', () => {
    it('should return allowed field', () => {
      expect(InvoiceRepository.sanitizeSortField('created_at')).toBe('created_at');
      expect(InvoiceRepository.sanitizeSortField('total_amount')).toBe('total_amount');
    });

    it('should return default for invalid field', () => {
      expect(InvoiceRepository.sanitizeSortField('invalid')).toBe('created_at');
      expect(InvoiceRepository.sanitizeSortField('DROP TABLE')).toBe('created_at');
    });
  });

  describe('sanitizeSortOrder', () => {
    it('should return ASC for asc', () => {
      expect(InvoiceRepository.sanitizeSortOrder('ASC')).toBe('ASC');
      expect(InvoiceRepository.sanitizeSortOrder('asc')).toBe('ASC');
    });

    it('should return DESC for other values', () => {
      expect(InvoiceRepository.sanitizeSortOrder('DESC')).toBe('DESC');
      expect(InvoiceRepository.sanitizeSortOrder('invalid')).toBe('DESC');
      expect(InvoiceRepository.sanitizeSortOrder(null)).toBe('DESC');
    });
  });

  describe('getStatistics', () => {
    it('should return statistics', async () => {
      const mockStats = {
        total_invoices: 10,
        total_paid: 5000,
        total_pending: 2000
      };
      mockConnection.execute.mockResolvedValue([[mockStats]]);

      const result = await InvoiceRepository.getStatistics(1);

      expect(result).toEqual(mockStats);
    });
  });

  describe('createAccessToken', () => {
    it('should create access token', async () => {
      mockConnection.execute.mockResolvedValue([{ insertId: 1 }]);

      const result = await InvoiceRepository.createAccessToken(1, 1, 'test@test.com');

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBe(64); // 32 bytes = 64 hex chars
    });
  });

  describe('verifyAccessToken', () => {
    it('should return null for invalid token', async () => {
      mockConnection.execute.mockResolvedValue([[]]);

      const result = await InvoiceRepository.verifyAccessToken(1, 'invalid', 'test@test.com');

      expect(result).toBeNull();
    });
  });

  describe('getClientInvoices', () => {
    it('should return client invoices', async () => {
      const mockInvoices = [{ id: 1 }, { id: 2 }];
      mockConnection.execute.mockResolvedValue([mockInvoices]);

      const result = await InvoiceRepository.getClientInvoices(1, 'client@test.com');

      expect(result).toEqual(mockInvoices);
    });
  });
});
