/**
 * Jest Test Setup
 * Global configuration and mocks for all tests
 */

// Load environment variables from .env (optional - don't fail if not found)
try {
  require('dotenv').config();
} catch (e) {
  // dotenv not available, use default env vars
  console.warn('dotenv not found, using default environment variables');
}

// Set test environment
process.env.NODE_ENV = 'test';

// Mock logger to avoid console output during tests
jest.mock('../config/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    http: jest.fn()
  },
  requestLogger: jest.fn((req, res, next) => next())
}));

// Global test timeout
jest.setTimeout(10000);

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});
