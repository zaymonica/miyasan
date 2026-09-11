/**
 * WhatsAppCloudFlowController Unit Tests
 * Tests for WhatsApp Cloud Flow/Automation management
 */

const WhatsAppCloudFlowController = require('../../../controllers/WhatsAppCloudFlowController');
const { pool } = require('../../../config/database');

// Mock dependencies
jest.mock('../../../config/database');
jest.mock('../../../config/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

describe('WhatsAppCloudFlowController', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();
    
    req = {
      body: {},
      params: {},
      query: {},
      user: { id: 1, tenantId: 1, role: 'admin' },
      tenantId: 1
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    pool.execute = jest.fn();
  });

  describe('list', () => {
    it('should list all flows for tenant', async () => {
      const mockFlows = [
        {
          id: 1,
          flow_name: 'Welcome Flow',
          trigger_type: 'keyword',
          trigger_value: 'hello',
          is_active: true,
          nodes: JSON.stringify([{ id: '1', type: 'start' }]),
          connections: JSON.stringify([])
        }
      ];

      pool.execute.mockResolvedValueOnce([mockFlows]);

      await WhatsAppCloudFlowController.list(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({
            flow_name: 'Welcome Flow',
            trigger_type: 'keyword'
          })
        ])
      });
    });

    it('should return empty array if no flows', async () => {
      pool.execute.mockResolvedValueOnce([[]]);

      await WhatsAppCloudFlowController.list(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: []
      });
    });

    it('should handle database errors', async () => {
      pool.execute.mockRejectedValueOnce(new Error('Database error'));

      await WhatsAppCloudFlowController.list(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: expect.stringContaining('error')
      });
    });
  });

  describe('get', () => {
    it('should get flow by ID', async () => {
      req.params.id = '1';

      const mockFlow = {
        id: 1,
        flow_name: 'Welcome Flow',
        trigger_type: 'keyword',
        trigger_value: 'hello',
        nodes: JSON.stringify([{ id: '1', type: 'start' }]),
        connections: JSON.stringify([])
      };

      pool.execute.mockResolvedValueOnce([[mockFlow]]);

      await WhatsAppCloudFlowController.get(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          flow_name: 'Welcome Flow'
        })
      });
    });

    it('should return 404 if flow not found', async () => {
      req.params.id = '999';
      pool.execute.mockResolvedValueOnce([[]]);

      await WhatsAppCloudFlowController.get(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Flow not found'
      });
    });
  });

  describe('create', () => {
    it('should create new flow', async () => {
      req.body = {
        flow_name: 'New Flow',
        trigger_type: 'keyword',
        trigger_value: 'start',
        account_id: '123',
        nodes: [{ id: '1', type: 'start' }],
        connections: []
      };

      pool.execute.mockResolvedValueOnce([{ insertId: 1 }]);

      await WhatsAppCloudFlowController.create(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Flow created successfully',
        data: { id: 1 }
      });
    });

    it('should return error if flow name missing', async () => {
      req.body = {
        trigger_type: 'keyword',
        nodes: []
      };

      await WhatsAppCloudFlowController.create(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: expect.stringContaining('Flow name')
      });
    });

    it('should set default values for optional fields', async () => {
      req.body = {
        flow_name: 'Simple Flow',
        trigger_type: 'keyword',
        trigger_value: 'hi'
      };

      pool.execute.mockResolvedValueOnce([{ insertId: 1 }]);

      await WhatsAppCloudFlowController.create(req, res);

      expect(pool.execute).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          'Simple Flow',
          'keyword',
          'hi',
          expect.any(Number),
          expect.any(String), // nodes as JSON
          expect.any(String), // connections as JSON
          true // is_active default
        ])
      );
    });
  });

  describe('update', () => {
    it('should update existing flow', async () => {
      req.params.id = '1';
      req.body = {
        flow_name: 'Updated Flow',
        trigger_value: 'updated',
        is_active: false
      };

      pool.execute
        .mockResolvedValueOnce([[{ id: 1 }]]) // Check exists
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // Update

      await WhatsAppCloudFlowController.update(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Flow updated successfully'
      });
    });

    it('should return 404 if flow not found', async () => {
      req.params.id = '999';
      req.body = { flow_name: 'Test' };

      pool.execute.mockResolvedValueOnce([[]]);

      await WhatsAppCloudFlowController.update(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Flow not found'
      });
    });

    it('should only update provided fields', async () => {
      req.params.id = '1';
      req.body = {
        flow_name: 'Partial Update'
      };

      pool.execute
        .mockResolvedValueOnce([[{ id: 1 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      await WhatsAppCloudFlowController.update(req, res);

      expect(pool.execute).toHaveBeenCalledWith(
        expect.stringContaining('flow_name = ?'),
        expect.not.arrayContaining([expect.stringContaining('trigger_type')])
      );
    });
  });

  describe('delete', () => {
    it('should delete flow', async () => {
      req.params.id = '1';

      pool.execute
        .mockResolvedValueOnce([[{ id: 1 }]]) // Check exists
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // Delete

      await WhatsAppCloudFlowController.delete(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Flow deleted successfully'
      });
    });

    it('should return 404 if flow not found', async () => {
      req.params.id = '999';
      pool.execute.mockResolvedValueOnce([[]]);

      await WhatsAppCloudFlowController.delete(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Flow not found'
      });
    });
  });

  describe('toggle', () => {
    it('should toggle flow active status', async () => {
      req.params.id = '1';
      req.body = { is_active: false };

      pool.execute
        .mockResolvedValueOnce([[{ id: 1, is_active: true }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      await WhatsAppCloudFlowController.toggle(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Flow status updated successfully'
      });
    });

    it('should return error if is_active not provided', async () => {
      req.params.id = '1';
      req.body = {};

      await WhatsAppCloudFlowController.toggle(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: expect.stringContaining('is_active')
      });
    });
  });

  describe('duplicate', () => {
    it('should duplicate existing flow', async () => {
      req.params.id = '1';

      const mockFlow = {
        flow_name: 'Original Flow',
        trigger_type: 'keyword',
        trigger_value: 'hello',
        account_id: '123',
        nodes: JSON.stringify([]),
        connections: JSON.stringify([]),
        is_active: false
      };

      pool.execute
        .mockResolvedValueOnce([[mockFlow]])
        .mockResolvedValueOnce([{ insertId: 2 }]);

      await WhatsAppCloudFlowController.duplicate(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Flow duplicated successfully',
        data: { id: 2 }
      });
    });

    it('should append "Copy" to duplicated flow name', async () => {
      req.params.id = '1';

      pool.execute
        .mockResolvedValueOnce([[{
          flow_name: 'Test Flow',
          trigger_type: 'keyword',
          nodes: '[]',
          connections: '[]'
        }]])
        .mockResolvedValueOnce([{ insertId: 2 }]);

      await WhatsAppCloudFlowController.duplicate(req, res);

      expect(pool.execute).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          expect.stringContaining('Copy')
        ])
      );
    });
  });

  describe('getStats', () => {
    it('should get flow statistics', async () => {
      req.params.id = '1';

      const mockStats = {
        total_sessions: 100,
        completed_sessions: 80,
        active_sessions: 5,
        avg_completion_time: 120
      };

      pool.execute.mockResolvedValueOnce([[mockStats]]);

      await WhatsAppCloudFlowController.getStats(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          total_sessions: 100,
          completed_sessions: 80
        })
      });
    });

    it('should return zero stats if no data', async () => {
      req.params.id = '1';
      pool.execute.mockResolvedValueOnce([[]]);

      await WhatsAppCloudFlowController.getStats(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          total_sessions: 0
        })
      });
    });
  });
});
