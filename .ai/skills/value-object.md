# Value Object (Rich Class) Conventions

Value objects live at `src/types/file/` and wrap a single primitive (`string`, `number`) that has domain meaning. They enforce their own invariants, expose only domain-meaningful operations, and hide the underlying primitive entirely. The primitive surfaces only at infrastructure boundaries — never within the domain, application, or action layers.

## Conventions

### Encapsulation — DO

- **DO** declare the wrapped primitive as `private readonly` — the only way out is `toString()`.
- **DO** implement `toString()` as the sole escape hatch from rich type to raw primitive.
- **DO** let `toString()` be called implicitly by template literals — callers write `` `Output: ${dir}` `` without an explicit `.toString()`.
- **DO** have methods that produce derived values return rich types — a method extracting a leaf name returns `FileName`, not `string`.
- **DO** compose rich types through each other — `FilePath` holds `DirectoryPath` and `FileName` as objects; both are passed as objects in constructors and methods.
- **DO** use `static create()` returning `T | undefined` for construction from user input or external data that can fail validation.
- **DO** use `static createInput()` for the flag-value-to-rich-type pattern when a sensible fallback exists (e.g. `DirectoryPath.default`).
- **DO** use `static readonly` for well-known singleton instances (e.g., `DirectoryPath.default`).
- **DO** access the private field directly inside methods — write `this.directoryPath` not `this.toString()`.

### Encapsulation — DON'T

- **DON'T** expose a getter that returns the underlying primitive:
  ```ts
  // BANNED
  get path(): string { return this.directoryPath; }
  ```
- **DON'T** call `.toString()` on `this` inside any method other than `toString()` itself.
- **DON'T** call `.toString()` on a rich object when passing it to another rich object's constructor or method:
  ```ts
  // BANNED
  new FilePath(new DirectoryPath(dir.toString()), new FileName(name.toString()))

  // CORRECT
  new FilePath(dir, name)
  ```
- **DON'T** unwrap to perform path arithmetic and re-wrap the result:
  ```ts
  // BANNED
  new DirectoryPath(this.directoryPath + "/subdir")

  // CORRECT — use the rich method
  this.join("subdir")
  ```
- **DON'T** return `string` from a method whose result has a domain type:
  ```ts
  // BANNED
  public leafName(): string { return path.basename(this.directoryPath); }

  // CORRECT
  public leafName(): FileName { return new FileName(path.basename(this.directoryPath)); }
  ```
- **DON'T** use `.toString()` inside `f.path()`, `f.link()`, or `f.var()` helpers — those accept the rich type via template interpolation.
- **DON'T** throw from the constructor when construction can fail — use `static create()` returning `T | undefined`.

### toString() boundary rule

`.toString()` — including implicit unwrapping via template literals — is permitted **only** at these boundary sites:

| Boundary | Example |
|---|---|
| `fs.*` / `fsExtra.*` calls | `fsExtra.stat(filePath.toString())` |
| `path.*` calls | `path.join(this.directoryPath, ...subPath)` |
| Axios / HTTP request construction | `axios.get(url.toString())` |
| External library APIs (execa, archiver, extract-zip, chokidar) | `execa("code", [filePath.toString()])` |
| Template literal inside own `toString()` | `` `${this.directoryPath}/${this.fileName}` `` |
| Logging / terminal display | `` log.info(`Saved to ${dir}`) `` |

Anything not in this table is a violation. In particular: domain methods, context classes, action classes, and application classes must not unwrap to `string` outside of `toString()` itself.

### Composition — DO

- **DO** pass `DirectoryPath` and `FileName` objects as constructor arguments — never pass raw strings.
- **DO** use `directory.join("subdir")` to derive a subdirectory — it returns `DirectoryPath`.
- **DO** use `filePath.replaceDirectory(newDirectory)` to move a file to a new parent — no string reconstruction.
- **DO** call `directoryPath.isEqual(other)` for equality — never `a.toString() === b.toString()`.

### Context class exposure rule

Context classes (`PortalContext`, `SdkContext`, etc.) may expose a rich-type field via a public getter or method **only** when the caller needs it for **logging or prompting display** — never for path computation, I/O, or construction of other paths. Add an inline comment when you do:

```ts
// Exposed for display in prompts — callers must not use this for path computation
public get sdkLanguageDirectory(): DirectoryPath {
  return this.languageDirectory;
}
```

---

## Known Gaps in Existing Code

These patterns exist in the current codebase and are flagged for awareness:

| File | Issue |
|---|---|
| `src/types/file/directoryPath.ts:31` | `leafName()` returns `string` — should return `FileName` |
| `src/types/sdk-context.ts` | `sdkLanguageDirectory` getter exposes `DirectoryPath` — needs justification comment if kept |
| `src/types/toc-context.ts` | `tocPath` getter exposes `FilePath` — prefer returning it only from the `save()` operation result |

---

## Review Checklist

- [ ] All imports use `.js` extension (e.g., `./directoryPath.js`)
- [ ] The wrapped primitive is `private readonly` — no public field, no getter exposing it
- [ ] No method calls `this.toString()` — methods access `this.{field}` directly
- [ ] `toString()` is the only method that returns the raw primitive
- [ ] Methods returning derived values return a rich type, not `string`
- [ ] Composed types receive other rich objects in their constructors — no `.toString()` at call sites
- [ ] `join()` / `replaceDirectory()` / similar transformation methods return rich types
- [ ] `static create()` used for user-input construction that can fail — constructor is for trusted callers
- [ ] `directoryPath.isEqual(other)` used for equality — not `a.toString() === b.toString()`
- [ ] No `.toString()` call appears outside a boundary site (fs, path, axios, external lib, logging)
- [ ] Context class public getter (if any) has an inline comment justifying the exposure (display only)
- [ ] No `.toString()` passed to `f.path()`, `f.link()`, or `f.var()` helpers
- [ ] `static readonly` used for constant singleton instances

---

## Reference Files

| Pattern | File |
|---|---|
| Ideal simple wrapper — private field, `static create()`, `toString()` only | `src/types/file/urlPath.ts` |
| `static createInput()` fallback, rich join/equality methods | `src/types/file/directoryPath.ts` |
| Rich predicate (`isMarkDown`) and transform (`normalize`) returning rich type | `src/types/file/fileName.ts` |
| Composed value object — holds two rich types, `static create()` splits at boundary | `src/types/file/filePath.ts` |
| Correct boundary unwrapping — all `.toString()` calls at `fs.*` / `path.*` sites | `src/infrastructure/file-service.ts` |
| Context with flagged public getter (display use) | `src/types/sdk-context.ts` |

---

## Scaffolding

### What to determine

1. **Name** — PascalCase class name (e.g., `PortNumber`, `ApiVersion`, `RecipeName`)
2. **Primitive type** — the underlying primitive (`string`, `number`, etc.)
3. **Validation** — can construction fail from user input? If yes, add `static create()`
4. **Fallback** — is there a sensible default for flag values? If yes, add `static createInput()` + `static readonly default`
5. **Derived values** — what can be computed? Each result that has domain meaning should be a rich type
6. **Composition** — does this hold other rich types as fields?
7. **Equality** — is structural equality needed? Add `isEqual(other: T)`

---

### Simple Value Object (wraps a single primitive)

**Use when:** wrapping a string or number that has a domain name — URL, port, version, file name, recipe name.

**Path:** `src/types/file/{name}.ts` for file-domain types; `src/types/{domain}/{name}.ts` for others.

```ts
export class {ClassName} {
  private readonly {field}: {Primitive};

  constructor({field}: {Primitive}) {
    this.{field} = {field};
  }

  // Static factory for user-input / external data that can fail validation.
  // Returns undefined — callers must check before using.
  public static create({field}: {Primitive}): {ClassName} | undefined {
    if (!{field} || !{validationCondition}) {
      return undefined;
    }
    return new {ClassName}({field});
  }

  // Well-known constant (if applicable)
  // public static readonly default = new {ClassName}({defaultValue});

  // Static factory for flag values with fallback (if applicable)
  // public static createInput(input: {Primitive} | undefined): {ClassName} {
  //   return input ? new {ClassName}(input) : {ClassName}.default;
  // }

  // Domain predicate — returns boolean, never exposes primitive
  public {isDomainCondition}(): boolean {
    return this.{field}.{check};
  }

  // Derived value — returns a rich type, never string
  public {derivedValue}(): {RichReturnType} {
    const raw = /* compute from this.{field} */;
    return new {RichReturnType}(raw);
  }

  // Structural equality — compare field directly, not via toString()
  public isEqual(other: {ClassName}): boolean {
    return this.{field} === other.{field};
  }

  // Sole escape hatch — called implicitly by template literals at boundaries
  public toString(): {Primitive} {
    return this.{field};
  }
}
```

**Notes:**
- All methods access `this.{field}` directly — they never call `this.toString()`.
- The direct `constructor` is for trusted callers (e.g., another rich type creating a derived instance). `static create()` is the entry point from external/user data.
- `isEqual()` compares the private field directly — never calls `a.toString() === b.toString()`.

---

### Composed Value Object (holds other rich types)

**Use when:** the value object is built from two or more rich types — e.g., `FilePath` = `DirectoryPath` + `FileName`.

**Path:** `src/types/file/{name}.ts` or the appropriate domain folder.

```ts
import { {PartA} } from "./{partA}.js";
import { {PartB} } from "./{partB}.js";

export class {ClassName} {
  private readonly {partA}: {PartA};
  private readonly {partB}: {PartB};

  // Constructor takes rich types — callers must not pass raw strings
  constructor({partA}: {PartA}, {partB}: {PartB}) {
    this.{partA} = {partA};
    this.{partB} = {partB};
  }

  // Static factory for user-input: splits the raw string at the boundary (path.* calls),
  // then wraps each part in its rich type
  public static create(rawValue: string): {ClassName} | undefined {
    if (!rawValue) {
      return undefined;
    }
    try {
      // path.* calls are a legitimate boundary — they produce the raw parts
      const rawA = /* path.dirname / path.basename / etc. */;
      const rawB = /* path.basename / path.extname / etc. */;
      return new {ClassName}(new {PartA}(rawA), new {PartB}(rawB));
    } catch {
      return undefined;
    }
  }

  // Transformation — swap one component, keep the other; returns a new rich type
  public replace{PartA}(new{PartA}: {PartA}): {ClassName} {
    return new {ClassName}(new{PartA}, this.{partB});
  }

  // toString() joins components at the infrastructure boundary.
  // Template literal calls each component's toString() implicitly — that is correct here.
  public toString(): string {
    return `${this.{partA}}/${this.{partB}}`;
    // Or: path.join(this.{partA}.toString(), this.{partB}.toString())
    // when OS-correct separators are required (path.* inside toString() is a boundary site)
  }
}
```

**Notes:**
- Constructor signature uses the rich types — a caller with a raw string must run `static create()` first.
- `replace{PartA}()` receives and returns rich types — never accepts or returns strings.
- Component parts unwrap inside `toString()` via template literal; this is the one permitted place they call `.toString()`.
