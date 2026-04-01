# APIMatic CLI — Codebase Context & Architecture Guide

> Use this document as the definitive reference when **adding new code** or **reviewing and improving existing code**. Both workflows are covered explicitly.

---

## Table of Contents

1. [Tech Stack at a Glance](#1-tech-stack-at-a-glance)
2. [Directory Map](#2-directory-map)
3. [Architectural Layers](#3-architectural-layers)
   - [Commands (`src/commands/`)](#31-commands-srccommands)
   - [Actions (`src/actions/`)](#32-actions-srcactions)
   - [Application (`src/application/`)](#33-application-srcapplication)
   - [Prompts (`src/prompts/`)](#34-prompts-srcprompts)
   - [Infrastructure (`src/infrastructure/`)](#35-infrastructure-srcinfrastructure)
   - [Types (`src/types/`)](#36-types-srctypes)
   - [Client-Utils (`src/client-utils/`)](#37-client-utils-srcclient-utils)
   - [Utils (`src/utils/`)](#38-utils-srcutils)
   - [Config (`src/config/`)](#39-config-srcconfig)
   - [Hooks (`src/hooks/`)](#310-hooks-srchooks)
4. [Full Data Flow: What Happens When a Command Runs](#4-full-data-flow-what-happens-when-a-command-runs)
5. [Layer Responsibility Rules (What Goes Where)](#5-layer-responsibility-rules-what-goes-where)
6. [How to Add a New Command — Step-by-Step](#6-how-to-add-a-new-command--step-by-step)
7. [Key Patterns & Conventions](#7-key-patterns--conventions)
   - [Error Handling: neverthrow + ActionResult](#71-error-handling-neverthrow--actionresult)
   - [Path Value Objects](#72-path-value-objects)
   - [CommandMetadata](#73-commandmetadata)
   - [FlagsProvider](#74-flagsprovider)
   - [Temporary Directories](#75-temporary-directories)
   - [Prompts formatting helpers](#76-prompts-formatting-helpers)
   - [Auth & API Key Resolution](#77-auth--api-key-resolution)
8. [Topic Structure and oclif Registration](#8-topic-structure-and-oclif-registration)
9. [Testing Conventions](#9-testing-conventions)
10. [Code Quality Rules](#10-code-quality-rules)
11. [Reviewing & Improving Existing Code](#11-reviewing--improving-existing-code)
    - [Layer audit checklist](#111-layer-audit-checklist)
    - [Anti-pattern catalogue](#112-anti-pattern-catalogue)
    - [Refactoring decision tree](#113-refactoring-decision-tree)

---

## 1. Tech Stack at a Glance

| Concern | Library |
|---|---|
| CLI framework | `@oclif/core` v4 |
| Interactive prompts / UI | `@clack/prompts` v1 Alpha |
| Terminal colours | `picocolors` |
| Result / error typing | `neverthrow` (`Result<T, E>`) |
| API SDK (APIMatic platform) | `@apimatic/sdk` |
| HTTP client (direct) | `axios` |
| File operations | `fs-extra` |
| ZIP archive/extract | `archiver`, `extract-zip` |
| Temp directories | `tmp-promise` |
| YAML serialisation | `yaml` |
| Code formatting | `prettier` |
| Module system | ESM (`"type": "module"`) |
| Language | TypeScript 5 — compiled to `lib/`, tested via `tsx` |
| Test runner | Mocha + Chai + Sinon + Nock |

---

## 2. Directory Map

```
src/
├── index.ts                   # Re-exports oclif run() — CLI entry point
├── commands/                  # Layer 1: oclif Command classes (CLI interface)
│   ├── quickstart.ts
│   ├── api/
│   │   ├── transform.ts
│   │   └── validate.ts
│   ├── auth/
│   │   ├── login.ts
│   │   ├── logout.ts
│   │   └── status.ts
│   ├── portal/
│   │   ├── copilot.ts
│   │   ├── generate.ts
│   │   ├── serve.ts
│   │   ├── recipe/
│   │   └── toc/
│   └── sdk/
│       ├── generate.ts
│       └── save-changes.ts
├── actions/                   # Layer 2: Use-case orchestrators
│   ├── action-result.ts       # ActionResult<T> — command exit envelope
│   ├── quickstart.ts
│   ├── api/, auth/, portal/, sdk/
├── application/               # Layer 3: Complex domain logic (not per-command)
│   ├── portal/
│   │   ├── recipe/            # Recipe generation algorithms
│   │   └── toc/               # TOC structure generation algorithms
│   └── sdk/
│       └── versioned-build-resolver.ts   # Shared versioned/unversioned build resolution
├── prompts/                   # Layer 4: All terminal output / interactive UI
│   ├── format.ts              # Shared colour formatters + intro/outro
│   ├── prompt.ts              # withSpinner, noteWrapped helpers
│   ├── quickstart.ts
│   ├── api/, auth/, portal/, sdk/
├── infrastructure/            # Layer 5: I/O, external APIs, system services
│   ├── services/
│   │   ├── api-client-factory.ts   # Creates @apimatic/sdk Client
│   │   ├── api-service.ts          # Direct axios calls (account, telemetry, status)
│   │   ├── auth-service.ts         # Device login flow
│   │   ├── file-download-service.ts
│   │   ├── portal-service.ts       # Portal & SDK generation API calls
│   │   ├── telemetry-service.ts
│   │   ├── transformation-service.ts
│   │   └── validation-service.ts
│   ├── debounce-service.ts
│   ├── env-info.ts            # CLI version, User-Agent, base-URL from env vars
│   ├── file-service.ts        # File system operations
│   ├── git-service.ts
│   ├── launcher-service.ts    # Opens files/URLs in OS default apps
│   ├── network-service.ts     # Port resolution
│   ├── service-error.ts       # Typed error catalog
│   ├── tmp-extensions.ts      # withDirPath() wrapper for tmp-promise
│   └── zip-service.ts
├── types/                     # Value objects, context objects, interfaces, enums
│   ├── file/                  # DirectoryPath, FilePath, FileName, UrlPath, ResourceInput
│   ├── common/                # CommandMetadata
│   ├── events/                # DomainEvent base + concrete events (telemetry)
│   ├── build/, sdk/, api/, recipe/, sdl/, toc/   # Domain enums & DTOs
│   ├── build-context.ts       # Wraps build directory: validate, read/write APIMATIC-BUILD.json
│   ├── portal-context.ts
│   ├── resource-context.ts    # Resolves file or URL input → local FilePath
│   ├── sdk-context.ts
│   ├── sdk-source-tree-context.ts
│   ├── spec-context.ts
│   ├── temp-context.ts        # Builds zip / saves streams inside a temp dir
│   ├── toc-context.ts
│   ├── versioned-build-context.ts
│   ├── flags-provider.ts      # Shared oclif flag definitions
│   └── utils.ts
├── client-utils/
│   └── auth-manager.ts        # Read/write config.json (credentials)
├── utils/
│   ├── telemetry.ts           # Shared telemetry flag snapshot helpers
│   ├── utils.ts               # replaceHTML, parseStreamBodyToJson, toPascalCase
│   └── string-utils.ts        # removeQuotes, stripAnsi, toTitleCase
├── config/
│   └── axios-config.ts        # Axios instance (50 MB limit, 5 min timeout)
└── hooks/
    ├── not-found.ts           # Command-not-found hook with fuzzy suggestion
    └── utils.ts
```

---

## 3. Architectural Layers

### 3.1 Commands (`src/commands/`)

**What it is:** The oclif `Command` class. This is the CLI's *public contract* — it owns flag definitions, help text, and examples.

**Responsibilities:**
- Declare `static flags`, `static summary`, `static description`, `static examples`.
- Parse flags with `this.parse()`.
- Convert raw flag values into typed domain objects (`DirectoryPath`, `FilePath`, `ResourceInput`).
- Build `CommandMetadata` (`commandName`, `shell`).
- Call `intro("Title")` at the start.
- Instantiate the Action and call `.execute()`.
- Call `outro(result)` with the `ActionResult` — this sets `process.exitCode`.
- Optionally fire telemetry events before/after (see `Quickstart` command).

**What it must NOT do:**
- Write any business logic.
- Print any messages itself (error/info/success all go through Prompts via the Action).
- Call infrastructure services directly.
- Call the APIMatic API.

**Signature pattern:**

```typescript
export default class MyTopicMyCommand extends Command {
  static readonly summary = "One-line description";
  static readonly description = `Longer description shown in --help.`;
  static readonly cmdTxt = format.cmd("apimatic", "my-topic", "my-command");

  static flags = {
    someFlag: Flags.string({ ... }),
    ...FlagsProvider.authKey,
    ...FlagsProvider.force,
  };

  static examples = [
    `${MyTopicMyCommand.cmdTxt} ${format.flag("someFlag", "value")}`,
  ];

  async run() {
    const { flags: { someFlag, "auth-key": authKey } } = await this.parse(MyTopicMyCommand);

    const commandMetadata: CommandMetadata = {
      commandName: MyTopicMyCommand.id,
      shell: this.config.shell,
    };

    intro("My Command Title");
    const action = new MyCommandAction(this.getConfigDir(), commandMetadata, authKey);
    const result = await action.execute(/* typed args */);
    outro(result);
  }

  private readonly getConfigDir = () => new DirectoryPath(this.config.configDir);
}
```

---

### 3.2 Actions (`src/actions/`)

**What it is:** The use-case orchestrator. One action class per command. This is the *brain* of each command.

**Responsibilities:**
- Accept typed domain inputs (e.g., `DirectoryPath`, `Language`, `ResourceInput`).
- Run validation / precondition checks (e.g., validate spec dir is non-empty).
- Guard against destructive operations (check for existing output, ask user via Prompts).
- Coordinate multi-step workflows using Context objects and Infrastructure services.
- Use `withDirPath()` for any operation needing a temporary directory.
- Delegate all display/IO to the matching Prompts class.
- Return `ActionResult` (never throw to the Command layer).

**Constructor contract (always):**
```typescript
constructor(configDir: DirectoryPath, commandMetadata: CommandMetadata, authKey: string | null = null)
```

**Execute method signature:**
```typescript
public readonly execute = async (/* domain params */): Promise<ActionResult<T>> => { ... }
```

**What it must NOT do:**
- Call `console.log`, `log.info`, etc. — all output is via `this.prompts.*`.
- Call `@apimatic/sdk` controllers directly — that belongs in a service.
- Import from `@clack/prompts` directly.
- Throw uncaught exceptions — always return a typed `ActionResult`.

**Canonical orchestration sequence:**
1. Guard: validate mutual exclusivity or paths.
2. Validate input types/existence (via Context objects).
3. Check overwrite guard (via `this.prompts.overwrite...()` confirm prompts).
4. Open temp dir via `withDirPath()`.
5. Zip input, call service inside `withSpinner` (via Prompts method).
6. Check `response.isErr()` → call `this.prompts.logError()` → return `ActionResult.failed()`.
7. Unzip / save output via Context.
8. Call final success message via `this.prompts.success()`.
9. Return `ActionResult.success()`.

---

### 3.3 Application (`src/application/`)

**What it is:** A layer for *complex domain algorithms* that are not purely orchestration and not purely infrastructure. Think: code generators, structure builders, parsers for internal formats.

**Responsibilities:**
- Implement multi-step *transformation* or *generation* logic (e.g., `PortalRecipeGenerator`, `TocStructureGenerator`).
- Accept pure data (DTOs, context objects), return transformed data.
- Do not contain interactive prompts or process exit logic.

**When to use this layer vs. Actions:**
- Does the logic involve *multiple commands* sharing the same algorithm? → Application layer.
- Is it a simple one-command orchestration? → Keep it in the Action.
- Is it a complex stateless transformation (e.g., building a YAML structure)? → Application layer.

Examples:
- `TocStructureGenerator` takes API endpoint/model data and builds the YAML TOC tree.
- `VersionedBuildResolver` resolves unversioned/versioned build directories and API version selection.

These classes are reusable across multiple actions.

---

### 3.4 Prompts (`src/prompts/`)

**What it is:** All terminal UI rendering. One class per command, mirroring the `actions/` folder structure.

**Responsibilities:**
- Render messages using `@clack/prompts` (`log.info`, `log.error`, `log.success`, `log.warning`, `log.message`).
- Show `confirm` and `select` interactive prompts.
- Wrap long-running async operations with `withSpinner()`.
- Format values using the shared `format.*` helpers from `format.ts`.

**Shared helpers (always use these, never raw `console.log`):**

| Helper | Purpose |
|---|---|
| `format.var(text)` | Emphasise a variable/identifier name (magenta) |
| `format.path(path)` | Show a filesystem path (cyan) |
| `format.flag(name, value?)` | Show a CLI flag (green) |
| `format.cmd(bin, ...parts)` | Render a command (blue) |
| `format.link(text)` | Hyperlink text (underline + blue) |
| `withSpinner(intro, success, failure, fn)` | Spin while awaiting a `Promise<Result<T,E>>` |
| `noteWrapped(message, title)` | Overflow-safe `note()` box |
| `intro(text)` / `outro(result)` | Called in Command only |

**What it must NOT do:**
- Contain any business logic.
- Directly call infrastructure or services.

---

### 3.5 Infrastructure (`src/infrastructure/`)

**What it is:** Adapters for everything external — filesystem, network, external APIs. Contains raw I/O side effects.

**Sub-layers:**

#### `infrastructure/services/` — External API calls

| Service | Purpose |
|---|---|
| `ApiClientFactory` | Creates a configured `@apimatic/sdk` `Client` with auth + user-agent |
| `ApiService` | Direct axios calls: account info, portal generation status, telemetry |
| `AuthService` | Device login OAuth flow |
| `PortalService` | Portal generation, SDK generation, API transformation |
| `ValidationService` | API spec validation via APIMatic API |
| `TransformationService` | API spec transformation |
| `FileDownloadService` | Downloads a remote file to a stream |
| `TelemetryService` | Sends domain events to telemetry endpoint |

**All services return `Result<T, ServiceError>` (neverthrow) — never throw to callers.**

#### `infrastructure/` — System utilities

| File | Purpose |
|---|---|
| `FileService` | All `fs-extra` wrappers (exists, read, write, copy, clean, stream) |
| `ZipService` | Archive directory → zip, extract zip → directory |
| `EnvInfo` | CLI version, user-agent string, base URL from env vars |
| `ServiceError` | Typed error catalog with predefined statics |
| `LauncherService` | Opens URLs / files via OS default app |
| `NetworkService` | Finds a free local port |
| `DebounceService` | File watcher debounce |
| `GitService` | Git-only operations (branches, refs, staging, commits, conflicts) |
| `tmp-extensions.ts` | `withDirPath(fn)` — wraps `tmp-promise` to provide a `DirectoryPath` |

**Infrastructure composition rule:**

- Do not initialize one infrastructure utility/service inside another.
- Keep utilities single-purpose (`GitService` does git only, `FileService` does file I/O only, `ZipService` does archive I/O only).
- Compose utilities at the Action/Context layer, where use-case orchestration belongs.

**Auth resolution in services:**

Services always resolve auth in this priority order:
1. `authKey` parameter (passed from Action → Command flag `--auth-key`).
2. Stored `authInfo.authKey` from `config.json` (read via `getAuthInfo(configDir)`).

```typescript
const authInfo = await getAuthInfo(configDir.toString());
const token = authKey || authInfo?.authKey;
```

---

### 3.6 Types (`src/types/`)

**What it is:** Value objects, context objects, enums, and DTOs. No logic lives here except what is intrinsic to the type.

#### Path value objects (`src/types/file/`)

Always use these — **never pass raw strings** as file/directory references:

| Class | Use for |
|---|---|
| `DirectoryPath` | A folder on disk. Has `.join()`, `.isEqual()`, `.leafName()`, `.toString()` |
| `FilePath` | A specific file: constructed from `(DirectoryPath, FileName)`. Has `.replaceDirectory()` |
| `FileName` | Just the filename portion |
| `UrlPath` | An HTTP(S) URL. Use `UrlPath.create(str)` for safe construction |
| `ResourceInput` | Discriminated union: `FilePath | UrlPath`. Created via `createResourceInput(file?, url?)` |

#### Context objects (`src/types/*-context.ts`)

Context objects encapsulate validation + persistence logic for a specific domain directory. They use `FileService` and `ZipService` internally.

| Context | Wraps |
|---|---|
| `BuildContext` | The `src/` directory with `APIMATIC-BUILD.json`. Validates, reads/writes build config. |
| `PortalContext` | The portal output directory. Checks existence, saves portal zip/unzipped. |
| `SdkContext` | The SDK output directory + language subdirectory. Checks existence, saves. |
| `SdkSourceTreeContext` | SDK source-tree persistence (`sdk-source-tree/.<language>`): restore/persist archive + save policy. |
| `SpecContext` | The spec input directory. Validates non-empty, can replace/save spec files. |
| `ResourceContext` | Resolves `ResourceInput` to a local `FilePath` — downloads if URL, copies if local. |
| `TempContext` | Wraps the temp dir: `zip(dir)`, `save(stream)` with random UUID filenames. |
| `VersionedBuildContext` | Detects versioned build shape and enumerates available versions. |

#### Domain types

- `src/types/sdk/generate.ts` — `Language` enum (all supported SDK languages).
- `src/types/build/build.ts` — `BuildConfig` interface (APIMATIC-BUILD.json shape).
- `src/types/api/` — API response interfaces.
- `src/types/events/` — Telemetry event classes inheriting `DomainEvent`.
- `src/types/common/command-metadata.ts` — `CommandMetadata { commandName, shell }`.

---

### 3.7 Client-Utils (`src/client-utils/`)

**auth-manager.ts** — The only file here. Handles reading/writing `config.json` to the oclif config directory.

```typescript
getAuthInfo(configDir: string): Promise<AuthInfo | null>
setAuthInfo(email, authKey, isTelemetryOptedOut, configDir): Promise<void>
removeAuthInfo(configDir): Promise<void>
```

`AuthInfo` shape: `{ email: string; authKey: string; APIMATIC_CLI_TELEMETRY_OPTOUT?: string }`

---

### 3.8 Utils (`src/utils/`)

Pure, stateless functions. No I/O.

- `utils.ts` — `replaceHTML`, `parseStreamBodyToJson`, `toPascalCase`, `getFileNameFromPath`
- `string-utils.ts` — `removeQuotes`, `stripAnsi`, `toTitleCase`

---

### 3.9 Config (`src/config/`)

- `axios-config.ts` — Exports a single Axios instance with 50 MB body limit and 5-minute timeout. Import this instead of creating new Axios instances.

---

### 3.10 Hooks (`src/hooks/`)

oclif lifecycle hooks. Currently: `command_not_found` — suggests the closest matching command using Levenshtein distance. Registered in `package.json` under `oclif.hooks`.

---

## 4. Full Data Flow: What Happens When a Command Runs

```
User types: apimatic sdk generate --language java
        │
        ▼
[ oclif core ]
        │  routes to src/commands/sdk/generate.ts
        ▼
[ Command: SdkGenerate ]
  • this.parse(SdkGenerate) → extracts flags
  • Wraps raw strings: new DirectoryPath(spec), new DirectoryPath(destination)
  • Builds CommandMetadata { commandName, shell }
  • intro("Generate SDK")          ← pure UI, via format.ts
  • new GenerateAction(configDir, commandMetadata, authKey)
  • result = await action.execute(specDirectory, sdkDirectory, language, force, zipSdk)
  • outro(result)                  ← sets process.exitCode
        │
        ▼
[ Action: GenerateAction ]   (src/actions/sdk/generate.ts)
  • validates specDirectory not same as sdkDirectory → prompts.sameSpecAndSdkDir()
  • new SpecContext(specDirectory).validate() → checks non-empty dir
  • new SdkContext(sdkDirectory, language).exists() → overwrite guard
  • withDirPath(async (tempDir) => {
      tempContext.zip(specDirectory)           ← TempContext packs input
      prompts.generateSDK(
        portalService.generateSdk(...)         ← triggers spinner + API call
      )
      if err → prompts.logGenerationError()   → ActionResult.failed()
      sdkContext.save(tempFilePath, zipSdk)    ← SdkContext unpacks output
      prompts.sdkGenerated(sdkDir)
      return ActionResult.success()
    })
        │
        ▼
[ Infrastructure: PortalService.generateSdk() ]  (src/infrastructure/services/portal-service.ts)
  • getAuthInfo() + apiClientFactory.createApiClient()
  • @apimatic/sdk CodeGenerationController.generateSDKViaFile()
  • returns Result<NodeJS.ReadableStream, ServiceError>
        │
        ▼
[ Prompts: SdkGeneratePrompts ]   (src/prompts/sdk/generate.ts)
  • withSpinner wraps the API call promise — shows spinner during wait
  • On error: log.error(message)
  • On success: log.info(`Generated SDK can be found at ...`)
```

---

## 5. Layer Responsibility Rules (What Goes Where)

| Decision | Layer |
|---|---|
| Declare CLI flags and `--help` content | **Command** |
| Parse and type-convert flags | **Command** |
| `intro()` and `outro()` calls | **Command** |
| Validate that input paths are non-empty | **Action** (via Context objects) |
| Ask user "overwrite existing output?" | **Action** → delegates confirm to **Prompts** |
| Coordinate steps 1→2→3→4 in sequence | **Action** |
| Make an HTTP call to APIMatic API | **Infrastructure / Services** |
| Read from / write to disk | **Infrastructure / FileService** |
| Work with ZIP files | **Infrastructure / ZipService** |
| Persist SDK source-tree archives (`sdk-source-tree/.<language>`) | **Types / SdkSourceTreeContext** |
| Sync git refs/branches and resolve conflicts | **Infrastructure / GitService** |
| Build a complex YAML structure | **Application** |
| Generate a recipe from steps | **Application** |
| Print any message to the terminal | **Prompts** |
| Show a spinner for a long operation | **Prompts** (`withSpinner`) |
| Ask an interactive `confirm` or `select` | **Prompts** |
| Define `DirectoryPath`, `FilePath` etc. | **Types / file/** |
| Define response shapes for API responses | **Types** |
| Represent domain enums (e.g. `Language`) | **Types** |
| Read/write `config.json` credentials | **client-utils / auth-manager** |
| Strip HTML, parse streams | **Utils** |
| Fire telemetry events | **Action** or **Command** (via `TelemetryService`) |

---

## 6. How to Add a New Command — Step-by-Step

Suppose you want to add `apimatic api lint` (a hypothetical new command).

### Step 1 — Define types (if needed)
If the command introduces new enums or DTOs, add them to `src/types/api/lint.ts`:
```typescript
// src/types/api/lint.ts
export enum LintRuleset { ... }
```

### Step 2 — Add a service (if it calls a new API endpoint)
```typescript
// src/infrastructure/services/lint-service.ts
export class LintService {
  constructor(private readonly configDir: DirectoryPath) {}

  async lintViaFile(params: LintParams): Promise<Result<LintResponse, string>> {
    // authenticate, call API, return Result
  }
}
```

### Step 3 — Create the Prompts class
```typescript
// src/prompts/api/lint.ts
import { log } from "@clack/prompts";
import { withSpinner } from "../prompt.js";
import { format as f } from "../format.js";
import { Result } from "neverthrow";

export class ApiLintPrompts {
  public lintApi(fn: Promise<Result<LintResponse, string>>) {
    return withSpinner("Linting API", "API linting completed", "API linting failed", fn);
  }
  public logLintError(error: string) { log.error(error); }
  public displayResults(results: LintResponse) { log.info(...); }
  public noIssuesFound() { log.success("No linting issues found."); }
}
```

### Step 4 — Create the Action class
```typescript
// src/actions/api/lint.ts
import { LintService } from "../../infrastructure/services/lint-service.js";
import { ApiLintPrompts } from "../../prompts/api/lint.js";
import { ActionResult } from "../action-result.js";
import { withDirPath } from "../../infrastructure/tmp-extensions.js";
import { ResourceContext } from "../../types/resource-context.js";
import { ResourceInput } from "../../types/file/resource-input.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";

export class LintAction {
  private readonly prompts = new ApiLintPrompts();
  private readonly lintService: LintService;

  constructor(configDir: DirectoryPath, private readonly commandMetadata: CommandMetadata, private readonly authKey: string | null = null) {
    this.lintService = new LintService(configDir);
  }

  public readonly execute = async (resourcePath: ResourceInput): Promise<ActionResult> => {
    return await withDirPath(async (tempDir) => {
      const resourceContext = new ResourceContext(tempDir);
      const fileResult = await resourceContext.resolveTo(resourcePath);
      if (fileResult.isErr()) {
        this.prompts.logLintError(fileResult.error.errorMessage);
        return ActionResult.failed();
      }

      const lintResult = await this.prompts.lintApi(
        this.lintService.lintViaFile({ file: fileResult.value, commandMetadata: this.commandMetadata, authKey: this.authKey })
      );

      if (lintResult.isErr()) {
        this.prompts.logLintError(lintResult.error);
        return ActionResult.failed();
      }

      this.prompts.displayResults(lintResult.value);
      return ActionResult.success();
    });
  };
}
```

### Step 5 — Create the Command class
```typescript
// src/commands/api/lint.ts
import { Command, Flags } from "@oclif/core";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FlagsProvider } from "../../types/flags-provider.js";
import { LintAction } from "../../actions/api/lint.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { format, intro, outro } from "../../prompts/format.js";
import { createResourceInput } from "../../types/file/resource-input.js";

export default class ApiLint extends Command {
  static readonly summary = "Lint an API specification";
  static readonly description = `Run linting rules against your API spec.`;
  static readonly cmdTxt = format.cmd("apimatic", "api", "lint");

  static flags = {
    file: Flags.string({ description: "Path to the API specification file" }),
    url: Flags.string({ description: "URL to the API specification file" }),
    ...FlagsProvider.authKey,
  };

  static examples = [
    `${ApiLint.cmdTxt} ${format.flag("file", "./specs/sample.json")}`,
    `${ApiLint.cmdTxt} ${format.flag("url", '"https://petstore.swagger.io/v2/swagger.json"')}`,
  ];

  async run() {
    const { flags: { file, url, "auth-key": authKey } } = await this.parse(ApiLint);

    const commandMetadata: CommandMetadata = {
      commandName: ApiLint.id,
      shell: this.config.shell,
    };

    const action = new LintAction(this.getConfigDir(), commandMetadata, authKey);
    const resourceInput = createResourceInput(file, url);

    intro("Lint API");
    const result = await action.execute(resourceInput);
    outro(result);
  }

  private readonly getConfigDir = () => new DirectoryPath(this.config.configDir);
}
```

### Step 6 — Register the topic in `package.json` (if a new topic)
```json
"oclif": {
  "topics": {
    "api": { "description": "Transform, Validate & Lint your API specifications." }
  }
}
```
No registration needed for commands within an existing topic — oclif auto-discovers from `lib/commands/`.

### Step 7 — Add tests
- `test/commands/api/lint.test.ts` — integration tests using `runCommand(["api lint", ...flags])`.
- `test/actions/api/lint.test.ts` — unit tests instantiating `LintAction` directly with test doubles.

---

## 7. Key Patterns & Conventions

### 7.1 Error Handling: neverthrow + ActionResult

**Infrastructure layer returns:** `Result<T, ServiceError | string>` from `neverthrow`.

**Action layer translates to:** `ActionResult<T>` — never exposes `Result` above the Action.

```typescript
// Pattern for handling service results in an Action:
const result = await this.prompts.doOperation(
  this.service.callApi(params)   // Returns Promise<Result<T, E>>
);                               // prompts wraps it in withSpinner, returns same Result

if (result.isErr()) {
  this.prompts.logError(result.error);
  return ActionResult.failed();
}
// use result.value safely
```

**`ActionResult` states:**

| State | Exit Code | Factory |
|---|---|---|
| Success | 0 | `ActionResult.success(value?)` |
| Failure | 1 | `ActionResult.failed(message?)` |
| Cancelled | 130 | `ActionResult.cancelled()` / `ActionResult.stopped()` |

**`ServiceError` — use the statics, don't construct new ones:**
```typescript
ServiceError.UnAuthorized     // 401
ServiceError.NotFound         // 404
ServiceError.ServerError      // 500
ServiceError.NetworkError     // ECONNREFUSED, ENOTFOUND
ServiceError.InvalidResponse  // Unexpected response
ServiceError.badRequest(msg)  // 400 with custom message
ServiceError.forbidden(msg)   // 403 with custom message
```

---

### 7.2 Path Value Objects

**Always construct at the boundary (Command layer), never deep inside logic:**

```typescript
// ✅ Good — Command parses the raw string and wraps it
const specDirectory = new DirectoryPath(flags.spec);

// ✅ Good — passing to action as a typed value
await action.execute(specDirectory, sdkDirectory, language);

// ❌ Bad — passing raw strings into actions or services
await action.execute(flags.spec, flags.destination, language);
```

**`DirectoryPath.createInput(input?: string)`** — handles `undefined` by returning `.default` (`./`). Use this for optional `--input` flags.

**`createResourceInput(file?, url?)`** — enforces mutual exclusivity between `--file` and `--url` flags. Throws on invalid combinations. Call from the Command.

---

### 7.3 CommandMetadata

Always construct in the Command, pass down:
```typescript
const commandMetadata: CommandMetadata = {
  commandName: MyCommand.id,   // oclif auto-computed from path, e.g. "api:validate"
  shell: this.config.shell,    // used for User-Agent header in API calls
};
```

This is forwarded into every service call to build the `User-Agent` string sent to the APIMatic API.

---

### 7.4 FlagsProvider

Shared reusable flag definitions. Spread into `static flags`:
```typescript
static flags = {
  ...FlagsProvider.authKey,           // --auth-key (-k)
  ...FlagsProvider.force,             // --force (-f)
  ...FlagsProvider.input,             // --input (-i)
  ...FlagsProvider.destination("portal", "portal"),  // --destination (-d)
};
```

Add new shared flags to `FlagsProvider` if they will be used by more than one command. Keep command-specific flags inline.

---

### 7.5 Temporary Directories

Any operation that needs scratch space (zipping input, saving a stream before extracting) must use `withDirPath`:

```typescript
import { withDirPath } from "../../infrastructure/tmp-extensions.js";

return await withDirPath(async (tempDirectory) => {
  const tempContext = new TempContext(tempDirectory);
  const zipPath = await tempContext.zip(someDirectory);
  // ... use zipPath ...
  return ActionResult.success();
});
// Temp dir is auto-cleaned after the callback resolves or rejects
```

Never create temp directories manually. The `TempContext` class handles unique filename generation (UUID).

---

### 7.6 Prompts formatting helpers

Use `format.*` from `src/prompts/format.ts` — never build coloured strings manually:

```typescript
import { format as f } from "../format.js";

log.info(`The spec is at ${f.path(specDirectory)}.`);
log.error(`The ${f.var("--spec")} flag is required.`);
log.message(`Run ${f.cmd("apimatic", "api", "validate")} first.`);
```

---

### 7.7 Auth & API Key Resolution

Services read auth in this exact order — do not change this pattern:
1. The `authKey` param supplied at construction (from `--auth-key` flag).
2. The stored `authInfo.authKey` from `config.json`.

```typescript
const authInfo = await getAuthInfo(configDir.toString());
const authorizationHeader = this.createAuthorizationHeader(authInfo, authKey);
```

The `createAuthorizationHeader` helper in services builds the `X-Auth-Key: <key>` or `Authorization: Bearer <key>` string. Always use it — never build the header manually.

---

## 8. Topic Structure and oclif Registration

oclif discovers commands from `lib/commands/` (the compiled output). Topics are derived from directory names. The `topicSeparator` is set to `" "` (space), so the command `lib/commands/sdk/generate.js` becomes `apimatic sdk generate`.

Topics must be declared in `package.json` under `oclif.topics` with descriptions for the help output:
```json
"topics": {
  "sdk": { "description": "Generate SDKs for your APIs in multiple languages." },
  "api": { "description": "Transform & Validate your API specifications." },
  "portal": { "description": "Generate, download and serve an API Documentation portal." },
  "auth": { "description": "Login using your APIMatic credentials, or view your authentication status." }
}
```

**Sub-topics** (e.g., `portal toc`, `portal recipe`) follow the same pattern and are also listed in `oclif.topics`.

The `cmdTxt` static on each Command is a display string used in `static examples` — it is not used by oclif for routing. Keep it in sync with the command's actual path.

---

## 9. Testing Conventions

### Test file locations
```
test/
├── commands/<topic>/<command>.test.ts   ← Integration tests (full command execution)
├── actions/<topic>/<command>.test.ts    ← Unit tests for Action logic
└── application/<subdomain>/<class>.test.ts  ← Unit tests for Application logic
```

### Command tests — Integration style
Use `@oclif/test`'s `runCommand`:
```typescript
import { runCommand } from "@oclif/test";
const { stdout, stderr, error } = await runCommand(["portal generate", "--input", myDir]);
expect(stdout).to.contain("The generated portal can be found at");
expect(stderr).to.be.empty;
```

These run the full oclif lifecycle including hooks. Use `nock` to intercept HTTP calls.

### Action tests — Unit style with test doubles
Subclass the Prompts and Service dependencies, inject via constructor or method override:
```typescript
class TestPrompts extends PortalServePrompts {
  public errors: string[] = [];
  logError(msg: string) { this.errors.push(msg); }
}

const testPrompts = new TestPrompts();
const action = new PortalServeAction(testPrompts, testServerService, testDocsPortalService);
const result = await action.execute(flags, paths);
expect(result.isFailed()).to.be.true;
expect(testPrompts.errors).to.include("expected error message");
```

### General test conventions
- Use `mocha` + `chai` (`expect` style).
- `sinon` for spies/stubs/mocks on existing instances.
- `mock-fs` or `tmp-promise` for filesystem isolation.
- `nock` for HTTP interception.
- `beforeEach`/`afterEach` for clean slate; call `nock.cleanAll()` and `nock.restore()` in `afterEach`.
- Parallel-safe: use unique temp directories (from `tmp-promise` `dir()`), never share static paths between tests.

---

## 10. Code Quality Rules

1. **No raw `string` paths** — use `DirectoryPath`, `FilePath`, `FileName`, `UrlPath`.
2. **No `console.log`** anywhere — use `@clack/prompts` log helpers via Prompts class.
3. **No uncaught throws** above the infrastructure layer — use `Result<T, E>` in services, `ActionResult` in actions.
4. **Prompts class methods for every message** — even one-line errors. No `log.error` calls in Actions directly.
5. **`CommandMetadata` is always created in the Command** — never construct it lower in the stack.
6. **`withDirPath`** for every temp directory — never use `tmp-promise` directly.
7. **`async/await` throughout** — no raw Promise chains.
8. **ESM imports with `.js` extension** — all imports end in `.js` (`../../types/file/directoryPath.js`), even for `.ts` source files.
9. **Private readonly properties** — constructor-injected deps are `private readonly`. Execute method is `public readonly execute = async ...`.
10. **`authKey` default `null`** — always `string | null = null`, not `undefined`.
11. **Exit via `outro(result)`** — always set `process.exitCode` through this, never `process.exit()` directly.
12. **`format.cmd` in `static cmdTxt`** — every command has this for consistent example rendering.
13. **Topic separator is a space** — write examples as `apimatic portal generate`, not `apimatic portal:generate`.
14. **Telemetry events** extend `DomainEvent` and live in `src/types/events/` — fired from Command or Action, never from Prompts or Infrastructure.
15. **No infrastructure-to-infrastructure initialization** — avoid `new FileService()` inside `GitService` (or similar). Compose utilities from Actions/Contexts.

---

## 11. Reviewing & Improving Existing Code

When you have code already written and want to evaluate its placement and quality, run through the checklist and anti-pattern catalogue below before making changes.

---

### 11.1 Layer Audit Checklist

For each file you are reviewing, answer every question in the relevant section. A "No" answer identifies a violation that needs to be moved or extracted.

#### Reviewing a `src/commands/` file

- [ ] Does the class extend `Command` from `@oclif/core`?
- [ ] Are **all** flags declared in `static flags` with clear descriptions?
- [ ] Does the `run()` method do nothing except: parse flags → wrap values in types → build `CommandMetadata` → call `intro()` → call `action.execute()` → call `outro(result)`?
- [ ] Is there **zero** business logic (no `if/else` beyond flag coercion)?
- [ ] Are there **no** direct calls to `FileService`, any infrastructure service, `@apimatic/sdk`, `axios`, or `@clack/prompts` log helpers?
- [ ] Does it have `static summary`, `static description`, `static examples`, and `static cmdTxt`?
- [ ] Are examples rendered with `format.cmd` and `format.flag`?
- [ ] Is `getConfigDir()` a private method returning `new DirectoryPath(this.config.configDir)`?

#### Reviewing a `src/actions/` file

- [ ] Does the constructor accept exactly `(configDir: DirectoryPath, commandMetadata: CommandMetadata, authKey: string | null = null)`?
- [ ] Is the execute method `public readonly execute = async (...): Promise<ActionResult<T>>`?
- [ ] Does it instantiate `private readonly prompts` and the needed service(s) as `private readonly` fields?
- [ ] Are all `log.*` / `confirm` / `select` calls **absent** — delegated to `this.prompts.*` instead?
- [ ] Is there **no** import from `@clack/prompts` directly?
- [ ] Does every error path call a prompts method then `return ActionResult.failed()`?
- [ ] Is every temp directory created through `withDirPath()`?
- [ ] Does it use Context objects where the domain already has one (`BuildContext`, `SdkContext`, etc.), while keeping any direct `FileService`/`ZipService` usage limited to action orchestration?
- [ ] Is there no direct `@apimatic/sdk` controller usage — all API calls go through a service in `infrastructure/services/`?
- [ ] Does it return `ActionResult` and never `throw` to its caller?

#### Reviewing a `src/prompts/` file

- [ ] Is every method purely about output/input rendering (no computation, no API calls, no file reads)?
- [ ] Are `withSpinner` wrappers used for every long-running operation passed in from an Action?
- [ ] Are all formatted values using `format.var()`, `format.path()`, `format.flag()`, `format.cmd()`, etc.?
- [ ] Is there **no** import of `FileService`, any service, or `@apimatic/sdk`?
- [ ] Are `log.info`, `log.error`, `log.success`, `log.warning` used correctly (not mixing `console.log`)?

#### Reviewing a `src/infrastructure/services/` file

- [ ] Does every public method return `Result<T, ServiceError | string>` (never throw to callers)?
- [ ] Is auth resolution following the priority order: `authKey` param → stored `authInfo.authKey`?
- [ ] Is `apiClientFactory.createApiClient(authHeader, shell)` used to create SDK clients (not manually constructing `Client`)?
- [ ] Is `handleServiceError(error)` used in every `catch` block instead of a custom switch?
- [ ] Is `envInfo.getUserAgent(shell)` passed through the factory (not hardcoded)?
- [ ] Are there **no** calls to `@clack/prompts` log helpers?

#### Reviewing a `src/infrastructure/` utility file

- [ ] Is the utility single-purpose (git-only, file-only, zip-only, etc.)?
- [ ] Does it avoid initializing peer infrastructure utilities/services?
- [ ] Are orchestration decisions (when/how to combine utilities) kept outside in Actions/Contexts?

#### Reviewing a `src/types/` file

- [ ] Does it contain only the type definition, interface, enum, or a value object's own intrinsic methods?
- [ ] Are context objects (`*Context.ts`) free of any prompt/display logic?
- [ ] Do context objects use only `FileService` and `ZipService` from infrastructure, nothing higher?
- [ ] Are path types (`DirectoryPath`, `FilePath`) used throughout, never raw `string` paths?

#### Reviewing a `src/application/` file

- [ ] Is this logic used by more than one command, or too complex to sit in a single Action?
- [ ] Is it a pure transformation — input data in, output data out — with no prompts or API calls?
- [ ] If it only serves one command and is a simple sequential step, should it be **merged into the Action** instead?

---

### 11.2 Anti-Pattern Catalogue

Each entry describes a violation, how to recognise it, and where the code should live instead.

---

#### AP-1: Business logic inside a Command

**Symptom:** `run()` contains `if/else` conditionals processing data, calls to `FileService`, loops over results, or direct `log.error()` / `log.info()` calls.

```typescript
// ❌ Wrong — Command doing validation work
async run() {
  const { flags: { spec } } = await this.parse(MyCommand);
  if (!fs.existsSync(spec)) {          // ← validation belongs in Action
    this.log("Spec dir not found");    // ← output belongs in Prompts
    return;
  }
  ...
}
```

**Fix:** Move the validation into the Action using a Context object. Move the message into a Prompts method.

---

#### AP-2: Raw `console.log` or direct `log.*` in an Action

**Symptom:** An `actions/` file imports `log` from `@clack/prompts` and calls it directly.

```typescript
// ❌ Wrong
import { log } from "@clack/prompts";
export class GenerateAction {
  async execute(...) {
    log.error("Generation failed");  // ← belongs in Prompts
  }
}
```

**Fix:** Move the message into the matching `prompts/` class. Call it as `this.prompts.generationFailed()`.

---

#### AP-3: Raw string paths passed between layers

**Symptom:** A `string` type (from a parsed flag) is passed directly into an Action, Context, or Service method parameter.

```typescript
// ❌ Wrong — passing raw string
const action = new GenerateAction(this.config.configDir, commandMetadata, authKey);
await action.execute(flags.spec, flags.destination, language);

// ✅ Correct — wrap at command boundary
const specDir = new DirectoryPath(flags.spec);
const destDir = new DirectoryPath(flags.destination);
await action.execute(specDir, destDir, language);
```

**Fix:** Wrap in the appropriate path value object (`DirectoryPath`, `FilePath`, `createResourceInput`) at the very top of `run()` in the Command, before passing anywhere.

---

#### AP-4: API call directly inside an Action

**Symptom:** An `actions/` file imports from `@apimatic/sdk`, `axios`, or constructs an `ApiClient` itself.

```typescript
// ❌ Wrong — Action making a network call directly
import { CodeGenerationExternalApisController } from "@apimatic/sdk";
export class GenerateAction {
  async execute(...) {
    const client = new Client(...);
    const controller = new CodeGenerationExternalApisController(client);
    await controller.generateSDKViaFile(...);
  }
}
```

**Fix:** Extract the API call into a method on the matching service in `infrastructure/services/`. The Action calls the service method; the service returns `Result<T, ServiceError>`.

---

#### AP-5: Service throws instead of returning Result

**Symptom:** A `infrastructure/services/` method has `throw` statements that could propagate to an Action unhandled.

```typescript
// ❌ Wrong — throws escape to the caller
async validateViaFile(params) {
  const response = await controller.validateApi(...);
  if (!response.ok) throw new Error("Validation failed");  // ← caller must try/catch
  return response;
}
```

**Fix:** Wrap in `try/catch` and return `err(handleServiceError(error))` from `neverthrow`. The Action checks `.isErr()` — no try/catch needed above the service layer.

---

#### AP-6: Prompts class doing computation

**Symptom:** A `prompts/` class method contains `if/else` logic that decides *what* to show based on data beyond simple formatting.

```typescript
// ❌ Wrong — Prompts deciding flow
public displayResult(summary: ValidationSummary) {
  if (!summary.isSuccess) {
    this.triggerRetry();   // ← flow control in Prompts
  }
}
```

**Fix:** Return a value from the Prompts method that the Action uses to branch, or move the branching into the Action, which then calls separate, focused Prompts methods.

---

#### AP-7: Context object used for display

**Symptom:** A `types/*-context.ts` file imports from `@clack/prompts` or `prompts/format.ts`.

**Fix:** Context objects are silent data managers. Move any display logic to the matching Prompts class.

---

#### AP-8: Algorithm that spans multiple commands kept in an Action

**Symptom:** An Action contains a large private method implementing a reusable algorithm (e.g., building a YAML TOC, generating a recipe boilerplate) that another command would also benefit from.

**Fix:** Extract the algorithm into a focused class in `src/application/<domain>/` (like `TocStructureGenerator`). Actions in multiple commands then instantiate and use it.

---

#### AP-9: `process.exit()` called directly

**Symptom:** `process.exit(0)` or `process.exit(1)` appears anywhere in the codebase outside of `src/prompts/format.ts`.

**Fix:** Return the appropriate `ActionResult` state. The `outro(result)` call in the Command sets `process.exitCode` from the result's exit code mapping (`Success=0`, `Failure=1`, `Cancelled=130`). This allows tests to run without process termination.

---

#### AP-10: Temp directories created manually

**Symptom:** Direct use of `tmp-promise`'s `withDir` / `dir()`, or `fs.mkdtempSync`, inside an Action or Service.

```typescript
// ❌ Wrong
import { withDir } from "tmp-promise";
await withDir(async ({ path }) => { ... });

// ✅ Correct
import { withDirPath } from "../../infrastructure/tmp-extensions.js";
await withDirPath(async (tempDirectory) => { ... }); // DirectoryPath, not raw string
```

---

### 11.3 Refactoring Decision Tree

Use this when you have a piece of code and are not sure where it belongs:

```
Is it directly about CLI flag parsing or --help content?
  YES → Command layer
  NO  ↓

Does it render output to the terminal (messages, spinners, confirm prompts)?
  YES → Prompts layer
  NO  ↓

Does it make an HTTP/network call OR perform file-system I/O?
  YES → Infrastructure layer (services/ for network, FileService/ZipService for fs)
  NO  ↓

Is it a reusable transformation or generation algorithm used by 2+ commands?
  YES → Application layer
  NO  ↓

Is it a value object, enum, DTO, or context (validate + persist a directory)?
  YES → Types layer
  NO  ↓

Is it a pure stateless utility function (string manipulation, stream parsing)?
  YES → Utils layer
  NO  ↓

→ It is use-case orchestration: it belongs in the Action layer.
```

**Rule of thumb for refactoring scope:** when moving something, only move the single responsibility that is misplaced. Do not restructure the surrounding code. A move is complete when the thing now satisfies all checklist items for its new layer.

