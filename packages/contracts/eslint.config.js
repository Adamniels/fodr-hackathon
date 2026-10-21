import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
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
      // The same settings as the other workspaces (#17).
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      'no-restricted-imports': [
        'error',
        {
          // Contracts may use zod and the domain's types; nothing from the apps (ADR 0003).
          patterns: [{ regex: '(^|/)apps/', message: 'Dependencies point inwards: no apps (ADR 0003).' }],
        },
      ],
    },
  },
  {
    extends: [js.configs.recommended, tseslint.configs.disableTypeChecked],
    files: ['**/*.js'],
  },
)
