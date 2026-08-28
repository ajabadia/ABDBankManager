import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/GITS/**',
      '**/build/**',
      '**/dist/**',
      '**/vendor/**',
      '**/*.gen.js',
      '**/*.gen.ts',
      '**/*.min.js',
      '**/*.map'
    ]
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, ...globals.vitest },
      sourceType: 'module',
      ecmaVersion: 'latest'
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none', ignoreRestSiblings: true }]
    }
  },
  ...tseslint.configs.recommended.map(config => ({
    ...config,
    files: ['**/*.ts']
  })),
  {
    files: ['Source/**/*.ts'],
    languageOptions: {
      globals: globals.node,
      sourceType: 'module',
      ecmaVersion: 'latest'
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { args: 'none', ignoreRestSiblings: true }]
    }
  }
];
