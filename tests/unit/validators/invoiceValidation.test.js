/**
 * invoiceValidation Unit Tests
 * Tests for invoice validation middleware using express-validator
 */

const { validationResult } = require('express-validator');
const {
  validateInvoiceId,
  validateCreateInvoice,
  validateUpdateStatus,
  validateSendInvoice,
  validateInvoiceFilters,
  validatePublicAccept,
  validatePublicReject,
  validatePublicMarkPaid
} = require('../../../middleware/validators/invoiceValidation');

// Helper to run validation chain
const runValidation = async (validations, req) => {
  for (const validation of validations) {
    if (typeof validation === 'function' && validation.name !== 'handleValidationErrors') {
      await validation.run(req);
    }
  }
  return validationResult(req);
};

describe('invoiceValidation', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    mockReq = {
      body: {},
      params: {},
      query: {},
      t: jest.fn((key) => key)
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    mockNext = jest.fn();
  });

  describe('validateInvoiceId', () => {
    it('should pass valid invoice ID', async () => {
      mockReq.params = { id: '123' };
      const result = await runValidation(validateInvoiceId, mockReq);
      expect(result.isEmpty()).toBe(true);
    });

    it('should reject invalid invoice ID', async () => {
      mockReq.params = { id: 'abc' };
      const result = await runValidation(validateInvoiceId, mockReq);
      expect(result.isEmpty()).toBe(false);
    });

    it('should reject negative invoice ID', async () => {
      mockReq.params = { id: '-1' };
      const result = await runValidation(validateInvoiceId, mockReq);
      expect(result.isEmpty()).toBe(false);
    });
  });

  describe('validateCreateInvoice', () => {
    it('should pass valid invoice data', async () => {
      mockReq.body = {
        type: 'invoice',
        title: 'Invoice for services',
        client: {
          name: 'John Doe',
          email: 'john@test.com',
          phone: '+5511999999999'
        },
        items: [
          { description: 'Service 1', quantity: 1, unit_price: 100 }
        ]
      };

      const result = await runValidation(validateCreateInvoice, mockReq);
      expect(result.isEmpty()).toBe(true);
    });

    it('should reject missing title', async () => {
      mockReq.body = {
        type: 'invoice',
        client: {
          name: 'John Doe',
          email: 'john@test.com',
          phone: '+5511999999999'
        },
        items: [{ description: 'Item', quantity: 1, unit_price: 100 }]
      };

      const result = await runValidation(validateCreateInvoice, mockReq);
      expect(result.isEmpty()).toBe(false);
    });

    it('should reject empty items array', async () => {
      mockReq.body = {
        type: 'invoice',
        title: 'Invoice',
        client: {
          name: 'John Doe',
          email: 'john@test.com',
          phone: '+5511999999999'
        },
        items: []
      };

      const result = await runValidation(validateCreateInvoice, mockReq);
      expect(result.isEmpty()).toBe(false);
    });

    it('should reject invalid type', async () => {
      mockReq.body = {
        type: 'invalid',
        title: 'Invoice',
        client: {
          name: 'John Doe',
          email: 'john@test.com',
          phone: '+5511999999999'
        },
        items: [{ description: 'Item', quantity: 1, unit_price: 100 }]
      };

      const result = await runValidation(validateCreateInvoice, mockReq);
      expect(result.isEmpty()).toBe(false);
    });

    it('should reject invalid client email', async () => {
      mockReq.body = {
        type: 'invoice',
        title: 'Invoice',
        client: {
          name: 'John Doe',
          email: 'invalid-email',
          phone: '+5511999999999'
        },
        items: [{ description: 'Item', quantity: 1, unit_price: 100 }]
      };

      const result = await runValidation(validateCreateInvoice, mockReq);
      expect(result.isEmpty()).toBe(false);
    });

    it('should reject negative item quantity', async () => {
      mockReq.body = {
        type: 'invoice',
        title: 'Invoice',
        client: {
          name: 'John Doe',
          email: 'john@test.com',
          phone: '+5511999999999'
        },
        items: [{ description: 'Item', quantity: -1, unit_price: 100 }]
      };

      const result = await runValidation(validateCreateInvoice, mockReq);
      expect(result.isEmpty()).toBe(false);
    });
  });

  describe('validateUpdateStatus', () => {
    it('should pass valid status update', async () => {
      mockReq.params = { id: '1' };
      mockReq.body = { status: 'sent' };
      const result = await runValidation(validateUpdateStatus, mockReq);
      expect(result.isEmpty()).toBe(true);
    });

    it('should reject invalid status', async () => {
      mockReq.params = { id: '1' };
      mockReq.body = { status: 'invalid_status' };
      const result = await runValidation(validateUpdateStatus, mockReq);
      expect(result.isEmpty()).toBe(false);
    });
  });

  describe('validateSendInvoice', () => {
    it('should pass with use_client_phone', async () => {
      mockReq.params = { id: '1' };
      mockReq.body = { use_client_phone: true };
      const result = await runValidation(validateSendInvoice, mockReq);
      expect(result.isEmpty()).toBe(true);
    });

    it('should pass with custom phone', async () => {
      mockReq.params = { id: '1' };
      mockReq.body = { phone: '+5511999999999', use_client_phone: false };
      const result = await runValidation(validateSendInvoice, mockReq);
      expect(result.isEmpty()).toBe(true);
    });
  });

  describe('validateInvoiceFilters', () => {
    it('should pass valid filters', async () => {
      mockReq.query = {
        type: 'invoice',
        status: 'sent',
        tab: 'active',
        page: '1',
        limit: '20'
      };
      const result = await runValidation(validateInvoiceFilters, mockReq);
      expect(result.isEmpty()).toBe(true);
    });

    it('should reject invalid tab', async () => {
      mockReq.query = { tab: 'invalid' };
      const result = await runValidation(validateInvoiceFilters, mockReq);
      expect(result.isEmpty()).toBe(false);
    });

    it('should reject invalid type', async () => {
      mockReq.query = { type: 'invalid' };
      const result = await runValidation(validateInvoiceFilters, mockReq);
      expect(result.isEmpty()).toBe(false);
    });
  });

  describe('validatePublicAccept', () => {
    it('should pass valid accept request', async () => {
      mockReq.params = { invoice_number: 'INV-2024-00001' };
      mockReq.body = { email: 'client@test.com' };
      const result = await runValidation(validatePublicAccept, mockReq);
      expect(result.isEmpty()).toBe(true);
    });

    it('should reject missing email', async () => {
      mockReq.params = { invoice_number: 'INV-2024-00001' };
      mockReq.body = {};
      const result = await runValidation(validatePublicAccept, mockReq);
      expect(result.isEmpty()).toBe(false);
    });

    it('should reject invalid email', async () => {
      mockReq.params = { invoice_number: 'INV-2024-00001' };
      mockReq.body = { email: 'invalid' };
      const result = await runValidation(validatePublicAccept, mockReq);
      expect(result.isEmpty()).toBe(false);
    });
  });

  describe('validatePublicReject', () => {
    it('should pass valid reject request with 7+ chars reason', async () => {
      mockReq.params = { invoice_number: 'INV-2024-00001' };
      mockReq.body = { email: 'client@test.com', reason: 'Price too high' };
      const result = await runValidation(validatePublicReject, mockReq);
      expect(result.isEmpty()).toBe(true);
    });

    it('should reject reason with less than 7 characters', async () => {
      mockReq.params = { invoice_number: 'INV-2024-00001' };
      mockReq.body = { email: 'client@test.com', reason: 'short' };
      const result = await runValidation(validatePublicReject, mockReq);
      expect(result.isEmpty()).toBe(false);
    });

    it('should reject missing reason', async () => {
      mockReq.params = { invoice_number: 'INV-2024-00001' };
      mockReq.body = { email: 'client@test.com' };
      const result = await runValidation(validatePublicReject, mockReq);
      expect(result.isEmpty()).toBe(false);
    });
  });

  describe('validatePublicMarkPaid', () => {
    it('should pass valid mark paid request', async () => {
      mockReq.params = { invoice_number: 'INV-2024-00001' };
      mockReq.body = { email: 'client@test.com' };
      const result = await runValidation(validatePublicMarkPaid, mockReq);
      expect(result.isEmpty()).toBe(true);
    });

    it('should reject missing email', async () => {
      mockReq.params = { invoice_number: 'INV-2024-00001' };
      mockReq.body = {};
      const result = await runValidation(validatePublicMarkPaid, mockReq);
      expect(result.isEmpty()).toBe(false);
    });
  });
});
