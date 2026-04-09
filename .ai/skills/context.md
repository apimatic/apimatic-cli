# Context Conventions

Context objects live at `src/types/` and encapsulate path derivation, validation, and file I/O for a single domain concept. Callers interact with high-level behavioral methods (`validate()`, `exists()`, `save()`) — never with internal paths, file names, or parsing logic. There are four variants: output, input, temp, and pure.

## Conventions

### Encapsulation — DO

- **DO** expose only behavioral methods — `validate()`, `exists()`, `save()`, `resolveTo()`. Callers say *what* they want, not *how*.
- **DO** return results from operations — `save()` returning `FilePath` (where it wrote) is fine. It's the *result* of work, not internal *state*.
- **DO** chain method return values between context operations — it's valid for one method's return (`DirectoryPath`, `FilePath`) to be passed as input to the next method on the same context. This is coordinated workflow within the context's domain, not leakage.
- **DO** keep derived paths as `private get` — all `FilePath`/`DirectoryPath` derivation is internal.
- **DO** keep decision logic inside — if the context knows how to choose between zip/unzip, file/url, etc., that logic stays internal.
- **DO** expose domain-specific read/write methods — instead of returning raw JSON/YAML config for callers to manipulate.
- **DO** initialize `FileService` / `ZipService` inline as `private readonly` fields.
- **DO** use constructor shorthand (`private readonly` in parameter list) for all constructor parameters.
- **DO** use `new FilePath(directory, new FileName("name"))` for file path construction.
- **DO** use `directory.join("subdir")` for subdirectory derivation.

### Encapsulation — DON'T

- **DON'T** expose internal paths as public getters — no `public get outputDirectory()` or `public get filePath()`. If a caller needs a path, it should come as a return value from an operation.
- **DON'T** return raw config objects — don't return parsed JSON/YAML for callers to manipulate directly. Wrap reads/writes in domain methods (e.g., `getCopilotConfig()` instead of `getBuildFileContents()`).
- **DON'T** expose derived file names — methods like `getScriptFileName()` leak internal naming logic.
- **DON'T** add public properties for internal state — constructor parameters are `private readonly`, not exposed.
- **DON'T** use `console.log` or any prompt output — contexts are silent.
- **DON'T** use `Result<T, E>` unless the context does network I/O (rare).
- **DON'T** use raw string paths — always wrap in `DirectoryPath`, `FilePath`, `FileName`.
- **DON'T** add methods that only use infrastructure services (`fileService`, `zipService`) without touching domain-specific private fields — these are stateless utilities, not context behavior. Every public method must use at least one constructor-derived private field (e.g., `sdkDirectory`, `language`). If a method takes all its inputs as parameters and never reads context state, it belongs in a service or a different context.

### Variant-specific rules

**Output contexts** (`exists()` + `save()` pattern):
- `exists()` checks if output is already populated — used by actions for overwrite confirmation.
- `save()` returns the path where content was written — only way callers learn about output location.
- Call `cleanDirectory` before writing when overwriting is expected.

**Input contexts** (`validate()` + domain read/write methods):
- `validate()` checks that required files/directories exist before any operation.
- Read/write methods expose domain concepts, not raw file contents.
- Callers should never need to know file names, formats, or internal structure.

**Temp contexts** (used inside `withDirPath()` blocks):
- Methods create temp files and return the resulting `FilePath`.
- Temp file naming (UUIDs, etc.) is internal — never exposed.

**Pure contexts** (no I/O):
- No `FileService`, `ZipService`, or any infrastructure imports.
- Constructor takes domain values (strings, enums, DTOs).
- Methods are pure transformations or in-memory checks.

---

## Review Checklist

- [ ] All imports use `.js` extension (e.g., `../infrastructure/file-service.js`)
- [ ] File placed at `src/types/{name}-context.ts`
- [ ] Named export (not default): `export class {PascalName}Context`
- [ ] `private readonly fileService = new FileService()` — inline, not constructor-injected
- [ ] Constructor params as `private readonly` (shorthand or explicit)
- [ ] **All derived paths are `private get`** — no public getters for internal paths
- [ ] **No raw config objects returned** — domain methods instead of `getContents()`
- [ ] Operations (`save`, `validate`) return results; internal state is not exposed
- [ ] Paths use value objects: `DirectoryPath`, `FilePath`, `FileName`
- [ ] `new FilePath(directory, new FileName("name"))` for file path construction
- [ ] `directory.join("subdir")` for subdirectory derivation
- [ ] No `console.log`, no prompt output — contexts are silent
- [ ] No `Result` unless context does network I/O (rare)
- [ ] Every public method uses at least one domain-specific private field — methods using only infrastructure services don't belong here
- [ ] No public properties that expose constructor parameters

## Reference Files

| Pattern | File | Encapsulation |
|---|---|---|
| Output context (save + zip/unarchive) | `src/types/portal-context.ts` | Good — all paths private |
| Output context (save stream + derived name) | `src/types/transform-context.ts` | Good — name derivation internal |
| Input context (validate + file ops) | `src/types/spec-context.ts` | Good — zip detection internal |
| Temp context (zip + save stream) | `src/types/temp-context.ts` | Good — UUID naming internal |
| Temp context (download + resolve) | `src/types/resource-context.ts` | Good — URL/file decision internal |
| Composite (delegates to BuildContext) | `src/types/versioned-build-context.ts` | Good — typed result object |
| Output context (leaky — avoid pattern) | `src/types/sdk-context.ts` | Avoid — exposes `sdkLanguageDirectory`, has methods that only use infrastructure services without touching domain state |
| Input context (leaky — avoid pattern) | `src/types/toc-context.ts` | Avoid — exposes `tocPath` |

---

## Scaffolding

Use when creating a new Context class. Choose the variant that matches the domain concept.

### What to determine

1. **Context name** — lowercase hyphenated (e.g., `portal`, `sdk`, `build`). File will be `{name}-context.ts`
2. **Class name** — PascalCase (e.g., `PortalContext`, `SdkContext`)
3. **Variant** — one of:
   - `output` — save/exists pattern for command outputs (portals, SDKs, transformed files)
   - `input` — validate/read pattern for user-provided input directories
   - `temp` — transient operations inside `withDirPath()` blocks
   - `pure` — no I/O, domain logic only (name derivation, in-memory checks)
4. **Constructor parameters** — what domain values the context wraps (directories, file paths, enums)
5. **Services needed** — `FileService`, `ZipService`, `FileDownloadService` (none for pure)
6. **Initial methods** — what operations the context should expose

### Output Context Template

**Use when:** the context manages command output (portals, SDKs, transformed files).

**Based on:** `src/types/portal-context.ts`, `src/types/transform-context.ts`

```typescript
import { FileService } from "../infrastructure/file-service.js";
import { DirectoryPath } from "./file/directoryPath.js";
import { FilePath } from "./file/filePath.js";
import { FileName } from "./file/fileName.js";
// If zip/unarchive needed:
// import { ZipService } from "../infrastructure/zip-service.js";

export class {PascalName}Context {
  private readonly fileService = new FileService();
  // private readonly zipService = new ZipService();

  constructor(private readonly outputDirectory: DirectoryPath) {}

  // Internal path derivation — always private
  private get outputPath(): FilePath {
    return new FilePath(this.outputDirectory, new FileName("{filename}"));
  }

  public async exists(): Promise<boolean> {
    return !(await this.fileService.directoryEmpty(this.outputDirectory));
  }

  // save() returns the output path as a result of the operation
  public async save(stream: NodeJS.ReadableStream): Promise<FilePath> {
    await this.fileService.createDirectoryIfNotExists(this.outputDirectory);
    await this.fileService.writeFile(this.outputPath, stream);
    return this.outputPath;
  }

  // For zip/unarchive branching:
  // public async save(tempFilePath: FilePath, asZip: boolean): Promise<void> {
  //   await this.fileService.cleanDirectory(this.outputDirectory);
  //   if (asZip) {
  //     await this.fileService.copy(tempFilePath, this.zipPath);
  //   } else {
  //     await this.zipService.unArchive(tempFilePath, this.outputDirectory);
  //   }
  // }
}
```

### Input Context Template

**Use when:** the context validates and reads from user-provided input directories.

**Based on:** `src/types/spec-context.ts`

```typescript
import { FileService } from "../infrastructure/file-service.js";
import { DirectoryPath } from "./file/directoryPath.js";
import { FilePath } from "./file/filePath.js";
import { FileName } from "./file/fileName.js";

export class {PascalName}Context {
  private readonly fileService = new FileService();

  constructor(private readonly inputDirectory: DirectoryPath) {}

  // Internal path derivation — always private
  private get configFile(): FilePath {
    return new FilePath(this.inputDirectory, new FileName("{config-file-name}"));
  }

  public async validate(): Promise<boolean> {
    if (!(await this.fileService.directoryExists(this.inputDirectory))) return false;
    return await this.fileService.fileExists(this.configFile);
  }

  // Domain-specific read methods — NOT raw config getters
  // public async getSomeDomainValue(): Promise<string> {
  //   const content = await this.fileService.getContents(this.configFile);
  //   const config = JSON.parse(content);
  //   return config.domainField;
  // }
}
```

### Temp Context Template

**Use when:** the context manages transient operations inside `withDirPath()` blocks.

**Based on:** `src/types/temp-context.ts`, `src/types/resource-context.ts`

```typescript
import { FileService } from "../infrastructure/file-service.js";
import { DirectoryPath } from "./file/directoryPath.js";
import { FilePath } from "./file/filePath.js";
import { FileName } from "./file/fileName.js";
// If zip needed:
// import { ZipService } from "../infrastructure/zip-service.js";
// import { randomUUID } from "crypto";

export class {PascalName}Context {
  private readonly fileService = new FileService();

  constructor(private readonly tempDirectory: DirectoryPath) {}

  // Operations return the resulting FilePath
  public async save(stream: NodeJS.ReadableStream): Promise<FilePath> {
    const tempFile = new FilePath(this.tempDirectory, new FileName("{temp-name}"));
    await this.fileService.writeFile(tempFile, stream);
    return tempFile;
  }

  // public async zip(sourceDirectory: DirectoryPath): Promise<FilePath> {
  //   const tempFile = new FilePath(this.tempDirectory, new FileName(randomUUID()));
  //   await this.zipService.archive(sourceDirectory, tempFile);
  //   return tempFile;
  // }
}
```

### Pure Context Template

**Use when:** the context has domain logic but no file/network I/O.

**Based on:** `src/types/recipe-context.ts`

```typescript
// No infrastructure imports — pure logic only

export class {PascalName}Context {
  constructor(private readonly {domainParam}: {Type}) {}

  // Domain logic methods — no I/O
  public {methodName}({params}): {ReturnType} {
    // Pure transformation or validation logic
  }
}
```
