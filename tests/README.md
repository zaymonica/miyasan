# Misayan SaaS - Test Suite

## 📋 Overview

Comprehensive test suite for Misayan SaaS with unit and integration tests.

**Target Coverage:** 80%+

## 🧪 Test Structure

```
tests/
├── unit/                    # Unit tests
│   ├── controllers/         # Controller tests
│   ├── middleware/          # Middleware tests
│   ├── services/            # Service tests
│   └── utils/               # Utility tests
├── integration/             # Integration tests
│   ├── auth.test.js        # Authentication flow
│   └── ...
├── setup.js                 # Test configuration
└── README.md                # This file
```

## 🚀 Running Tests

### All Tests
```bash
npm test
```

### Unit Tests Only
```bash
npm run test:unit
```

### Integration Tests Only
```bash
npm run test:integration
```

### Watch Mode
```bash
npm run test:watch
```

### Coverage Report
```bash
npm test -- --coverage
```

### Specific Test File
```bash
npm test -- tests/unit/controllers/BaseController.test.js
```

## 📊 Coverage Goals

| Category | Target | Current |
|----------|--------|---------|
| Statements | 80% | 🔨 |
| Branches | 70% | 🔨 |
| Functions | 70% | 🔨 |
| Lines | 70% | 🔨 |

## ✅ Test Checklist

### Controllers
- [x] BaseController
- [x] AuthController
- [ ] SuperAdminController (TODO)
- [ ] TenantController (TODO)
- [ ] BillingController (TODO)

### Middleware
- [x] auth.js
- [x] security.js
- [x] tenant.js
- [ ] errorHandler.js (TODO)

### Services
- [ ] WhatsAppService (TODO)
- [ ] BillingService (TODO)
- [ ] EmailService (TODO)

### Integration
- [x] Authentication flow
- [ ] Tenant operations (TODO)
- [ ] Billing flow (TODO)

## 🔧 Writing Tests

### Unit Test Template

```javascript
/**
 * Component Unit Tests
 */

describe('ComponentName', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    // Setup mocks
    mockReq = {};
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    mockNext = jest.fn();
  });

  describe('methodName', () => {
    it('should do something', () => {
      // Test implementation
      expect(true).toBe(true);
    });
  });
});
```

### Integration Test Template

```javascript
/**
 * Feature Integration Tests
 */

const request = require('supertest');
const { app } = require('../../server');

describe('Feature Integration Tests', () => {
  it('should test complete flow', async () => {
    const response = await request(app)
      .post('/api/endpoint')
      .send({ data: 'test' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});
```

## 🎯 Best Practices

### 1. Test Isolation
- Each test should be independent
- Use `beforeEach` to reset state
- Clean up after tests

### 2. Descriptive Names
```javascript
// Good
it('should return 401 when token is missing')

// Bad
it('test auth')
```

### 3. Arrange-Act-Assert
```javascript
it('should create user', () => {
  // Arrange
  const userData = { name: 'Test' };
  
  // Act
  const result = createUser(userData);
  
  // Assert
  expect(result).toBeDefined();
});
```

### 4. Mock External Dependencies
```javascript
jest.mock('../config/database');
jest.mock('bcryptjs');
```

### 5. Test Edge Cases
- Empty inputs
- Invalid inputs
- Boundary conditions
- Error scenarios

## 📝 Coverage Report

After running tests, view coverage report:

```bash
# Open HTML report
open coverage/lcov-report/index.html

# Or view in terminal
npm test -- --coverage
```

## 🐛 Debugging Tests

### Run Single Test
```bash
npm test -- -t "test name"
```

### Debug Mode
```bash
node --inspect-brk node_modules/.bin/jest --runInBand
```

### Verbose Output
```bash
npm test -- --verbose
```

## 🔍 Common Issues

### Issue: Tests timeout
**Solution:** Increase timeout in jest.config.js or specific test:
```javascript
jest.setTimeout(15000);
```

### Issue: Database connection errors
**Solution:** Ensure test database is configured in tests/setup.js

### Issue: Mock not working
**Solution:** Clear mocks in beforeEach:
```javascript
beforeEach(() => {
  jest.clearAllMocks();
});
```

## 📚 Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)

## ✨ Contributing

When adding new features:
1. Write tests first (TDD)
2. Ensure tests pass
3. Maintain 80%+ coverage
4. Update this README if needed

---

**Current Status:** Foundation tests complete ✅  
**Next:** Add service and integration tests 🔨
