import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// The API answers with codes, not sentences (ADR 0013); the web app turns them into text (ADR 0014). A string with
// å, ä or ö is almost always Swedish text for a reader, as the domain's guard (packages/domain/eslint.config.js) says.
const SWEDISH_TEXT = {
  selector: 'Literal[value=/[ÅÄÖåäö]/], Literal[regex.pattern=/[ÅÄÖåäö]/], TemplateElement[value.raw=/[ÅÄÖåäö]/]',
  message: 'The API returns codes, not Swedish text (ADR 0013, ADR 0014).',
}

export default tseslint.config(
  { ignores: ['dist'] },
  {
    rules: { 'no-template-curly-in-string': 'error' },
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.strictTypeChecked],
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // The same settings as the web app and the domain (#17).
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      'no-restricted-imports': [
        'error',
        { patterns: [{ regex: '(^|/)apps/', message: 'Dependencies point inwards: no other app (ADR 0003).' }] },
      ],
    },
  },
  {
    // Modules only; tests may hold Swedish data. The prompts and schema descriptions in ai/anthropic.ts are Swedish
    // model input, not text for a reader.
    files: ['src/**/*.ts'],
    ignores: ['**/*.test.ts', 'src/ai/anthropic.ts'],
    rules: { 'no-restricted-syntax': ['error', SWEDISH_TEXT] },
  },
  {
    // In a test, `x!` states what the test expects; if x is missing the test fails anyway (#17).
    files: ['**/*.test.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  {
    extends: [js.configs.recommended, tseslint.configs.disableTypeChecked],
    files: ['**/*.{js,mjs}'],
    languageOptions: { ecmaVersion: 2022, globals: globals.node },
  },
)
