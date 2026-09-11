/**
 * WhatsAppStateManager
 * Manages WhatsApp session state with tenant isolation
 * 
 * @module services/whatsapp/WhatsAppStateManager
 */

const fs = require('fs');
const path = require('path');
const { logger } = require('../../config/logger');

class WhatsAppStateManager {
  constructor(baseSessionPath) {
    this.baseSessionPath = baseSessionPath || path.join(__dirname, '../../sessions');
    this.ensureBaseDirectory();
  }

  /**
   * Ensure base sessions directory exists
   */
  ensureBaseDirectory() {
    if (!fs.existsSync(this.baseSessionPath)) {
      fs.mkdirSync(this.baseSessionPath, { recursive: true });
      logger.info('Base sessions directory created', { path: this.baseSessionPath });
    }
  }

  /**
   * Get tenant-specific session path
   * @param {number} tenantId - Tenant ID
   * @returns {string} Session path for tenant
   */
  getTenantSessionPath(tenantId) {
    const basePath = path.join(this.baseSessionPath, `tenant_${tenantId}`);
    const nestedPath = path.join(basePath, `tenant_${tenantId}`);
    const nestedCreds = path.join(nestedPath, 'creds.json');
    if (fs.existsSync(nestedCreds)) {
      return nestedPath;
    }
    return basePath;
  }

  /**
   * Ensure tenant session directory exists
   * @param {number} tenantId - Tenant ID
   */
  ensureTenantSessionDirectory(tenantId) {
    const sessionPath = this.getTenantSessionPath(tenantId);
    if (!fs.existsSync(sessionPath)) {
      fs.mkdirSync(sessionPath, { recursive: true });
      logger.info('Tenant session directory created', { tenantId, path: sessionPath });
    }
  }

  /**
   * Check if tenant has saved session
   * @param {number} tenantId - Tenant ID
   * @returns {boolean} True if session exists
   */
  hasSession(tenantId) {
    const sessionPath = this.getTenantSessionPath(tenantId);
    const credsPath = path.join(sessionPath, 'creds.json');
    if (fs.existsSync(credsPath)) {
      return true;
    }
    const nestedPath = path.join(this.baseSessionPath, `tenant_${tenantId}`, `tenant_${tenantId}`);
    const nestedCreds = path.join(nestedPath, 'creds.json');
    return fs.existsSync(nestedCreds);
  }

  /**
   * Clear tenant session
   * @param {number} tenantId - Tenant ID
   * @returns {boolean} Success status
   */
  clearSession(tenantId) {
    try {
      const sessionPath = this.getTenantSessionPath(tenantId);
      
      if (fs.existsSync(sessionPath)) {
        const files = fs.readdirSync(sessionPath);
        files.forEach(file => {
          const filePath = path.join(sessionPath, file);
          if (fs.lstatSync(filePath).isDirectory()) {
            fs.rmSync(filePath, { recursive: true, force: true });
          } else {
            fs.unlinkSync(filePath);
          }
        });
        logger.info('Tenant session cleared', { tenantId });
        return true;
      }
      return false;
    } catch (error) {
      logger.error('Error clearing tenant session', { tenantId, error: error.message });
      return false;
    }
  }

  /**
   * Backup tenant session
   * @param {number} tenantId - Tenant ID
   * @returns {boolean} Success status
   */
  backupSession(tenantId) {
    try {
      const sessionPath = this.getTenantSessionPath(tenantId);
      const backupPath = path.join(
        this.baseSessionPath,
        `tenant_${tenantId}_backup_${Date.now()}`
      );

      if (!fs.existsSync(sessionPath)) {
        logger.warn('No session to backup', { tenantId });
        return false;
      }

      fs.mkdirSync(backupPath, { recursive: true });

      const files = fs.readdirSync(sessionPath);
      files.forEach(file => {
        const srcPath = path.join(sessionPath, file);
        const destPath = path.join(backupPath, file);
        
        if (fs.lstatSync(srcPath).isDirectory()) {
          fs.cpSync(srcPath, destPath, { recursive: true });
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
      });

      logger.info('Tenant session backed up', { tenantId, backupPath });
      return true;
    } catch (error) {
      logger.error('Error backing up tenant session', { tenantId, error: error.message });
      return false;
    }
  }

  /**
   * Get tenant session info
   * @param {number} tenantId - Tenant ID
   * @returns {Object} Session info
   */
  getSessionInfo(tenantId) {
    try {
      const sessionPath = this.getTenantSessionPath(tenantId);
      const credsPath = path.join(sessionPath, 'creds.json');

      if (!fs.existsSync(credsPath)) {
        return {
          exists: false,
          tenantId,
          createdAt: null,
          size: 0
        };
      }

      const stats = fs.statSync(credsPath);

      return {
        exists: true,
        tenantId,
        createdAt: stats.mtime,
        size: stats.size,
        path: sessionPath
      };
    } catch (error) {
      logger.error('Error getting tenant session info', { tenantId, error: error.message });
      return {
        exists: false,
        tenantId,
        error: error.message
      };
    }
  }

  /**
   * Clean old backup sessions
   * @param {number} daysToKeep - Days to keep backups
   * @returns {number} Number of cleaned backups
   */
  cleanOldBackups(daysToKeep = 7) {
    try {
      const files = fs.readdirSync(this.baseSessionPath);
      const backupDirs = files.filter(f => f.includes('_backup_'));

      const now = Date.now();
      const maxAge = daysToKeep * 24 * 60 * 60 * 1000;

      let cleaned = 0;

      backupDirs.forEach(dir => {
        const match = dir.match(/_backup_(\d+)$/);
        if (match) {
          const timestamp = parseInt(match[1]);
          const age = now - timestamp;

          if (age > maxAge) {
            const fullPath = path.join(this.baseSessionPath, dir);
            fs.rmSync(fullPath, { recursive: true, force: true });
            cleaned++;
            logger.info('Old backup cleaned', { 
              dir, 
              ageInDays: Math.floor(age / (24 * 60 * 60 * 1000)) 
            });
          }
        }
      });

      if (cleaned > 0) {
        logger.info('Backup cleanup completed', { cleaned });
      }

      return cleaned;
    } catch (error) {
      logger.error('Error cleaning old backups', { error: error.message });
      return 0;
    }
  }

  /**
   * Get all tenant sessions
   * @returns {Array} Array of tenant IDs with sessions
   */
  getAllTenantSessions() {
    try {
      const files = fs.readdirSync(this.baseSessionPath);
      const tenantDirs = files.filter(f => f.startsWith('tenant_') && !f.includes('_backup_'));

      return tenantDirs.map(dir => {
        const match = dir.match(/^tenant_(\d+)$/);
        return match ? parseInt(match[1]) : null;
      }).filter(id => id !== null);
    } catch (error) {
      logger.error('Error getting all tenant sessions', { error: error.message });
      return [];
    }
  }

  /**
   * Get session statistics
   * @returns {Object} Session statistics
   */
  getStats() {
    try {
      const tenantSessions = this.getAllTenantSessions();
      const backups = fs.readdirSync(this.baseSessionPath)
        .filter(f => f.includes('_backup_')).length;

      return {
        totalSessions: tenantSessions.length,
        totalBackups: backups,
        tenants: tenantSessions
      };
    } catch (error) {
      logger.error('Error getting session stats', { error: error.message });
      return {
        totalSessions: 0,
        totalBackups: 0,
        tenants: []
      };
    }
  }
}

module.exports = WhatsAppStateManager;
