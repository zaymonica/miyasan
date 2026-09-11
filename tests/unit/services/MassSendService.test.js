/**
 * MassSendService Unit Tests
 */

const MassSendService = require('../../../services/MassSendService');

// Mock dependencies
jest.mock('../../../config/database', () => ({
  pool: {
    execute: jest.fn(),
    getConnection: jest.fn()
  }
}));

jest.mock('../../../services/WhatsAppService', () => ({
  getWhatsAppService: jest.fn()
}));

const { pool } = require('../../../config/database');
const { getWhatsAppService } = require('../../../services/WhatsAppService');

describe('MassSendService', () => {
  let mockConnection;
  let mockWhatsAppService;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConnection = {
      execute: jest.fn(),
      query: jest.fn(),
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn()
    };

    mockWhatsAppService = {
      sendMessage: jest.fn(),
      getStatus: jest.fn()
    };

    pool.getConnection.mockResolvedValue(mockConnection);
    getWhatsAppService.mockReturnValue(mockWhatsAppService);
  });

  describe('createMassSend', () => {
    it('should create mass send campaign', async () => {
      const data = {
        tenantId: 1,
        name: 'Test Campaign',
        message: 'Hello {{name}}!',
        recipients: [
          { phone: '123456789', name: 'John' },
          { phone: '987654321', name: 'Jane' }
        ]
      };

      mockConnection.execute.mockResolvedValue([{ insertId: 1 }]);

      const result = await MassSendService.createMassSend(data);

      expect(result).toEqual(expect.objectContaining({
        id: 1
      }));
      expect(mockConnection.execute).toHaveBeenCalled();
    });

    it('should validate recipients', async () => {
      const data = {
        tenantId: 1,
        name: 'Test',
        message: 'Hello',
        recipients: []
      };

      await expect(MassSendService.createMassSend(data))
        .rejects.toThrow();
    });
  });

  describe('getMassSendHistory', () => {
    it('should return mass send history', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, name: 'Campaign 1', status: 'completed' },
        { id: 2, name: 'Campaign 2', status: 'pending' }
      ]]);

      const result = await MassSendService.getMassSendHistory(1);

      expect(result).toHaveLength(2);
    });

    it('should filter by status', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, name: 'Campaign 1', status: 'completed' }
      ]]);

      const result = await MassSendService.getMassSendHistory(1, { status: 'completed' });

      expect(result).toHaveLength(1);
    });
  });

  describe('getMassSendById', () => {
    it('should return mass send by id', async () => {
      pool.execute.mockResolvedValue([[{
        id: 1,
        name: 'Test Campaign',
        recipients: '[{"phone":"123"}]'
      }]]);

      const result = await MassSendService.getMassSendById(1, 1);

      expect(result).toEqual(expect.objectContaining({
        id: 1,
        name: 'Test Campaign'
      }));
    });

    it('should return null if not found', async () => {
      pool.execute.mockResolvedValue([[]]);

      const result = await MassSendService.getMassSendById(1, 999);

      expect(result).toBeNull();
    });
  });

  describe('startMassSend', () => {
    it('should start mass send campaign', async () => {
      pool.execute
        .mockResolvedValueOnce([[{
          id: 1,
          status: 'pending',
          recipients: JSON.stringify([{ phone: '123456789' }]),
          message: 'Hello!'
        }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      mockWhatsAppService.getStatus.mockReturnValue({ connected: true });
      mockWhatsAppService.sendMessage.mockResolvedValue({ success: true });

      const result = await MassSendService.startMassSend(1, 1);

      expect(result.started).toBe(true);
    });

    it('should reject if WhatsApp not connected', async () => {
      pool.execute.mockResolvedValue([[{
        id: 1,
        status: 'pending',
        recipients: '[]'
      }]]);

      mockWhatsAppService.getStatus.mockReturnValue({ connected: false });

      await expect(MassSendService.startMassSend(1, 1))
        .rejects.toThrow();
    });
  });

  describe('pauseMassSend', () => {
    it('should pause mass send campaign', async () => {
      pool.execute
        .mockResolvedValueOnce([[{ id: 1, status: 'sending' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await MassSendService.pauseMassSend(1, 1);

      expect(result.paused).toBe(true);
    });

    it('should reject if not in sending status', async () => {
      pool.execute.mockResolvedValue([[{ id: 1, status: 'completed' }]]);

      await expect(MassSendService.pauseMassSend(1, 1))
        .rejects.toThrow();
    });
  });

  describe('cancelMassSend', () => {
    it('should cancel mass send campaign', async () => {
      pool.execute
        .mockResolvedValueOnce([[{ id: 1, status: 'pending' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await MassSendService.cancelMassSend(1, 1);

      expect(result.cancelled).toBe(true);
    });
  });

  describe('getMassSendLogs', () => {
    it('should return send logs', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, phone_number: '123', status: 'success' },
        { id: 2, phone_number: '456', status: 'failed' }
      ]]);

      const result = await MassSendService.getMassSendLogs(1);

      expect(result).toHaveLength(2);
    });
  });

  describe('createScheduledSend', () => {
    it('should create scheduled send', async () => {
      const data = {
        tenantId: 1,
        name: 'Scheduled Campaign',
        message: 'Hello!',
        recipients: [{ phone: '123' }],
        scheduledDate: new Date('2024-12-25')
      };

      mockConnection.execute.mockResolvedValue([{ insertId: 1 }]);

      const result = await MassSendService.createScheduledSend(data);

      expect(result.id).toBe(1);
    });
  });

  describe('getScheduledSends', () => {
    it('should return scheduled sends', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, name: 'Scheduled 1', scheduled_date: '2024-12-25' }
      ]]);

      const result = await MassSendService.getScheduledSends(1);

      expect(result).toHaveLength(1);
    });
  });

  describe('createReminder', () => {
    it('should create reminder', async () => {
      const data = {
        tenantId: 1,
        name: 'Reminder',
        message: 'Reminder message',
        recipients: [{ phone: '123' }],
        finalDate: new Date('2024-12-31'),
        reminderDates: ['2024-12-25', '2024-12-28']
      };

      mockConnection.execute.mockResolvedValue([{ insertId: 1 }]);

      const result = await MassSendService.createReminder(data);

      expect(result.id).toBe(1);
    });
  });
});
