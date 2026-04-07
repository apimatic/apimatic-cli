# Prompt Conventions

Prompts live at `src/prompts/` and are the sole terminal UI layer for each command. They are thin wrappers around `@clack/prompts` — no constructor, no business logic, no knowledge of domain rules. Four method categories: spinners, interactive prompts, log messages, and note/tree display. Everything else belongs in the Action layer.

## Conventions

### DO

- **DO** use named export: `export class {PascalName}Prompts`.
- **DO** omit the constructor — prompts classes are always stateless with no fields.
- **DO** import only the `@clack/prompts` functions actually used (e.g., `{ log, confirm, isCancel }`).
- **DO** alias the format import: `import { format as f } from "../format.js"` (add one more `../` per nesting level).
- **DO** use `withSpinner(intro, success, failure, fn)` from `../prompt.js` for all async `Result` operations.
- **DO** always check `isCancel()` on interactive prompts (`confirm`, `select`, `text`, `multiselect`) before using the value.
- **DO** return `false` from `confirm` methods on cancel — not `undefined`.
- **DO** return `undefined` from `select`, `text`, and `multiselect` methods on cancel.
- **DO** use `confirm({ message: "...", initialValue: false })` for overwrite/destructive confirmations.
- **DO** use format helpers for all dynamic content: `f.var("name")` for variables, `f.path(dir)` for paths, `f.link(url)` for URLs.
- **DO** use `log.error()` for errors, `log.info()` for success/info, `log.warning()` for warnings, `log.message()` for multi-line output, `log.step()` for step markers.
- **DO** use `noteWrapped(message, title)` from `../prompt.js` for multi-line notes (e.g., next steps).
- **DO** use `getTree()` from `../format.js` when displaying directory structures.
- **DO** factor repeated `log.error()` calls into a private `logError(message: string)` helper when there are 3+ error methods.
- **DO** name spinner methods after their operation, matching the paired service call (e.g., `generatePortal(fn)`, `validateApi(fn)`).

### DON'T

- **DON'T** use a constructor — no parameters, no fields.
- **DON'T** put business logic in Prompts — only UI rendering and user interaction. This is a wrapper around `@clack/prompts`, nothing more.
- **DON'T** use `console.log` — use `log.*` from `@clack/prompts`.
- **DON'T** skip the `isCancel()` guard on interactive prompts — omitting it causes a crash when the user presses Ctrl+C.
- **DON'T** return the raw `symbol` value from interactive prompts — always guard with `isCancel()` first.
- **DON'T** import `ActionResult`, services, or domain logic — those belong in the Action layer.
- **DON'T** use `export default` — always use named exports.
- **DON'T** use raw string paths — wrap in `DirectoryPath`, `FilePath`, or `UrlPath`.
- **DON'T** chain complex format calls on a single line — build the message string on a separate line first.
- **DON'T** use `format.*` directly — always alias as `f`: `import { format as f }`.

---

## Review Checklist

- [ ] All imports use `.js` extension (e.g., `../../types/file/directoryPath.js`)
- [ ] File placed at `src/prompts/{topic}/{name}.ts` mirroring the action/command path
- [ ] Named export (not default): `export class {PascalName}Prompts`
- [ ] No constructor — class body starts directly with methods
- [ ] `@clack/prompts` imports are selective (only functions actually used)
- [ ] `format` aliased as `f`: `import { format as f } from "../format.js"`
- [ ] Import depth matches nesting level (one extra `../` per nesting level)
- [ ] All interactive prompts check `isCancel()` before using the result
- [ ] `confirm` returns `false` on cancel; `select`/`text`/`multiselect` return `undefined` on cancel
- [ ] All dynamic content uses `f.var()`, `f.path()`, `f.link()`, etc.
- [ ] No `console.log`, no business logic, no service or ActionResult imports
- [ ] Spinner methods accept `Promise<Result<T, E>>` and delegate to `withSpinner()`

---

## Reference Files

| Pattern | File |
|---|---|
| Simple (log + spinner, no interactive prompts) | `src/prompts/auth/login.ts` |
| Simple (log-only display methods) | `src/prompts/auth/status.ts` |
| Standard (confirm + log + spinner) | `src/prompts/portal/generate.ts` |
| Standard (confirm + select + log + spinner) | `src/prompts/sdk/generate.ts` |
| Standard (log + spinner + structured display) | `src/prompts/api/validate.ts` |
| Delegation (select flow + welcome message) | `src/prompts/quickstart.ts` |
| Wizard (multi-step, noteWrapped, getTree) | `src/prompts/portal/quickstart.ts` |
| Shared utilities (withSpinner, noteWrapped) | `src/prompts/prompt.ts` |
| Format helpers (f.var, f.path, f.link, getTree) | `src/prompts/format.ts` |

---

## Scaffolding

Use when creating a new Prompts class. Choose the variant that matches the command's UI complexity.

### What to determine

1. **Topic** — folder path matching the action (e.g., `auth`, `api`, `sdk`, `portal`, `portal/toc`)
2. **Name** — file name, lowercase hyphenated (e.g., `login`, `generate`, `new-toc`)
3. **Class name** — PascalCase with `Prompts` suffix (e.g., `LoginPrompts`, `SdkGeneratePrompts`)
4. **Variant** — one of:
   - `simple` — log methods and optional spinner; no interactive prompts
   - `standard` — overwrite confirm + error log methods + spinner
   - `delegation` — welcome message + async select returning a typed flow union
   - `wizard` — multi-step with step markers, multiple prompt types, noteWrapped, getTree
5. **Interactive prompts needed** — which of: `confirm`, `select`, `text`, `multiselect`
6. **Spinner needed** — yes/no, and what `Result` type it wraps
7. **Format helpers needed** — which of: `f.var`, `f.path`, `f.link`, `noteWrapped`, `getTree`

### Simple Template

**Use when:** the command only needs to display messages and wrap a service call in a spinner — no interactive prompts.

**Based on:** `src/prompts/auth/login.ts`

**Path:** `src/prompts/{topic}/{name}.ts`

```typescript
import { log } from "@clack/prompts";
import { Result } from "neverthrow";
import { ServiceError } from "../../infrastructure/service-error.js";
import { withSpinner } from "../prompt.js";
// Add if messages use dynamic content:
// import { format as f } from "../format.js";
// Add typed path imports as needed:
// import { DirectoryPath } from "../../types/file/directoryPath.js";

export class {PascalName}Prompts {
  public {action}(fn: Promise<Result<{T}, ServiceError>>) {
    return withSpinner("{Action started}", "{Action} completed successfully.", "{Action} failed.", fn);
  }

  public {errorMethod}() {
    log.error("{Error message}");
  }

  public {successMethod}() {
    log.info("{Success message}");
  }
}
```

**Notes:**
- Omit `withSpinner` import entirely if the command has no async service call.
- Add `import { format as f } from "../format.js"` when any message includes a dynamic value.
- Adjust `../` depth: one more level per nesting (e.g., `portal/toc/` uses `../../`).

### Standard Template

**Use when:** the command confirms before overwriting, calls a service, and displays error/success messages.

**Based on:** `src/prompts/portal/generate.ts`, `src/prompts/sdk/generate.ts`

**Path:** `src/prompts/{topic}/{name}.ts`

```typescript
import { isCancel, confirm, log } from "@clack/prompts";
import { Result } from "neverthrow";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ServiceError } from "../../infrastructure/service-error.js";
import { format as f } from "../format.js";
import { withSpinner } from "../prompt.js";

export class {PascalName}Prompts {
  public async confirmOverwrite(directory: DirectoryPath): Promise<boolean> {
    const overwrite = await confirm({
      message: `The destination ${f.path(directory)} is not empty, do you want to overwrite?`,
      initialValue: false
    });

    if (isCancel(overwrite)) {
      return false;
    }

    return overwrite;
  }

  public {action}(fn: Promise<Result<{T}, ServiceError>>) {
    return withSpinner("{Action started}", "{Action} completed.", "{Action} failed.", fn);
  }

  public {domainError}() {
    log.error("{Domain-specific error message}");
  }

  public serviceError(serviceError: ServiceError) {
    log.error(serviceError.errorMessage);
  }

  public {successMethod}({param}: {Type}) {
    log.info(`{message}`);
  }
}
```

**Notes:**
- `confirm` returns `false` on cancel — never `undefined`.
- Add `select` or `text` as additional interactive methods with the same `isCancel()` guard + `return undefined` pattern.
- Extract a `private logError(message: string) { log.error(message); }` helper when there are 3+ error methods.

### Delegation Template

**Use when:** the command is a top-level router that lets the user choose a sub-flow.

**Based on:** `src/prompts/quickstart.ts`

**Path:** `src/prompts/{topic}/{name}.ts`

```typescript
import { isCancel, log, select } from "@clack/prompts";

export type {Feature}Flow = "optionA" | "optionB" | undefined;

export class {PascalName}Prompts {
  public welcomeMessage() {
    log.info("{Welcome message}");
    log.message("{Brief description of what this wizard does.}");
  }

  public async select{Feature}Flow(): Promise<{Feature}Flow> {
    const option = await select({
      message: "{What would you like to do?}",
      options: [
        { value: "optionA", label: "{Label A}", hint: "{Optional hint}" },
        { value: "optionB", label: "{Label B}" }
      ]
    });

    if (isCancel(option)) {
      return undefined;
    }

    return option;
  }

  public noFlowSelected() {
    log.error("No option was selected.");
  }
}
```

**Notes:**
- Export the flow union type from the same file — the paired Action imports it for type-safe `switch` cases.
- `undefined` in the union represents cancellation — the Action returns `ActionResult.cancelled()` for that case.
- Add `import { format as f } from "../format.js"` only if messages include dynamic content.

### Wizard Template

**Use when:** the command is a multi-step interactive flow with step markers, multiple prompt types, and rich output formatting.

**Based on:** `src/prompts/portal/quickstart.ts`

**Path:** `src/prompts/{topic}/{name}.ts`

```typescript
import { isCancel, log, confirm, select, text, multiselect } from "@clack/prompts";
import { Result } from "neverthrow";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ServiceError } from "../../infrastructure/service-error.js";
import { format as f } from "../format.js";
import { withSpinner, noteWrapped } from "../prompt.js";
import { getTree } from "../format.js";
// Additional domain type imports as needed

export class {PascalName}Prompts {
  // Step markers — sync, no return value
  public {step}Step() {
    log.step("Step {N}: {Step title}");
  }

  // Text input prompt
  public async {input}Prompt(): Promise<string | undefined> {
    const value = await text({
      message: "{Prompt message}",
      placeholder: "{placeholder}",
      validate: (v) => (!v ? "{Field} is required." : undefined)
    });

    if (isCancel(value)) {
      return undefined;
    }

    return value;
  }

  // Multi-select prompt
  public async select{Items}Prompt(options: string[]): Promise<string[] | undefined> {
    const selected = await multiselect({
      message: "{Select message}",
      options: options.map((o) => ({ value: o, label: o })),
      required: true
    });

    if (isCancel(selected)) {
      return undefined;
    }

    return selected;
  }

  // Spinner for async Result operations
  public {action}(fn: Promise<Result<{T}, ServiceError>>) {
    return withSpinner("{Action started}", "{Action} completed.", "{Action} failed.", fn);
  }

  // Multi-line note
  public nextSteps() {
    const message = ["{Step 1}", "{Step 2}"].join("\n");
    noteWrapped(message, "Next steps");
  }

  // Directory tree display
  public showStructure(directory: DirectoryPath) {
    log.message(getTree(directory));
  }

  public {errorMethod}() {
    log.error("{Error message}");
  }
}
```

**Notes:**
- Wizard prompts return `undefined` on cancel — the Action checks for `undefined` and returns `ActionResult.cancelled()`.
- `text()` `validate` callback returns a string (error message) or `undefined` (valid) — this is clack UI validation only, not business logic.
- Use `multiselect` with `required: true` to prevent empty selection without extra logic in the Action.
- Step markers are sync void methods called by the Action before the matching interactive prompt.
- `noteWrapped` handles terminal-width overflow automatically — prefer it over `note()` for long messages.
- Remove unused prompt imports (e.g., omit `multiselect` if the wizard has no multi-select step).
