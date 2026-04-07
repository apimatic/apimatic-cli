# Command, Action & Prompts Conventions

These three layers are always created together and mirror each other in path structure. Commands parse flags and orchestrate the flow. Actions contain the business logic. Prompts handle all terminal UI. Each has strict responsibilities — none bleeds into another's domain.

## Conventions

### Commands — DO

- **DO** use `export default class` for all commands — oclif requires default export.
- **DO** use `static readonly` for `summary`, `description`, and `cmdTxt`.
- **DO** use `format.cmd("apimatic", ...topicParts)` for `cmdTxt` — each topic level and the command name are separate arguments.
- **DO** reference the class name (not `this`) in static `examples` array: `${ClassName.cmdTxt}`.
- **DO** use `format.flag("name", "value")` in examples for rendered flag display.
- **DO** place `FlagsProvider.authKey` as the last spread in the flags object.
- **DO** order flags as: custom flags first, then FlagsProvider spreads (`input` → `destination` → `force` → `authKey`).
- **DO** parse flags as the first operation in `run()`, before any other logic.
- **DO** convert raw flag strings to typed values (`DirectoryPath`, `ResourceInput`) immediately after parsing.
- **DO** build `CommandMetadata` in the Command only — never construct it in Action or lower layers.
- **DO** follow the exact `run()` flow: parse → type-convert → CommandMetadata → `intro()` → `action.execute()` → `outro(result)`.
- **DO** use `private readonly getConfigDir = () => new DirectoryPath(this.config.configDir)` when the action needs `configDir`.
- **DO** import only `{ Command }` if no flags, `{ Command, Flags }` if flags exist.
- **DO** add one more `../` to relative imports for each nesting level (e.g., `portal/toc/new.ts` uses `../../../` instead of `../../`).
- **DO** always define both `summary` and `description` static properties.

### Commands — DON'T

- **DON'T** use named exports (`export class`) — always use `export default class`.
- **DON'T** use `this` in static context for examples — use `ClassName.cmdTxt` instead. (Some existing files use `this.cmdTxt` in static context; do not follow that pattern in new code.)
- **DON'T** use `private static` for `cmdTxt` — use `static readonly` for consistency.
- **DON'T** define `auth-key` flag inline — use `...FlagsProvider.authKey` spread instead. (The `auth/login.ts` command defines it inline; this is legacy — don't repeat.)
- **DON'T** put business logic in `run()` — only flag parsing, type conversion, and the intro/execute/outro flow.
- **DON'T** omit `summary` — every command must have it.
- **DON'T** call `process.exit()` — use `outro(result)` which sets `process.exitCode`.

### Actions — DO

- **DO** use named export: `export class {PascalName}Action`.
- **DO** use `public readonly execute = async (...): Promise<ActionResult> =>` (arrow function property).
- **DO** initialize prompts as a field: `private readonly prompts = new {Name}Prompts()`.
- **DO** initialize services as `private readonly` fields (inline with `new`, not in constructor body).
- **DO** use the full constructor pattern when the command calls an API: `constructor(configDir: DirectoryPath, commandMetadata: CommandMetadata, authKey: string | null = null)`.
- **DO** use a simpler constructor when no API call is needed: just `(configDir: DirectoryPath, commandMetadata: CommandMetadata)` or even `(configDir: DirectoryPath)`.
- **DO** delegate all terminal output to `this.prompts.*` — never import `log` from `@clack/prompts`.
- **DO** wrap service calls in `this.prompts.spinnerMethod(serviceCall)`.
- **DO** check `result.isErr()` after spinner calls and delegate error display to prompts.
- **DO** use `withDirPath()` to wrap any code that needs a temporary directory.
- **DO** use Context objects for input validation (`buildContext.validate()`) and output management (`outputContext.save()`).
- **DO** use the overwrite guard pattern: `if (!force && (await context.exists()) && !(await this.prompts.confirmOverwrite(dir)))`.

### Actions — DON'T

- **DON'T** use `export default` — actions use named exports.
- **DON'T** use regular `async execute()` method — use the arrow function property form. (Some legacy actions use regular methods; new code should use arrow functions.)
- **DON'T** initialize services in the constructor body that depend on constructor params — initialize services inline on the property declaration, or if they need `configDir`, pass it in the constructor and assign manually.
- **DON'T** import or call `log.*` from `@clack/prompts` — all output goes through `this.prompts.*`.
- **DON'T** throw exceptions to the Command layer — always return `ActionResult.failed()` or `ActionResult.cancelled()`.
- **DON'T** define helper types/classes inside the action file — put them in `src/types/`.
- **DON'T** use `undefined` for optional auth — always use `string | null = null`.

### Prompts — DO

- **DO** use named export: `export class {PascalName}Prompts`.
- **DO** import only the `@clack/prompts` functions actually used (e.g., `{ log, confirm, isCancel }`).
- **DO** alias the format import: `import { format as f } from "../format.js"`.
- **DO** use `withSpinner(startMsg, successMsg, failureMsg, promise)` for async operations — it takes `Promise<Result<T, E>>`.
- **DO** always check `isCancel()` on interactive prompts (`confirm`, `select`, `text`, `multiselect`) and return `false` or `undefined` on cancel.
- **DO** use `confirm({ message: "...", initialValue: false })` for overwrite confirmations.
- **DO** use format helpers for all dynamic content: `f.var("name")` for names, `f.path(dirOrFile)` for paths, `f.link(url)` for URLs.
- **DO** use `noteWrapped(message, title)` from `../prompt.js` for multi-line informational notes (e.g., next steps).
- **DO** use `getTree()` from `../format.js` when displaying directory structures.

### Prompts — DON'T

- **DON'T** put business logic in prompts — only UI rendering and user interaction.
- **DON'T** use constructor parameters — prompts classes have no constructor.
- **DON'T** use `console.log` — use `log.*` from `@clack/prompts`.
- **DON'T** forget the `isCancel()` guard — skipping it causes crashes when user presses Ctrl+C.
- **DON'T** concatenate method calls on the same line as string assignment (keep them on separate lines).

### General — DO

- **DO** use `.js` extension on all relative imports (even for `.ts` source files).
- **DO** mirror file paths across `commands/`, `actions/`, `prompts/` directories.
- **DO** use typed path objects (`DirectoryPath`, `FilePath`, `FileName`, `UrlPath`) instead of raw strings.
- **DO** use `ActionResult.success(value?)`, `ActionResult.failed(message?)`, or `ActionResult.cancelled()` as return values.
- **DO** use neverthrow `Result<T, E>` for service returns — check with `.isErr()` / `.isOk()`.

### General — DON'T

- **DON'T** use `console.log` anywhere in any layer.
- **DON'T** use raw string paths — always wrap in the appropriate value object.
- **DON'T** use `process.exit()` — use `outro(result)`.
- **DON'T** use colon as topic separator — use space (`apimatic portal generate`, not `apimatic portal:generate`).

---

## Review Checklist

- [ ] All imports use `.js` extension (e.g., `../../types/file/directoryPath.js`)
- [ ] File paths mirror across `commands/`, `actions/`, `prompts/` directories
- [ ] Command uses `export default class`
- [ ] Command has `static readonly` for summary, description, cmdTxt
- [ ] Command uses `ClassName.cmdTxt` (not `this.cmdTxt`) in examples
- [ ] Command `run()` follows: parse → type-convert → CommandMetadata → intro → execute → outro
- [ ] Command has `getConfigDir()` helper (private readonly arrow function)
- [ ] Action uses named export (not default)
- [ ] Action constructor signature matches expected pattern for its complexity level
- [ ] Action execute is arrow function: `public readonly execute = async (...) => { ... }`
- [ ] Action uses `this.prompts.*` for all output (no direct `log.*` imports)
- [ ] `authKey` typed as `string | null = null`, not `undefined`
- [ ] Prompts spinner methods take `Promise<Result<T,E>>` and use `withSpinner()`
- [ ] Interactive prompts guard with `isCancel()` returning `false`/`undefined`
- [ ] `FlagsProvider.authKey` is the last spread in `static flags`
- [ ] No `console.log` anywhere
- [ ] Topic separator is space in examples and cmdTxt (not colon)
- [ ] No raw string paths — use `DirectoryPath`, `FilePath`, `FileName`, `UrlPath`
- [ ] Services initialized inline on property declaration (not in constructor body)

## Reference Files

| Pattern | File |
|---|---|
| Complex command (multiple flags, FlagsProvider) | `src/commands/sdk/generate.ts` |
| Simple command (ResourceInput, file/url) | `src/commands/api/validate.ts` |
| Minimal command (no flags) | `src/commands/auth/logout.ts` |
| Command with nested topic (3-level) | `src/commands/portal/toc/new.ts` |
| Action with withDirPath + Context objects | `src/actions/portal/generate.ts` |
| Action with Result error handling | `src/actions/api/validate.ts` |
| Action with simpler constructor (no authKey) | `src/actions/portal/toc/new-toc.ts` |
| Action that delegates to sub-actions | `src/actions/quickstart.ts` |
| Prompts with spinner + confirm + select | `src/prompts/sdk/generate.ts` |
| Prompts with error display methods | `src/prompts/portal/generate.ts` |
| Prompts with format helpers | `src/prompts/api/transform.ts` |
| Prompts with noteWrapped + getTree | `src/prompts/quickstart.ts` |

---

## Scaffolding

Use when creating a new command triple (Command + Action + Prompts).

### What to determine

1. **Topic** — command group (e.g., `api`, `sdk`, `portal`). Can be nested: `portal/toc`, `portal/recipe`
2. **Command name** — subcommand (e.g., `validate`, `generate`, `new`)
3. **Summary** — one-line description
4. **Description** — multi-line description (template literal)
5. **Input type** — one of:
   - `ResourceInput` — adds `file` + `url` flags, uses `createResourceInput(file, url)`
   - `DirectoryPath` — adds `FlagsProvider.input`, uses `DirectoryPath.createInput(input)`
   - `None` — no input flags
6. **Needs API auth** — adds `FlagsProvider.authKey`, passes `authKey` to Action constructor
7. **Needs force flag** — adds `FlagsProvider.force` for overwrite confirmation
8. **Needs destination flag** — adds `FlagsProvider.destination(artifact, artifactName)`
9. **Custom flags** — any command-specific flags
10. **Intro text** — text for `intro("...")` call (e.g., "Validate API", "Generate SDK")

### Command File Template

**Path:** `src/commands/{topic}/{name}.ts`

For nested topics like `portal/toc`, add one more `../` to all relative import paths.

```typescript
import { Command, Flags } from "@oclif/core";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FlagsProvider } from "../../types/flags-provider.js";
// If ResourceInput:
// import { createResourceInput } from "../../types/file/resource-input.js";
import { {PascalName}Action } from "../../actions/{topic}/{name}.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { format, intro, outro } from "../../prompts/format.js";

export default class {PascalName} extends Command {
  static readonly summary = "{summary}";

  static readonly description = `{description}`;

  // Each topic level is a separate argument to format.cmd
  // e.g., format.cmd("apimatic", "portal", "toc", "new")
  static readonly cmdTxt = format.cmd("apimatic", "{topic}", "{name}");

  static examples = [
    `${ClassName.cmdTxt} ${format.flag("flagName", "value")}`
  ];

  static flags = {
    // Custom flags first
    // Then FlagsProvider spreads in this order:
    // ...FlagsProvider.input,
    // ...FlagsProvider.destination("{artifact}", "{artifactName}"),
    // ...FlagsProvider.force,
    // ...FlagsProvider.authKey,  <-- always last
  };

  async run() {
    const {
      flags: { /* destructure all flags, rename "auth-key": authKey */ }
    } = await this.parse({PascalName});

    // Build typed paths from raw flag strings:
    //
    // For DirectoryPath input:
    //   const workingDirectory = DirectoryPath.createInput(input);
    //   const buildDirectory = input ? new DirectoryPath(input, "src") : workingDirectory.join("src");
    //   const outputDirectory = destination ? new DirectoryPath(destination) : workingDirectory.join("{artifact}");
    //
    // For ResourceInput:
    //   const resourceInput = createResourceInput(file, url);

    const commandMetadata: CommandMetadata = {
      commandName: {PascalName}.id,
      shell: this.config.shell
    };

    intro("{Intro Text}");
    const action = new {PascalName}Action(this.getConfigDir(), commandMetadata, authKey);
    const result = await action.execute(/* pass typed args */);
    outro(result);
  }

  private readonly getConfigDir = () => {
    return new DirectoryPath(this.config.configDir);
  };
}
```

### Action File Template

**Path:** `src/actions/{topic}/{name}.ts`

```typescript
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../action-result.js";
import { {PascalName}Prompts } from "../../prompts/{topic}/{name}.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
// If temp directory needed:
// import { withDirPath } from "../../infrastructure/tmp-extensions.js";
// import { TempContext } from "../../types/temp-context.js";
// If service needed:
// import { SomeService } from "../../infrastructure/services/some-service.js";
// If context needed:
// import { SomeContext } from "../../types/some-context.js";

export class {PascalName}Action {
  private readonly prompts: {PascalName}Prompts = new {PascalName}Prompts();
  // Services as private readonly fields:
  // private readonly someService: SomeService = new SomeService();
  private readonly configDir: DirectoryPath;
  private readonly commandMetadata: CommandMetadata;
  private readonly authKey: string | null;

  constructor(
    configDir: DirectoryPath,
    commandMetadata: CommandMetadata,
    authKey: string | null = null
  ) {
    this.configDir = configDir;
    this.commandMetadata = commandMetadata;
    this.authKey = authKey;
  }

  public readonly execute = async (
    /* parameters matching what Command passes */
  ): Promise<ActionResult> => {
    // 1. Input validation via Context objects
    //    const buildContext = new BuildContext(buildDirectory);
    //    if (!(await buildContext.validate())) {
    //      this.prompts.directoryEmpty(buildDirectory);
    //      return ActionResult.failed();
    //    }

    // 2. Overwrite confirmation (if force flag)
    //    const outputContext = new OutputContext(outputDirectory);
    //    if (!force && (await outputContext.exists()) && !(await this.prompts.confirmOverwrite(outputDirectory))) {
    //      this.prompts.destinationNotEmpty();
    //      return ActionResult.cancelled();
    //    }

    // 3. Business logic (wrap in withDirPath if temp dirs needed)
    //    return await withDirPath(async (tempDirectory) => {
    //      const tempContext = new TempContext(tempDirectory);
    //      const zipPath = await tempContext.zip(buildDirectory);
    //
    //      const response = await this.prompts.spinnerMethod(
    //        this.someService.doSomething(zipPath, this.configDir, this.commandMetadata, this.authKey)
    //      );
    //
    //      if (response.isErr()) {
    //        this.prompts.serviceError(response.error);
    //        return ActionResult.failed();
    //      }
    //
    //      this.prompts.outputGenerated(outputDirectory);
    //      return ActionResult.success();
    //    });

    return ActionResult.success();
  };
}
```

### Prompts File Template

**Path:** `src/prompts/{topic}/{name}.ts`

```typescript
import { log, isCancel, confirm } from "@clack/prompts";
// Add select, text, multiselect as needed
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { format as f } from "../format.js";
import { Result } from "neverthrow";
import { withSpinner } from "../prompt.js";
import { ServiceError } from "../../infrastructure/service-error.js";

export class {PascalName}Prompts {
  // Spinner methods — wrap async service calls
  // Takes Promise<Result<T, E>>, returns the same Result after spinner completes
  public async doSomething(fn: Promise<Result<SuccessType, ErrorType>>) {
    return withSpinner(
      "Doing something",         // start message
      "Done successfully.",       // success message
      "Failed to do something.",  // failure message
      fn
    );
  }

  // Confirmation methods — return boolean, guard with isCancel
  public async confirmOverwrite(directory: DirectoryPath): Promise<boolean> {
    const overwrite = await confirm({
      message: `The destination ${f.path(directory)} is not empty, do you want to overwrite?`,
      initialValue: false
    });
    if (isCancel(overwrite)) return false;
    return overwrite;
  }

  // Error display methods
  public serviceError(error: ServiceError): void {
    log.error(error.errorMessage);
  }

  // Info/success display methods
  public outputGenerated(outputPath: DirectoryPath): void {
    log.info(`Output can be found at ${f.path(outputPath)}.`);
  }

  // Validation error messages using format helpers
  public directoryEmpty(directory: DirectoryPath): void {
    log.error(`The ${f.var("src")} directory is either empty or invalid: ${f.path(directory)}`);
  }

  public destinationNotEmpty(): void {
    log.error(`Please enter a different destination folder or remove the existing files and try again.`);
  }
}
```
