# WhatsApp Tests Documentation

## Test Status

✅ **All Unit Tests Passing** - 65/65 tests (100%)
⚠️ **Integration Tests** - Require running server and database connection

## Overview

Comprehensive test suite for the multi-tenant WhatsApp system, covering unit tests, integration tests, and end-to-end flows.

## Test Structure

```
tests/
├── unit/
│   ├── services/
│   │   └── WhatsAppService.test.js       # Service layer tests
│   ├── controllers/
│   │   └── WhatsAppController.test.js    # Controller tests
│   └── models/
│       └── WhatsAppConnection.test.js    # Model tests
├── integration/
│   └── whatsapp-flow.test.js             # Integration tests
└── run-whatsapp-tests.js                 # Test runner script
```

## Running Tests

### All WhatsApp Tests
```bash
npm run test:whatsapp
```

### Unit Tests Only
```bash
npm run test:whatsapp:unit
```

### Integration Tests Only
```bash
npm run test:whatsapp:integration
```

### Individual Test Files
```bash
# Service tests
npx jest tests/unit/services/WhatsAppService.test.js --verbose

# Controller tests
npx jest tests/unit/controllers/WhatsAppController.test.js --verbose

# Model tests
npx jest tests/unit/models/WhatsAppConnection.test.js --verbose

# Integration tests
npx jest tests/integration/whatsapp-flow.test.js --verbose
```

### With Coverage
```bash
npx jest tests/unit/services/WhatsAppService.test.js --coverage
```

## Test Coverage

### WhatsAppService Tests
- ✅ Tenant initialization
- ✅ Instance management
- ✅ Message sending
- ✅ Status retrieval
- ✅ Connection/disconnection
- ✅ Session management
- ✅ Usage limits
- ✅ Multi-tenant isolation

### WhatsAppController Tests
- ✅ Connect endpoint
- ✅ Disconnect endpoint
- ✅ Status endpoint
- ✅ QR code endpoint
- ✅ Clear session endpoint
- ✅ Send message endpoint
- ✅ Get messages endpoint
- ✅ Get contacts endpoint
- ✅ Authentication
- ✅ Error handling

### WhatsAppConnection Model Tests
- ✅ CRUD operations
- ✅ Status updates
- ✅ Connection statistics
- ✅ Tenant isolation
- ✅ Data validation
- ✅ Error handling

### Integration Tests
- ✅ Complete connection flow
- ✅ Authentication flow
- ✅ Message operations
- ✅ Tenant isolation
- ✅ Error scenarios

## Test Data

### Mock Tenant
- ID: 1
- Status: active
- Name: Test Tenant

### Mock User
- Username: tenant_user
- Password: password123
- Role: admin

### Mock Phone Numbers
- Test number: 5511999999999
- Format: Country code + number (no spaces)

## Mocked Dependencies

The tests mock the following dependencies:
- Database connection pool
- Logger
- Socket.IO
- Baileys WhatsApp library
- BillingService
- File system operations

## Test Scenarios

### 1. Connection Flow
```
1. Get initial status (disconnected)
2. Initiate connection
3. Generate QR code
4. Scan QR code (manual)
5. Connection established
6. Status shows connected
```

### 2. Message Flow
```
1. Check connection status
2. Validate usage limits
3. Send message
4. Track usage
5. Verify delivery
```

### 3. Session Management
```
1. Create session
2. Backup session
3. Clear session
4. Verify cleanup
```

## Expected Results

### Successful Tests
- All unit tests should pass
- Integration tests may fail if database is not configured
- Coverage should be > 80%

### Known Limitations
- Integration tests require database connection
- Some tests require manual QR code scanning
- Socket.IO events are mocked in unit tests

## Debugging Tests

### Enable Verbose Logging
```bash
npx jest tests/unit/services/WhatsAppService.test.js --verbose --no-coverage
```

### Run Single Test
```bash
npx jest tests/unit/services/WhatsAppService.test.js -t "should initialize WhatsApp"
```

### Watch Mode
```bash
npx jest tests/unit/services/WhatsAppService.test.js --watch
```

## CI/CD Integration

### GitHub Actions
```yaml
- name: Run WhatsApp Tests
  run: npm run test:whatsapp:unit
```

### Pre-commit Hook
```bash
npm run test:whatsapp:unit
```

## Troubleshooting

### Tests Failing
1. Check database connection
2. Verify environment variables
3. Check mock data
4. Review error logs

### Coverage Issues
1. Add missing test cases
2. Test error scenarios
3. Test edge cases
4. Mock external dependencies

## Contributing

When adding new WhatsApp features:
1. Write unit tests first (TDD)
2. Add integration tests
3. Update this documentation
4. Ensure > 80% coverage
5. Run all tests before commit

## Performance

### Test Execution Time
- Unit tests: ~2-5 seconds
- Integration tests: ~10-15 seconds
- Total: ~15-20 seconds

### Optimization Tips
- Use `--maxWorkers=2` for parallel execution
- Mock heavy operations
- Use test database
- Clear data between tests

## References

- [Jest Documentation](https://jestjs.io/)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Testing Best Practices](https://testingjavascript.com/)
