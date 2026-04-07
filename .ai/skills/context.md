# /new-context

Scaffold a new context object following the project's encapsulation principles. Creates a single file at `src/types/{name}-context.ts`. Context objects encapsulate path derivation, validation, and file I/O for a domain concept — callers interact with high-level operations, not internal paths or file structures.

## Files Created

1. `src/types/{name}-context.ts` — Context class with behavioral methods

## Information to Gather

Before generating, determine the following from the user or their description:

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

## Encapsulation Rules

Context classes **encapsulate** logic. Follow these rules strictly:

### DO

- **Expose only behavioral methods** — `validate()`, `exists()`, `save()`, `resolveTo()`. Callers say *what* they want, not *how*.
- **Return results from operations** — `save()` returning `FilePath` (where it wrote) is fine. It's the *result* of work, not internal *state*.
- **Keep derived paths as `private get`** — all `FilePath`/`DirectoryPath` derivation is internal.
- **Keep decision logic inside** — if the context knows how to choose between zip/unzip, file/url, etc., that logic stays internal.
- **Expose domain-specific read/write methods** — instead of returning raw JSON/YAML config for callers to manipulate.

### DON'T

- **DON'T expose internal paths as public getters** — no `public get outputDirectory()` or `public get filePath()`. If a caller needs a path, it should come as a return value from an operation.
- **DON'T return raw config objects** — don't return parsed JSON/YAML for callers to manipulate directly. Wrap reads/writes in domain methods (e.g., `getCopilotConfig()` instead of `getBuildFileContents()`).
- **DON'T expose derived file names** — methods like `getScriptFileName()` leak internal naming logic. Keep file name derivation inside the context.
- **DON'T add public properties for internal state** — constructor parameters are `private readonly`, not exposed.

## Output Context Template

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

**Output context rules:**
- `exists()` checks if output already populated — used by actions for overwrite confirmation.
- `save()` returns the path where content was written — this is the only way callers learn about output location.
- All path derivation (`private get`) stays internal.
- `cleanDirectory` before writing when overwriting is expected.

## Input Context Template

**Use when:** the context validates and reads from user-provided input directories.

**Based on:** `src/types/spec-context.ts` (good encapsulation), `src/types/build-context.ts` (structure reference)

```typescript
import { FileService } from "../infrastructure/file-service.js";
import { DirectoryPath } from "./file/directoryPath.js";
import { FilePath } from "./file/filePath.js";
import { FileName } from "./file/fileName.js";
// If zip operations needed:
// import { ZipService } from "../infrastructure/zip-service.js";

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
  // Good: exposes domain concept
  // public async getSomeDomainValue(): Promise<string> {
  //   const content = await this.fileService.getContents(this.configFile);
  //   const config = JSON.parse(content);
  //   return config.domainField;
  // }

  // Good: domain-specific write
  // public async updateSomeDomainValue(value: string): Promise<void> {
  //   const content = await this.fileService.getContents(this.configFile);
  //   const config = JSON.parse(content);
  //   config.domainField = value;
  //   await this.fileService.writeContents(this.configFile, JSON.stringify(config, null, 2));
  // }
}
```

**Input context rules:**
- `validate()` checks that required files/directories exist.
- Read/write methods expose domain concepts, not raw file contents.
- No `getContents()` or `getConfig()` that returns parsed JSON/YAML directly to callers.
- Callers should never need to know file names, formats, or internal structure.

## Temp Context Template

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
  // private readonly zipService = new ZipService();

  constructor(private readonly tempDirectory: DirectoryPath) {}

  // Internal temp file naming — always private
  // private get tempFilePath(): FilePath {
  //   return new FilePath(this.tempDirectory, new FileName(randomUUID()));
  // }

  // Operations return the resulting FilePath
  public async save(stream: NodeJS.ReadableStream): Promise<FilePath> {
    const tempFile = new FilePath(this.tempDirectory, new FileName("{temp-name}"));
    await this.fileService.writeFile(tempFile, stream);
    return tempFile;
  }

  // public async zip(sourceDirectory: DirectoryPath): Promise<FilePath> {
  //   const tempFile = this.tempFilePath;
  //   await this.zipService.archive(sourceDirectory, tempFile);
  //   return tempFile;
  // }
}
```

**Temp context rules:**
- Used inside `withDirPath(async (tempDirectory) => { ... })` in actions.
- Methods create temp files and return the resulting `FilePath`.
- Temp file naming (UUIDs, etc.) is internal.

## Pure Context Template

**Use when:** the context has domain logic but no file/network I/O.

**Based on:** `src/types/recipe-context.ts`

```typescript
// No infrastructure imports — pure logic only

export class {PascalName}Context {
  constructor(private readonly {domainParam}: {Type}) {}

  // Domain logic methods — no I/O
  // Keep derived values internal; expose behavioral checks
  public {methodName}({params}): {ReturnType} {
    // Pure transformation or validation logic
  }
}
```

**Pure context rules:**
- No `FileService`, `ZipService`, or any infrastructure imports.
- Constructor takes domain values (strings, enums, DTOs).
- Methods are pure transformations or in-memory checks.
- Derived file names or identifiers stay internal unless they are the explicit output of an operation.

## Conventions Checklist

After generating, verify all of the following:

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
- [ ] No public properties that expose constructor parameters

## Reference Files

Study these before generating to match the exact patterns:

| Pattern | File | Encapsulation |
|---|---|---|
| Output context (save + zip/unarchive) | `src/types/portal-context.ts` | Good — all paths private |
| Output context (save stream + derived name) | `src/types/transform-context.ts` | Good — name derivation internal |
| Input context (validate + file ops) | `src/types/spec-context.ts` | Good — zip detection internal |
| Temp context (zip + save stream) | `src/types/temp-context.ts` | Good — UUID naming internal |
| Temp context (download + resolve) | `src/types/resource-context.ts` | Good — URL/file decision internal |
| Composite (delegates to BuildContext) | `src/types/versioned-build-context.ts` | Good — typed result object |
| Output context (leaky — avoid pattern) | `src/types/sdk-context.ts` | Avoid — exposes `sdkLanguageDirectory` |
| Input context (leaky — avoid pattern) | `src/types/toc-context.ts` | Avoid — exposes `tocPath` |
