/**
 * Jest Configuration
 * Testing framework configuration
 */

module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'controllers/**/*.js',
    'services/**/*.js',
    'middleware/**/*.js',
    'utils/**/*.js',
    'config/**/*.js',
    '!**/node_modules/**',
    '!**/tests/**',
    '!**/coverage/**'
  ],
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js'
  ],
  // coverageThreshold: {
  //   global: {
  //     branches: 70,
  //     functions: 70,
  //     lines: 70,
  //     statements: 70
  //   }
  // },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  verbose: true,
  testTimeout: 10000,
  coverageReporters: ['text', 'lcov', 'html'],
  collectCoverage: true
};
