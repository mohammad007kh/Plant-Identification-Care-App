// Flat ESLint config (root) — lints both backend/ and frontend/ TypeScript.
// typescript-eslint recommended (non-type-checked for speed) + Prettier compat.
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/*.d.ts',
      'frontend/next-env.d.ts',
      // CommonJS/JS config files are not TS source; skip the TS-focused lint.
      '**/*.config.js',
      '**/*.config.cjs',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // Pragmatic relaxations for an early-stage scaffold; tightened later.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
);
