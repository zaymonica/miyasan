/**
 * RTL Middleware
 * 
 * Express middleware for RTL/LTR detection and handling
 * Wraps the config/rtl module for use in Express routes
 * 
 * @module middleware/rtl
 */

const rtlConfig = require('../config/rtl');

/**
 * RTL middleware
 * Adds RTL-related properties to the request object
 * 
 * Properties added:
 * - req.language: Detected language code
 * - req.textDirection: 'rtl' or 'ltr'
 * - req.isRTL: Boolean indicating if RTL
 */
module.exports = rtlConfig.rtlMiddleware;
