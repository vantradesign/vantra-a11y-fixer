import js from '@eslint/js'
import tseslint from 'typescript-eslint'

/**
 * Shared flat config for every workspace in the repo.
 *
 * The `no-restricted-globals` block below is a privacy guardrail, not a style
 * rule: the extension must never reach the network at runtime. The manifest CSP
 * (`connect-src 'none'`) enforces this in the browser, this rule surfaces a
 * violation at lint time so it never reaches review.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/dist-harness/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/vendor/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'Network access is forbidden. See docs/ARCHITECTURE.md §6.' },
        { name: 'XMLHttpRequest', message: 'Network access is forbidden. See docs/ARCHITECTURE.md §6.' },
        { name: 'WebSocket', message: 'Network access is forbidden. See docs/ARCHITECTURE.md §6.' },
        { name: 'EventSource', message: 'Network access is forbidden. See docs/ARCHITECTURE.md §6.' },
      ],
    },
  },
  {
    // Build and test tooling runs in Node, not in the extension. Globals are
    // listed explicitly rather than pulling in the `globals` package, keeping the
    // dependency tree small enough to audit by hand.
    files: ['**/*.config.{ts,mjs}', 'tests/**/*.mjs', 'scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
      },
    },
    rules: {
      // The static test server legitimately writes its listen address to stdout.
      'no-console': 'off',
    },
  },
)
