#!/usr/bin/env node

/**
 * WhatsApp Tests Runner
 * Runs all WhatsApp-related tests
 */

const { execSync } = require('child_process');

console.log('🧪 Running WhatsApp Unit and Integration Tests\n');

const tests = [
  {
    name: 'WhatsApp Service Tests',
    path: 'tests/unit/services/WhatsAppService.test.js'
  },
  {
    name: 'WhatsApp Controller Tests',
    path: 'tests/unit/controllers/WhatsAppController.test.js'
  },
  {
    name: 'WhatsApp Connection Model Tests',
    path: 'tests/unit/models/WhatsAppConnection.test.js'
  },
  {
    name: 'WhatsApp Integration Tests',
    path: 'tests/integration/whatsapp-flow.test.js'
  }
];

let passed = 0;
let failed = 0;

tests.forEach((test, index) => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📝 Test ${index + 1}/${tests.length}: ${test.name}`);
  console.log('='.repeat(60));

  try {
    execSync(`npx jest ${test.path} --verbose --no-coverage`, {
      stdio: 'inherit',
      encoding: 'utf-8'
    });
    passed++;
    console.log(`✅ ${test.name} - PASSED`);
  } catch (error) {
    failed++;
    console.log(`❌ ${test.name} - FAILED`);
  }
});

console.log(`\n${'='.repeat(60)}`);
console.log('📊 Test Summary');
console.log('='.repeat(60));
console.log(`✅ Passed: ${passed}/${tests.length}`);
console.log(`❌ Failed: ${failed}/${tests.length}`);
console.log(`📈 Success Rate: ${((passed / tests.length) * 100).toFixed(1)}%`);
console.log('='.repeat(60));

process.exit(failed > 0 ? 1 : 0);
