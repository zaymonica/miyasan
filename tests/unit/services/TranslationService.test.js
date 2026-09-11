/**
 * TranslationService Unit Tests
 */

const TranslationService = require('../../../services/TranslationService');

// Mock dependencies
jest.mock('../../../config/database', () => ({
  pool: {
    execute: jest.fn()
  }
}));

const { pool } = require('../../../config/database');

describe('TranslationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear cache before each test
    TranslationService.clearCache && TranslationService.clearCache();
  });

  describe('getTranslation', () => {
    it('should return translation for key', async () => {
      pool.execute.mockResolvedValue([[{
        translation_value: 'Hello'
      }]]);

      const result = await TranslationService.getTranslation('en', 'greeting');

      expect(result).toBe('Hello');
    });

    it('should return key if translation not found', async () => {
      pool.execute.mockResolvedValue([[]]);

      const result = await TranslationService.getTranslation('en', 'unknown_key');

      expect(result).toBe('unknown_key');
    });

    it('should use cache for repeated requests', async () => {
      pool.execute.mockResolvedValue([[{ translation_value: 'Hello' }]]);

      await TranslationService.getTranslation('en', 'greeting');
      await TranslationService.getTranslation('en', 'greeting');

      // Should only call database once due to caching
      expect(pool.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('getAllTranslations', () => {
    it('should return all translations for language', async () => {
      pool.execute.mockResolvedValue([[
        { translation_key: 'greeting', translation_value: 'Hello' },
        { translation_key: 'goodbye', translation_value: 'Goodbye' }
      ]]);

      const result = await TranslationService.getAllTranslations('en');

      expect(result).toEqual({
        greeting: 'Hello',
        goodbye: 'Goodbye'
      });
    });

    it('should return empty object if no translations', async () => {
      pool.execute.mockResolvedValue([[]]);

      const result = await TranslationService.getAllTranslations('xx');

      expect(result).toEqual({});
    });
  });

  describe('getTranslationsByCategory', () => {
    it('should return translations by category', async () => {
      pool.execute.mockResolvedValue([[
        { translation_key: 'nav.home', translation_value: 'Home' },
        { translation_key: 'nav.about', translation_value: 'About' }
      ]]);

      const result = await TranslationService.getTranslationsByCategory('en', 'navigation');

      expect(result).toEqual({
        'nav.home': 'Home',
        'nav.about': 'About'
      });
    });
  });

  describe('setTranslation', () => {
    it('should insert new translation', async () => {
      pool.execute
        .mockResolvedValueOnce([[]]) // Check if exists
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // Insert

      const result = await TranslationService.setTranslation('en', 'new_key', 'New Value');

      expect(result).toBe(true);
    });

    it('should update existing translation', async () => {
      pool.execute
        .mockResolvedValueOnce([[{ id: 1 }]]) // Exists
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // Update

      const result = await TranslationService.setTranslation('en', 'existing_key', 'Updated Value');

      expect(result).toBe(true);
    });
  });

  describe('deleteTranslation', () => {
    it('should delete translation', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await TranslationService.deleteTranslation('en', 'key_to_delete');

      expect(result).toBe(true);
    });

    it('should return false if translation not found', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 0 }]);

      const result = await TranslationService.deleteTranslation('en', 'nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('getAvailableLanguages', () => {
    it('should return list of available languages', async () => {
      pool.execute.mockResolvedValue([[
        { language_code: 'en', language_name: 'English' },
        { language_code: 'pt', language_name: 'Portuguese' },
        { language_code: 'es', language_name: 'Spanish' }
      ]]);

      const result = await TranslationService.getAvailableLanguages();

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ code: 'en', name: 'English' });
    });
  });

  describe('translate', () => {
    it('should translate with variable substitution', async () => {
      pool.execute.mockResolvedValue([[{
        translation_value: 'Hello, {{name}}! Welcome to {{platform}}.'
      }]]);

      const result = await TranslationService.translate('en', 'welcome_message', {
        name: 'John',
        platform: 'Misayan'
      });

      expect(result).toBe('Hello, John! Welcome to Misayan.');
    });

    it('should return key if translation not found', async () => {
      pool.execute.mockResolvedValue([[]]);

      const result = await TranslationService.translate('en', 'unknown', { name: 'John' });

      expect(result).toBe('unknown');
    });
  });

  describe('bulkSetTranslations', () => {
    it('should set multiple translations', async () => {
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const translations = {
        key1: 'Value 1',
        key2: 'Value 2',
        key3: 'Value 3'
      };

      const result = await TranslationService.bulkSetTranslations('en', translations);

      expect(result).toBe(true);
      expect(pool.execute).toHaveBeenCalledTimes(3);
    });
  });
});
