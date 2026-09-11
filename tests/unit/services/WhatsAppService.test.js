/**
 * WhatsAppService Unit Tests
 * Tests for multi-tenant WhatsApp service
 */

const { WhatsAppService } = require('../../../services/WhatsAppService');
const BillingService = require('../../../services/BillingService');

// Mock dependencies
jest.mock('../../../config/database');
jest.mock('../../../config/logger');
jest.mock('../../../services/BillingService');
jest.mock('../../../services/whatsapp/WhatsAppConnection');
jest.mock('../../../services/whatsapp/WhatsAppMessageHandler');
jest.mock('../../../services/whatsapp/WhatsAppMediaHandler');
jest.mock('../../../services/whatsapp/WhatsAppQRHandler');
jest.mock('../../../services/whatsapp/WhatsAppStateManager');

describe('WhatsAppService', () => {
  let whatsappService;
  let mockIo;
  let mockPool;

  beforeEach(() => {
    // Mock Socket.IO
    mockIo = {
      of: jest.fn().mockReturnValue({
        emit: jest.fn(),
        on: jest.fn()
      })
    };

    // Mock database pool
    mockPool = {
      getConnection: jest.fn().mockResolvedValue({
        query: jest.fn().mockResolvedValue([[{ id: 1, status: 'active' }], {}]),
        release: jest.fn()
      })
    };

    const { pool } = require('../../../config/database');
    Object.assign(pool, mockPool);

    whatsappService = new WhatsAppService(mockIo);

    // Mock BillingService
    BillingService.checkUsageLimits = jest.fn().mockResolvedValue(true);
    BillingService.trackMessageUsage = jest.fn().mockResolvedValue({
      current: 10,
      limit: 1000,
      remaining: 990
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initializeTenant', () => {
    it('should initialize WhatsApp for a new tenant', async () => {
      const tenantId = 1;
      
      const instance = await whatsappService.initializeTenant(tenantId);

      expect(instance).toBeDefined();
      expect(instance.tenantId).toBe(tenantId);
      expect(mockIo.of).toHaveBeenCalledWith(`/tenant/${tenantId}`);
    });

    it('should return existing instance if already initialized', async () => {
      const tenantId = 1;
      
      const instance1 = await whatsappService.initializeTenant(tenantId);
      const instance2 = await whatsappService.initializeTenant(tenantId);

      expect(instance1).toBe(instance2);
    });

    it('should throw error for inactive tenant', async () => {
      // Create a fresh service instance with the correct mock
      const mockConnection = {
        query: jest.fn().mockResolvedValue([[], {}]),
        release: jest.fn()
      };
      
      const { pool } = require('../../../config/database');
      pool.getConnection = jest.fn().mockResolvedValue(mockConnection);
      
      const freshService = new WhatsAppService(mockIo);

      await expect(freshService.initializeTenant(999))
        .rejects.toThrow('Tenant not found or inactive');
    });
  });

  describe('sendMessage', () => {
    it('should send message successfully', async () => {
      const tenantId = 1;
      await whatsappService.initializeTenant(tenantId);

      const mockSocket = {
        sendMessage: jest.fn().mockResolvedValue(true)
      };

      whatsappService.tenantInstances.get(tenantId).connection.getSocket = jest.fn()
        .mockReturnValue(mockSocket);
      whatsappService.tenantInstances.get(tenantId).connection.isConnected = jest.fn()
        .mockReturnValue(true);

      const result = await whatsappService.sendMessage(tenantId, '5511999999999', 'Test message');

      expect(result.success).toBe(true);
      expect(mockSocket.sendMessage).toHaveBeenCalled();
      expect(BillingService.trackMessageUsage).toHaveBeenCalledWith(tenantId, 1);
    });

    it('should fail if tenant not initialized', async () => {
      const result = await whatsappService.sendMessage(999, '5511999999999', 'Test');

      expect(result.success).toBe(false);
      expect(result.error).toBe('WhatsApp not initialized for this tenant');
    });

    it('should fail if usage limits exceeded', async () => {
      BillingService.checkUsageLimits = jest.fn().mockResolvedValue(false);

      const tenantId = 1;
      await whatsappService.initializeTenant(tenantId);

      const result = await whatsappService.sendMessage(tenantId, '5511999999999', 'Test');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Monthly message limit exceeded');
    });
  });

  describe('getTenantStatus', () => {
    it('should return status for initialized tenant', async () => {
      const tenantId = 1;
      await whatsappService.initializeTenant(tenantId);

      const status = await whatsappService.getTenantStatus(tenantId);

      expect(status).toBeDefined();
      expect(status.status).toBeDefined();
    });

    it('should return disconnected for non-initialized tenant', async () => {
      const status = await whatsappService.getTenantStatus(999);

      expect(status.status).toBe('disconnected');
    });
  });

  describe('disconnect', () => {
    it('should disconnect tenant successfully', async () => {
      const tenantId = 1;
      await whatsappService.initializeTenant(tenantId);

      const result = await whatsappService.disconnect(tenantId);

      expect(result).toBe(true);
      expect(whatsappService.getInstance(tenantId)).toBeNull();
    });

    it('should return false for non-existent tenant', async () => {
      const result = await whatsappService.disconnect(999);

      expect(result).toBe(false);
    });
  });

  describe('clearSession', () => {
    it('should clear session and remove instance', async () => {
      const tenantId = 1;
      const instance = await whatsappService.initializeTenant(tenantId);
      
      // Mock stateManager.clearSession to return true
      instance.stateManager.clearSession = jest.fn().mockReturnValue(true);
      instance.stateManager.backupSession = jest.fn();
      instance.connection.disconnect = jest.fn().mockResolvedValue(true);
      instance.qrHandler.resetCounter = jest.fn();
      instance.qrHandler.clearQR = jest.fn();

      const result = await whatsappService.clearSession(tenantId);

      expect(result).toBe(true);
      expect(whatsappService.getInstance(tenantId)).toBeNull();
    });
  });

  describe('getActiveTenants', () => {
    it('should return list of active tenant IDs', async () => {
      await whatsappService.initializeTenant(1);
      await whatsappService.initializeTenant(2);

      const activeTenants = whatsappService.getActiveTenants();

      expect(activeTenants).toContain(1);
      expect(activeTenants).toContain(2);
      expect(activeTenants.length).toBe(2);
    });
  });
});
