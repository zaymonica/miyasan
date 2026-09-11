/**
 * Translation Service
 * Centralized translation management with i18n support
 */

const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');

class TranslationService {
  constructor() {
    this.translations = {};
    this.defaultLanguage = 'en';
    this.loadTranslations();
    this.refreshDefaultLanguage();
  }

  /**
   * Load all translation files
   */
  loadTranslations() {
    const localesPath = path.join(__dirname, '../locales');
    
    try {
      const files = fs.readdirSync(localesPath);
      
      files.forEach(file => {
        if (file.endsWith('.json')) {
          const lang = file.replace('.json', '');
          const filePath = path.join(localesPath, file);
          this.translations[lang] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
      });
    } catch (error) {
      console.error('Error loading translations:', error.message);
    }
  }

  async refreshDefaultLanguage() {
    try {
      const [rows] = await pool.execute(
        `SELECT setting_value FROM system_settings_kv WHERE setting_key = 'default_language' LIMIT 1`
      );
      if (rows && rows[0] && rows[0].setting_value) {
        this.defaultLanguage = rows[0].setting_value;
      }
    } catch (error) {
      console.error('Error loading default language:', error.message);
    }
  }

  setDefaultLanguage(language) {
    if (language && typeof language === 'string') {
      this.defaultLanguage = language;
    }
  }

  /**
   * Get translation for a key
   * @param {string} key - Translation key (e.g., 'errors.not_found')
   * @param {string} lang - Language code (default: 'en')
   * @param {object} params - Parameters for interpolation
   * @returns {string} Translated text
   */
  t(key, lang = 'en', params = {}) {
    const keys = key.split('.');
    let translation = this.translations[lang] || this.translations[this.defaultLanguage];

    for (const k of keys) {
      if (translation && translation[k]) {
        translation = translation[k];
      } else {
        // Fallback to default language
        translation = this.translations[this.defaultLanguage];
        for (const k2 of keys) {
          if (translation && translation[k2]) {
            translation = translation[k2];
          } else {
            return key; // Return key if translation not found
          }
        }
        break;
      }
    }

    // Interpolate parameters
    if (typeof translation === 'string' && params) {
      Object.keys(params).forEach(param => {
        translation = translation.replace(new RegExp(`{{${param}}}`, 'g'), params[param]);
      });
    }

    return translation;
  }

  /**
   * Get user's preferred language from request
   * @param {object} req - Express request object
   * @returns {string} Language code
   */
  getLanguage(req) {
    // Priority: 1. User preference, 2. Accept-Language header, 3. Default
    if (req.user && req.user.preferred_language) {
      return req.user.preferred_language;
    }

    if (req.headers['accept-language']) {
      const lang = req.headers['accept-language'].split(',')[0].split('-')[0];
      if (this.translations[lang]) {
        return lang;
      }
    }

    return this.defaultLanguage;
  }

  /**
   * Middleware to add translation function to request
   */
  middleware() {
    return (req, res, next) => {
      const lang = this.getLanguage(req);
      req.t = (key, params) => this.t(key, lang, params);
      req.lang = lang;
      next();
    };
  }
}

// Export singleton instance
module.exports = new TranslationService();
