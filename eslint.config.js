import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        process: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        URL: 'readonly',
        Blob: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        NodeJS: true
      }
    },
    plugins: {
      '@typescript-eslint': tseslint
    },
    rules: {
      ...tseslint.configs.recommended.rules
    }
  },
  {
    // Test files use Mocha's global TDD/BDD functions and chai assertion
    // expressions (e.g. `expect(x).to.be.true`), which the base config would
    // otherwise flag as undefined globals / unused expressions.
    files: ['test/**/*.ts'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        before: 'readonly',
        beforeEach: 'readonly',
        after: 'readonly',
        afterEach: 'readonly'
      }
    },
    rules: {
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-explicit-any': 'off'
    }
  },
  {
    ignores: [
      'lib',
      'node_modules',
      // Claude Code worktrees, each a full checkout of the repo.
      '.claude',
      // Built by Vite inside a temp project, not by this package's toolchain.
      'portal-template',
      // Scratch input and output directories .gitignore already sets aside for local runs.
      'tmp',
      'test-source',
      'test-destination',
      'test-portal'
    ]
  }
];
