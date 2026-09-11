/**
 * Input Sanitizer Utility
 * Sanitizes user input to prevent XSS and injection attacks
 * 
 * @module utils/sanitizer
 */

/**
 * Sanitize input string
 * @param {string} input - Input string to sanitize
 * @returns {string} Sanitized string
 */
function sanitizeInput(input) {
  if (typeof input !== 'string') {
    return input;
  }

  // Remove potentially dangerous HTML tags (script, iframe, etc.)
  let sanitized = input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  sanitized = sanitized.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
  sanitized = sanitized.replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '');
  sanitized = sanitized.replace(/<embed\b[^>]*>/gi, '');
  sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, ''); // Remove event handlers

  // Trim whitespace
  sanitized = sanitized.trim();

  return sanitized;
}

/**
 * Sanitize HTML content (allows safe HTML tags)
 * @param {string} html - HTML content to sanitize
 * @returns {string} Sanitized HTML
 */
function sanitizeHTML(html) {
  if (typeof html !== 'string') {
    return html;
  }

  // Allow only safe HTML tags
  const allowedTags = ['p', 'br', 'strong', 'em', 'u', 'a', 'ul', 'ol', 'li'];
  const tagRegex = /<\/?([a-z][a-z0-9]*)\b[^>]*>/gi;

  return html.replace(tagRegex, (match, tag) => {
    if (allowedTags.includes(tag.toLowerCase())) {
      return match;
    }
    return '';
  });
}

/**
 * Sanitize email address
 * @param {string} email - Email to sanitize
 * @returns {string} Sanitized email
 */
function sanitizeEmail(email) {
  if (typeof email !== 'string') {
    return email;
  }

  return email.toLowerCase().trim();
}

/**
 * Sanitize phone number
 * @param {string} phone - Phone number to sanitize
 * @returns {string} Sanitized phone
 */
function sanitizePhone(phone) {
  if (typeof phone !== 'string') {
    return phone;
  }

  // Remove all non-numeric characters except +
  return phone.replace(/[^\d+]/g, '');
}

/**
 * Sanitize URL
 * @param {string} url - URL to sanitize
 * @returns {string} Sanitized URL
 */
function sanitizeURL(url) {
  if (typeof url !== 'string') {
    return url;
  }

  // Only allow http and https protocols
  const urlPattern = /^https?:\/\//i;
  if (!urlPattern.test(url)) {
    return '';
  }

  return url.trim();
}

module.exports = {
  sanitizeInput,
  sanitizeHTML,
  sanitizeEmail,
  sanitizePhone,
  sanitizeURL
};
