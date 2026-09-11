/**
 * i18n - Internationalization System
 * Handles translations for the tenant panel
 * 
 * @module i18n
 */

const i18n = {
  currentLanguage: 'en',
  translations: {},
  fallbackLanguage: 'en',
  isLoaded: false,
  isInitializing: false,

  /**
   * Initialize i18n system
   * @param {string} language - Language code (en, pt, es, etc.)
   */
  async init(language = null) {
    // Prevent multiple simultaneous initializations
    if (this.isInitializing) {
      return;
    }
    
    // Check if already loaded with same language
    if (this.isLoaded && this.currentLanguage === language) {
      this.translatePage();
      return;
    }

    this.isInitializing = true;

    const savedLang = localStorage.getItem('language');
    let defaultLanguage = null;
    if (!language) {
      try {
        const response = await fetch('/api/public/default-language');
        const data = await response.json();
        defaultLanguage = data?.data?.code || null;
      } catch (error) {
        defaultLanguage = null;
      }
    }

    if (defaultLanguage) {
      localStorage.setItem('system_default_language', defaultLanguage);
    }

    language = language || defaultLanguage || savedLang || (navigator.language || 'en').split('-')[0];

    this.currentLanguage = language;
    
    // Load translations for current language
    await this.loadTranslations(language);
    
    // Also preload fallback language if different
    if (language !== this.fallbackLanguage && !this.translations[this.fallbackLanguage]) {
      await this.loadTranslations(this.fallbackLanguage);
    }
    
    this.isLoaded = true;
    this.isInitializing = false;
    this.translatePage();
    
    localStorage.setItem('language', language);
    localStorage.setItem('system_default_language', defaultLanguage || language);
    document.documentElement.lang = language;
  },

  /**
   * Load translations from server
   * @param {string} language - Language code
   */
  async loadTranslations(language) {
    try {
      const response = await fetch(`/locales/${language}.json?v=${Date.now()}`);
      if (!response.ok) {
        throw new Error(`Failed to load ${language} translations`);
      }
      const data = await response.json();
      this.translations[language] = data;
      console.log(`Translations loaded for ${language}:`, Object.keys(data).length, 'categories');
    } catch (error) {
      console.error('Error loading translations:', error);
      if (language !== this.fallbackLanguage) {
        await this.loadTranslations(this.fallbackLanguage);
      }
    }
  },

  /**
   * Get translation for a key
   * @param {string} key - Translation key (e.g., 'stores.title')
   * @param {Object} params - Parameters for interpolation
   * @returns {string} Translated text
   */
  t(key, params = {}) {
    // Try current language first
    let value = this.getNestedValue(this.translations[this.currentLanguage], key);
    
    // Fallback to English if not found
    if (value === undefined || value === null) {
      value = this.getNestedValue(this.translations[this.fallbackLanguage], key);
    }
    
    // Return key if still not found (only warn if translations are loaded)
    if (value === undefined || value === null) {
      if (this.isLoaded) {
        console.warn(`Translation key not found: ${key}`);
      }
      return key;
    }

    if (typeof value !== 'string') {
      if (this.isLoaded) {
        console.warn(`Translation value is not a string: ${key}`);
      }
      return key;
    }

    // Replace parameters {{param}}
    return value.replace(/\{\{(\w+)\}\}/g, (match, param) => {
      return params[param] !== undefined ? params[param] : match;
    });
  },

  /**
   * Get nested value from object using dot notation
   * @param {Object} obj - Object to search
   * @param {string} key - Dot-notated key (e.g., 'stores.title')
   * @returns {*} Value or undefined
   */
  getNestedValue(obj, key) {
    if (!obj) return undefined;
    
    const keys = key.split('.');
    let value = obj;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return undefined;
      }
    }

    return value;
  },

  mergeDeep(target, source) {
    if (!source || typeof source !== 'object') return target;
    const output = Array.isArray(target) ? [...target] : { ...target };
    Object.keys(source).forEach(key => {
      const sourceValue = source[key];
      if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
        output[key] = this.mergeDeep(output[key] || {}, sourceValue);
      } else {
        output[key] = sourceValue;
      }
    });
    return output;
  },

  /**
   * Translate all elements with data-i18n attribute
   */
  translatePage() {
    // Don't translate if translations aren't loaded yet
    if (!this.isLoaded || !this.translations[this.currentLanguage]) {
      return;
    }

    // Translate text content
    document.querySelectorAll('[data-i18n]').forEach(element => {
      const key = element.getAttribute('data-i18n');
      if (key) {
        const translation = this.t(key);
        if (translation !== key) {
          element.textContent = translation;
        }
      }
    });

    // Translate placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
      const key = element.getAttribute('data-i18n-placeholder');
      if (key) {
        const translation = this.t(key);
        if (translation !== key) {
          element.placeholder = translation;
        }
      }
    });

    // Translate titles
    document.querySelectorAll('[data-i18n-title]').forEach(element => {
      const key = element.getAttribute('data-i18n-title');
      if (key) {
        const translation = this.t(key);
        if (translation !== key) {
          element.title = translation;
        }
      }
    });

    // Translate aria-labels
    document.querySelectorAll('[data-i18n-aria]').forEach(element => {
      const key = element.getAttribute('data-i18n-aria');
      if (key) {
        const translation = this.t(key);
        if (translation !== key) {
          element.setAttribute('aria-label', translation);
        }
      }
    });
  },

  /**
   * Change language
   * @param {string} language - New language code
   */
  async changeLanguage(language) {
    if (language === this.currentLanguage) return;
    
    this.currentLanguage = language;
    
    // Load translations if not already loaded
    if (!this.translations[language]) {
      await this.loadTranslations(language);
    }
    
    this.translatePage();
    localStorage.setItem('language', language);
    document.documentElement.lang = language;

    // Dispatch language change event for RTL integration
    window.dispatchEvent(new CustomEvent('languagechange', {
      detail: { language: language }
    }));
  },

  /**
   * Get current language
   * @returns {string} Current language code
   */
  getCurrentLanguage() {
    return this.currentLanguage;
  },

  /**
   * Set language
   * @param {string} language - Language code
   */
  setLanguage(language) {
    this.changeLanguage(language);
  },

  /**
   * Get language
   * @returns {string} Current language code
   */
  getLanguage() {
    return this.currentLanguage;
  }
};
