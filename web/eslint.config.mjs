// ESLint flat config for the web app (task 1.6 / finding F-008).
// Scope intentionally pragmatic: typescript-eslint recommended + React Hooks
// rules. This is the first lint baseline for a previously unlinted codebase;
// rules that would require a large refactors stay as warnings, correctness
// rules stay errors so CI fails on real defects.
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: ['dist/**', 'shared/**', 'scripts/**'],
  },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['src/**/*.test.{ts,tsx}', 'vitest.config.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
