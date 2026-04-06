# /new-action

Scaffold a standalone Action class for the project's 5-layer architecture. This creates a single file — use `/new-command` when you also need the corresponding Command and Prompts files.

## Files Created

1. `src/actions/{topic}/{name}.ts` — Action class (business logic orchestration)

## Information to Gather

Before generating, determine the following from the user or their description:

1. **Topic** — action group folder (e.g., `api`, `sdk`, `portal`). Can be nested: `portal/toc`, `portal/recipe`
2. **Action name** — file name, lowercase hyphenated (e.g., `validate`, `generate`, `new-toc`)
3. **Class name** — PascalCase with `Action` suffix (e.g., `ValidateAction`, `PortalNewTocAction`)
4. **Variant** — one of:
   - `standard` — full constructor with configDir, commandMetadata, authKey; services, withDirPath, prompts
   - `minimal` — simpler constructor (subset of params); no services or temp dirs
   - `delegation` — routes to sub-actions via switch on prompt result
5. **Needs auth** — whether the action receives `authKey: string | null = null`
6. **Needs services** — which infrastructure services are used (e.g., `PortalService`, `ValidationService`)
7. **Needs temp directory** — whether to wrap logic in `withDirPath()`
8. **Needs Context objects** — which contexts are used (e.g., `BuildContext`, `TempContext`, `ResourceContext`)
9. **Prompts class** — the paired Prompts class name and import path (e.g., `ApiValidatePrompts` from `../../prompts/api/validate.js`). Some actions reuse another command's prompts.
10. **Execute parameters** — typed parameters the execute method receives from the Command layer
11. **Execute return type** — `ActionResult` or `ActionResult<T>` with a specific generic type

## DO's and DON'Ts

### Actions — DO

- **DO** use named export: `export class {PascalName}Action`.
- **DO** use `public readonly execute = async (...): Promise<ActionResult> =>` (arrow function property).
- **DO** initialize prompts as a field: `private readonly prompts: {Name}Prompts = new {Name}Prompts()` or `private readonly prompts = new {Name}Prompts()`.
- **DO** initialize services as `private readonly` fields (inline with `new`, not in constructor body) when the service takes no constructor args. If a service needs `configDir`, assign it in the constructor body after `this.configDir` is set.
- **DO** use the full constructor pattern when the action calls an API: `constructor(configDir: DirectoryPath, commandMetadata: CommandMetadata, authKey: string | null = null)`.
- **DO** use a simpler constructor when no API call is needed: just `(configDir: DirectoryPath, commandMetadata: CommandMetadata)` or even `(configDir: DirectoryPath)`.
- **DO** use constructor shorthand (`private readonly` in parameter list) for minimal actions where no manual field assignment is needed.
- **DO** delegate all terminal output to `this.prompts.*` — never import `log` from `@clack/prompts`.
- **DO** wrap service calls in `this.prompts.spinnerMethod(serviceCall)`.
- **DO** check `result.isErr()` after spinner calls and delegate error display to prompts.
- **DO** use `withDirPath()` to wrap any code that needs a temporary directory.
- **DO** return `ActionResult` directly from the `withDirPath` callback — the return propagates through.
- **DO** use Context objects for input validation (`buildContext.validate()`) and output management (`outputContext.save()`).
- **DO** use the overwrite guard pattern: `if (!force && (await context.exists()) && !(await this.prompts.confirmOverwrite(dir)))`.
- **DO** close file streams in `finally` blocks when using `FileWrapper` or `getStream()`.
- **DO** create sub-action instances inside switch cases (not as class fields) for delegation actions.
- **DO** handle `undefined` (cancel) case explicitly in delegation actions — return `ActionResult.cancelled()`.

### Actions — DON'T

- **DON'T** use `export default` — actions use named exports.
- **DON'T** use regular `async execute()` method — use the arrow function property form. (Some existing actions use regular methods; new code should use arrow functions.)
- **DON'T** initialize services in the constructor body unless they need a constructor parameter like `configDir`.
- **DON'T** import or call `log.*` from `@clack/prompts` — all output goes through `this.prompts.*`.
- **DON'T** throw exceptions to the Command layer — always return `ActionResult.failed()` or `ActionResult.cancelled()`.
- **DON'T** define helper types/classes inside the action file — put them in `src/types/`. (Exception: small local types used only within the file are acceptable.)
- **DON'T** use `undefined` for optional auth — always use `string | null = null`.
- **DON'T** use `tmp-promise` directly — always use `withDirPath()` from `../../infrastructure/tmp-extensions.js`.
- **DON'T** include `authKey` in the constructor if the action never calls an API — omit it entirely.
- **DON'T** store sub-action instances as class fields — create them per-use in delegation switch cases.
- **DON'T** use `process.exit()` — return an `ActionResult` and let the Command layer handle exit codes via `outro(result)`.

### General — DO

- **DO** use `.js` extension on all relative imports (even for `.ts` source files).
- **DO** mirror file paths across `commands/`, `actions/`, `prompts/` directories.
- **DO** use typed path objects (`DirectoryPath`, `FilePath`, `FileName`, `UrlPath`) instead of raw strings.
- **DO** use `ActionResult.success(value?)`, `ActionResult.failed(message?)`, or `ActionResult.cancelled()` as return values.
- **DO** use neverthrow `Result<T, E>` for service returns — check with `.isErr()` / `.isOk()`.

### General — DON'T

- **DON'T** use `console.log` anywhere in any layer.
- **DON'T** use raw string paths — always wrap in the appropriate value object.
- **DON'T** use `process.exit()` — use `outro(result)` in the Command layer.

---

## Standard Action Template

**Use when:** the action calls API services, needs auth, uses temp directories, or has complex business logic.

**Path:** `src/actions/{topic}/{name}.ts`

For nested topics like `portal/toc`, add one more `../` to all relative import paths.

```typescript
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../action-result.js";
import { {PromptsClassName} } from "../../prompts/{topic}/{promptsFile}.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
// If temp directory needed:
import { withDirPath } from "../../infrastructure/tmp-extensions.js";
// If context objects needed:
// import { ResourceContext } from "../../types/resource-context.js";
// import { TempContext } from "../../types/temp-context.js";
// import { BuildContext } from "../../types/build-context.js";
// If services needed:
// import { {ServiceName} } from "../../infrastructure/services/{service-file}.js";
// If ResourceInput parameter:
// import { ResourceInput } from "../../types/file/resource-input.js";

export class {PascalName}Action {
  private readonly prompts = new {PromptsClassName}();
  // Services as private readonly fields (inline initialization when no constructor args needed):
  // private readonly someService = new SomeService();
  //
  // When service needs configDir, declare without initializer and assign in constructor:
  // private readonly validationService: ValidationService;
  private readonly configDir: DirectoryPath;
  private readonly commandMetadata: CommandMetadata;
  private readonly authKey: string | null;

  constructor(configDir: DirectoryPath, commandMetadata: CommandMetadata, authKey: string | null = null) {
    this.configDir = configDir;
    this.commandMetadata = commandMetadata;
    this.authKey = authKey;
    // Initialize services that need configDir:
    // this.validationService = new ValidationService(configDir);
  }

  public readonly execute = async (
    /* parameters matching what Command passes, e.g.:
    resourcePath: ResourceInput,
    destination: DirectoryPath,
    force: boolean
    */
  ): Promise<ActionResult> => {
    // 1. Input validation via Context objects
    //    const buildContext = new BuildContext(buildDirectory);
    //    if (!(await buildContext.validate())) {
    //      this.prompts.invalidBuildDirectory(buildDirectory);
    //      return ActionResult.failed();
    //    }

    // 2. Overwrite confirmation (if force flag)
    //    if (!force && (await outputContext.exists()) && !(await this.prompts.confirmOverwrite(directory))) {
    //      this.prompts.destinationNotEmpty();
    //      return ActionResult.cancelled();
    //    }

    // 3. Business logic wrapped in withDirPath for temp directory
    return await withDirPath(async (tempDirectory) => {
      // 4. Resolve resources / prepare context
      //    const resourceContext = new ResourceContext(tempDirectory);
      //    const specFileDirResult = await resourceContext.resolveTo(resourcePath);
      //    if (specFileDirResult.isErr()) {
      //      this.prompts.networkError(specFileDirResult.error);
      //      return ActionResult.failed();
      //    }

      // 5. Service call via prompts spinner
      //    const response = await this.prompts.spinnerMethod(
      //      this.someService.doSomething({
      //        file: specFileDirResult.value,
      //        commandMetadata: this.commandMetadata,
      //        authKey: this.authKey
      //      })
      //    );

      // 6. Error handling
      //    if (response.isErr()) {
      //      this.prompts.serviceError(response.error);
      //      return ActionResult.failed();
      //    }

      // 7. Process success, save output
      //    this.prompts.outputGenerated(outputDirectory);

      return ActionResult.success();
    });
  };
}
```

**Standard action rules:**
- Constructor assigns `configDir`, `commandMetadata`, and `authKey` explicitly because services or internal methods reference them via `this.*`.
- Services needing `configDir` (e.g., `new ValidationService(configDir)`) must be assigned in the constructor body after `this.configDir` is set.
- `withDirPath` returns the `ActionResult` — the entire flow inside the callback must return `ActionResult`.
- When using `withDirPath<ActionResult>`, the generic type annotation is optional when TypeScript can infer it.
- Multiple error-check points are normal — each service call or context operation gets its own `.isErr()` check.
- Close file streams in `finally` blocks when working with `FileWrapper` or `getStream()`.

## Minimal Action Template

**Use when:** the action has simple logic, no API services, no temp directories, and few constructor dependencies.

**Path:** `src/actions/{topic}/{name}.ts`

```typescript
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../action-result.js";
import { {PromptsClassName} } from "../../prompts/{topic}/{promptsFile}.js";
// If commandMetadata needed:
// import { CommandMetadata } from "../../types/common/command-metadata.js";

export class {PascalName}Action {
  private readonly prompts = new {PromptsClassName}();

  // Shorthand constructor — fields become private readonly automatically
  constructor(private readonly configDir: DirectoryPath) {}

  // With commandMetadata:
  // constructor(
  //   private readonly configDir: DirectoryPath,
  //   private readonly commandMetadata: CommandMetadata
  // ) {}

  public readonly execute = async (
    /* parameters */
  ): Promise<ActionResult> => {
    // Simple logic — no withDirPath, no services
    // Delegate output to this.prompts.*

    return ActionResult.success();
  };
}
```

**Minimal action rules:**
- Use TypeScript constructor shorthand (`private readonly` in parameter list) when no manual field assignment is needed.
- Omit `authKey` entirely — don't include it with a default value if it's never used.
- Omit `commandMetadata` if the action doesn't need it (e.g., `LogoutAction` only takes `configDir`).
- Even minimal actions should use the arrow function `execute` form for consistency.

## Delegation Action Template

**Use when:** the action routes to sub-actions based on user selection (e.g., quickstart flows, wizard-style branching).

**Path:** `src/actions/{topic}/{name}.ts`

```typescript
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../action-result.js";
import { {PromptsClassName} } from "../../prompts/{topic}/{promptsFile}.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
// Import sub-actions:
// import { SubActionA } from "./{sub-action-a}.js";
// import { SubActionB } from "./{sub-action-b}.js";

export class {PascalName}Action {
  private readonly prompts = new {PromptsClassName}();

  public constructor(
    private readonly configDir: DirectoryPath,
    private readonly commandMetadata: CommandMetadata
  ) {}

  public readonly execute = async (): Promise<ActionResult> => {
    const selectedFlow = await this.prompts.selectFlow();
    switch (selectedFlow) {
      case "optionA": {
        const action = new SubActionA(this.configDir, this.commandMetadata);
        return await action.execute();
      }
      case "optionB": {
        const action = new SubActionB(this.configDir, this.commandMetadata);
        return await action.execute();
      }
      case undefined: {
        this.prompts.noFlowSelected();
        return ActionResult.cancelled();
      }
    }
  };
}
```

**Delegation action rules:**
- Create sub-action instances inside the switch case — don't store them as class fields.
- Pass `configDir` and `commandMetadata` through to sub-actions.
- Pass `authKey` through if the sub-actions need it: add `private readonly authKey: string | null` to constructor and forward it.
- Handle `undefined` (cancel) case explicitly — return `ActionResult.cancelled()`.
- Each case block is wrapped in braces `{ }` for proper scoping of the `action` variable.

---

## Conventions Checklist

After generating, verify all of the following:

- [ ] All imports use `.js` extension (e.g., `../../types/file/directoryPath.js`)
- [ ] File placed at `src/actions/{topic}/{name}.ts` matching the prompts path
- [ ] Named export (not default): `export class {PascalName}Action`
- [ ] Execute is arrow function: `public readonly execute = async (...): Promise<ActionResult> => { ... }`
- [ ] Prompts initialized as field: `private readonly prompts = new {PromptsClassName}()`
- [ ] Services initialized as `private readonly` fields (inline unless they need constructor args)
- [ ] Constructor signature matches complexity: full form for API actions, shorthand for simple ones
- [ ] `authKey` typed as `string | null = null` when present — never `undefined`
- [ ] `authKey` omitted entirely when the action doesn't call an API
- [ ] All terminal output goes through `this.prompts.*` — no direct `log.*` imports
- [ ] Service results checked with `.isErr()`, errors displayed via `this.prompts.*`
- [ ] `withDirPath()` used for temp directories — never raw `tmp-promise`
- [ ] Returns `ActionResult.success()`, `ActionResult.failed()`, or `ActionResult.cancelled()` — never throws
- [ ] Context objects used for validation (`validate()`) and output (`save()`, `exists()`)
- [ ] Overwrite guard uses pattern: `if (!force && (await context.exists()) && !(await this.prompts.confirmOverwrite(dir)))`
- [ ] No `console.log` anywhere
- [ ] No raw string paths — use `DirectoryPath`, `FilePath`, `FileName`, `UrlPath`
- [ ] Relative import depth matches nesting level (extra `../` per nesting level)
- [ ] File streams closed in `finally` block when using `getStream()` or `FileWrapper`
- [ ] Delegation actions handle `undefined` case with `ActionResult.cancelled()`

## Reference Files

Study these before generating to match the exact patterns:

| Pattern | File |
|---|---|
| Standard action (auth + services + withDirPath) | `src/actions/api/validate.ts` |
| Standard action (multiple params + overwrite guard) | `src/actions/api/transform.ts` |
| Standard action (Context + TempContext + service) | `src/actions/portal/generate.ts` |
| Standard action (SDK generation + version selection) | `src/actions/sdk/generate.ts` |
| Standard action (interactive prompts + neverthrow) | `src/actions/portal/copilot.ts` |
| Minimal action (configDir only, no services) | `src/actions/auth/logout.ts` |
| Minimal action (configDir + commandMetadata, no auth) | `src/actions/auth/status.ts` |
| Minimal action (shorthand constructor) | `src/actions/portal/toc/new-toc.ts` |
| Delegation action (routes to sub-actions) | `src/actions/quickstart.ts` |
| Multi-step flow (withDirPath + multiple cancellation points) | `src/actions/sdk/quickstart.ts` |
| Multi-step flow (interactive wizard + withDirPath) | `src/actions/portal/quickstart.ts` |
| Long-running/stateful action (server + watcher) | `src/actions/portal/serve.ts` |
| ActionResult API (success, failed, cancelled, stopped) | `src/actions/action-result.ts` |
| withDirPath implementation | `src/infrastructure/tmp-extensions.ts` |
