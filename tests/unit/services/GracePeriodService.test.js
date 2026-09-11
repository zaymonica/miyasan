/**
 * GracePeriodService Unit Tests
 */

const GracePeriodService = require('../../../services/GracePeriodService');
const { pool } = require('../../../config/database');

jest.mock('../../../config/database', () => ({
  pool: {
    execute: jest.fn(),
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

describe('GracePeriodService', () => {
  let mockConnection;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockConnection = {
      execute: jest.fn(),
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn()
    };
    
    pool.getConnection.mockResolvedValue(mockConnection);
  });

  describe('getGracePeriodDays', () => {
    it('should return grace period days from settings', async () => {
      pool.execute.mockResolvedValue([[{ grace_period_days: 7 }]]);

      const days = await GracePeriodService.getGracePeriodDays();

      expect(days).toBe(7);
    });

    it('should return default 7 days if settings not found', async () => {
      pool.execute.mockResolvedValue([[]]);

      const days = await GracePeriodService.getGracePeriodDays();

      expect(days).toBe(7);
    });

    it('should return default 7 days on error', async () => {
      pool.execute.mockRejectedValue(new Error('DB error'));

      const days = await GracePeriodService.getGracePeriodDays();

      expect(days).toBe(7);
    });
  });

  describe('calculateGracePeriodEnd', () => {
    it('should add grace period days to subscription end date', async () => {
      pool.execute.mockResolvedValue([[{ grace_period_days: 7 }]]);
      
      const subscriptionEnd = new Date('2024-12-21');
      const gracePeriodEnd = await GracePeriodService.calculateGracePeriodEnd(subscriptionEnd);

      expect(gracePeriodEnd.getDate()).toBe(28);
      expect(gracePeriodEnd.getMonth()).toBe(11); // December
    });
  });

  describe('checkTenantGracePeriod', () => {
    it('should return active for active tenant', async () => {
      pool.execute.mockResolvedValue([[{
        id: 1,
        status: 'active',
        subscription_end_date: null,
        grace_period_end: null
      }]]);

      const result = await GracePeriodService.checkTenantGracePeriod(1);

      expect(result.isActive).toBe(true);
      expect(result.inGracePeriod).toBe(false);
    });

    it('should return active for trial tenant', async () => {
      pool.execute.mockResolvedValue([[{
        id: 1,
        status: 'trial',
        subscription_end_date: null,
        grace_period_end: null
      }]]);

      const result = await GracePeriodService.checkTenantGracePeriod(1);

      expect(result.isActive).toBe(true);
      expect(result.inGracePeriod).toBe(false);
    });

    it('should return active and inGracePeriod for tenant in grace period', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);

      pool.execute.mockResolvedValue([[{
        id: 1,
        status: 'grace_period',
        subscription_end_date: new Date(),
        grace_period_end: futureDate
      }]]);

      const result = await GracePeriodService.checkTenantGracePeriod(1);

      expect(result.isActive).toBe(true);
      expect(result.inGracePeriod).toBe(true);
      expect(result.daysRemaining).toBeGreaterThan(0);
    });

    it('should return inactive for tenant with expired grace period', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 5);

      pool.execute.mockResolvedValue([[{
        id: 1,
        status: 'grace_period',
        subscription_end_date: new Date('2024-01-01'),
        grace_period_end: pastDate
      }]]);

      const result = await GracePeriodService.checkTenantGracePeriod(1);

      expect(result.isActive).toBe(false);
      expect(result.inGracePeriod).toBe(false);
    });

    it('should return inactive for non-existent tenant', async () => {
      pool.execute.mockResolvedValue([[]]);

      const result = await GracePeriodService.checkTenantGracePeriod(999);

      expect(result.isActive).toBe(false);
      expect(result.inGracePeriod).toBe(false);
    });
  });

  describe('shouldAllowAccess', () => {
    it('should allow access for active tenant', async () => {
      const tenant = { id: 1, status: 'active' };

      const result = await GracePeriodService.shouldAllowAccess(tenant);

      expect(result).toBe(true);
    });

    it('should allow access for trial tenant', async () => {
      const tenant = { id: 1, status: 'trial' };

      const result = await GracePeriodService.shouldAllowAccess(tenant);

      expect(result).toBe(true);
    });

    it('should allow access for tenant in grace period', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);

      pool.execute.mockResolvedValue([[{
        id: 1,
        status: 'grace_period',
        subscription_end_date: new Date(),
        grace_period_end: futureDate
      }]]);

      const tenant = { id: 1, status: 'grace_period' };

      const result = await GracePeriodService.shouldAllowAccess(tenant);

      expect(result).toBe(true);
    });

    it('should deny access for null tenant', async () => {
      const result = await GracePeriodService.shouldAllowAccess(null);

      expect(result).toBe(false);
    });
  });

  describe('getDisplayStatus', () => {
    it('should return active for grace_period status', () => {
      const tenant = { id: 1, status: 'grace_period', name: 'Test' };

      const result = GracePeriodService.getDisplayStatus(tenant);

      expect(result.display_status).toBe('active');
      expect(result.grace_period_end).toBeUndefined();
    });

    it('should return same status for active tenant', () => {
      const tenant = { id: 1, status: 'active', name: 'Test' };

      const result = GracePeriodService.getDisplayStatus(tenant);

      expect(result.display_status).toBe('active');
    });

    it('should return same status for suspended tenant', () => {
      const tenant = { id: 1, status: 'suspended', name: 'Test' };

      const result = GracePeriodService.getDisplayStatus(tenant);

      expect(result.display_status).toBe('suspended');
    });

    it('should return null for null tenant', () => {
      const result = GracePeriodService.getDisplayStatus(null);

      expect(result).toBeNull();
    });
  });

  describe('getDisplayStatusForAll', () => {
    it('should transform all tenants', () => {
      const tenants = [
        { id: 1, status: 'active' },
        { id: 2, status: 'grace_period' },
        { id: 3, status: 'suspended' }
      ];

      const result = GracePeriodService.getDisplayStatusForAll(tenants);

      expect(result[0].display_status).toBe('active');
      expect(result[1].display_status).toBe('active'); // grace_period shows as active
      expect(result[2].display_status).toBe('suspended');
    });
  });
});
