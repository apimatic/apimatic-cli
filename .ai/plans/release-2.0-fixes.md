# Plan: the pre-release fix batches for 2.0

Status: PR 1 implemented on `saeedjamshaid/one-home-per-concept` (see §3.8 for
where it departed from this plan); PRs 2 and 3 proposed. Three PRs against
`dev`, landed before the release PR is cut. Grounded in `dev` at `ecf76668`;
every file:line below was verified there.

## 1. Goal and scope

The 2.0 release review found no must-fix defects and no flow below main's bar.
What it found is a dozen concepts living in more than one place, a few layer
leaks, and one untested recovery path. This plan turns those findings into
three PRs — small enough to review, ordered so they never conflict — plus one
new test suite, so the release ships with the same "one concept, one place"
discipline the rest of 2.0 already shows.

The three PRs, in landing order:

1. **One home per concept** (Batch 2 of the review checklist) — seven
   mechanical consolidations, mostly in `types/` and `services/`.
2. **Portal flow polish** (Batch 3) — the duplicated runtime/authorization
   gate, the unguarded `portal.config.json` contract, two service fixes, and
   the `PortalContext.save` staging test suite.
3. **One place that knows a project's layout** (Batch 1; the PR #372 redo) —
   `ProjectContext` absorbs `BuildContext` and every `'src'`/output-name
   literal. Largest and most likely to slip, so it lands last: the small
   certain wins are banked first, and this PR rebases over three one-liners
   rather than the other way round.

Out of scope: everything the review marked safe to trail (user-facing copy in
infrastructure, error-channel unification, `SdkPublishAction`'s parameter
object, the remaining coverage extras, the tiny template items), and the two
standing decisions that are not code — `content-tree.ts`'s layer and the
prompts-as-functions blessing — which need an answer before the release PR but
belong to whoever owns the conventions, not to these batches.

## 2. Ordering and conflicts

| Files touched by more than one PR | Who wins |
|---|---|
| `actions/portal/generate.ts`, `actions/portal/serve.ts` + their suites | PR 2 (gate hoist) and PR 3 (ProjectContext threading) both edit them. Never in flight together; PR 2 first is the smaller rebase, and the hoist simplifies PR 3's portal step — the gate it would have had to thread is already gone. |
| `prompts/portal/serve.ts` | PR 1 (two `f.var` swaps) and PR 2 (method deletions). One-line rebase either way. |
| `types/portal-source-context.ts` | PR 1 (one import line for `SHELL_FILE_NAME`) and PR 3 (constructor threading). Trivial. |
| `actions/sdk/publish/interactive.ts:162,172` | The unquote-factory item is scoped to prompt sites only; PR 3 adopts `DirectoryPath.fromUserInput()` in whatever replaces these two callbacks. |
| `actions/sdk/record-published-sdk.ts` | PR 1 moves its helpers out; PR 3 changes its signature. PR 1 lands first, so PR 3 finds the file already reduced to the class. |
| `build-context.ts:38` calls `getContents` | PR 1 keeps `getContents` as the survivor; PR 3 deletes the whole file. No action, just no surprise. |

Suggested branch topics: `one-home-per-concept`, `portal-flow-polish`,
`project-context-layout` — each cut from `origin/dev`.

---

## 3. PR 1 — one home per concept

Seven items, all behavior-preserving. Half a day plus review.

### 3.1 The `languages` block gets one module

The on-disk shape `languages.<lang>.publishing.{source.repositoryUrl,
package.version, packageConfiguration}` is typed in
`types/plugin/plugin-config.ts:16-54`, built in
`types/plugin/language-entry.ts:17-38`, re-read stringly in
`types/portal/portal-sdk.ts:20-32` (every field path re-spelled as a literal
through a private `objectAt`), shape-checked in
`types/apimatic-config/document.ts:134-151`, and merged into by two
independent writers — `recorded`/`keepsRecord` in
`plugin-config-context.ts:103-120` and `withLanguage`/`languagesOf` inside
`actions/sdk/record-published-sdk.ts:16-40`, the latter against action.md's
"no helpers in action files". A rename in the typed shape would not break the
portal reader; it would silently read nothing.

| Topic | Decision |
|---|---|
| Home | New `src/types/apimatic-config/languages-block.ts`, beside `document.ts` — the block is root `apimatic.json` state shared by sdk, plugin and portal, not a plugin possession. |
| What moves in | The six type declarations from `plugin-config.ts` (doc comments travel — they are the block's contract prose); `buildLanguageEntry` from `language-entry.ts` (the file then holds nothing — delete it); `languagesOf` and `withLanguage` from the action file; `isPublished` from `plugin-config-context.ts:22`. |
| What stays put | `recorded`/`keepsRecord` stay in `plugin-config-context.ts` — "a cleared checkbox keeps a published record" is the plugin flow's policy, not block knowledge — now calling the shared `languagesOf`/`isPublished`. |
| The narrowing reader | A `publishingOf(entry: unknown)` whose key literals are tied to the typed shape via `satisfies keyof LanguagePublishing<unknown>`, so a rename fails `tsc` while the read stays defensive. `PortalSdk.fromEntry` keeps its exact semantics — wrongly shaped below `publishing` reads as not recorded; its `:19` comment stays true — but reads through this module; its private `objectAt` goes if unused. |
| Import churn | `plugin-config.ts` re-exports the moved types, so the 11 existing import sites don't move. Only the four files doing real work change. |

Tests: behavior unchanged; the existing nets are
`record-published-sdk.test.ts` (merge preservation),
`plugin-config-context.test.ts`, `portal/portal-sdk.test.ts`,
`apimatic-config/schema.test.ts`. Optionally one compile-level case in a new
`languages-block.test.ts` pinning the reader's key names to the typed shape.

### 3.2 `TIMING_DEFAULTS` / `GenerationTimings` hoisted

Three copies (`plugin-service.ts:25-32`, `sdk-generation-service.ts:24-31`,
`portal-artifacts-service.ts:31-40`), identical in values — all derive from
the poller's own exported constants plus `REQUEST_TIMEOUT_MS` — with
`portal-artifacts` carrying the best comment (the server's 25-minute budget
rationale). Export `TIMING_DEFAULTS` and
`type GenerationTimings = Partial<typeof TIMING_DEFAULTS>` from
`generation-status-poller.ts`, keeping that comment; each service deletes its
copy and keeps `private readonly timings: typeof TIMING_DEFAULTS` with the
spread. The poller gains the `axios-config.js` import (it has none today). No
test imports the type by name; nothing else changes. This shares only the
timing knobs — the per-endpoint status fetches stay deliberately unshared per
service.md.

### 3.3 `getContents` ≡ `readFile` collapsed

Byte-identical (`file-service.ts:269` / `:335`), a main-era duplication whose
caller split grew in dev. Survivor: `getContents` — all 11 external callers
already use it and it is the name context.md's own examples use. `readFile`'s
only caller is internal (`:355`, inside `contains`); repoint it and delete the
method. Grep `test/` for prototype stubs of `readFile` first (none expected —
test matches are `fs.readFileSync` assertions).

### 3.4 `_shell.html` gets one constant

Three homes: `portal-build-service.ts:22` (string),
`types/portal-context.ts:10` (`FileName`), `portal-source-context.ts:46` (a
string in the reserved-names list). Export the **string** —
`export const SHELL_FILE_NAME = '_shell.html'` in `types/portal-context.ts`,
carrying the merged comment (emitted by the SPA build even when nothing else
is, so alone it means a failed build; doubles as the not-found page on static
hosts). Two of three sites want the raw string for `is()`/list membership, and
`GENERATED_DIRECTORY_NAME` (`generated-pages.ts:13`) is the precedent for a
plain-string name constant in a types file. `portal-context.ts` keeps a local
`FileName` wrapper for its own `FilePath` construction. Test literals stay —
tests asserting the on-disk name independently is a feature.

### 3.5 `languageLabel` duplicate deleted

`types/portal/code-samples.ts:87-89` re-derives the label from
`LANGUAGE_CHOICES`; the canonical `languageLabel()` is
`types/sdk/generate.ts:130-136`. Delete the local function, import the shared
one, drop the now-unused `LANGUAGE_CHOICES` import. Rewrite
`LANGUAGE_CHOICES`' stale doc comment (`generate.ts:48-53` claims quickstart
consumers it no longer has): after this fix its only src consumer is
`UPCOMING_LANGUAGES` (`:105`), which uses it as the enum in display order —
say that. Folding it down to a `LANGUAGE_ORDER` list is possible but touches
`test/types/sdk/generate.test.ts:6,25` for no behavior; comment fix only.

### 3.6 Registry package-name fields: a compile-time guard

`types/portal/published-package.ts:11-36` hardcodes `nameField: 'name'` /
`'packageId'` per registry, re-encoding what
`types/publish/package-settings-configuration.ts` already types. Instead of a
cross-check test (which would state the mapping a third time), make the field
name a type:

```ts
interface PackageRegistry<L extends Language> {
  name: string;
  nameField: keyof PackageConfigurationForLanguage[L] & string;
  address: (packageName: string) => string;
}
const REGISTRIES: { [L in Language]?: PackageRegistry<L> };
```

A rename in the configuration types then fails `tsc` (which `pretest` runs) at
the exact literal. Zero runtime change; the portal→publish import direction
already exists via `plugin-config.ts:1`.

### 3.7 Micro-sweep

- `prompts/portal/serve.ts:53-54,60-61`: the `f.var('apimatic.json')`
  literals become `f.var(APIMATIC_CONFIG_FILE_NAME)` — the constant is already
  imported at `:3`, and `prompts/plugin/generate.ts:65-111` is the pattern.
- `portal-artifacts-service.ts:249,261,278-279,299,303`: the
  `.endsWith('.json')` / `.slice(0, -'.json'.length)` arithmetic becomes
  `fileName.hasExtension('.json')` / `fileName.withoutExtension()` — both
  already exist on `FileName` with those exact contracts. One accepted delta:
  `hasExtension` is case-insensitive where `endsWith` was exact — strictly
  safer for server-delivered names. The `const name = fileName.toString()`
  locals at `:248,:277,:298` mostly disappear.
- `DirectoryPath.fromUserInput(input: string)` — `new
  DirectoryPath(removeQuotes(input.trim()))`, beside `createInput`
  (`directoryPath.ts:30`). Always returns; these sites validate existence
  separately, unlike `create()`'s reject-on-invalid contract. Adopt at the
  three prompt sites (`prompts/sdk/publish/interactive.ts:34,56`,
  `prompts/quickstart.ts:139`, whose dead `?.`/`?? ''` go too). The two action
  callbacks (`actions/sdk/publish/interactive.ts:162,172`) are PR 3's lines —
  it adopts the factory there.

### 3.8 As implemented — departures from the above

- 3.1: no re-exports from `plugin-config.ts`. The import sites were 4 (2 src,
  2 test), not 11, so they moved and the concept has one import path. The
  reader is `recordedPublishing(entry)`; its keys are checked through a type
  parameter (`objectAt<LanguagePublishing<unknown>>(publishing, 'source')`)
  rather than `satisfies`. The type names keep their `Plugin` prefix; dropping
  it is a cheap follow-up. `language-entry.test.ts` moved to
  `test/types/apimatic-config/languages-block.test.ts`.
- 3.2: `STATUS_POLL_INTERVAL_MS` and `GENERATION_TIMEOUT_MS` were inlined into
  `TIMING_DEFAULTS` — nothing else read them once the copies went. The
  25-minute rationale now names `/portal-artifacts`, the endpoint it is about.
- 3.3: `readFile`'s only caller, `hasContent`, had no callers either; both
  went. Four more `FileService` methods are dead and pre-date 2.0
  (`fileExistsSync`, `copyDirectoryExcluding`, `pollDeleteDirectory`,
  `copyToDir`) — left for a separate sweep.
- 3.4: `404.html` and `portal.zip` had the same three-home shape (including
  `prompts/portal/generate.ts`), so `NOT_FOUND_FILE_NAME` and `ZIP_FILE_NAME`
  joined `SHELL_FILE_NAME`. The `portal-source-context.ts` glossary rider (§6)
  rode along.
- 3.7: `hasExactExtension`, not `hasExtension`, so the artifacts reader keeps
  its exact-match behavior and the PR has no behavior delta at all. The bare
  `nav.json` prompt literals (six) became `NAVIGATION_FILE_NAME`;
  `content/nav.json` waits for PR 3's names table. `fromUserInput` has a unit
  test. The `prompt.md` rider (§6) rode along, with the two `log.warning`
  calls in `prompts/api/validate.ts`.

---

## 4. PR 2 — portal flow polish, and the staging test

### 4.1 The runtime + authorization gate moves into `PreparePortalProjectAction`

Fifteen identical lines head `actions/portal/generate.ts:44-58` and
`actions/portal/serve.ts:50-66` (serve's copy carries the "checked once, at
startup" why-comment), and the `runtimeUnsupported`/`authorizationFailed`
wrappers exist in three prompts classes. `PreparePortalProjectAction` already
receives the exact constructor triple the gate needs and already has a
`runtimeUnsupported` prompt.

| Topic | Decision |
|---|---|
| Placement | The gate opens `prepare-project.ts`'s `execute`, before the `PortalSourceContext.resolve()` at `:51`. Generate's user-visible order is preserved: destination checks stay in `GenerateAction`, then gate, then source — and `generate.test.ts:124` (destination failure → `authorize` never called) stays true. |
| Serve's port probe | `serve.ts:68-71` currently runs after the gate and would otherwise run before it. It moves into the head of serve's `onPrepared`, next to its only consumer (`devServerService.start(project, servePort)` at `:79`) — gate-first ordering preserved, and no fallback-port message before an auth refusal. |
| Fields | `PreparePortalProjectAction` gains `authorizationService`; `GenerateAction` drops `projectService` and `authorizationService` entirely (`runtimeProblem` was its only projectService use); `PortalServeAction` drops only `authorizationService` (it keeps `projectService` for `applyConfig`/`applyContent` at `:183/:228`). |
| Prompts | `PreparePortalProjectPrompts` gains `authorizationFailed` (delegating to the shared `reportAuthorizationFailure`); the four wrapper methods and their imports leave `PortalGeneratePrompts` (`:58-65`) and `PortalServePrompts` (`:19-26`). |
| Quickstart | Untouched. Its own preflight (`actions/quickstart.ts:58-76`) is deliberate — fail before the wizard — and it already authorized before calling `PortalServeAction`, so the authorize count on that path stays two. A shared gate helper serving all three is a later cleanup, not this PR. |

Tests: the stub seam barely moves — `stubPreparePortalProject()`
(`test/actions/portal/prepare-project-stubs.ts:41-57`) already stubs the
prompts class and `runtimeProblem`, and `authorize` is stubbed on the service
prototype in both suites. Four scenarios retarget one assertion each from the
command's prompts stub to the shared one (`generate.test.ts:137-158`,
`serve.test.ts:86-105`); serve's fallback-port scenario asserts the prompt
call, not its position, so the probe move passes it unchanged.

### 4.2 `portal.config.json` gets a guarded contract

The CLI writes it as an untyped literal
(`portal-project-service.ts:277-289`); the template declares the shape
(`portal-template/portal-config.ts:5-17`) and re-casts fields ad hoc in
`src/lib/portal.server.ts:7,10`. Every other contract shape is guarded; the
identity type has a compile-time `Equal<>` test at
`test/portal-template.test.ts:169`, and that test file already imports from
`portal-project-service`, so the mechanism transfers directly.

| Topic | Decision |
|---|---|
| CLI type | `export interface PortalProjectConfig { specs: Record<string, string>; codeSamples: string \| null; contentDir: string; generatedDir: string; staticDir: string \| null; downloadsDir: string \| null }` in `portal-project-service.ts` beside the writer — it is infrastructure's contract with the template build. Annotate the literal with it. |
| Template rename | `PortalConfig` → **`BuildPaths`** — inside the template, "build" is the site build, and the review's `ProjectPaths` suggestion collides with the CLI's exported `PortalProjectPaths` from the same service. Consumers: `portal-config.ts:19`, `prerender-pages.ts:4,17`, `vite.config.ts:14`, `portal.server.ts`. |
| `portal.server.ts` | The two per-field casts become one `import type { BuildPaths } from '../../portal-config'` and a single cast at the import. Implementer check first: the raw JSON-module import at `:1` typechecks today although the file ships absent (packaging test `:177` asserts that) — verify how before choosing the cast form, and don't break `pretest`. |
| Guard | Beside `:169`: `const config: Equal<BuildPaths, PortalProjectConfig> = true;`, same comment style ("compiled apart, casts hold nothing together"). |

### 4.3 `validation-service.ts`

`parseErrorResponse` (`:161-187`) returns
`{ message, statusCode } as unknown as ServiceError` — no `errorMessage`, so
the strip path prints `undefined` where the message should be. It becomes
`ServiceError.invalidResponse(errorMessage)` (`service-error.ts:36-38`), whose
default message already bakes in the status. And `validateViaFile` (`:61-96`)
hoists its read stream above the try and closes it in a `finally`, per
service.md. The `Result<_, string>` return at `:65` stays — pre-existing, its
consumers switch on strings. No test pins either behavior. The strip-failure
output changing from `undefined` to the actual message is the one (desirable)
behavior delta; the PR notes it.

### 4.4 ANSI stripping via the stdlib

`portal-dev-server-service.ts:28`'s hand-built `COLOUR_SEQUENCE_PATTERN`
becomes `stripVTControlCharacters` from `node:util` at both use sites
(`:95,:137`). The `:26-27` comment's objection — the repo's `stripAnsi` eats
the newline `LOCAL_URL_PATTERN` needs — does not apply to the stdlib, which
removes escape sequences only. The existing test (real `\u001b[32m…`
sequences around the Local URL) passes unchanged. Whether the repo's own
`stripAnsi` (`utils/string-utils.ts:12`) can then also be retired is a
follow-up, not this PR.

### 4.5 The staging test suite (the test gate)

`types/portal-context.ts:54-78` — stage into `<portal>/.apimatic-staging`,
swap, best-effort cleanup — is the release's headline data-loss fix and has no
test. New `test/types/portal-context.test.ts`, house style (real dirs under
`os.tmpdir()`, sinon prototype stubs as `portal-source-context.test.ts` does,
no mock-fs), all cases cross-platform — no chmod tricks:

1. `exists()`: false on empty; true with any file; **true when only
   `.apimatic-staging` exists** (the leftover-staging rule at `:42-47`).
2. Unzipped happy path: portal pre-holds `old.txt`; after `save` — `ok`,
   `index.html` + `_shell.html` + `404.html` (copied shell) present,
   `old.txt` gone, staging gone.
3. Zip happy path: portal contains exactly `portal.zip`; staging gone.
4. No shell → no `404.html` (`:95-100` guard).
5. `stagingFailed`: a `builtDirectory` that does not exist makes the copy
   throw ENOENT on both platforms. Assert the kind, a non-empty reason,
   `old.txt` untouched, staging absent (the `:64` cleanup ran).
6. `replaceFailed`: stage succeeds for real, then
   `sinon.stub(FileService.prototype, 'moveDirectoryContents')` rejects —
   only that method, the staging phase stays real. Assert the kind,
   `stagedAt.isEqual(portal.join('.apimatic-staging'))`, and that the staged
   directory still holds the complete copy on disk.
7. `saveBuildLog`: writes `apimatic-debug/build.log` and returns the path;
   returns `null` when `writeContents` rejects (`:84-92`).

~180 lines, one new file.

---

## 5. PR 3 — one place that knows a project's layout

The PR #372 redo. The API is adopted from that PR's description (which was
manually exercised against dev — its six-run matrix); the implementation is
fresh, on current `dev`. `BuildContext` has no test file of its own —
deletion has zero direct test fallout, and every behavior is covered through
action tests, which is also why step 1 writes the missing unit tests before
any caller moves.

### 5.1 What exists today

`ProjectContext` (`types/project-context.ts`, 58 lines) knows only
`upsertGitignore()`; its one caller is `actions/quickstart.ts:117`; `GENERATED
= ['/sdk/', '/portal/', '/plugin/']` lives there while the same three names
are literals in five commands (`portal/generate.ts:41`, `sdk/generate.ts:77`,
`sdk/publish.ts:106`, `plugin/generate.ts:35`, `plugin/publish.ts:35`).
`BuildContext` (110 lines) carries the versioning walk — three getters
sharing an identical 9-line preamble and two `// TODO`s — and is consumed at
`actions/sdk/generate.ts:45-105` (the `versionedContextGetter` closure
returning `{version, buildContext} | ActionResult`, disambiguated by
`instanceof` at `:86`), `actions/plugin/generate.ts:41`,
`actions/sdk/publish/non-interactive.ts:43`, and
`actions/sdk/publish/interactive.ts:158,162`. Twelve `'src'` join sites
(`commands/{sdk,plugin,portal}/*`, `actions/sdk/publish/interactive.ts:35,158,162`,
`actions/quickstart.ts:94,143,173`) — the three joins in
`portal-project-service.ts` are the portal *template's* own `src/`, a
different concept that stays. Display re-derivations of `spec/`, `content/`,
`static/` sit in `prompts/portal/source.ts:90,97,115` and
`prompts/portal/serve.ts` (eleven lines). The composites
(`PortalSourceContext:57`, `PluginConfigContext:128`,
`ApimaticConfigContext:43`) all take a source directory; their own signatures
need not change. `DirectoryPath`'s constructor is `path.resolve(...)` and
`join` builds on an already-resolved base, so the four `'src'` spellings are
provably equivalent for every input — the "no behaviour change" claim holds.

### 5.2 Decisions

| Topic | Decision |
|---|---|
| Factories | `ProjectContext.at(input)` — the `--input` flag, absent meaning where the CLI ran — and `ProjectContext.in(directory)` for a caller handed a directory it asked the user for (sdk publish interactive). Adopted from #372. |
| Constructor | `private constructor(projectDirectory, source, version?)`; only `private reading(v)` produces the versioned case, so the factories can never construct it by accident. Adopted from #372. |
| Versioned build | `versionToBuild(select, apiVersion?)` narrows and returns the project to build from, or a typed problem the prompts name — replacing the `{version, buildContext} \| ActionResult` closure and the `instanceof` check. The three versioned getters collapse into one private walk; both `// TODO`s die with the file. |
| API surface | From `BuildContext`: `sourceExists()`, `specsExist()`, `buildZip(temp, packageSettings?)`, `isVersioned()`, `hasVersions()`, `onlyVersion()`, `chosenVersion(ask)`. Handoffs: `portalSource()`, `pluginConfig()`, `config()`. Overrides: `sdkDirectory(d?)`, `portalDirectory(d?)`, `pluginDirectory(d?)` — flag wins, else the project's own name. `upsertGitignore()` stays. `validate()`/`getBuildFileContents()` go private. |
| `sourceDirectory()` | Kept, narrowed as #372 argued: answers a **derived** directory, only for prompts (display) and `PortalArtifactsService` (upload); never `projectDirectory()` itself. `context.md` records the narrowed exception. Prompts keep taking paths — contexts do not enter the text layer. |
| Directory names | One private names table (`src`, `spec`, `content`, `static`, `sdk`, `portal`, `plugin`); `GENERATED` derives from the output names so a rename cannot reach one and miss the other; the child names are exported for prompt display joins, the getters stay private. |
| Fixtures | `test/resources/portal-inputs/{default,branded,code-samples}` become real projects — contents move under `<fixture>/src/`. Adopted from #372; it also retires `portal/generate.test.ts:128`'s hand-staging. `grep -r portal-inputs test` is the complete reference list (4 files). |
| Gitignore/`--destination` bug | **Decision for review — recommended: (b) now, (a) only if cheap.** (a) `pluginDirectory(d)` notices an override inside the project and `upsertGitignore()` gains the relative entry — fixes creation-side but mutates `.gitignore` from a flag and misses directories made by other means. (b) `plugin publish` checks its target before `git init`: inside a git work tree and not ignored → warn or confirm — fixes the failure point regardless of who created the directory. (c) ticket only. |

### 5.3 Implementation steps

Each step compiles and passes the suite on its own.

1. **Grow `ProjectContext`**: factories, narrowing, the moved bodies (the
   versioned walk collapsed to one), names table + derived `GENERATED` +
   exported child names, `sourceDirectory()` with its justification comment,
   the three handoffs, the three destination accessors. Extend
   `test/types/project-context.test.ts` first with the versioned-selection
   behaviors — multi-version prompt, single-version auto-pick,
   `--api-version` on an unversioned build warns — since `BuildContext` never
   had unit tests and the old bodies differ only in their final filter.
2. **`sdk generate`**: command builds `ProjectContext.at(input)` and
   `sdkDirectory(destination)`; the action's closure becomes
   `versionToBuild`; the dead ternary at `commands/sdk/generate.ts:76` dies
   with the join.
3. **`sdk publish`**: same factory switch; the interactive validators use a
   context built in the action (`ProjectContext.in`), adopting
   `DirectoryPath.fromUserInput()` from PR 1 in the rewritten callbacks;
   `interactive.ts:35`'s join goes.
4. **Plugin flows** (`plugin/{generate,publish}`, `record-metadata`,
   `record-published-sdk`): take `ProjectContext`; `exists()` at
   `plugin/generate.ts:41` becomes `sourceExists()`; composites via
   `pluginConfig()`/`config()`.
5. **Portal flows + quickstart**: `portalSource()` handoff,
   `portalDirectory(destination)`; quickstart's three joins collapse; its
   existing gitignore call keeps working.
6. **Prompts**: display joins use the exported name constants; no signature
   changes.
7. **Fixtures + tests**: the fixture move and the seven action suites' setup.
8. **Docs**: delete `build-context.ts`; `context.md`'s narrowed exception;
   the `command.md`/`action.md` reference rows naming `BuildContext`; sweep
   `.ai/plans/` references.
9. **The gitignore bug** per the decision row.

### 5.4 Tests and verification

`test/types/project-context.test.ts` grows substantially (versioned walk,
name derivation, destination overrides); the seven action suites and
`test/e2e/portal-build.test.ts` follow the signatures and fixture paths. Then
`pnpm build`, `pnpm lint`, the full suite, and #372's six-run manual matrix
(`--input`, in-place, `--destination`, versioned ×3).

### 5.5 Risks

| Risk | Mitigation |
|---|---|
| Behavior drift collapsing the versioned getters | Step 1 writes the tests before any caller moves. |
| Fixture move breaks a hardcoded path | One step; the four referencing files are the complete grep list. |
| Windows path semantics | Proven equivalent from `DirectoryPath`'s resolve/join; no new fs.watch/8.3 surface. |
| Prompt validators wanting contexts | Construction stays in the action, as today — validators receive a closure. |

---

## 6. Riders — small items that travel with whichever PR touches the file

- ~~`prompt.md`: `log.warning()` → `log.warn()`~~ — done in PR 1.
- ~~`portal-source-context.ts:50` glossary misuse~~ — done in PR 1.
- `commands/quickstart.ts:34-39`: the success-side telemetry marked
  `// TODO: Remove this` contradicts the documented failure-only pattern.
  Remove it, per its own TODO — flagged for confirmation since it is a
  telemetry behavior change.
- `directoryPath.leafName()` returning `string` is value-object.md's known
  gap and gained callers this release (`portal-tabs.ts:51`). Fixing it to
  return `FileName` touches PR 3's narrowing (`reading(v)` uses
  `v.leafName()` as the version key), so if it is fixed, fix it inside PR 3
  where the biggest consumer is being written; otherwise it stays a known
  gap.

## 7. Standing decisions the release PR needs (not code in these batches)

- `content-tree.ts` (and arguably `portal-navigation.ts`): move to
  `application/portal/` or update instructions.md's "no such algorithms exist
  today" note.
- Prompts-as-functions (`prompts/portal/{source,artifacts,authorization,code-samples}.ts`):
  bless in prompt.md or convert.
- `--codegen-version` retained-but-unread: confirm the intended long-term
  surface.
- The CRLF→LF rewrite on apimatic.json merge: one release-notes line.
