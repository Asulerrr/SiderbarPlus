const js = require('@eslint/js');
const reactPlugin = require('eslint-plugin-react');
const tsParser = require('@typescript-eslint/parser');
const globals = require('globals');

module.exports = [
  {
    ignores: ['out/**', 'dist/**', 'node_modules/**', 'electron.vite.config.*.mjs']
  },
  {
    ...js.configs.recommended,
    files: ['**/*.{js,cjs}'],
    languageOptions: {
      ...js.configs.recommended.languageOptions,
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        ...globals.node
      }
    }
  },
  {
    ...js.configs.recommended,
    files: ['**/*.mjs'],
    languageOptions: {
      ...js.configs.recommended.languageOptions,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node
      }
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true
        }
      },
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    plugins: {
      react: reactPlugin
    },
    settings: {
      react: {
        version: 'detect'
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactPlugin.configs.recommended.rules,
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'no-redeclare': 'off',
      'react/react-in-jsx-scope': 'off'
    }
  },
  {
    files: ['**/*.d.ts'],
    rules: {
      'no-unused-vars': 'off'
    }
  }
];
