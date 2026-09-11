/**
 * MassSendController Unit Tests
 */

const MassSendController = require('../../../controllers/MassSendController');

// Mock dependencies
jest.mock('../../../config/database', () => ({
  pool: {
    execute: jest.fn(),
    getConnection: jest.fn()
  }
}));

jest.mock('../../../services/MassSendService', () => ({
  createMassSend: jest.fn(),
  getMassSendHistory: jest.fn(),
  getMassSendById: jest.fn(),
  startMassSend: jest.fn(),
  pauseMassSend: jest.fn(),
  cancelMassSend: jest.fn(),
  getMassSendLogs: jest.fn(),
  createScheduledSend: jest.fn(),
  getScheduledSends: jest.fn(),
  cancelScheduledSend: jest.fn(),
  createReminder: jest.fn(),
  getReminders: jest.fn()
}));

const { pool } = require('../../../config/database');
const MassSendService = require('../../../services/MassSendService');

describe('MassSendController', () => {
  let mockReq;
  let mockRes;

  beforeEach(() => {
    jest.clearAllMocks();

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

  describe('createMassSend', () => {
    it('should create mass send campaign', async () => {
      mockReq.body = {
        name: 'Test Campaign',
        message: 'Hello!',
        recipients: [{ phone: '123456789' }]
      };

      MassSendService.createMassSend.mockResolvedValue({ id: 1 });

      await MassSendController.createMassSend(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ id: 1 })
        })
      );
    });

    it('should reject if required fields missing', async () => {
      mockReq.body = { name: 'Test' };

      await MassSendController.createMassSend(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('getMassSendHistory', () => {
    it('should return mass send history', async () => {
      mockReq.query = { page: 1, limit: 20 };

      MassSendService.getMassSendHistory.mockResolvedValue([
        { id: 1, name: 'Campaign 1' },
        { id: 2, name: 'Campaign 2' }
      ]);

      await MassSendController.getMassSendHistory(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.any(Array)
        })
      );
    });
  });

  describe('getMassSendById', () => {
    it('should return mass send by id', async () => {
      mockReq.params = { id: 1 };

      MassSendService.getMassSendById.mockResolvedValue({
        id: 1,
        name: 'Test Campaign',
        status: 'pending'
      });

      await MassSendController.getMassSendById(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ id: 1 })
        })
      );
    });

    it('should return 404 if not found', async () => {
      mockReq.params = { id: 999 };
      MassSendService.getMassSendById.mockResolvedValue(null);

      await MassSendController.getMassSendById(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  describe('startMassSend', () => {
    it('should start mass send campaign', async () => {
      mockReq.params = { id: 1 };

      MassSendService.startMassSend.mockResolvedValue({ started: true });

      await MassSendController.startMassSend(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  describe('pauseMassSend', () => {
    it('should pause mass send campaign', async () => {
      mockReq.params = { id: 1 };

      MassSendService.pauseMassSend.mockResolvedValue({ paused: true });

      await MassSendController.pauseMassSend(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  describe('cancelMassSend', () => {
    it('should cancel mass send campaign', async () => {
      mockReq.params = { id: 1 };

      MassSendService.cancelMassSend.mockResolvedValue({ cancelled: true });

      await MassSendController.cancelMassSend(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  describe('getMassSendLogs', () => {
    it('should return send logs', async () => {
      mockReq.params = { id: 1 };

      MassSendService.getMassSendLogs.mockResolvedValue([
        { id: 1, phone_number: '123', status: 'success' }
      ]);

      await MassSendController.getMassSendLogs(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.any(Array)
        })
      );
    });
  });

  describe('createScheduledSend', () => {
    it('should create scheduled send', async () => {
      mockReq.body = {
        name: 'Scheduled Campaign',
        message: 'Hello!',
        recipients: [{ phone: '123' }],
        scheduledDate: '2024-12-25T10:00:00'
      };

      MassSendService.createScheduledSend.mockResolvedValue({ id: 1 });

      await MassSendController.createScheduledSend(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  describe('getScheduledSends', () => {
    it('should return scheduled sends', async () => {
      MassSendService.getScheduledSends.mockResolvedValue([
        { id: 1, name: 'Scheduled 1' }
      ]);

      await MassSendController.getScheduledSends(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.any(Array)
        })
      );
    });
  });

  describe('cancelScheduledSend', () => {
    it('should cancel scheduled send', async () => {
      mockReq.params = { id: 1 };

      MassSendService.cancelScheduledSend.mockResolvedValue({ cancelled: true });

      await MassSendController.cancelScheduledSend(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  describe('createReminder', () => {
    it('should create reminder', async () => {
      mockReq.body = {
        name: 'Reminder',
        message: 'Reminder message',
        recipients: [{ phone: '123' }],
        finalDate: '2024-12-31',
        reminderDates: ['2024-12-25', '2024-12-28']
      };

      MassSendService.createReminder.mockResolvedValue({ id: 1 });

      await MassSendController.createReminder(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  describe('getReminders', () => {
    it('should return reminders', async () => {
      MassSendService.getReminders.mockResolvedValue([
        { id: 1, name: 'Reminder 1' }
      ]);

      await MassSendController.getReminders(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.any(Array)
        })
      );
    });
  });
});
