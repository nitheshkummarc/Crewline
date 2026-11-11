// ESLint: TypeScript strict rules, React hooks, accessibility (jsx-a11y), no raw fetch outside the API client.
import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.strict, jsxA11y.flatConfigs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-restricted-globals': ['error', { name: 'fetch', message: 'All HTTP goes through src/api/client.ts.' }],
      'no-restricted-syntax': ['error', {
        selector: 'Literal[value=/—/]',
        message: 'No em dashes in any text (product rule 17).',
      }],
    },
  },
  {
    files: ['src/api/client.ts', 'src/**/*.test.{ts,tsx}', 'e2e/**/*.ts'],
    rules: { 'no-restricted-globals': 'off' },
  },
);
