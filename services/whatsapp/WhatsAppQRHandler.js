/**
 * WhatsAppQRHandler
 * Manages QR code generation and emission with tenant isolation
 * 
 * @module services/whatsapp/WhatsAppQRHandler
 */

const qrcode = require('qrcode');
const { logger } = require('../../config/logger');

class WhatsAppQRHandler {
  constructor(io, options = {}) {
    this.io = io;
    this.tenantQRCodes = new Map(); // Store QR codes per tenant
    this.tenantCounters = new Map(); // Store generation counters per tenant
    this.tenantTimeouts = new Map(); // Store timeouts per tenant
    this.maxQrGenerations = options.maxQrGenerations || 10;
    this.qrTimeoutDuration = options.qrTimeoutDuration || 180000; // 3 minutes
  }

  /**
   * Generate QR code for tenant
   * @param {number} tenantId - Tenant ID
   * @param {string} qrString - QR string from Baileys
   * @returns {Promise<string|null>} Base64 QR code or null
   */
  async generateQR(tenantId, qrString) {
    try {
      const currentCount = this.tenantCounters.get(tenantId) || 0;
      const newCount = currentCount + 1;
      this.tenantCounters.set(tenantId, newCount);

      logger.info('⚡ Generating QR code for tenant', {
        tenantId,
        attempt: newCount,
        maxAttempts: this.maxQrGenerations
      });

      if (newCount > this.maxQrGenerations) {
        logger.error('Maximum QR generations reached for tenant', { tenantId });
        this.emitQRStatus(tenantId, 'max_attempts_reached');
        return null;
      }

      const qrStart = Date.now();
      
      // Generate base64 QR code with optimized settings
      const qr = await qrcode.toDataURL(qrString, {
        errorCorrectionLevel: 'M', // Medium error correction (faster than H)
        type: 'image/png',
        quality: 0.92,
        margin: 1,
        width: 300 // Fixed width for faster generation
      });
      
      const qrTime = Date.now() - qrStart;
      this.tenantQRCodes.set(tenantId, qr);

      // Emit QR code directly (like 2.0 version)
      this.io.emit('qr-code', qr);
      
      logger.info(`✅ QR code generated and emitted in ${qrTime}ms`, { 
        tenantId, 
        qrLength: qr.length,
        attempt: newCount 
      });

      // Set timeout for QR expiration
      this.setQRTimeout(tenantId);

      return qr;
    } catch (error) {
      logger.error('Error generating QR code for tenant', {
        tenantId,
        error: error.message
      });
      this.emitQRStatus(tenantId, 'generation_error');
      return null;
    }
  }

  /**
   * Set timeout for QR code expiration
   * @param {number} tenantId - Tenant ID
   */
  setQRTimeout(tenantId) {
    // Clear existing timeout
    const existingTimeout = this.tenantTimeouts.get(tenantId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set new timeout
    const timeout = setTimeout(() => {
      logger.warn('QR code expired for tenant', { tenantId });
      this.emitQRStatus(tenantId, 'expired');
      this.tenantQRCodes.delete(tenantId);
    }, this.qrTimeoutDuration);

    this.tenantTimeouts.set(tenantId, timeout);
  }

  /**
   * Clear QR code for tenant
   * @param {number} tenantId - Tenant ID
   */
  clearQR(tenantId) {
    this.tenantQRCodes.delete(tenantId);
    this.tenantCounters.delete(tenantId);

    const timeout = this.tenantTimeouts.get(tenantId);
    if (timeout) {
      clearTimeout(timeout);
      this.tenantTimeouts.delete(tenantId);
    }

    // Emit null to clear QR code (like 2.0 version)
    this.io.emit('qr-code', null);
    logger.info('QR code cleared for tenant', { tenantId });
  }

  /**
   * Emit QR status event to tenant
   * @param {number} tenantId - Tenant ID
   * @param {string} status - Status message
   */
  emitQRStatus(tenantId, status) {
    const attempts = this.tenantCounters.get(tenantId) || 0;
    
    this.io.emit('qr-status', {
      status,
      tenantId,
      attempts,
      maxAttempts: this.maxQrGenerations
    });
  }

  /**
   * Get current QR code for tenant
   * @param {number} tenantId - Tenant ID
   * @returns {string|null} QR code or null
   */
  getCurrentQR(tenantId) {
    return this.tenantQRCodes.get(tenantId) || null;
  }

  /**
   * Reset QR generation counter for tenant
   * @param {number} tenantId - Tenant ID
   */
  resetCounter(tenantId) {
    this.tenantCounters.set(tenantId, 0);
    logger.info('QR generation counter reset for tenant', { tenantId });
  }

  /**
   * Check if tenant can generate more QR codes
   * @param {number} tenantId - Tenant ID
   * @returns {boolean} True if can generate
   */
  canGenerateQR(tenantId) {
    const count = this.tenantCounters.get(tenantId) || 0;
    return count < this.maxQrGenerations;
  }

  /**
   * Get QR generation stats for tenant
   * @param {number} tenantId - Tenant ID
   * @returns {Object} QR stats
   */
  getStats(tenantId) {
    return {
      tenantId,
      attempts: this.tenantCounters.get(tenantId) || 0,
      maxAttempts: this.maxQrGenerations,
      hasQR: this.tenantQRCodes.has(tenantId),
      canGenerate: this.canGenerateQR(tenantId)
    };
  }

  /**
   * Clean up tenant data
   * @param {number} tenantId - Tenant ID
   */
  cleanup(tenantId) {
    this.clearQR(tenantId);
    logger.info('QR handler cleaned up for tenant', { tenantId });
  }

  /**
   * Get all active tenants with QR codes
   * @returns {Array<number>} Array of tenant IDs
   */
  getActiveTenants() {
    return Array.from(this.tenantQRCodes.keys());
  }
}

module.exports = WhatsAppQRHandler;
