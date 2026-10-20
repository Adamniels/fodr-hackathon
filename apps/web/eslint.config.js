import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

// UI text lives in src/i18n (ADR 0014). These selectors catch text written inline: JSX text, and literals or
// template literals placed directly in JSX (as a child or a user-facing attribute), also through ?:, && and ||.
// Arguments to calls such as t('key') are not text. Known gap: a Swedish constant outside JSX is only caught
// when it contains å, ä or ö.
const LETTER = '/[A-Za-zÅÄÖåäöÉé]/'
const UI_ATTRIBUTES = '/^(label|placeholder|title|alt|aria-label|hjalp|rubrik|varde|under)$/'
const BRANCH = ':matches(ConditionalExpression, LogicalExpression)'
const inlineText = [':matches(JSXElement, JSXFragment)', `JSXAttribute[name.name=${UI_ATTRIBUTES}]`]
  .flatMap((parent) =>
    ['', ` > ${BRANCH}`, ` > ${BRANCH} > ${BRANCH}`].map((via) => `${parent} > JSXExpressionContainer${via}`),
  )
  .flatMap((path) => [
    `${path} > Literal[value=${LETTER}]`,
    `${path} > TemplateLiteral > TemplateElement[value.raw=${LETTER}]`,
  ])
const UI_TEXT_MESSAGE = 'UI text goes in src/i18n/sv.json and is rendered with t() or <Trans> (ADR 0014).'

export default tseslint.config(
  { ignores: ['dist', 'playwright-report', 'test-results'] },
  {
    // Catches '${x}' in a plain string, the bug behind audit finding C7.
    rules: { 'no-template-curly-in-string': 'error' },
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/data/**', 'src/**/*.test.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: `JSXText[value=${LETTER}]`, message: UI_TEXT_MESSAGE },
        { selector: `JSXAttribute[name.name=${UI_ATTRIBUTES}] > Literal[value=${LETTER}]`, message: UI_TEXT_MESSAGE },
        { selector: inlineText.join(', '), message: UI_TEXT_MESSAGE },
        { selector: 'Literal[value=/[ÅÄÖåäö]/], TemplateElement[value.raw=/[ÅÄÖåäö]/]', message: UI_TEXT_MESSAGE },
      ],
    },
  },
  {
    extends: [js.configs.recommended, tseslint.configs.disableTypeChecked],
    files: ['**/*.{js,mjs}'],
    languageOptions: { ecmaVersion: 2022, globals: globals.node },
  },
)
