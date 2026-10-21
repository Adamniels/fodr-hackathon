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
          // An allowlist: relative imports within the package, and vitest for tests. Everything else (Node
          // built-ins, React, other workspaces, any hoisted package) is refused, so a new dependency of the engine
          // is a deliberate change to this list and to package.json (ADR 0003, ADR 0004).
          patterns: [
            {
              regex: '^(?!\\.{1,2}/|vitest$)',
              message: 'The domain package imports only its own modules (ADR 0003, ADR 0004).',
            },
            { regex: '(^|/)apps/', message: 'Dependencies point inwards: no apps (ADR 0003).' },
          ],
        },
      ],
    },
  },
  {
    // The engine returns message codes, never sentences (ADR 0014). A string with å, ä or ö is almost always Swedish
    // text for a reader. Modules move under this rule as they are converted; #12 extends it to the whole package.
    // A Swedish string without those letters is not caught, which the unit tests on codes cover instead.
    files: ['src/plan.ts', 'src/slu.ts', 'src/optimize.ts', 'src/swaps.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/[ÅÄÖåäö]/], TemplateElement[value.raw=/[ÅÄÖåäö]/]',
          message: 'The domain returns message codes with params, not Swedish text (ADR 0014).',
        },
      ],
    },
  },
  {
    extends: [js.configs.recommended, tseslint.configs.disableTypeChecked],
    files: ['**/*.js'],
  },
)
