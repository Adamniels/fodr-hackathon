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

// The clock and randomness make a result depend on when it ran (#80). The caller passes such values in.
const CLOCK_MESSAGE = 'The domain package is pure: the caller passes the time, a date or an ID in (ADR 0004).'
const CLOCK_PROPERTIES = [
  { object: 'Date', property: 'now', message: CLOCK_MESSAGE },
  { object: 'Math', property: 'random', message: CLOCK_MESSAGE },
]
// Shared with every no-restricted-syntax block below: in a flat config, a later block's options replace these.
// purity.guard.ts checks the base block only; the åäö block spreads the same list, until #95 merges the two blocks.
const CLOCK_SYNTAX = [
  { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: CLOCK_MESSAGE },
  { selector: "CallExpression[callee.name='Date']", message: CLOCK_MESSAGE },
]

export default tseslint.config(
  {
    // Unused disable directives are errors, so the guard file fails lint if a purity rule stops reporting.
    linterOptions: { reportUnusedDisableDirectives: 'error' },
  },
  {
    rules: { 'no-template-curly-in-string': 'error' },
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.strictTypeChecked],
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // Strict type-aware rules (#17), with the same two settings as the web app: an arrow that only calls a void
      // function, and numbers in template strings (text for a reader is never built in the domain, ADR 0014).
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      'no-restricted-globals': ['error', ...IO_GLOBALS],
      'no-restricted-properties': ['error', ...CLOCK_PROPERTIES],
      'no-restricted-syntax': ['error', ...CLOCK_SYNTAX],
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
    // text for a reader. Modules move under this rule as they are converted; #95 extends it to the whole package.
    // A Swedish string without those letters is not caught, which the unit tests on codes cover instead.
    files: [
      'src/plan.ts',
      'src/slu.ts',
      'src/optimize.ts',
      'src/swaps.ts',
      'src/quality.ts',
      'src/sensitivity.ts',
      'src/transition.ts',
      'src/journal.ts',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...CLOCK_SYNTAX,
        {
          selector: 'Literal[value=/[ÅÄÖåäö]/], TemplateElement[value.raw=/[ÅÄÖåäö]/]',
          message: 'The domain returns message codes with params, not Swedish text (ADR 0014).',
        },
      ],
    },
  },
  {
    // In a test, `x!` states what the test expects; if x is missing the test fails anyway (#17).
    files: ['**/*.test.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  {
    extends: [js.configs.recommended, tseslint.configs.disableTypeChecked],
    files: ['**/*.js'],
  },
)
