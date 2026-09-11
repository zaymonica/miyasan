module.exports = {
  rootDir: '..',
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'controllers/ApiIntegrationController.js',
    'controllers/PlanLimitsController.js',
    'middleware/planLimits.js'
  ],
  testMatch: [
    '<rootDir>/tests/unit/controllers/ApiIntegrationController.test.js',
    '<rootDir>/tests/unit/controllers/PlanLimitsController.test.js',
    '<rootDir>/tests/unit/middleware/planLimits.test.js'
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
