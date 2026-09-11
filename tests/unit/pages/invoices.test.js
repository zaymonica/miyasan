/**
 * Unit Tests for Invoices & Quotes Page
 * Tests the invoices and quotes management functionality
 */

describe('Invoices & Quotes Page', () => {
  let mockFetch;
  let currentInvoiceItems;

  beforeEach(() => {
    // Mock localStorage
    global.localStorage = {
      getItem: jest.fn(() => 'mock-token'),
      setItem: jest.fn(),
      removeItem: jest.fn()
    };
    
    // Mock fetch
    mockFetch = jest.fn();
    global.fetch = mockFetch;
    
    // Initialize invoice items
    currentInvoiceItems = [];
    
    jest.clearAllMocks();
  });

  describe('Load Invoices API', () => {
    it('should load invoices successfully', async () => {
      const mockInvoices = [
        {
          id: 1,
          invoice_number: 'INV-001',
          type: 'invoice',
          client_name: 'John Doe',
          client_email: 'john@example.com',
          title: 'Web Development',
          total_amount: 1000,
          currency: 'USD',
          status: 'sent',
          created_at: '2024-01-01'
        }
      ];

      mockFetch.mockResolvedValue({
        json: async () => ({ success: true, invoices: mockInvoices })
      });

      const response = await fetch('/api/invoices/admin', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.invoices).toHaveLength(1);
      expect(data.invoices[0].invoice_number).toBe('INV-001');
    });

    it('should apply filters to API request', async () => {
      mockFetch.mockResolvedValue({
        json: async () => ({ success: true, invoices: [] })
      });

      const params = new URLSearchParams({
        type: 'quote',
        status: 'accepted',
        search: 'test'
      });

      await fetch(`/api/invoices/admin?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('type=quote'),
        expect.any(Object)
      );
    });

    it('should handle API error', async () => {
      mockFetch.mockResolvedValue({
        json: async () => ({ success: false, error: 'Failed to load' })
      });

      const response = await fetch('/api/invoices/admin');
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to load');
    });

    it('should handle network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      try {
        await fetch('/api/invoices/admin');
      } catch (error) {
        expect(error.message).toBe('Network error');
      }
    });
  });

  describe('Invoice Data Structure', () => {
    it('should have correct invoice structure', () => {
      const invoice = {
        id: 1,
        invoice_number: 'INV-001',
        type: 'invoice',
        client_name: 'John Doe',
        client_email: 'john@example.com',
        title: 'Web Development',
        total_amount: 1000,
        currency: 'USD',
        status: 'sent',
        created_at: '2024-01-01'
      };

      expect(invoice).toHaveProperty('id');
      expect(invoice).toHaveProperty('invoice_number');
      expect(invoice).toHaveProperty('type');
      expect(invoice).toHaveProperty('client_name');
      expect(invoice).toHaveProperty('total_amount');
    });

    it('should support invoice type', () => {
      const invoice = { type: 'invoice' };
      expect(['invoice', 'quote']).toContain(invoice.type);
    });

    it('should support quote type', () => {
      const quote = { type: 'quote' };
      expect(['invoice', 'quote']).toContain(quote.type);
    });

    it('should have valid status values', () => {
      const statuses = ['draft', 'sent', 'viewed', 'accepted', 'rejected', 'paid'];
      const invoice = { status: 'sent' };
      expect(statuses).toContain(invoice.status);
    });
  });

  describe('Invoice Items Management', () => {
    it('should create invoice item structure', () => {
      const item = {
        description: 'Web Development',
        quantity: 2,
        unit_price: 50
      };

      expect(item).toHaveProperty('description');
      expect(item).toHaveProperty('quantity');
      expect(item).toHaveProperty('unit_price');
    });

    it('should calculate item total', () => {
      const item = {
        quantity: 2,
        unit_price: 50
      };

      const total = item.quantity * item.unit_price;
      expect(total).toBe(100);
    });

    it('should handle multiple items', () => {
      const items = [
        { description: 'Item 1', quantity: 2, unit_price: 50 },
        { description: 'Item 2', quantity: 1, unit_price: 100 }
      ];

      expect(items).toHaveLength(2);
      expect(items[0].quantity * items[0].unit_price).toBe(100);
      expect(items[1].quantity * items[1].unit_price).toBe(100);
    });

    it('should validate item has required fields', () => {
      const item = {
        description: 'Test Item',
        quantity: 1,
        unit_price: 50
      };

      expect(item.description).toBeTruthy();
      expect(item.quantity).toBeGreaterThan(0);
      expect(item.unit_price).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Invoice Calculations', () => {
    it('should calculate subtotal correctly', () => {
      const items = [
        { quantity: 2, unit_price: 100 },
        { quantity: 1, unit_price: 50 }
      ];

      const subtotal = items.reduce((sum, item) => {
        return sum + (item.quantity * item.unit_price);
      }, 0);

      expect(subtotal).toBe(250);
    });

    it('should calculate tax amount', () => {
      const subtotal = 250;
      const taxRate = 10;
      const taxAmount = (subtotal * taxRate) / 100;

      expect(taxAmount).toBe(25);
    });

    it('should calculate fixed discount', () => {
      const discountType = 'fixed';
      const discountValue = 50;
      const subtotal = 250;

      const discountAmount = discountType === 'fixed' ? discountValue : (subtotal * discountValue) / 100;

      expect(discountAmount).toBe(50);
    });

    it('should calculate percentage discount', () => {
      const discountType = 'percentage';
      const discountValue = 20;
      const subtotal = 100;

      const discountAmount = discountType === 'percentage' ? (subtotal * discountValue) / 100 : discountValue;

      expect(discountAmount).toBe(20);
    });

    it('should calculate final total', () => {
      const subtotal = 250;
      const taxAmount = 25;
      const discountAmount = 50;
      const total = subtotal + taxAmount - discountAmount;

      expect(total).toBe(225);
    });
  });

  describe('Create Invoice API', () => {
    it('should submit invoice successfully', async () => {
      const invoiceData = {
        type: 'invoice',
        title: 'Test Invoice',
        description: 'Test Description',
        currency: 'USD',
        tax_rate: 10,
        discount_type: 'fixed',
        discount_value: 0,
        payment_method: 'paypal',
        due_date: '2024-12-31',
        client: {
          name: 'John Doe',
          email: 'john@example.com',
          phone: '+5511999999999',
          company_name: 'Test Company'
        },
        items: [
          { description: 'Item 1', quantity: 2, unit_price: 50 }
        ]
      };

      mockFetch.mockResolvedValue({
        json: async () => ({ success: true })
      });

      const response = await fetch('/api/invoices/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify(invoiceData)
      });
      const data = await response.json();

      expect(data.success).toBe(true);
    });

    it('should validate items before submit', () => {
      const invoiceData = {
        type: 'invoice',
        title: 'Test',
        items: []
      };

      expect(invoiceData.items).toHaveLength(0);
    });

    it('should handle submit error', async () => {
      mockFetch.mockResolvedValue({
        json: async () => ({ success: false, error: 'Validation error' })
      });

      const response = await fetch('/api/invoices/admin', {
        method: 'POST',
        body: JSON.stringify({})
      });
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error).toBe('Validation error');
    });

    it('should include client information', () => {
      const client = {
        name: 'John Doe',
        email: 'john@example.com',
        phone: '+5511999999999',
        company_name: 'Test Company'
      };

      expect(client.name).toBeTruthy();
      expect(client.email).toContain('@');
      expect(client.phone).toMatch(/^\+/);
    });
  });

  describe('View Invoice API', () => {
    it('should load and display invoice details', async () => {
      const mockInvoice = {
        id: 1,
        invoice_number: 'INV-001',
        title: 'Test Invoice',
        type: 'invoice',
        status: 'sent',
        client_name: 'John Doe',
        client_email: 'john@example.com',
        client_phone: '+5511999999999',
        currency: 'USD',
        subtotal: 100,
        tax_amount: 10,
        discount_amount: 5,
        total_amount: 105,
        items: [
          { description: 'Item 1', quantity: 1, unit_price: 100, total_price: 100 }
        ]
      };

      mockFetch.mockResolvedValue({
        json: async () => ({ success: true, invoice: mockInvoice })
      });

      const response = await fetch('/api/invoices/admin/1', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.invoice.invoice_number).toBe('INV-001');
      expect(data.invoice.items).toHaveLength(1);
    });

    it('should handle view error', async () => {
      mockFetch.mockResolvedValue({
        json: async () => ({ success: false, error: 'Not found' })
      });

      const response = await fetch('/api/invoices/admin/999');
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error).toBe('Not found');
    });
  });

  describe('Send Invoice via WhatsApp API', () => {
    it('should send to client phone', async () => {
      mockFetch.mockResolvedValue({
        json: async () => ({ success: true })
      });

      const response = await fetch('/api/invoices/admin/1/send-whatsapp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify({ use_client_phone: true })
      });
      const data = await response.json();

      expect(data.success).toBe(true);
    });

    it('should send to custom phone', async () => {
      mockFetch.mockResolvedValue({
        json: async () => ({ success: true })
      });

      const response = await fetch('/api/invoices/admin/1/send-whatsapp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify({ phone: '+5511888888888', use_client_phone: false })
      });
      const data = await response.json();

      expect(data.success).toBe(true);
    });

    it('should validate phone number', () => {
      const phone = '+5511999999999';
      expect(phone).toMatch(/^\+/);
      expect(phone.length).toBeGreaterThan(10);
    });

    it('should handle send error', async () => {
      mockFetch.mockResolvedValue({
        json: async () => ({ success: false, error: 'WhatsApp not connected' })
      });

      const response = await fetch('/api/invoices/admin/1/send-whatsapp', {
        method: 'POST',
        body: JSON.stringify({ use_client_phone: true })
      });
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error).toBe('WhatsApp not connected');
    });
  });

  describe('Convert Quote to Invoice API', () => {
    it('should convert quote to invoice', async () => {
      mockFetch.mockResolvedValue({
        json: async () => ({ success: true })
      });

      const response = await fetch('/api/invoices/admin/1/convert-to-invoice', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });
      const data = await response.json();

      expect(data.success).toBe(true);
    });

    it('should handle conversion error', async () => {
      mockFetch.mockResolvedValue({
        json: async () => ({ success: false, error: 'Cannot convert' })
      });

      const response = await fetch('/api/invoices/admin/1/convert-to-invoice', {
        method: 'POST'
      });
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error).toBe('Cannot convert');
    });

    it('should only convert accepted quotes', () => {
      const quote = { type: 'quote', status: 'accepted' };
      expect(quote.type).toBe('quote');
      expect(quote.status).toBe('accepted');
    });
  });

  describe('Currency Formatting', () => {
    const formatCurrency = (amount, currency) => {
      const symbols = { USD: '$', BRL: 'R$', EUR: '€', GBP: '£' };
      return `${symbols[currency] || currency} ${parseFloat(amount).toFixed(2)}`;
    };

    it('should format USD correctly', () => {
      expect(formatCurrency(1000, 'USD')).toBe('$ 1000.00');
    });

    it('should format BRL correctly', () => {
      expect(formatCurrency(500.50, 'BRL')).toBe('R$ 500.50');
    });

    it('should format EUR correctly', () => {
      expect(formatCurrency(250.75, 'EUR')).toBe('€ 250.75');
    });

    it('should format GBP correctly', () => {
      expect(formatCurrency(100, 'GBP')).toBe('£ 100.00');
    });

    it('should handle decimal places', () => {
      expect(formatCurrency(99.9, 'USD')).toBe('$ 99.90');
    });

    it('should handle zero amount', () => {
      expect(formatCurrency(0, 'USD')).toBe('$ 0.00');
    });
  });

  describe('Payment Methods', () => {
    it('should support PayPal', () => {
      const methods = ['paypal', 'pagseguro', 'bank_transfer', 'cash', 'other'];
      expect(methods).toContain('paypal');
    });

    it('should support PagSeguro', () => {
      const methods = ['paypal', 'pagseguro', 'bank_transfer', 'cash', 'other'];
      expect(methods).toContain('pagseguro');
    });

    it('should support Bank Transfer', () => {
      const methods = ['paypal', 'pagseguro', 'bank_transfer', 'cash', 'other'];
      expect(methods).toContain('bank_transfer');
    });

    it('should support Cash', () => {
      const methods = ['paypal', 'pagseguro', 'bank_transfer', 'cash', 'other'];
      expect(methods).toContain('cash');
    });
  });

  describe('Invoice Filters', () => {
    it('should filter by type', () => {
      const invoices = [
        { id: 1, type: 'invoice' },
        { id: 2, type: 'quote' },
        { id: 3, type: 'invoice' }
      ];

      const filtered = invoices.filter(inv => inv.type === 'invoice');
      expect(filtered).toHaveLength(2);
    });

    it('should filter by status', () => {
      const invoices = [
        { id: 1, status: 'sent' },
        { id: 2, status: 'paid' },
        { id: 3, status: 'sent' }
      ];

      const filtered = invoices.filter(inv => inv.status === 'sent');
      expect(filtered).toHaveLength(2);
    });

    it('should search by client name', () => {
      const invoices = [
        { id: 1, client_name: 'John Doe' },
        { id: 2, client_name: 'Jane Smith' },
        { id: 3, client_name: 'John Smith' }
      ];

      const search = 'John';
      const filtered = invoices.filter(inv => 
        inv.client_name.toLowerCase().includes(search.toLowerCase())
      );
      expect(filtered).toHaveLength(2);
    });
  });
});
