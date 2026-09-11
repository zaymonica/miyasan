/**
 * Internationalization (i18n) Configuration
 * Database-driven translation system
 * 
 * @module config/i18n
 */

const { pool } = require('./database');
const { logger } = require('./logger');

/**
 * Translation cache
 * Reduces database queries for frequently used translations
 */
const translationCache = new Map();
const CACHE_TTL = 3600000; // 1 hour

/**
 * Get translation from database
 * 
 * @param {string} languageCode - Language code (e.g., 'en', 'pt')
 * @param {string} key - Translation key
 * @param {string} defaultValue - Default value if translation not found
 * @returns {Promise<string>} Translated string
 */
async function getTranslation(languageCode, key, defaultValue = key) {
  try {
    // Check cache first
    const cacheKey = `${languageCode}:${key}`;
    const cached = translationCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.value;
    }

    // Query database
    const [rows] = await pool.execute(
      'SELECT translation_value FROM translations WHERE language_code = ? AND translation_key = ?',
      [languageCode, key]
    );

    if (rows.length > 0) {
      const value = rows[0].translation_value;
      
      // Cache the result
      translationCache.set(cacheKey, {
        value,
        timestamp: Date.now()
      });
      
      return value;
    }

    // Fallback to English if not found
    if (languageCode !== 'en') {
      return getTranslation('en', key, defaultValue);
    }

    return defaultValue;
  } catch (error) {
    logger.error('Translation error', { error: error.message, languageCode, key });
    return defaultValue;
  }
}

/**
 * Get multiple translations at once
 * 
 * @param {string} languageCode - Language code
 * @param {Array<string>} keys - Array of translation keys
 * @returns {Promise<Object>} Object with key-value pairs
 */
async function getTranslations(languageCode, keys) {
  try {
    const placeholders = keys.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT translation_key, translation_value 
       FROM translations 
       WHERE language_code = ? AND translation_key IN (${placeholders})`,
      [languageCode, ...keys]
    );

    const translations = {};
    rows.forEach(row => {
      translations[row.translation_key] = row.translation_value;
    });

    // Fill missing with keys
    keys.forEach(key => {
      if (!translations[key]) {
        translations[key] = key;
      }
    });

    return translations;
  } catch (error) {
    logger.error('Translations error', { error: error.message });
    return keys.reduce((acc, key) => ({ ...acc, [key]: key }), {});
  }
}

/**
 * Get all translations for a language
 * 
 * @param {string} languageCode - Language code
 * @returns {Promise<Object>} All translations
 */
async function getAllTranslations(languageCode) {
  try {
    const [rows] = await pool.execute(
      'SELECT translation_key, translation_value FROM translations WHERE language_code = ?',
      [languageCode]
    );

    return rows.reduce((acc, row) => ({
      ...acc,
      [row.translation_key]: row.translation_value
    }), {});
  } catch (error) {
    logger.error('Get all translations error', { error: error.message });
    return {};
  }
}

/**
 * Clear translation cache
 */
function clearCache() {
  translationCache.clear();
  logger.info('Translation cache cleared');
}

/**
 * i18n Middleware
 * Attaches translation function to request object
 */
function i18nMiddleware(req, res, next) {
  // Get language from header, query, or default to 'en'
  const language = req.headers['accept-language']?.split(',')[0]?.split('-')[0] ||
                   req.query.lang ||
                   req.user?.language ||
                   'en';

  // Attach translation function to request
  req.t = async (key, defaultValue) => {
    return getTranslation(language, key, defaultValue);
  };

  // Attach language to request
  req.language = language;

  next();
}

/**
 * Initialize default translations
 */
async function initializeDefaultTranslations() {
  try {
    const defaultTranslations = {
      en: {
        // Authentication
        'auth.login': 'Login',
        'auth.logout': 'Logout',
        'auth.email': 'Email',
        'auth.password': 'Password',
        'auth.username': 'Username',
        'auth.invalid_credentials': 'Invalid credentials',
        'auth.login_success': 'Login successful',
        'auth.logout_success': 'Logout successful',
        
        // Common
        'common.save': 'Save',
        'common.cancel': 'Cancel',
        'common.delete': 'Delete',
        'common.edit': 'Edit',
        'common.create': 'Create',
        'common.update': 'Update',
        'common.search': 'Search',
        'common.filter': 'Filter',
        'common.export': 'Export',
        'common.import': 'Import',
        'common.yes': 'Yes',
        'common.no': 'No',
        'common.loading': 'Loading...',
        'common.success': 'Success',
        'common.error': 'Error',
        'common.warning': 'Warning',
        'common.info': 'Information',
        
        // Validation
        'validation.required': 'This field is required',
        'validation.email': 'Invalid email address',
        'validation.min_length': 'Minimum length is {min} characters',
        'validation.max_length': 'Maximum length is {max} characters',
        'validation.password_mismatch': 'Passwords do not match',
        
        // Dashboard
        'dashboard.title': 'Dashboard',
        'dashboard.welcome': 'Welcome',
        'dashboard.statistics': 'Statistics',
        
        // Tenants
        'tenants.title': 'Tenants',
        'tenants.create': 'Create Tenant',
        'tenants.edit': 'Edit Tenant',
        'tenants.delete': 'Delete Tenant',
        'tenants.name': 'Name',
        'tenants.email': 'Email',
        'tenants.status': 'Status',
        'tenants.plan': 'Plan',
        
        // Plans
        'plans.title': 'Subscription Plans',
        'plans.create': 'Create Plan',
        'plans.name': 'Plan Name',
        'plans.price': 'Price',
        'plans.features': 'Features',
        
        // Messages
        'messages.title': 'Messages',
        'messages.send': 'Send Message',
        'messages.received': 'Received',
        'messages.sent': 'Sent',
      },
      pt: {
        // Authentication
        'auth.login': 'Entrar',
        'auth.logout': 'Sair',
        'auth.email': 'E-mail',
        'auth.password': 'Senha',
        'auth.username': 'Usuário',
        'auth.invalid_credentials': 'Credenciais inválidas',
        'auth.login_success': 'Login realizado com sucesso',
        'auth.logout_success': 'Logout realizado com sucesso',
        
        // Common
        'common.save': 'Salvar',
        'common.cancel': 'Cancelar',
        'common.delete': 'Excluir',
        'common.edit': 'Editar',
        'common.create': 'Criar',
        'common.update': 'Atualizar',
        'common.search': 'Pesquisar',
        'common.filter': 'Filtrar',
        'common.export': 'Exportar',
        'common.import': 'Importar',
        'common.yes': 'Sim',
        'common.no': 'Não',
        'common.loading': 'Carregando...',
        'common.success': 'Sucesso',
        'common.error': 'Erro',
        'common.warning': 'Aviso',
        'common.info': 'Informação',
        
        // Validation
        'validation.required': 'Este campo é obrigatório',
        'validation.email': 'Endereço de e-mail inválido',
        'validation.min_length': 'Comprimento mínimo é {min} caracteres',
        'validation.max_length': 'Comprimento máximo é {max} caracteres',
        'validation.password_mismatch': 'As senhas não coincidem',
        
        // Dashboard
        'dashboard.title': 'Painel',
        'dashboard.welcome': 'Bem-vindo',
        'dashboard.statistics': 'Estatísticas',
        
        // Tenants
        'tenants.title': 'Inquilinos',
        'tenants.create': 'Criar Inquilino',
        'tenants.edit': 'Editar Inquilino',
        'tenants.delete': 'Excluir Inquilino',
        'tenants.name': 'Nome',
        'tenants.email': 'E-mail',
        'tenants.status': 'Status',
        'tenants.plan': 'Plano',
        
        // Plans
        'plans.title': 'Planos de Assinatura',
        'plans.create': 'Criar Plano',
        'plans.name': 'Nome do Plano',
        'plans.price': 'Preço',
        'plans.features': 'Recursos',
        
        // Messages
        'messages.title': 'Mensagens',
        'messages.send': 'Enviar Mensagem',
        'messages.received': 'Recebidas',
        'messages.sent': 'Enviadas',
      }
    };

    for (const [langCode, translations] of Object.entries(defaultTranslations)) {
      const langName = langCode === 'en' ? 'English' : 'Português';
      
      for (const [key, value] of Object.entries(translations)) {
        await pool.execute(
          `INSERT IGNORE INTO translations (language_code, language_name, translation_key, translation_value, category)
           VALUES (?, ?, ?, ?, ?)`,
          [langCode, langName, key, value, key.split('.')[0]]
        );
      }
    }

    logger.info('Default translations initialized');
  } catch (error) {
    logger.error('Error initializing translations', { error: error.message });
  }
}

module.exports = {
  getTranslation,
  getTranslations,
  getAllTranslations,
  clearCache,
  i18nMiddleware,
  initializeDefaultTranslations
};
