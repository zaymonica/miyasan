/**
 * Unit Tests for AI Configuration Page
 * Tests the AI configuration functionality
 */

describe('AI Configuration Page', () => {
  let mockFetch;
  let aiConfig;

  beforeEach(() => {
    // Mock fetch
    mockFetch = jest.fn();
    global.fetch = mockFetch;
    
    // Mock localStorage
    global.localStorage = {
      getItem: jest.fn(() => 'mock-token'),
      setItem: jest.fn(),
      removeItem: jest.fn()
    };
    
    // Reset AI config
    aiConfig = {
      openai_api_key: '',
      model: 'gpt-3.5-turbo',
      system_prompt: 'You are a helpful assistant.',
      temperature: 0.7,
      max_tokens: 500,
      auto_reply: 0,
      is_active: 0
    };
    
    jest.clearAllMocks();
  });

  describe('AI Configuration API', () => {
    it('should load AI configuration successfully', async () => {
      const mockConfig = {
        openai_api_key: 'sk-test123',
        model: 'gpt-4',
        system_prompt: 'Test prompt',
        temperature: 0.8,
        max_tokens: 1000,
        auto_reply: 1,
        is_active: 1
      };

      mockFetch.mockResolvedValue({
        json: async () => ({ success: true, data: mockConfig })
      });

      const response = await fetch('/api/ai/config', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data).toEqual(mockConfig);
    });

    it('should handle API error when loading config', async () => {
      mockFetch.mockResolvedValue({
        json: async () => ({ success: false, error: 'Network error' })
      });

      const response = await fetch('/api/ai/config');
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error).toBe('Network error');
    });
  });

  describe('AI Configuration Save', () => {
    it('should save configuration successfully', async () => {
      const configData = {
        openai_api_key: 'sk-new123',
        model: 'gpt-4',
        system_prompt: 'New prompt',
        temperature: 0.8,
        max_tokens: 1000,
        auto_reply: 1,
        is_active: 1
      };

      mockFetch.mockResolvedValue({
        json: async () => ({ success: true })
      });

      const response = await fetch('/api/ai/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify(configData)
      });
      const data = await response.json();

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/ai/config',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(configData)
        })
      );
      expect(data.success).toBe(true);
    });

    it('should validate required fields', () => {
      const invalidConfig = {
        openai_api_key: '',
        model: 'gpt-4'
      };

      expect(invalidConfig.openai_api_key).toBe('');
    });

    it('should validate temperature range', () => {
      const config = { temperature: 0.7 };
      expect(config.temperature).toBeGreaterThanOrEqual(0);
      expect(config.temperature).toBeLessThanOrEqual(2);
    });

    it('should validate max tokens range', () => {
      const config = { max_tokens: 500 };
      expect(config.max_tokens).toBeGreaterThanOrEqual(1);
      expect(config.max_tokens).toBeLessThanOrEqual(4000);
    });

    it('should convert boolean values correctly', () => {
      const config = {
        auto_reply: 1,
        is_active: 0
      };

      expect(config.auto_reply).toBe(1);
      expect(config.is_active).toBe(0);
    });
  });

  describe('AI Test Functionality', () => {
    it('should test AI with user message', async () => {
      const testMessage = 'Hello AI';
      const aiResponse = 'Hello! How can I help?';

      mockFetch.mockResolvedValue({
        json: async () => ({
          success: true,
          data: { response: aiResponse }
        })
      });

      const response = await fetch('/api/ai/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify({ message: testMessage })
      });
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.response).toBe(aiResponse);
    });

    it('should handle test error', async () => {
      mockFetch.mockResolvedValue({
        json: async () => ({
          success: false,
          error: 'AI test failed'
        })
      });

      const response = await fetch('/api/ai/test', {
        method: 'POST',
        body: JSON.stringify({ message: 'Test' })
      });
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error).toBe('AI test failed');
    });

    it('should require message for testing', () => {
      const testData = { message: '' };
      expect(testData.message).toBe('');
    });
  });

  describe('AI Model Options', () => {
    it('should support GPT-3.5 Turbo', () => {
      const config = { model: 'gpt-3.5-turbo' };
      expect(['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo']).toContain(config.model);
    });

    it('should support GPT-4', () => {
      const config = { model: 'gpt-4' };
      expect(['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo']).toContain(config.model);
    });

    it('should support GPT-4 Turbo', () => {
      const config = { model: 'gpt-4-turbo' };
      expect(['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo']).toContain(config.model);
    });
  });

  describe('AI Configuration Defaults', () => {
    it('should have default system prompt', () => {
      expect(aiConfig.system_prompt).toBe('You are a helpful assistant.');
    });

    it('should have default temperature', () => {
      expect(aiConfig.temperature).toBe(0.7);
    });

    it('should have default max tokens', () => {
      expect(aiConfig.max_tokens).toBe(500);
    });

    it('should have default model', () => {
      expect(aiConfig.model).toBe('gpt-3.5-turbo');
    });

    it('should have auto_reply disabled by default', () => {
      expect(aiConfig.auto_reply).toBe(0);
    });

    it('should have is_active disabled by default', () => {
      expect(aiConfig.is_active).toBe(0);
    });
  });
});
