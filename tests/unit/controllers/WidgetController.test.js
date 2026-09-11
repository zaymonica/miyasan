/**
 * WidgetController Unit Tests
 */

const WidgetController = require('../../../controllers/WidgetController');

// Mock dependencies
jest.mock('../../../config/database', () => ({
  pool: {
    execute: jest.fn(),
    getConnection: jest.fn()
  }
}));

const { pool } = require('../../../config/database');

describe('WidgetController', () => {
  let mockReq;
  let mockRes;
  let mockConnection;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConnection = {
      execute: jest.fn(),
      query: jest.fn(),
      release: jest.fn()
    };

    pool.getConnection.mockResolvedValue(mockConnection);

    mockReq = {
      body: {},
      query: {},
      params: {},
      tenantId: 1,
      user: { tenantId: 1 },
      t: jest.fn((key) => key)
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('getWidgets', () => {
    it('should return all widgets for tenant', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, name: 'Widget 1', is_active: true },
        { id: 2, name: 'Widget 2', is_active: false }
      ]]);

      await WidgetController.getWidgets(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.any(Array)
        })
      );
    });
  });

  describe('getWidgetById', () => {
    it('should return widget by id', async () => {
      mockReq.params = { id: 1 };

      pool.execute.mockResolvedValue([[{
        id: 1,
        name: 'Test Widget',
        whatsapp_number: '123456789',
        widget_token: 'token123'
      }]]);

      await WidgetController.getWidgetById(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ id: 1 })
        })
      );
    });

    it('should return 404 if widget not found', async () => {
      mockReq.params = { id: 999 };
      pool.execute.mockResolvedValue([[]]);

      await WidgetController.getWidgetById(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  describe('createWidget', () => {
    it('should create new widget', async () => {
      mockReq.body = {
        name: 'New Widget',
        whatsapp_number: '123456789',
        button_title: 'Chat with us',
        widget_title: 'How can we help?'
      };

      pool.execute.mockResolvedValue([{ insertId: 1 }]);

      await WidgetController.createWidget(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ id: 1 })
        })
      );
    });

    it('should reject if required fields missing', async () => {
      mockReq.body = { name: 'Widget' };

      await WidgetController.createWidget(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('updateWidget', () => {
    it('should update widget', async () => {
      mockReq.params = { id: 1 };
      mockReq.body = {
        name: 'Updated Widget',
        button_background_color: '#FF0000'
      };

      pool.execute
        .mockResolvedValueOnce([[{ id: 1 }]]) // Check exists
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // Update

      await WidgetController.updateWidget(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    it('should return 404 if widget not found', async () => {
      mockReq.params = { id: 999 };
      mockReq.body = { name: 'Updated' };

      pool.execute.mockResolvedValue([[]]);

      await WidgetController.updateWidget(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  describe('deleteWidget', () => {
    it('should delete widget', async () => {
      mockReq.params = { id: 1 };

      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      await WidgetController.deleteWidget(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  describe('toggleWidget', () => {
    it('should toggle widget active status', async () => {
      mockReq.params = { id: 1 };

      pool.execute
        .mockResolvedValueOnce([[{ id: 1, is_active: true }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      await WidgetController.toggleWidget(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  describe('getWidgetByToken', () => {
    it('should return widget by token (public)', async () => {
      mockReq.params = { token: 'token123' };

      pool.execute.mockResolvedValue([[{
        id: 1,
        name: 'Widget',
        whatsapp_number: '123456789',
        is_active: true
      }]]);

      await WidgetController.getWidgetByToken(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    it('should return 404 if widget not found or inactive', async () => {
      mockReq.params = { token: 'invalid' };
      pool.execute.mockResolvedValue([[]]);

      await WidgetController.getWidgetByToken(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  describe('trackWidgetEvent', () => {
    it('should track widget analytics event', async () => {
      mockReq.params = { token: 'token123' };
      mockReq.body = {
        event_type: 'opened',
        page_url: 'https://example.com'
      };
      mockReq.ip = '127.0.0.1';
      mockReq.headers = { 'user-agent': 'Test Browser' };

      pool.execute
        .mockResolvedValueOnce([[{ id: 1, tenant_id: 1 }]])
        .mockResolvedValueOnce([{ insertId: 1 }]);

      await WidgetController.trackWidgetEvent(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  describe('getWidgetAnalytics', () => {
    it('should return widget analytics', async () => {
      mockReq.params = { id: 1 };
      mockReq.query = { days: 30 };

      pool.execute
        .mockResolvedValueOnce([[{ id: 1 }]]) // Widget exists
        .mockResolvedValueOnce([[
          { event_type: 'loaded', count: 100 },
          { event_type: 'opened', count: 50 },
          { event_type: 'message_sent', count: 20 }
        ]]);

      await WidgetController.getWidgetAnalytics(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.any(Array)
        })
      );
    });
  });

  describe('getWidgetCode', () => {
    it('should return embed code for widget', async () => {
      mockReq.params = { id: 1 };

      pool.execute.mockResolvedValue([[{
        id: 1,
        widget_token: 'token123'
      }]]);

      await WidgetController.getWidgetCode(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            embedCode: expect.stringContaining('script')
          })
        })
      );
    });
  });
});
