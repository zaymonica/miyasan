/**
 * RTL (Right-to-Left) Configuration Module
 * 
 * Centralizes RTL/LTR direction management for the system.
 * This module provides configuration and utilities for RTL support
 * without affecting existing LTR functionality.
 * 
 * @module config/rtl
 */

const logger = require('./logger');

/**
 * RTL-enabled languages
 * Add language codes that require RTL layout
 */
const RTL_LANGUAGES = [
  'ar', // Arabic
  'he', // Hebrew
  'fa', // Persian/Farsi
  'ur', // Urdu
  'yi', // Yiddish
];

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  enabled: process.env.RTL_ENABLED === 'true' || false,
  defaultLanguage: process.env.DEFAULT_LANGUAGE || 'en',
  autoDetect: process.env.RTL_AUTO_DETECT === 'true' || true,
};

/**
 * Check if a language requires RTL layout
 * @param {string} languageCode - ISO 639-1 language code (e.g., 'ar', 'en')
 * @returns {boolean} True if language requires RTL
 */
function isRTLLanguage(languageCode) {
  if (!languageCode || typeof languageCode !== 'string') {
    return false;
  }
  
  const code = languageCode.toLowerCase().split('-')[0]; // Handle 'ar-SA' -> 'ar'
  return RTL_LANGUAGES.includes(code);
}

/**
 * Get text direction for a language
 * @param {string} languageCode - ISO 639-1 language code
 * @returns {string} 'rtl' or 'ltr'
 */
function getDirection(languageCode) {
  return isRTLLanguage(languageCode) ? 'rtl' : 'ltr';
}

/**
 * Get RTL configuration
 * @returns {object} RTL configuration object
 */
function getConfig() {
  return { ...DEFAULT_CONFIG };
}

/**
 * Check if RTL is enabled globally
 * @returns {boolean}
 */
function isRTLEnabled() {
  return DEFAULT_CONFIG.enabled;
}

/**
 * Middleware to detect and set text direction based on language
 * Adds `req.textDirection` and `req.isRTL` properties
 */
function rtlMiddleware(req, res, next) {
  try {
    // Validate req and res objects
    if (!req || !res || typeof next !== 'function') {
      logger.error('Invalid middleware parameters');
      if (typeof next === 'function') next();
      return;
    }

    // Get language from various sources (priority order)
    const language = 
      req.query?.lang || 
      req.body?.language || 
      req.headers?.['accept-language']?.split(',')[0]?.split('-')[0] ||
      DEFAULT_CONFIG.defaultLanguage;

    // Determine direction
    const direction = getDirection(language);
    const isRTL = direction === 'rtl';

    // Attach to request object
    req.language = language;
    req.textDirection = direction;
    req.isRTL = isRTL;

    next();
  } catch (error) {
    logger.error('RTL middleware error:', error);
    // Continue without RTL detection
    req.textDirection = 'ltr';
    req.isRTL = false;
    next();
  }
}

module.exports = {
  RTL_LANGUAGES,
  isRTLLanguage,
  getDirection,
  getConfig,
  isRTLEnabled,
  rtlMiddleware,
};
