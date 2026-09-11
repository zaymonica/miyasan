/**
 * WhatsAppStateManager Unit Tests
 */

const path = require('path');
const fs = require('fs');

// Mock fs module
jest.mock('fs');

// Mock logger
jest.mock('../../../../config/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

const WhatsAppStateManager = require('../../../../services/whatsapp/WhatsAppStateManager');

describe('WhatsAppStateManager', () => {
  let stateManager;

  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(true);
    fs.mkdirSync.mockReturnValue(undefined);
    stateManager = new WhatsAppStateManager('/test/sessions');
  });

  describe('constructor', () => {
    it('should create instance with custom path', () => {
      expect(stateManager.baseSessionPath).toBe('/test/sessions');
    });

    it('should create base directory if not exists', () => {
      fs.existsSync.mockReturnValue(false);
      new WhatsAppStateManager('/new/path');
      expect(fs.mkdirSync).toHaveBeenCalled();
    });
  });

  describe('getTenantSessionPath', () => {
    it('should return correct path for tenant', () => {
      const result = stateManager.getTenantSessionPath(1);
      expect(result).toContain('tenant_1');
    });
  });

  describe('ensureTenantSessionDirectory', () => {
    it('should create directory if not exists', () => {
      fs.existsSync.mockReturnValue(false);
      stateManager.ensureTenantSessionDirectory(1);
      expect(fs.mkdirSync).toHaveBeenCalled();
    });

    it('should not create if already exists', () => {
      fs.existsSync.mockReturnValue(true);
      fs.mkdirSync.mockClear();
      stateManager.ensureTenantSessionDirectory(1);
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('hasSession', () => {
    it('should return true if creds.json exists', () => {
      fs.existsSync.mockReturnValue(true);
      expect(stateManager.hasSession(1)).toBe(true);
    });

    it('should return false if creds.json not exists', () => {
      fs.existsSync.mockReturnValue(false);
      expect(stateManager.hasSession(1)).toBe(false);
    });
  });

  describe('clearSession', () => {
    it('should clear session files', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(['creds.json', 'keys']);
      fs.lstatSync.mockReturnValue({ isDirectory: () => false });
      fs.unlinkSync.mockReturnValue(undefined);

      const result = stateManager.clearSession(1);

      expect(result).toBe(true);
    });

    it('should return false if session not exists', () => {
      fs.existsSync.mockReturnValue(false);
      expect(stateManager.clearSession(1)).toBe(false);
    });

    it('should handle errors', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockImplementation(() => { throw new Error('Error'); });

      expect(stateManager.clearSession(1)).toBe(false);
    });
  });

  describe('getSessionInfo', () => {
    it('should return session info if exists', () => {
      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockReturnValue({
        mtime: new Date(),
        size: 1024
      });

      const result = stateManager.getSessionInfo(1);

      expect(result.exists).toBe(true);
      expect(result.tenantId).toBe(1);
      expect(result.size).toBe(1024);
    });

    it('should return not exists if no creds', () => {
      fs.existsSync.mockReturnValue(false);

      const result = stateManager.getSessionInfo(1);

      expect(result.exists).toBe(false);
    });

    it('should handle errors', () => {
      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockImplementation(() => { throw new Error('Error'); });

      const result = stateManager.getSessionInfo(1);

      expect(result.exists).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('getAllTenantSessions', () => {
    it('should return tenant IDs', () => {
      fs.readdirSync.mockReturnValue(['tenant_1', 'tenant_2', 'tenant_3_backup_123']);

      const result = stateManager.getAllTenantSessions();

      expect(result).toEqual([1, 2]);
    });

    it('should handle errors', () => {
      fs.readdirSync.mockImplementation(() => { throw new Error('Error'); });

      const result = stateManager.getAllTenantSessions();

      expect(result).toEqual([]);
    });
  });

  describe('getStats', () => {
    it('should return statistics', () => {
      fs.readdirSync.mockReturnValue(['tenant_1', 'tenant_2', 'tenant_1_backup_123']);

      const result = stateManager.getStats();

      expect(result.totalSessions).toBe(2);
      expect(result.totalBackups).toBe(1);
    });

    it('should handle errors', () => {
      fs.readdirSync.mockImplementation(() => { throw new Error('Error'); });

      const result = stateManager.getStats();

      expect(result.totalSessions).toBe(0);
    });
  });

  describe('cleanOldBackups', () => {
    it('should clean old backups', () => {
      const oldTimestamp = Date.now() - (10 * 24 * 60 * 60 * 1000); // 10 days ago
      fs.readdirSync.mockReturnValue([`tenant_1_backup_${oldTimestamp}`]);
      fs.rmSync.mockReturnValue(undefined);

      const result = stateManager.cleanOldBackups(7);

      expect(result).toBe(1);
      expect(fs.rmSync).toHaveBeenCalled();
    });

    it('should not clean recent backups', () => {
      const recentTimestamp = Date.now() - (1 * 24 * 60 * 60 * 1000); // 1 day ago
      fs.readdirSync.mockReturnValue([`tenant_1_backup_${recentTimestamp}`]);

      const result = stateManager.cleanOldBackups(7);

      expect(result).toBe(0);
    });

    it('should handle errors', () => {
      fs.readdirSync.mockImplementation(() => { throw new Error('Error'); });

      const result = stateManager.cleanOldBackups(7);

      expect(result).toBe(0);
    });
  });

  describe('backupSession', () => {
    it('should backup session', () => {
      fs.existsSync.mockReturnValue(true);
      fs.mkdirSync.mockReturnValue(undefined);
      fs.readdirSync.mockReturnValue(['creds.json']);
      fs.lstatSync.mockReturnValue({ isDirectory: () => false });
      fs.copyFileSync.mockReturnValue(undefined);

      const result = stateManager.backupSession(1);

      expect(result).toBe(true);
    });

    it('should return false if no session', () => {
      fs.existsSync.mockReturnValue(false);

      const result = stateManager.backupSession(1);

      expect(result).toBe(false);
    });

    it('should handle errors', () => {
      fs.existsSync.mockReturnValue(true);
      fs.mkdirSync.mockImplementation(() => { throw new Error('Error'); });

      const result = stateManager.backupSession(1);

      expect(result).toBe(false);
    });
  });
});
