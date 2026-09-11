module.exports = {
  rootDir: '..',
  testEnvironment: 'jsdom',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'public/admin/js/whatsapp-cloud.js'
  ],
  testMatch: [
    '<rootDir>/tests/unit/admin/whatsapp-cloud.test.js'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  verbose: true,
  testTimeout: 10000,
  coverageReporters: ['text', 'lcov', 'html'],
  collectCoverage: true,
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  }
};
