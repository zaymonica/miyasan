/**
 * WhatsAppQRHandler Unit Tests
 */

jest.mock('qrcode');
jest.mock('../../../../config/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

const qrcode = require('qrcode');
const WhatsAppQRHandler = require('../../../../services/whatsapp/WhatsAppQRHandler');

describe('WhatsAppQRHandler', () => {
  let qrHandler;
  let mockIo;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockIo = {
      emit: jest.fn()
    };

    qrHandler = new WhatsAppQRHandler(mockIo, {
      maxQrGenerations: 5,
      qrTimeoutDuration: 60000
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const handler = new WhatsAppQRHandler(mockIo);
      expect(handler.maxQrGenerations).toBe(10);
      expect(handler.qrTimeoutDuration).toBe(180000);
    });

    it('should initialize with custom options', () => {
      expect(qrHandler.maxQrGenerations).toBe(5);
      expect(qrHandler.qrTimeoutDuration).toBe(60000);
    });
  });

  describe('generateQR', () => {
    it('should generate QR code', async () => {
      qrcode.toDataURL.mockResolvedValue('data:image/png;base64,qrcode');

      const result = await qrHandler.generateQR(1, 'qr-string');

      expect(result).toBe('data:image/png;base64,qrcode');
      expect(mockIo.emit).toHaveBeenCalledWith('qr-code', 'data:image/png;base64,qrcode');
    });

    it('should increment counter', async () => {
      qrcode.toDataURL.mockResolvedValue('data:image/png;base64,qrcode');

      await qrHandler.generateQR(1, 'qr-string');
      await qrHandler.generateQR(1, 'qr-string');

      expect(qrHandler.tenantCounters.get(1)).toBe(2);
    });

    it('should return null when max attempts reached', async () => {
      qrcode.toDataURL.mockResolvedValue('data:image/png;base64,qrcode');

      // Generate max QR codes
      for (let i = 0; i < 5; i++) {
        await qrHandler.generateQR(1, 'qr-string');
      }

      const result = await qrHandler.generateQR(1, 'qr-string');

      expect(result).toBeNull();
      expect(mockIo.emit).toHaveBeenCalledWith('qr-status', expect.objectContaining({
        status: 'max_attempts_reached'
      }));
    });

    it('should handle errors', async () => {
      qrcode.toDataURL.mockRejectedValue(new Error('QR error'));

      const result = await qrHandler.generateQR(1, 'qr-string');

      expect(result).toBeNull();
    });
  });

  describe('clearQR', () => {
    it('should clear QR code and counter', async () => {
      qrcode.toDataURL.mockResolvedValue('data:image/png;base64,qrcode');
      await qrHandler.generateQR(1, 'qr-string');

      qrHandler.clearQR(1);

      expect(qrHandler.tenantQRCodes.has(1)).toBe(false);
      expect(qrHandler.tenantCounters.has(1)).toBe(false);
      expect(mockIo.emit).toHaveBeenCalledWith('qr-code', null);
    });

    it('should clear timeout', async () => {
      qrcode.toDataURL.mockResolvedValue('data:image/png;base64,qrcode');
      await qrHandler.generateQR(1, 'qr-string');

      qrHandler.clearQR(1);

      expect(qrHandler.tenantTimeouts.has(1)).toBe(false);
    });
  });

  describe('getCurrentQR', () => {
    it('should return current QR code', async () => {
      qrcode.toDataURL.mockResolvedValue('data:image/png;base64,qrcode');
      await qrHandler.generateQR(1, 'qr-string');

      const result = qrHandler.getCurrentQR(1);

      expect(result).toBe('data:image/png;base64,qrcode');
    });

    it('should return null if no QR', () => {
      const result = qrHandler.getCurrentQR(999);
      expect(result).toBeNull();
    });
  });

  describe('resetCounter', () => {
    it('should reset counter to 0', async () => {
      qrcode.toDataURL.mockResolvedValue('data:image/png;base64,qrcode');
      await qrHandler.generateQR(1, 'qr-string');
      await qrHandler.generateQR(1, 'qr-string');

      qrHandler.resetCounter(1);

      expect(qrHandler.tenantCounters.get(1)).toBe(0);
    });
  });

  describe('canGenerateQR', () => {
    it('should return true if under limit', () => {
      expect(qrHandler.canGenerateQR(1)).toBe(true);
    });

    it('should return false if at limit', async () => {
      qrcode.toDataURL.mockResolvedValue('data:image/png;base64,qrcode');

      for (let i = 0; i < 5; i++) {
        await qrHandler.generateQR(1, 'qr-string');
      }

      expect(qrHandler.canGenerateQR(1)).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return stats for tenant', async () => {
      qrcode.toDataURL.mockResolvedValue('data:image/png;base64,qrcode');
      await qrHandler.generateQR(1, 'qr-string');

      const stats = qrHandler.getStats(1);

      expect(stats.tenantId).toBe(1);
      expect(stats.attempts).toBe(1);
      expect(stats.maxAttempts).toBe(5);
      expect(stats.hasQR).toBe(true);
      expect(stats.canGenerate).toBe(true);
    });

    it('should return default stats for unknown tenant', () => {
      const stats = qrHandler.getStats(999);

      expect(stats.attempts).toBe(0);
      expect(stats.hasQR).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should cleanup tenant data', async () => {
      qrcode.toDataURL.mockResolvedValue('data:image/png;base64,qrcode');
      await qrHandler.generateQR(1, 'qr-string');

      qrHandler.cleanup(1);

      expect(qrHandler.tenantQRCodes.has(1)).toBe(false);
      expect(qrHandler.tenantCounters.has(1)).toBe(false);
    });
  });

  describe('getActiveTenants', () => {
    it('should return active tenant IDs', async () => {
      qrcode.toDataURL.mockResolvedValue('data:image/png;base64,qrcode');
      await qrHandler.generateQR(1, 'qr-string');
      await qrHandler.generateQR(2, 'qr-string');

      const result = qrHandler.getActiveTenants();

      expect(result).toContain(1);
      expect(result).toContain(2);
    });
  });

  describe('setQRTimeout', () => {
    it('should emit expired status after timeout', async () => {
      qrcode.toDataURL.mockResolvedValue('data:image/png;base64,qrcode');
      await qrHandler.generateQR(1, 'qr-string');

      jest.advanceTimersByTime(60001);

      expect(mockIo.emit).toHaveBeenCalledWith('qr-status', expect.objectContaining({
        status: 'expired'
      }));
    });
  });
});
