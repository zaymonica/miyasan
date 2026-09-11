/**
 * Sanitizer Utility Unit Tests
 */

const {
  sanitizeInput,
  sanitizeHTML,
  sanitizeEmail,
  sanitizePhone,
  sanitizeURL
} = require('../../../utils/sanitizer');

describe('Sanitizer Utility', () => {
  describe('sanitizeInput', () => {
    it('should return non-string input unchanged', () => {
      expect(sanitizeInput(123)).toBe(123);
      expect(sanitizeInput(null)).toBe(null);
      expect(sanitizeInput(undefined)).toBe(undefined);
      expect(sanitizeInput({ key: 'value' })).toEqual({ key: 'value' });
    });

    it('should remove script tags', () => {
      const input = 'Hello <script>alert("xss")</script> World';
      expect(sanitizeInput(input)).toBe('Hello  World');
    });

    it('should remove iframe tags', () => {
      const input = 'Hello <iframe src="evil.com"></iframe> World';
      expect(sanitizeInput(input)).toBe('Hello  World');
    });

    it('should remove object tags', () => {
      const input = 'Hello <object data="evil.swf"></object> World';
      expect(sanitizeInput(input)).toBe('Hello  World');
    });

    it('should remove embed tags', () => {
      const input = 'Hello <embed src="evil.swf"> World';
      expect(sanitizeInput(input)).toBe('Hello  World');
    });

    it('should remove event handlers', () => {
      const input = '<div onclick="alert(1)">Click</div>';
      expect(sanitizeInput(input)).not.toContain('onclick');
    });

    it('should trim whitespace', () => {
      expect(sanitizeInput('  hello  ')).toBe('hello');
    });

    it('should handle empty string', () => {
      expect(sanitizeInput('')).toBe('');
    });
  });

  describe('sanitizeHTML', () => {
    it('should return non-string input unchanged', () => {
      expect(sanitizeHTML(123)).toBe(123);
      expect(sanitizeHTML(null)).toBe(null);
    });

    it('should allow safe tags', () => {
      const input = '<p>Hello</p><strong>World</strong>';
      expect(sanitizeHTML(input)).toBe('<p>Hello</p><strong>World</strong>');
    });

    it('should remove unsafe tags', () => {
      const input = '<p>Hello</p><script>alert(1)</script>';
      const result = sanitizeHTML(input);
      expect(result).not.toContain('<script>');
    });

    it('should allow br tags', () => {
      const input = 'Line 1<br>Line 2';
      expect(sanitizeHTML(input)).toBe('Line 1<br>Line 2');
    });

    it('should allow list tags', () => {
      const input = '<ul><li>Item 1</li><li>Item 2</li></ul>';
      expect(sanitizeHTML(input)).toBe('<ul><li>Item 1</li><li>Item 2</li></ul>');
    });

    it('should allow anchor tags', () => {
      const input = '<a href="https://example.com">Link</a>';
      expect(sanitizeHTML(input)).toContain('<a');
    });

    it('should remove div tags', () => {
      const input = '<div>Content</div>';
      expect(sanitizeHTML(input)).toBe('Content');
    });
  });

  describe('sanitizeEmail', () => {
    it('should return non-string input unchanged', () => {
      expect(sanitizeEmail(123)).toBe(123);
      expect(sanitizeEmail(null)).toBe(null);
    });

    it('should convert to lowercase', () => {
      expect(sanitizeEmail('Test@Example.COM')).toBe('test@example.com');
    });

    it('should trim whitespace', () => {
      expect(sanitizeEmail('  test@example.com  ')).toBe('test@example.com');
    });

    it('should handle valid email', () => {
      expect(sanitizeEmail('user@domain.com')).toBe('user@domain.com');
    });
  });

  describe('sanitizePhone', () => {
    it('should return non-string input unchanged', () => {
      expect(sanitizePhone(123)).toBe(123);
      expect(sanitizePhone(null)).toBe(null);
    });

    it('should remove non-numeric characters except +', () => {
      expect(sanitizePhone('+1 (234) 567-8900')).toBe('+12345678900');
    });

    it('should keep + sign', () => {
      expect(sanitizePhone('+5511999999999')).toBe('+5511999999999');
    });

    it('should remove letters', () => {
      expect(sanitizePhone('123-ABC-4567')).toBe('1234567');
    });

    it('should handle clean number', () => {
      expect(sanitizePhone('1234567890')).toBe('1234567890');
    });
  });

  describe('sanitizeURL', () => {
    it('should return non-string input unchanged', () => {
      expect(sanitizeURL(123)).toBe(123);
      expect(sanitizeURL(null)).toBe(null);
    });

    it('should allow http URLs', () => {
      expect(sanitizeURL('http://example.com')).toBe('http://example.com');
    });

    it('should allow https URLs', () => {
      expect(sanitizeURL('https://example.com')).toBe('https://example.com');
    });

    it('should reject javascript URLs', () => {
      expect(sanitizeURL('javascript:alert(1)')).toBe('');
    });

    it('should reject data URLs', () => {
      expect(sanitizeURL('data:text/html,<script>alert(1)</script>')).toBe('');
    });

    it('should reject file URLs', () => {
      expect(sanitizeURL('file:///etc/passwd')).toBe('');
    });

    it('should handle URL with spaces', () => {
      const result = sanitizeURL('https://example.com');
      expect(result).toBe('https://example.com');
    });

    it('should reject URLs without protocol', () => {
      expect(sanitizeURL('example.com')).toBe('');
    });
  });
});
