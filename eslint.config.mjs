import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.scratch/**',
      '**/scratch/**',
      '**/.clasp.json',
      '**/.clasprc.json',
      '**/coverage/**',
      '**/build/**'
    ]
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2021
      }
    }
  },
  {
    files: ['src/**/*.ts', 'scripts/**/*.ts', 'test/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.googleappsscript
      }
    }
  },
  // Tier 1 Pure Core Isolation: Restrict GAS Globals in Core Domain Logic (ADR-0013)
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'SpreadsheetApp',
          message: 'SpreadsheetApp is a Tier 2 GAS global and must not be used in Tier 1 Core logic (ADR-0013).'
        },
        {
          name: 'DriveApp',
          message: 'DriveApp is a Tier 2 GAS global and must not be used in Tier 1 Core logic (ADR-0013).'
        },
        {
          name: 'GmailApp',
          message: 'GmailApp is a Tier 2 GAS global and must not be used in Tier 1 Core logic (ADR-0013).'
        },
        {
          name: 'CardService',
          message: 'CardService is a Tier 2 GAS global and must not be used in Tier 1 Core logic (ADR-0013).'
        },
        {
          name: 'Logger',
          message: 'Logger is a Tier 2 GAS global and must not be used in Tier 1 Core logic (ADR-0013).'
        },
        {
          name: 'PropertiesService',
          message: 'PropertiesService is a Tier 2 GAS global and must not be used in Tier 1 Core logic (ADR-0013).'
        },
        {
          name: 'ScriptApp',
          message: 'ScriptApp is a Tier 2 GAS global and must not be used in Tier 1 Core logic (ADR-0013).'
        },
        {
          name: 'UrlFetchApp',
          message: 'UrlFetchApp is a Tier 2 GAS global and must not be used in Tier 1 Core logic (ADR-0013).'
        },
        {
          name: 'Browser',
          message: 'Browser is a Tier 2 GAS global and must not be used in Tier 1 Core logic (ADR-0013).'
        }
      ]
    }
  },
  // Tier 1 & 2 Node.js Import Restrictions: Prevent Node built-ins in src/ (ADR-0013)
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'fs', message: 'Do not import Node.js fs module in src/ for GAS compatibility.' },
            { name: 'node:fs', message: 'Do not import Node.js fs module in src/ for GAS compatibility.' },
            { name: 'path', message: 'Do not import Node.js path module in src/ for GAS compatibility.' },
            { name: 'node:path', message: 'Do not import Node.js path module in src/ for GAS compatibility.' },
            { name: 'crypto', message: 'Do not import Node.js crypto module in src/ for GAS compatibility.' },
            { name: 'node:crypto', message: 'Do not import Node.js crypto module in src/ for GAS compatibility.' },
            { name: 'os', message: 'Do not import Node.js os module in src/ for GAS compatibility.' },
            { name: 'node:os', message: 'Do not import Node.js os module in src/ for GAS compatibility.' },
            { name: 'child_process', message: 'Do not import Node.js child_process in src/.' },
            { name: 'node:child_process', message: 'Do not import Node.js child_process in src/.' }
          ],
          patterns: [
            { group: ['../scripts/*', '../../scripts/*'], message: 'Do not import Tier 3 scripts in src/.' }
          ]
        }
      ]
    }
  },
  // Architectural rules and project overrides
  {
    rules: {
      'no-var': 'error',
      'no-undef': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-useless-escape': 'off',
      'no-useless-assignment': 'off',
      'no-case-declarations': 'off',
      'no-fallthrough': 'off',
      'preserve-caught-error': 'off',
      '@typescript-eslint/no-require-imports': 'error',
      '@typescript-eslint/triple-slash-reference': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_'
        }
      ]
    }
  }
);
