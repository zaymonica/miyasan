/**
 * RTL (Right-to-Left) Frontend Module
 * 
 * Handles RTL/LTR switching on the client side.
 * This module detects language changes and applies appropriate text direction.
 * 
 * IMPORTANT: This module does NOT modify existing functionality.
 * It only adds RTL support when explicitly activated.
 */

(function() {
  'use strict';

  // RTL-enabled languages
  const RTL_LANGUAGES = ['ar', 'he', 'fa', 'ur', 'yi'];

  // Configuration
  const RTL_CONFIG = {
    storageKey: 'app_text_direction',
    languageKey: 'app_language',
    autoDetect: true,
  };

  /**
   * Check if a language requires RTL layout
   * @param {string} languageCode - ISO 639-1 language code
   * @returns {boolean}
   */
  function isRTLLanguage(languageCode) {
    if (!languageCode || typeof languageCode !== 'string') {
      return false;
    }
    const code = languageCode.toLowerCase().split('-')[0];
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
   * Apply text direction to the document
   * @param {string} direction - 'rtl' or 'ltr'
   */
  function applyDirection(direction) {
    const validDirection = direction === 'rtl' ? 'rtl' : 'ltr';
    
    // Set direction on HTML element
    document.documentElement.setAttribute('dir', validDirection);
    document.body.setAttribute('dir', validDirection);
    
    // Store preference
    try {
      localStorage.setItem(RTL_CONFIG.storageKey, validDirection);
    } catch (e) {
      console.warn('Could not save direction preference:', e);
    }

    // Load RTL stylesheet if needed
    if (validDirection === 'rtl') {
      loadRTLStylesheet();
    } else {
      unloadRTLStylesheet();
    }

    // Dispatch custom event for other modules
    window.dispatchEvent(new CustomEvent('directionchange', {
      detail: { direction: validDirection }
    }));

    console.log(`Text direction set to: ${validDirection}`);
  }

  /**
   * Load RTL stylesheet dynamically
   */
  function loadRTLStylesheet() {
    // Check if already loaded
    if (document.getElementById('rtl-stylesheet')) {
      return;
    }

    const link = document.createElement('link');
    link.id = 'rtl-stylesheet';
    link.rel = 'stylesheet';
    link.href = '/admin/css/rtl.css';
    link.type = 'text/css';
    
    document.head.appendChild(link);
    console.log('RTL stylesheet loaded');
  }

  /**
   * Unload RTL stylesheet
   */
  function unloadRTLStylesheet() {
    const link = document.getElementById('rtl-stylesheet');
    if (link) {
      link.remove();
      console.log('RTL stylesheet unloaded');
    }
  }

  /**
   * Toggle between RTL and LTR
   */
  function toggleDirection() {
    const currentDir = getCurrentDirection();
    const newDir = currentDir === 'rtl' ? 'ltr' : 'rtl';
    applyDirection(newDir);
  }

  /**
   * Get current text direction
   * @returns {string} 'rtl' or 'ltr'
   */
  function getCurrentDirection() {
    return document.documentElement.getAttribute('dir') || 'ltr';
  }

  /**
   * Initialize RTL module
   */
  function init() {
    console.log('RTL module initializing...');

    // Check for saved direction preference
    let savedDirection;
    try {
      savedDirection = localStorage.getItem(RTL_CONFIG.storageKey);
    } catch (e) {
      console.warn('Could not read direction preference:', e);
    }

    // Apply saved direction or detect from language
    if (savedDirection) {
      applyDirection(savedDirection);
    } else if (RTL_CONFIG.autoDetect) {
      // Try to detect from current language
      let currentLanguage;
      try {
        currentLanguage = localStorage.getItem(RTL_CONFIG.languageKey);
      } catch (e) {
        console.warn('Could not read language preference:', e);
      }

      if (currentLanguage) {
        const direction = getDirection(currentLanguage);
        applyDirection(direction);
      }
    }

    // Listen for language changes
    window.addEventListener('languagechange', function(event) {
      if (event.detail && event.detail.language) {
        const direction = getDirection(event.detail.language);
        applyDirection(direction);
      }
    });

    console.log('RTL module initialized');
  }

  // Public API
  window.RTL = {
    isRTLLanguage,
    getDirection,
    applyDirection,
    toggleDirection,
    getCurrentDirection,
    init,
  };

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
