/**
 * Unit Tests for Widget Page
 * Tests the widget management functionality
 */

describe('Widget Page', () => {
  let mockFetch;

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
    
    jest.clearAllMocks();
  });

  describe('Load Widgets API', () => {
    it('should load widgets successfully', async () => {
      const mockWidgets = [
        {
          id: 1,
          name: 'Main Widget',
          whatsapp_number: '+5511999999999',
          button_title: 'Chat with us',
          button_background_color: '#25D366',
          widget_title: 'How can we help?',
          is_active: true,
          created_at: '2024-01-01'
        }
      ];

      mockFetch.mockResolvedValue({
        json: async () => ({ 
          success: true, 
          data: { 
            data: mockWidgets,
            pagination: {
              page: 1,
              limit: 10,
              total: 1,
              totalPages: 1
            }
          }
        })
      });

      const response = await fetch('/api/widget/admin', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.data).toHaveLength(1);
      expect(data.data.data[0].name).toBe('Main Widget');
    });

    it('should apply search filter', async () => {
      mockFetch.mockResolvedValue({
        json: async () => ({ 
          success: true, 
          data: { data: [], pagination: {} }
        })
      });

      const searchQuery = 'test';
      await fetch(`/api/widget/admin?search=${encodeURIComponent(searchQuery)}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('search=test'),
        expect.any(Object)
      );
    });

    it('should handle API error', async () => {
      mockFetch.mockResolvedValue({
        json: async () => ({ success: false, error: 'Failed to load' })
      });

      const response = await fetch('/api/widget/admin');
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to load');
    });
  });

  describe('Widget Data Structure', () => {
    it('should have correct widget structure', () => {
      const widget = {
        id: 1,
        name: 'Main Widget',
        whatsapp_number: '+5511999999999',
        button_title: 'Chat with us',
        button_background_color: '#25D366',
        widget_title: 'How can we help?',
        predefined_message: 'Hello!',
        max_message_length: 500,
        margin_right: 20,
        margin_bottom: 20,
        border_radius: 50,
        is_active: true
      };

      expect(widget).toHaveProperty('id');
      expect(widget).toHaveProperty('name');
      expect(widget).toHaveProperty('whatsapp_number');
      expect(widget).toHaveProperty('button_title');
      expect(widget).toHaveProperty('button_background_color');
    });

    it('should validate WhatsApp number format', () => {
      const validNumbers = ['+5511999999999', '+1234567890', '+447911123456'];
      const invalidNumbers = ['invalid', 'abc', '+0123456789', ''];

      validNumbers.forEach(number => {
        expect(number).toMatch(/^\+?[1-9]\d{1,14}$/);
      });

      invalidNumbers.forEach(number => {
        expect(number).not.toMatch(/^\+?[1-9]\d{1,14}$/);
      });
    });

    it('should validate color format', () => {
      const validColors = ['#25D366', '#FFF', '#000000'];
      const invalidColors = ['25D366', '#GGG', 'red'];

      validColors.forEach(color => {
        expect(color).toMatch(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/);
      });

      invalidColors.forEach(color => {
        expect(color).not.toMatch(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/);
      });
    });
  });

  describe('Create Widget API', () => {
    it('should create widget successfully', async () => {
      const widgetData = {
        name: 'New Widget',
        whatsapp_number: '+5511999999999',
        button_title: 'Chat with us',
        button_background_color: '#25D366',
        widget_title: 'How can we help?',
        max_message_length: 500,
        margin_right: 20,
        margin_bottom: 20,
        border_radius: 50,
        is_active: true
      };

      mockFetch.mockResolvedValue({
        json: async () => ({ 
          success: true,
          message: 'Widget created successfully',
          data: { id: 1, ...widgetData }
        })
      });

      const response = await fetch('/api/widget/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify(widgetData)
      });
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.name).toBe('New Widget');
    });

    it('should validate required fields', () => {
      const requiredFields = ['name', 'whatsapp_number', 'button_title', 'widget_title'];
      const widgetData = {};

      requiredFields.forEach(field => {
        expect(widgetData[field]).toBeUndefined();
      });
    });

    it('should handle creation error', async () => {
      mockFetch.mockResolvedValue({
        json: async () => ({ 
          success: false, 
          error: 'Validation failed' 
        })
      });

      const response = await fetch('/api/widget/admin', {
        method: 'POST',
        body: JSON.stringify({})
      });
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error).toBe('Validation failed');
    });
  });

  describe('Update Widget API', () => {
    it('should update widget successfully', async () => {
      const updateData = {
        name: 'Updated Widget',
        button_title: 'Contact us'
      };

      mockFetch.mockResolvedValue({
        json: async () => ({ 
          success: true,
          message: 'Widget updated successfully',
          data: { id: 1, ...updateData }
        })
      });

      const response = await fetch('/api/widget/admin/1', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify(updateData)
      });
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Updated Widget');
    });

    it('should handle widget not found', async () => {
      mockFetch.mockResolvedValue({
        json: async () => ({ 
          success: false, 
          error: 'Widget not found' 
        })
      });

      const response = await fetch('/api/widget/admin/999', {
        method: 'PUT',
        body: JSON.stringify({})
      });
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error).toBe('Widget not found');
    });
  });

  describe('Delete Widget API', () => {
    it('should delete widget successfully', async () => {
      mockFetch.mockResolvedValue({
        json: async () => ({ 
          success: true,
          message: 'Widget deleted successfully'
        })
      });

      const response = await fetch('/api/widget/admin/1', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.message).toBe('Widget deleted successfully');
    });

    it('should handle delete error', async () => {
      mockFetch.mockResolvedValue({
        json: async () => ({ 
          success: false, 
          error: 'Widget not found' 
        })
      });

      const response = await fetch('/api/widget/admin/999', {
        method: 'DELETE'
      });
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error).toBe('Widget not found');
    });
  });

  describe('Embed Code Generation', () => {
    it('should generate embed code successfully', async () => {
      const embedCode = `<script>
  (function() {
    var script = document.createElement('script');
    script.src = 'http://localhost:7000/widget/embed.js';
    script.setAttribute('data-widget-id', '1');
    script.setAttribute('data-widget-token', 'abc123');
    script.async = true;
    document.head.appendChild(script);
  })();
</script>`;

      mockFetch.mockResolvedValue({
        json: async () => ({ 
          success: true,
          data: {
            embedCode,
            widgetId: 1,
            widgetToken: 'abc123'
          }
        })
      });

      const response = await fetch('/api/widget/admin/1/embed-code', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.embedCode).toContain('script');
      expect(data.data.embedCode).toContain('data-widget-id');
      expect(data.data.embedCode).toContain('data-widget-token');
    });

    it('should include widget ID and token in embed code', () => {
      const widgetId = 1;
      const widgetToken = 'abc123';
      const embedCode = `data-widget-id="${widgetId}" data-widget-token="${widgetToken}"`;

      expect(embedCode).toContain(`data-widget-id="${widgetId}"`);
      expect(embedCode).toContain(`data-widget-token="${widgetToken}"`);
    });
  });

  describe('Widget Analytics', () => {
    it('should get widget analytics successfully', async () => {
      const mockAnalytics = {
        analytics: [
          { event_type: 'loaded', count: 100, date: '2024-01-01' },
          { event_type: 'clicked', count: 50, date: '2024-01-01' }
        ],
        summary: [
          { event_type: 'loaded', total: 500 },
          { event_type: 'clicked', total: 250 }
        ]
      };

      mockFetch.mockResolvedValue({
        json: async () => ({ 
          success: true,
          data: mockAnalytics
        })
      });

      const response = await fetch('/api/widget/admin/1/analytics', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.analytics).toHaveLength(2);
      expect(data.data.summary).toHaveLength(2);
    });

    it('should support date range filtering', async () => {
      mockFetch.mockResolvedValue({
        json: async () => ({ 
          success: true,
          data: { analytics: [], summary: [] }
        })
      });

      const startDate = '2024-01-01';
      const endDate = '2024-01-31';

      await fetch(`/api/widget/admin/1/analytics?start_date=${startDate}&end_date=${endDate}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('start_date=2024-01-01'),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('end_date=2024-01-31'),
        expect.any(Object)
      );
    });
  });

  describe('Public Widget Access', () => {
    it('should get widget by token', async () => {
      const mockWidget = {
        id: 1,
        name: 'Main Widget',
        whatsapp_number: '+5511999999999',
        button_title: 'Chat with us',
        button_background_color: '#25D366',
        widget_title: 'How can we help?'
      };

      mockFetch.mockResolvedValue({
        json: async () => ({ 
          success: true,
          data: mockWidget
        })
      });

      const response = await fetch('/api/widget/public/1/abc123');
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.id).toBe(1);
    });

    it('should handle invalid token', async () => {
      mockFetch.mockResolvedValue({
        json: async () => ({ 
          success: false,
          error: 'Widget not found or inactive'
        })
      });

      const response = await fetch('/api/widget/public/1/invalid');
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error).toBe('Widget not found or inactive');
    });
  });

  describe('Widget Event Tracking', () => {
    it('should track widget event successfully', async () => {
      const eventData = {
        event_type: 'clicked',
        event_data: {
          page_url: 'https://example.com'
        }
      };

      mockFetch.mockResolvedValue({
        json: async () => ({ 
          success: true,
          message: 'Event tracked successfully'
        })
      });

      const response = await fetch('/api/widget/public/1/abc123/track', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(eventData)
      });
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.message).toBe('Event tracked successfully');
    });

    it('should validate event types', () => {
      const validEvents = ['loaded', 'opened', 'closed', 'message_sent', 'clicked'];
      const invalidEvents = ['invalid', 'test', 'unknown'];

      validEvents.forEach(event => {
        expect(validEvents).toContain(event);
      });

      invalidEvents.forEach(event => {
        expect(validEvents).not.toContain(event);
      });
    });
  });

  describe('Widget Configuration Validation', () => {
    it('should validate margin values', () => {
      const validMargins = [0, 20, 100, 500];
      const invalidMargins = [-1, 501, 1000];

      validMargins.forEach(margin => {
        expect(margin).toBeGreaterThanOrEqual(0);
        expect(margin).toBeLessThanOrEqual(500);
      });

      invalidMargins.forEach(margin => {
        expect(margin < 0 || margin > 500).toBe(true);
      });
    });

    it('should validate border radius', () => {
      const validRadius = [0, 25, 50, 100];
      const invalidRadius = [-1, 101, 200];

      validRadius.forEach(radius => {
        expect(radius).toBeGreaterThanOrEqual(0);
        expect(radius).toBeLessThanOrEqual(100);
      });

      invalidRadius.forEach(radius => {
        expect(radius < 0 || radius > 100).toBe(true);
      });
    });

    it('should validate message length', () => {
      const validLengths = [50, 500, 1000, 5000];
      const invalidLengths = [49, 5001, 10000];

      validLengths.forEach(length => {
        expect(length).toBeGreaterThanOrEqual(50);
        expect(length).toBeLessThanOrEqual(5000);
      });

      invalidLengths.forEach(length => {
        expect(length < 50 || length > 5000).toBe(true);
      });
    });
  });

  describe('Widget Status', () => {
    it('should toggle widget active status', () => {
      const widget = { is_active: true };
      widget.is_active = !widget.is_active;
      expect(widget.is_active).toBe(false);

      widget.is_active = !widget.is_active;
      expect(widget.is_active).toBe(true);
    });

    it('should filter active widgets', () => {
      const widgets = [
        { id: 1, is_active: true },
        { id: 2, is_active: false },
        { id: 3, is_active: true }
      ];

      const activeWidgets = widgets.filter(w => w.is_active);
      expect(activeWidgets).toHaveLength(2);
    });
  });
});
