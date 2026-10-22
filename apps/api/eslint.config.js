import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// The API answers with codes, not sentences (ADR 0013); the web app turns them into text (ADR 0014). A string with
// å, ä or ö is almost always Swedish text for a reader, as the domain's guard (packages/domain/eslint.config.js) says.
const SWEDISH_TEXT = {
  selector: 'Literal[value=/[ÅÄÖåäö]/], Literal[regex.pattern=/[ÅÄÖåäö]/], TemplateElement[value.raw=/[ÅÄÖåäö]/]',
  message: 'The API returns codes, not Swedish text (ADR 0013, ADR 0014).',
}

const INWARDS = { regex: '(^|/)apps/', message: 'Dependencies point inwards: no other app (ADR 0003).' }

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
      'no-restricted-imports': ['error', { patterns: [INWARDS] }],
    },
  },
  {
    // Handlers never reach the database themselves: data goes through repositories that take the user and scope every
    // query (ADR 0010). Only the database module and schema, auth (Better Auth's tables), the composition root, the
    // migrator and src/repositories/ may import it, or the driver and ORM beneath it. A dynamic import() or reaching
    // through auth.$context is left to review. A later block's rule options replace this one's, so it repeats INWARDS.
    files: ['src/**/*.ts'],
    ignores: [
      'src/db.ts',
      'src/db/**',
      'src/auth.ts',
      'src/server.ts',
      'src/migrate.ts',
      // The seed's composition roots: one transaction around the repositories it uses (#29).
      'src/seed.ts',
      'src/seed-cli.ts',
      // The product import's composition root (#35).
      'src/import-products-cli.ts',
      'src/repositories/**',
      // Imports Drizzle's and pg's error classes to keep query data out of the logs; no data access.
      'src/logger.ts',
      '**/*.test.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            INWARDS,
            {
              regex: '(^|/)db(\\.ts)?(/.*)?$|^pg$|^drizzle-orm(/|$)',
              message: 'Data access goes through a repository in src/repositories/ (ADR 0010).',
            },
          ],
        },
      ],
    },
  },
  {
    // Modules only; tests may hold Swedish data. The prompts and schema descriptions in ai/anthropic.ts are Swedish
    // model input, not text for a reader; the emails in mail/templates.ts leave by email, not as API responses (#22);
    // seed-data.ts is the demo account's Swedish data (horse notes, journal text), stored as the owner would type it (#29).
    files: ['src/**/*.ts'],
    ignores: ['**/*.test.ts', 'src/ai/anthropic.ts', 'src/mail/templates.ts', 'src/seed-data.ts'],
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
