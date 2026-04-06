# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

APIMatic CLI (`@apimatic/cli`) — the official CLI for APIMatic, built on oclif v4 with TypeScript ESM. It provides commands for API spec validation/transformation, SDK generation, and documentation portal management.

## Common Commands

```bash
# Build
npm run build          # tsc -b → outputs to lib/

# Lint
npm run lint           # ESLint on src/**/*.{js,ts}
npm run lint:fix       # ESLint with --fix --quiet

# Format
npm run format         # Prettier write on src/**/*.{js,ts}

# Test (all)
npm test               # tsx + mocha, runs test/**/*.test.ts

# Test (single file)
npx tsx node_modules/mocha/bin/_mocha "test/actions/portal/serve.test.ts" --timeout 99999

# Run CLI locally
node bin/run.js <command>
```

## Architecture — 5-Layer Stack

```
Command → Action → Application → Prompts / Infrastructure → Types
```

1. **Commands** (`src/commands/`) — oclif `Command` subclasses. Parse flags, build `CommandMetadata`, call `intro()` → `action.execute()` → `outro(result)`. No business logic.
2. **Actions** (`src/actions/`) — One per command. Orchestrate use-case: validate inputs via Context objects, coordinate services, return `ActionResult<T>`. Never throw to Command.
3. **Application** (`src/application/`) — Complex reusable domain algorithms (e.g., TOC generators, recipe generators). Pure transformations: data in → data out. No prompts, no API calls.
4. **Prompts** (`src/prompts/`) — All terminal UI via `@clack/prompts`. One class per command mirroring `actions/`. Uses `withSpinner` for async operations. No business logic.
5. **Infrastructure** (`src/infrastructure/`) — I/O adapters: `FileService`, `ZipService`, `NetworkService`, API services in `services/`. All return `Result<T, ServiceError>` (neverthrow).

Supporting: **Types** (`src/types/`) for value objects and context objects, **client-utils** for auth credential management, **utils** for pure string helpers, **config** for shared Axios instance.

## Critical Code Conventions

- **ESM imports with `.js` extension** — even for `.ts` source files: `import { Foo } from "../../types/file/directoryPath.js"`
- **No raw string paths** — use `DirectoryPath`, `FilePath`, `FileName`, `UrlPath` value objects from `src/types/file/`
- **No `console.log`** — all output through `@clack/prompts` via Prompts classes only
- **Error handling**: Services return `Result<T, ServiceError>` (neverthrow); Actions return `ActionResult<T>` (success/failed/cancelled). No uncaught throws above infrastructure.
- **Prompts delegation** — Actions never call `log.*` directly; every message goes through `this.prompts.*`
- **Temp directories** — always use `withDirPath()` wrapper, never `tmp-promise` directly
- **`authKey` typed as `string | null = null`**, not `undefined`
- **Exit via `outro(result)`** — sets `process.exitCode`; never call `process.exit()` directly
- **Constructor pattern**: `private readonly` properties, `public readonly execute = async (...) => { ... }`
- **`static cmdTxt`** on every Command using `format.cmd(...)` for example rendering
- **Topic separator is space** — `apimatic portal generate`, not `apimatic portal:generate`

## Commit Conventions

Uses [Conventional Commits](https://www.conventionalcommits.org/) enforced by commitlint + husky. Pre-commit runs lint-staged (ESLint + Prettier).

## Testing

- **Framework**: mocha + chai (expect style) + sinon + nock + mock-fs
- **Test location**: mirrors source — `test/commands/`, `test/actions/`, `test/application/`
- **HTTP mocking**: nock for API calls
- **Run via tsx** (not ts-node) for ESM compatibility
