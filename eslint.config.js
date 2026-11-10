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
    // The functional core of the SDK work: data and pure functions only. Anything that reaches
    // a process or the disk belongs in a context or in infrastructure.
    files: ['src/types/sdk/**/*.ts', 'src/types/git/**/*.ts', 'src/types/file/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            'fs',
            'node:fs',
            'fs/promises',
            'node:fs/promises',
            'fs-extra',
            'child_process',
            'node:child_process',
            'execa'
          ].map((name) => ({ name, message: 'src/types/sdk, git and file are pure: no file or process access.' })),
          patterns: [
            {
              group: ['**/infrastructure/**'],
              message: 'src/types/sdk, git and file are pure: they do not import infrastructure.'
            }
          ]
        }
      ]
    }
  },
  {
    // The mock server's core decides everything and touches nothing: stub files reach it as bytes and
    // requests as values, so what the HTTP host does is what the unit tests verify. It imports nothing
    // from the rest of the CLI either, which keeps it liftable into a package of its own.
    files: ['src/types/mock/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            'fs',
            'node:fs',
            'fs/promises',
            'node:fs/promises',
            'fs-extra',
            'child_process',
            'node:child_process',
            'execa',
            'http',
            'node:http',
            'https',
            'node:https',
            'net',
            'node:net'
          ].map((name) => ({ name, message: 'src/types/mock is pure: no file, process or network access.' })),
          patterns: [
            {
              group: ['@clack/*', '@oclif/*'],
              message: 'src/types/mock is pure: it prints nothing and knows no command.'
            },
            {
              group: ['../../*'],
              message: 'src/types/mock stands alone: it imports nothing from the rest of the CLI.'
            }
          ]
        }
      ]
    }
  },
  {
    // The stub format has no pattern rule and the mock compares with string operations alone, so a
    // value is never matched by something a stub author cannot read off the stub.
    files: [
      'src/types/mock/**/*.ts',
      'src/infrastructure/mock/**/*.ts',
      'src/actions/mock/**/*.ts',
      'src/prompts/mock/**/*.ts',
      'src/commands/mock/**/*.ts',
      'test/**/mock/**/*.ts'
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...['Literal[regex]', "NewExpression[callee.name='RegExp']", "CallExpression[callee.name='RegExp']"].map(
          (selector) => ({
            selector,
            message: 'The mock server uses no regular expressions; compare with string operations.'
          })
        )
      ]
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
