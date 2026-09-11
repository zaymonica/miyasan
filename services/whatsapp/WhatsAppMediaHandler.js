/**
 * WhatsAppMediaHandler
 * Handles media download, upload, and validation with tenant isolation
 * 
 * @module services/whatsapp/WhatsAppMediaHandler
 */

const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const { logger } = require('../../config/logger');

class WhatsAppMediaHandler {
  constructor(options = {}) {
    this.baseUploadPath = options.uploadPath || path.join(__dirname, '../../uploads/whatsapp');
    this.maxFileSize = options.maxFileSize || 50 * 1024 * 1024; // 50MB
    this.allowedMimeTypes = options.allowedMimeTypes || [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/3gpp',
      'audio/ogg',
      'audio/mpeg',
      'audio/mp4',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    this.ensureBaseDirectory();
  }

  /**
   * Ensure base upload directory exists
   */
  ensureBaseDirectory() {
    if (!fs.existsSync(this.baseUploadPath)) {
      fs.mkdirSync(this.baseUploadPath, { recursive: true });
      logger.info('Base upload directory created', { path: this.baseUploadPath });
    }
  }

  /**
   * Get tenant-specific upload path
   * @param {number} tenantId - Tenant ID
   * @returns {string} Upload path for tenant
   */
  getTenantUploadPath(tenantId) {
    return path.join(this.baseUploadPath, `tenant_${tenantId}`);
  }

  /**
   * Ensure tenant upload directory exists
   * @param {number} tenantId - Tenant ID
   */
  ensureTenantUploadDirectory(tenantId) {
    const uploadPath = this.getTenantUploadPath(tenantId);
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
      logger.info('Tenant upload directory created', { tenantId, path: uploadPath });
    }
  }

  /**
   * Download media from WhatsApp message
   * @param {number} tenantId - Tenant ID
   * @param {Object} message - WhatsApp message object
   * @param {Function} downloadMediaMessage - Baileys download function
   * @returns {Promise<Object|null>} Media info or null
   */
  async downloadMedia(tenantId, message, downloadMediaMessage) {
    try {
      if (!message.message) {
        return null;
      }

      const messageType = Object.keys(message.message)[0];

      // Check if message has media
      if (!['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'].includes(messageType)) {
        return null;
      }

      logger.info('Downloading media for tenant', { tenantId, messageType });

      // Download media buffer
      const buffer = await downloadMediaMessage(
        message,
        'buffer',
        {},
        {
          logger: {
            error: () => {},
            warn: () => {},
            info: () => {},
            debug: () => {}
          },
          reuploadRequest: () => {}
        }
      );

      if (!buffer || buffer.length === 0) {
        logger.warn('Downloaded buffer is empty', { tenantId });
        return null;
      }

      // Get media info
      const mediaInfo = message.message[messageType];
      let mimeType = mediaInfo.mimetype || 'application/octet-stream';
      
      // CRITICAL FIX: If mimetype is generic, try to detect from buffer
      if (mimeType === 'application/octet-stream') {
        const detectedMime = this.detectMimeTypeFromBuffer(buffer, '');
        if (detectedMime) {
          mimeType = detectedMime;
          logger.info('Detected mimetype from buffer', { tenantId, detectedMime });
        }
      }
      
      // CRITICAL FIX: Get proper extension based on mimetype
      let extension = mime.extension(mimeType);
      
      // If extension is still not detected, use type-specific defaults
      if (!extension || extension === 'bin') {
        switch (messageType) {
          case 'imageMessage':
            extension = 'jpg';
            if (!mimeType || mimeType === 'application/octet-stream') mimeType = 'image/jpeg';
            break;
          case 'videoMessage':
            extension = 'mp4';
            if (!mimeType || mimeType === 'application/octet-stream') mimeType = 'video/mp4';
            break;
          case 'audioMessage':
            extension = 'ogg';
            if (!mimeType || mimeType === 'application/octet-stream') mimeType = 'audio/ogg';
            break;
          case 'documentMessage':
            // Try to get extension from filename
            if (mediaInfo.fileName) {
              const fileExt = path.extname(mediaInfo.fileName).toLowerCase().replace('.', '');
              if (fileExt) {
                extension = fileExt;
                // Try to get mimetype from extension
                const extMime = mime.lookup(mediaInfo.fileName);
                if (extMime) mimeType = extMime;
              }
            }
            if (!extension || extension === 'bin') extension = 'pdf';
            break;
          case 'stickerMessage':
            extension = 'webp';
            if (!mimeType || mimeType === 'application/octet-stream') mimeType = 'image/webp';
            break;
          default:
            extension = 'bin';
        }
      }

      // Validate mime type - be more permissive
      const isAllowedType = this.allowedMimeTypes.includes(mimeType) || 
                           mimeType.startsWith('image/') || 
                           mimeType.startsWith('video/') || 
                           mimeType.startsWith('audio/') ||
                           mimeType.startsWith('application/');
      
      if (!isAllowedType) {
        logger.warn('Mime type not allowed, but proceeding anyway', { tenantId, mimeType });
      }

      // Validate file size
      if (buffer.length > this.maxFileSize) {
        logger.warn('File size exceeds limit', {
          tenantId,
          size: buffer.length,
          limit: this.maxFileSize
        });
        return null;
      }

      // Ensure tenant upload directory exists
      this.ensureTenantUploadDirectory(tenantId);

      // Generate unique filename with proper extension
      const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}.${extension}`;
      const uploadPath = this.getTenantUploadPath(tenantId);
      const filepath = path.join(uploadPath, filename);

      // Save file
      fs.writeFileSync(filepath, buffer);
      logger.info('Media saved successfully for tenant', {
        tenantId,
        filename,
        mimeType,
        extension,
        size: buffer.length
      });

      return {
        filename,
        filepath,
        mimeType,
        size: buffer.length,
        url: `/uploads/whatsapp/tenant_${tenantId}/${filename}`,
        caption: mediaInfo.caption || null
      };
    } catch (error) {
      logger.error('Error downloading media for tenant', {
        tenantId,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Upload media to WhatsApp
   * @param {number} tenantId - Tenant ID
   * @param {string} filePath - File path
   * @returns {Promise<Object|null>} Media buffer and info or null
   */
  async uploadMedia(tenantId, filePath) {
    try {
      logger.info('uploadMedia called', { tenantId, filePath });
      
      if (!fs.existsSync(filePath)) {
        logger.error('File not found for tenant', { tenantId, filePath });
        return null;
      }

      const buffer = fs.readFileSync(filePath);
      
      // Try to get mimetype from extension first
      let mimeType = mime.lookup(filePath);
      
      // If mimetype is not detected or is generic, try to detect from file content (magic bytes)
      if (!mimeType || mimeType === 'application/octet-stream') {
        mimeType = this.detectMimeTypeFromBuffer(buffer, filePath);
      }
      
      // Final fallback
      if (!mimeType) {
        mimeType = 'application/octet-stream';
      }

      logger.info('Uploading media for tenant', {
        tenantId,
        filePath,
        mimeType,
        size: buffer.length
      });

      // Determine message type based on mime
      let messageType;
      if (mimeType.startsWith('image/')) {
        messageType = 'image';
      } else if (mimeType.startsWith('video/')) {
        messageType = 'video';
      } else if (mimeType.startsWith('audio/')) {
        messageType = 'audio';
      } else {
        messageType = 'document';
      }

      return {
        buffer,
        mimeType,
        messageType
      };
    } catch (error) {
      logger.error('Error uploading media for tenant', {
        tenantId,
        filePath,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Detect MIME type from buffer using magic bytes
   * @param {Buffer} buffer - File buffer
   * @param {string} filePath - File path for extension fallback
   * @returns {string} Detected MIME type
   */
  detectMimeTypeFromBuffer(buffer, filePath) {
    if (!buffer || buffer.length < 12) {
      return null;
    }

    // Check magic bytes for common file types
    const hex = buffer.slice(0, 12).toString('hex').toUpperCase();
    
    // PDF: %PDF (25 50 44 46)
    if (hex.startsWith('255044462D')) {
      return 'application/pdf';
    }
    
    // JPEG: FF D8 FF
    if (hex.startsWith('FFD8FF')) {
      return 'image/jpeg';
    }
    
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (hex.startsWith('89504E470D0A1A0A')) {
      return 'image/png';
    }
    
    // GIF: GIF87a or GIF89a
    if (hex.startsWith('474946383761') || hex.startsWith('474946383961')) {
      return 'image/gif';
    }
    
    // WebP: RIFF....WEBP
    if (hex.startsWith('52494646') && buffer.slice(8, 12).toString() === 'WEBP') {
      return 'image/webp';
    }
    
    // MP4/MOV: ftyp
    if (hex.slice(8, 16) === '66747970') {
      return 'video/mp4';
    }
    
    // MP3: ID3 or FF FB
    if (hex.startsWith('494433') || hex.startsWith('FFFB') || hex.startsWith('FFF3')) {
      return 'audio/mpeg';
    }
    
    // OGG: OggS
    if (hex.startsWith('4F676753')) {
      return 'audio/ogg';
    }
    
    // WebM: 1A 45 DF A3
    if (hex.startsWith('1A45DFA3')) {
      return 'video/webm';
    }
    
    // DOCX/XLSX/PPTX (ZIP-based): PK
    if (hex.startsWith('504B0304')) {
      // Check extension for specific Office format
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      if (ext === '.xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      if (ext === '.pptx') return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      return 'application/zip';
    }
    
    // Try extension as last resort
    const ext = path.extname(filePath).toLowerCase();
    const extMimeMap = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
      '.webm': 'video/webm',
      '.mp3': 'audio/mpeg',
      '.ogg': 'audio/ogg',
      '.wav': 'audio/wav',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    };
    
    return extMimeMap[ext] || null;
  }

  /**
   * Validate media file
   * @param {string} filePath - File path
   * @returns {Object} Validation result
   */
  validateMedia(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        return { valid: false, error: 'File not found' };
      }

      const stats = fs.statSync(filePath);

      if (stats.size > this.maxFileSize) {
        return {
          valid: false,
          error: `File size ${stats.size} exceeds limit ${this.maxFileSize}`
        };
      }

      const mimeType = mime.lookup(filePath);

      if (!this.allowedMimeTypes.includes(mimeType)) {
        return {
          valid: false,
          error: `Mime type ${mimeType} not allowed`
        };
      }

      return {
        valid: true,
        mimeType,
        size: stats.size
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Clean old media files for tenant
   * @param {number} tenantId - Tenant ID
   * @param {number} daysToKeep - Days to keep files
   * @returns {number} Number of files deleted
   */
  cleanOldMedia(tenantId, daysToKeep = 30) {
    try {
      const uploadPath = this.getTenantUploadPath(tenantId);

      if (!fs.existsSync(uploadPath)) {
        return 0;
      }

      const files = fs.readdirSync(uploadPath);
      const now = Date.now();
      const maxAge = daysToKeep * 24 * 60 * 60 * 1000;

      let deleted = 0;

      files.forEach(file => {
        const filePath = path.join(uploadPath, file);
        const stats = fs.statSync(filePath);
        const age = now - stats.mtime.getTime();

        if (age > maxAge) {
          fs.unlinkSync(filePath);
          deleted++;
        }
      });

      if (deleted > 0) {
        logger.info('Old media cleaned for tenant', { tenantId, deleted });
      }

      return deleted;
    } catch (error) {
      logger.error('Error cleaning old media for tenant', {
        tenantId,
        error: error.message
      });
      return 0;
    }
  }

  /**
   * Get media statistics for tenant
   * @param {number} tenantId - Tenant ID
   * @returns {Object} Media statistics
   */
  getStats(tenantId) {
    try {
      const uploadPath = this.getTenantUploadPath(tenantId);

      if (!fs.existsSync(uploadPath)) {
        return {
          tenantId,
          totalFiles: 0,
          totalSize: 0
        };
      }

      const files = fs.readdirSync(uploadPath);
      let totalSize = 0;

      files.forEach(file => {
        const filePath = path.join(uploadPath, file);
        const stats = fs.statSync(filePath);
        totalSize += stats.size;
      });

      return {
        tenantId,
        totalFiles: files.length,
        totalSize,
        totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2)
      };
    } catch (error) {
      logger.error('Error getting media stats for tenant', {
        tenantId,
        error: error.message
      });
      return {
        tenantId,
        totalFiles: 0,
        totalSize: 0,
        error: error.message
      };
    }
  }

  /**
   * Delete all media for tenant
   * @param {number} tenantId - Tenant ID
   * @returns {boolean} Success status
   */
  deleteAllMedia(tenantId) {
    try {
      const uploadPath = this.getTenantUploadPath(tenantId);

      if (fs.existsSync(uploadPath)) {
        fs.rmSync(uploadPath, { recursive: true, force: true });
        logger.info('All media deleted for tenant', { tenantId });
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Error deleting all media for tenant', {
        tenantId,
        error: error.message
      });
      return false;
    }
  }
}

module.exports = WhatsAppMediaHandler;
