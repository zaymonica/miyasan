/**
 * Invoice Controller Unit Tests
 */

const InvoiceController = require('../../../controllers/InvoiceController');
const InvoiceRepository = require('../../../repositories/InvoiceRepository');

// Mock the repository
jest.mock('../../../repositories/InvoiceRepository');

describe('InvoiceController', () => {
  let controller;
  let req;
  let res;

  beforeEach(() => {
    controller = new InvoiceController();
    
    req = {
      tenantId: 1,
      user: { id: 1 },
      params: {},
      query: {},
      body: {},
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('test-user-agent'),
      app: {
        get: jest.fn()
      }
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create invoice successfully', async () => {
      const invoiceData = {
        type: 'invoice',
        title: 'Test Invoice',
        client: {
          name: 'John Doe',
          email: 'john@example.com',
          phone: '+5511999999999'
        }
      };

      const items = [
        { description: 'Item 1', quantity: 1, unit_price: 100 }
      ];

      req.body = { ...invoiceData, items };

      const mockInvoice = {
        id: 1,
        invoice_number: 'INV-2024-00001',
        ...invoiceData
      };

      InvoiceRepository.createInvoice.mockResolvedValue(mockInvoice);

      await controller.create(req, res);

      expect(InvoiceRepository.createInvoice).toHaveBeenCalledWith(
        1,
        invoiceData,
        items,
        1
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        invoice: mockInvoice
      });
    });

    it('should return error if no items provided', async () => {
      req.body = {
        type: 'invoice',
        title: 'Test',
        client: { name: 'John', email: 'john@test.com', phone: '+5511999999999' },
        items: []
      };

      await controller.create(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'At least one item is required'
      });
    });

    it('should handle repository errors', async () => {
      req.body = {
        type: 'invoice',
        title: 'Test',
        client: { name: 'John', email: 'john@test.com', phone: '+5511999999999' },
        items: [{ description: 'Item', quantity: 1, unit_price: 100 }]
      };

      InvoiceRepository.createInvoice.mockRejectedValue(new Error('Database error'));

      await controller.create(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Database error'
      });
    });
  });

  describe('list', () => {
    it('should list invoices with filters', async () => {
      req.query = {
        type: 'invoice',
        status: 'sent',
        page: '1',
        limit: '20',
        tab: 'active'
      };

      const mockResult = {
        invoices: [
          { id: 1, invoice_number: 'INV-2024-00001' }
        ],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          pages: 1
        }
      };

      const mockTabCounts = { active: 1, archived: 0, disabled: 0 };

      InvoiceRepository.listInvoices.mockResolvedValue(mockResult);
      InvoiceRepository.getTabCounts.mockResolvedValue(mockTabCounts);

      await controller.list(req, res);

      expect(InvoiceRepository.listInvoices).toHaveBeenCalledWith(1, {
        type: 'invoice',
        status: 'sent',
        client_id: undefined,
        search: undefined,
        page: 1,
        limit: 20,
        sort_by: 'created_at',
        sort_order: 'DESC',
        tab: 'active'
      });
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        ...mockResult,
        tabCounts: mockTabCounts
      });
    });
  });

  describe('getById', () => {
    it('should return invoice by id', async () => {
      req.params.id = '1';

      const mockInvoice = {
        id: 1,
        invoice_number: 'INV-2024-00001',
        title: 'Test Invoice'
      };

      InvoiceRepository.getInvoiceById.mockResolvedValue(mockInvoice);

      await controller.getById(req, res);

      expect(InvoiceRepository.getInvoiceById).toHaveBeenCalledWith(1, '1');
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        invoice: mockInvoice
      });
    });

    it('should return 404 if invoice not found', async () => {
      req.params.id = '999';

      InvoiceRepository.getInvoiceById.mockResolvedValue(null);

      await controller.getById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invoice not found'
      });
    });
  });

  describe('updateStatus', () => {
    it('should update invoice status', async () => {
      req.params.id = '1';
      req.body.status = 'sent';

      InvoiceRepository.updateStatus.mockResolvedValue(true);

      await controller.updateStatus(req, res);

      expect(InvoiceRepository.updateStatus).toHaveBeenCalledWith(
        1,
        '1',
        'sent',
        expect.objectContaining({
          actor_type: 'admin',
          actor_id: 1,
          ip_address: '127.0.0.1'
        })
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Status updated successfully'
      });
    });
  });

  describe('sendViaWhatsApp', () => {
    it('should send invoice via WhatsApp using client phone', async () => {
      req.params.id = '1';
      req.body = { use_client_phone: true };

      const mockInvoice = {
        id: 1,
        invoice_number: 'INV-2024-00001',
        title: 'Test Invoice',
        type: 'invoice',
        client_name: 'John Doe',
        client_email: 'john@example.com',
        client_phone: '+5511999999999',
        total_amount: 1000,
        currency: 'USD',
        status: 'draft'
      };

      const mockWhatsAppService = {
        sendMessage: jest.fn().mockResolvedValue({ success: true })
      };

      InvoiceRepository.getInvoiceById.mockResolvedValue(mockInvoice);
      InvoiceRepository.updateStatus.mockResolvedValue(true);
      req.app.get.mockReturnValue(mockWhatsAppService);

      await controller.sendViaWhatsApp(req, res);

      expect(mockWhatsAppService.sendMessage).toHaveBeenCalledWith(
        1,
        '5511999999999',
        expect.stringContaining('John Doe')
      );
      expect(InvoiceRepository.updateStatus).toHaveBeenCalledWith(
        1,
        '1',
        'sent',
        expect.any(Object)
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Invoice sent successfully via WhatsApp'
      });
    });

    it('should send invoice via WhatsApp using custom phone', async () => {
      req.params.id = '1';
      req.body = {
        use_client_phone: false,
        phone: '+5511888888888'
      };

      const mockInvoice = {
        id: 1,
        invoice_number: 'INV-2024-00001',
        title: 'Test Invoice',
        type: 'invoice',
        client_name: 'John Doe',
        client_email: 'john@example.com',
        client_phone: '+5511999999999',
        total_amount: 1000,
        currency: 'USD',
        status: 'draft'
      };

      const mockWhatsAppService = {
        sendMessage: jest.fn().mockResolvedValue({ success: true })
      };

      InvoiceRepository.getInvoiceById.mockResolvedValue(mockInvoice);
      InvoiceRepository.updateStatus.mockResolvedValue(true);
      req.app.get.mockReturnValue(mockWhatsAppService);

      await controller.sendViaWhatsApp(req, res);

      expect(mockWhatsAppService.sendMessage).toHaveBeenCalledWith(
        1,
        '5511888888888',
        expect.any(String)
      );
    });

    it('should return error if phone not provided', async () => {
      req.params.id = '1';
      req.body = { use_client_phone: false };

      const mockInvoice = {
        id: 1,
        client_phone: null
      };

      InvoiceRepository.getInvoiceById.mockResolvedValue(mockInvoice);

      await controller.sendViaWhatsApp(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Phone number is required'
      });
    });

    it('should return error if WhatsApp service not available', async () => {
      req.params.id = '1';
      req.body = { use_client_phone: true };

      const mockInvoice = {
        id: 1,
        client_phone: '+5511999999999'
      };

      InvoiceRepository.getInvoiceById.mockResolvedValue(mockInvoice);
      req.app.get.mockReturnValue(null);

      await controller.sendViaWhatsApp(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'WhatsApp service not available'
      });
    });
  });

  describe('convertToInvoice', () => {
    it('should convert quote to invoice', async () => {
      req.params.id = '1';

      const mockInvoice = {
        id: 2,
        invoice_number: 'INV-2024-00001',
        type: 'invoice'
      };

      InvoiceRepository.convertQuoteToInvoice.mockResolvedValue(mockInvoice);

      await controller.convertToInvoice(req, res);

      expect(InvoiceRepository.convertQuoteToInvoice).toHaveBeenCalledWith(1, '1', 1);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        invoice: mockInvoice
      });
    });
  });

  describe('publicGetInvoice', () => {
    it('should return invoice for valid email', async () => {
      req.params.invoice_number = 'INV-2024-00001';
      req.query.email = 'john@example.com';

      const mockInvoice = {
        id: 1,
        tenant_id: 1,
        invoice_number: 'INV-2024-00001',
        client_email: 'john@example.com',
        status: 'sent',
        viewed_at: null,
        is_active: true
      };

      InvoiceRepository.getInvoiceByNumberPublic.mockResolvedValue(mockInvoice);
      InvoiceRepository.updateStatus.mockResolvedValue(true);

      await controller.publicGetInvoice(req, res);

      expect(InvoiceRepository.updateStatus).toHaveBeenCalledWith(
        1,
        1,
        'viewed',
        expect.any(Object)
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        invoice: expect.objectContaining({ status: 'viewed' })
      });
    });

    it('should return error for invalid email', async () => {
      req.params.invoice_number = 'INV-2024-00001';
      req.query.email = 'wrong@example.com';

      const mockInvoice = {
        id: 1,
        client_email: 'john@example.com',
        is_active: true
      };

      InvoiceRepository.getInvoiceByNumberPublic.mockResolvedValue(mockInvoice);

      await controller.publicGetInvoice(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid email'
      });
    });

    it('should return 404 if invoice not found', async () => {
      req.params.invoice_number = 'INV-2024-99999';
      req.query.email = 'john@example.com';

      InvoiceRepository.getInvoiceByNumberPublic.mockResolvedValue(null);

      await controller.publicGetInvoice(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invoice not found'
      });
    });
  });

  describe('publicAccept', () => {
    it('should accept invoice', async () => {
      req.params.invoice_number = 'INV-2024-00001';
      req.body.email = 'john@example.com';

      const mockInvoice = {
        id: 1,
        tenant_id: 1,
        type: 'invoice',
        client_email: 'john@example.com',
        items: []
      };

      InvoiceRepository.getInvoiceByNumberPublic.mockResolvedValue(mockInvoice);
      InvoiceRepository.updateStatus.mockResolvedValue(true);
      InvoiceRepository.getTenantPaymentGateway.mockResolvedValue(null);

      await controller.publicAccept(req, res);

      expect(InvoiceRepository.updateStatus).toHaveBeenCalledWith(
        1,
        1,
        'accepted',
        expect.any(Object)
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Invoice accepted successfully',
        payment_link: null
      });
    });
  });

  describe('publicReject', () => {
    it('should reject invoice with reason', async () => {
      req.params.invoice_number = 'INV-2024-00001';
      req.body = {
        email: 'john@example.com',
        reason: 'This is a valid rejection reason'
      };

      const mockInvoice = {
        id: 1,
        tenant_id: 1,
        client_email: 'john@example.com'
      };

      InvoiceRepository.getInvoiceByNumberPublic.mockResolvedValue(mockInvoice);
      InvoiceRepository.rejectInvoice.mockResolvedValue(true);

      await controller.publicReject(req, res);

      expect(InvoiceRepository.rejectInvoice).toHaveBeenCalledWith(
        1,
        1,
        req.body.reason,
        expect.any(Object)
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Rejection submitted. Waiting for review.'
      });
    });

    it('should return error if reason too short', async () => {
      req.params.invoice_number = 'INV-2024-00001';
      req.body = {
        email: 'john@example.com',
        reason: 'Short'
      };

      await controller.publicReject(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Rejection reason must be at least 7 characters'
      });
    });
  });

  describe('publicMarkPaid', () => {
    it('should mark invoice as paid', async () => {
      req.params.invoice_number = 'INV-2024-00001';
      req.body.email = 'john@example.com';

      const mockInvoice = {
        id: 1,
        tenant_id: 1,
        client_email: 'john@example.com'
      };

      InvoiceRepository.getInvoiceByNumberPublic.mockResolvedValue(mockInvoice);
      InvoiceRepository.updateStatus.mockResolvedValue(true);

      await controller.publicMarkPaid(req, res);

      expect(InvoiceRepository.updateStatus).toHaveBeenCalledWith(
        1,
        1,
        'paid',
        expect.objectContaining({
          actor_type: 'client',
          details: 'Marked as paid by client - pending admin verification'
        })
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Payment confirmation received'
      });
    });
  });

  describe('getStatistics', () => {
    it('should return invoice statistics', async () => {
      const mockStats = {
        total_invoices: 10,
        total_paid: 5000,
        total_pending: 2000
      };

      InvoiceRepository.getStatistics.mockResolvedValue(mockStats);

      await controller.getStatistics(req, res);

      expect(InvoiceRepository.getStatistics).toHaveBeenCalledWith(1);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        statistics: mockStats
      });
    });
  });

  describe('formatCurrency', () => {
    it('should format currency correctly', () => {
      expect(controller.formatCurrency(1000, 'USD')).toBe('$ 1000.00');
      expect(controller.formatCurrency(1500.50, 'BRL')).toBe('R$ 1500.50');
      expect(controller.formatCurrency(2000, 'EUR')).toBe('€ 2000.00');
      expect(controller.formatCurrency(3000, 'GBP')).toBe('£ 3000.00');
    });
  });
});
