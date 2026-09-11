/**
 * ESLint Configuration (Flat Config Format)
 * Code quality and style enforcement
 * 
 * @module eslint.config
 */

const globals = require('globals');

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'coverage/**',
      'logs/**',
      'uploads/**',
      'sessions/**',
      'backups/**',
      'public/**',
      'tests/unit/pages/**',
      '*.backup',
      '*.bak'
    ]
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.jest,
        ...globals.es2021
      },
      parserOptions: {
        ecmaVersion: 2022
      }
    },
    rules: {
      'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-var': 'error',
      'prefer-const': 'warn',
      'eqeqeq': ['warn', 'always', { null: 'ignore' }],
      'curly': ['warn', 'multi-line'],
      'no-throw-literal': 'error',
      'no-return-await': 'warn',
      'require-await': 'off'
    }
  }
];
