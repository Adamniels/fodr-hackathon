import js from '@eslint/js'
import tseslint from 'typescript-eslint'

// The engine is pure: input in, result out, no I/O (ADR 0004). These globals and imports are I/O, timers or
// platform APIs, and the package may not reach into the apps.
const IO_GLOBALS = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'window',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'setTimeout',
  'setInterval',
  'process',
  'Buffer',
].map((name) => ({ name, message: 'The domain package is pure: no I/O, timers or platform APIs (ADR 0004).' }))

export default tseslint.config(
  {
    // Unused disable directives are errors, so the guard file fails lint if a purity rule stops reporting.
    linterOptions: { reportUnusedDisableDirectives: 'error' },
  },
  {
    rules: { 'no-template-curly-in-string': 'error' },
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      'no-restricted-globals': ['error', ...IO_GLOBALS],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { regex: '^node:', message: 'No Node APIs in the domain package (ADR 0004).' },
            {
              regex: '^(fs|path|os|http|https|net|child_process|crypto|url|util|stream|worker_threads)(/|$)',
              message: 'No Node APIs in the domain package (ADR 0004).',
            },
            { regex: '^@fodr/(web|api)(/|$)', message: 'Dependencies point inwards: no apps (ADR 0003).' },
            { regex: '(^|/)apps/', message: 'Dependencies point inwards: no apps (ADR 0003).' },
            { regex: '^react(-dom)?(/|$)', message: 'No UI code in the domain package (ADR 0004).' },
          ],
        },
      ],
    },
  },
  {
    extends: [js.configs.recommended, tseslint.configs.disableTypeChecked],
    files: ['**/*.js'],
  },
)
