# Plan: `apimatic.json` replaces `portal.json` and `plugin-config.json`

Status: draft, 2026-09-22. Branch to be cut from `dev`.

## 1. Goal and scope

One file, `apimatic.json`, at the root of the input directory (beside `src/`),
carries what `src/portal.json` and `src/plugin-config.json` carry today. The
file has three blocks: `portal` for the portal, `plugin` for the context
plugin's identity, and `languages` for per-language settings that both the
portal and the plugin will read. `languages` exists once so the two halves can
never disagree about which SDKs a project has.

This release moves the files and little else. Every command produces the same
output, asks the same questions and fails on the same inputs as it does today;
only the file it reads and writes changes. Three behaviour changes are
deliberate, each forced by two files becoming one and each decided in section 2:
a byte-order mark is stripped rather than refused on the plugin path, the
writer preserves indentation and the trailing newline, and it writes
atomically. All three are more permissive or more careful than today, so none
can break a project that works now, with the one Windows caveat on the rename
in section 8. A fourth rule is new rather than changed:
the root level, which neither old file had, is lenient about keys it does not
know.

This PR is the first of a series that ends in the 2.0.0 cut; the release is the
series, not this PR. The PRs after it, in order: quickstart adopts a directory
that already holds an `apimatic.json` — it uses the `portal` and `languages`
blocks it finds and writes the ones it does not; then `portal generate`
requires `portal` and at least one entry in `languages`, and `plugin generate`
requires `plugin` and at least one `languages` entry carrying what plugin
generation needs. Where a decision below is shaped by what a later PR will do,
its row says so.

The new capabilities the shared `languages` block is for (package information
on the injected portal pages, `packageConfiguration` per language) are later
plans. The `portal` block keeps today's flat shape; the restructuring in
`.ai/plans/portal-config.md` lands inside the block in a later PR of the
series, before the cut (section 2, release row). That plan is not untouched by
this move, though: its `sdks.languages` is dropped in favour of the shared
top-level `languages`, which section 10 records.

Out of scope: `APIMATIC-BUILD.json`, which stays in `src/` for SDK generation;
the published JSON schema (section 10 notes what it will be called); any
change to what the backend receives.

## 2. Decisions

| Topic | Decision |
|---|---|
| Location | `<input>/apimatic.json`, where `<input>` is the directory `-i` names and `src/` sits in. Not inside `src/`: `sdk generate` and `plugin generate` upload `src/` wholesale, and the portal block has no business on the server. |
| Root keys | `$schema`, `schemaVersion`, `portal`, `plugin`, `languages`. All optional at the file level; each command requires what it needs (section 4). |
| `schemaVersion` | Optional. Accepted when absent or `1`. Any other value is an error naming the CLI version that reads it, so a future format is refused rather than misread. Written by the create path only (writer row). |
| `$schema` | Accepted and ignored, as the portal-config plan already says. Not written by the scaffold until the schema file exists. |
| Ownership per block | `portal` is user-authored. In this release the CLI writes it once, from quickstart, and never again; the quickstart PR that adopts an existing directory (section 1) writes it into a file that already exists, which is why the writer below knows no block. `plugin` and `languages` are shared, as `plugin-config.json` was designed to be: the user may edit them and the CLI merges into them after `plugin generate` and `sdk publish`. |
| Validation per block | `portal` keeps today's strictness: every field validated, unknown fields reported with the near-miss hint. `plugin` and `languages` keep today's leniency: shape checks that protect the merge, unknown fields preserved, and the two `plugin` checks that make the file `unreadable` today — `PLUGIN_ID_PATTERN` on `pluginId`, semver on `pluginVersion` — kept as `plugin` findings (decided 2026-09-22, section 11). The two policies already exist; they now apply to blocks instead of files. |
| Byte-order mark | Stripped, then parsed. `portal.json` strips one today and `plugin-config.json` refuses one as `unreadable`; with one file the parser has to pick, and stripping is the only choice that cannot break a project that works today. The plugin path's byte-order-mark `reason` is deleted. Windows is where a byte-order mark comes from — Notepad and PowerShell redirection write it — and it is now the portal's file too. |
| Unknown root keys | Ignored, and preserved untouched by the writers — the same leniency `plugin` and `languages` get, for the same reason: a file written by a later CLI that adds a root block must still be readable by this one, which is what `schemaVersion` exists to gate instead. No near-miss hint at the root; a misspelled block is reported only as the required block being absent. |
| A required block is absent | Reported by the command that needs it, naming the block and nothing else: `'portal' is required`. That is the whole root-level report, so a user who wrote `portla` is told what is missing rather than what is unrecognised. |
| Which findings reach which command | Every finding carries the block it came from. `portal generate` and `portal serve` see root-level and `portal` findings; the plugin path sees root-level, `plugin` and `languages`, and never `portal`. A malformed `languages` entry therefore cannot fail a portal build, which is what the ownership split above and the invariants in section 4 both require. When `portal generate` later reads `languages` (the series' last PR, and `x-codeSamples` after it), it opts into those findings deliberately and this row is revisited. |
| Writer | Read the document, hand the whole of it to the caller's `apply`, write back the whole of what comes back. The writer knows no block: this release's two callers replace `plugin` and `languages`, and the quickstart PR replaces `portal` without reopening it. Every key the caller did not touch keeps its position, a block the caller adds is appended after the last key — so section 3's order is what a file created whole looks like, and a project that publishes SDKs before it builds a plugin ends up with `languages` before `plugin` — and the file is written with the indentation it already uses and the trailing newline as found. A file the writer creates gets two spaces, a trailing newline and `schemaVersion: 1`; a merge into a file that lacks `schemaVersion` adds nothing (decided 2026-09-22, section 11). Today's two writers disagree on the newline (the plugin writer omits it, the portal scaffold appends it), so it is decided here rather than left to whichever runs first. Preserving indentation and the newline is new behaviour, not preserved behaviour (section 8). The write goes through a new `FileService.replaceContents`: the content is written to a temporary file beside the target and renamed over it, so a torn write cannot destroy a hand-authored `portal` block, and the temporary file is removed if the rename fails, so a failed write leaves nothing behind. A file that exists but cannot be parsed is left alone, as today. |
| Legacy files | `src/plugin-config.json` is not read, not imported and not mentioned by the CLI. Same rule as the 1.x portal setup: the release notes carry the move, the CLI carries no migration messaging. `src/portal.json` needs no rule: no released CLI ever wrote one — npm `latest` is 1.5.0 and `beta` is 1.3.0-beta.2, and both trees predate the Fumadocs portal — so only a directory built from `dev` holds one. The break users actually meet is `APIMATIC-BUILD.json`'s portal settings and `src/plugin-config.json`, and that is what the notes describe (section 9). |
| `--update-plugin-config` | Keeps its name this release; only its description changes to say `apimatic.json`. Renaming is a separate decision. |
| Quickstart on an existing file | Does not arise in this PR. Quickstart refuses a non-empty input directory, so it always creates the file. Adopting a directory that already holds an `apimatic.json` is the next PR of the series (section 1). |
| SDK generation upload | Assumed to ignore the two files it no longer receives. Stated in the PR description for the reviewer; not verified against the backend beforehand. |
| Backend contract | Unchanged. `plugin generate` writes a `plugin-config.json` in today's exact shape into the temporary copy of `src/` it uploads. The server never learns the file moved. |
| Release | The move is breaking, but this commit is an ordinary `feat:`; the `BREAKING CHANGE:` footer rides on the last PR of the series (decided 2026-09-22, section 11). That footer names what users lose: `src/plugin-config.json`, and the 1.x portal — the `APIMATIC-BUILD.json` portal settings and the `portal copilot`, `portal recipe new` and `portal toc new` commands, which #343 removed with an empty commit body. Until that PR lands, `dev` is not merged into `main`: `release.config.cjs` cuts the version from footers, nothing on `dev` carries one, and npm `latest` is 1.5.0, so a merge today would ship the half-moved portal as 1.6.0. PRs into `dev` are squash-merged and commitlint never sees the squash message, so the footer goes in that PR's description too and is checked at merge time. The `1.x` branch in `release.config.cjs` carries 1.x fixes afterwards; it does not exist yet and is created from `v1.5.0` when first needed. |

Rejected:

- **Keep the file in `src/`.** It would keep the upload contract free, but the
  portal block would ride in every SDK generation upload, and the user's own
  statement of the layout puts the file at the root.
- **One validation policy for the whole file.** Strict everywhere would make
  `sdk publish` refuse to record a successful publish because of a typo in a
  portal colour; lenient everywhere would let a misspelled portal field produce
  a portal that is quietly wrong, which is the one mistake the portal parser
  exists to catch.
- **Auto-import `src/plugin-config.json`.** Cheap to write, but it is a
  migration path that lives in the code for a major, and the project has
  already decided the 1.x portal setup gets no such path.

## 3. The file

```json
{
  "schemaVersion": 1,
  "portal": {
    "title": "Swagger Petstore",
    "description": "A sample pet store server.",
    "logo": "static/images/logo.png",
    "siteUrl": "https://petstore.example.com"
  },
  "plugin": {
    "pluginId": "acme-payments",
    "pluginName": "Acme Payments",
    "pluginVersion": "0.1.0",
    "author": { "name": "Acme Inc.", "email": "sdk@acme.com" },
    "license": "MIT"
  },
  "languages": {
    "typescript": {
      "source": { "repositoryUrl": "https://github.com/acme/payments-typescript", "branch": "main" },
      "package": { "name": "@acme/payments", "version": "1.2.0" },
      "codegenVersion": "v2"
    }
  }
}
```

- `portal` is `PortalConfigData` as it is today: `title` required, `description`,
  `logo`, `siteUrl`, `aiPageActions`. Paths stay relative to `src/`, so `logo`
  is still `static/...` and the existence check still resolves against `src/`.
- `plugin` is today's identity: `pluginId`, `pluginName`, `pluginVersion`,
  `pluginKey`, `author`, `license`, `homepage`, `repository`. Same validation
  (`PLUGIN_ID_PATTERN`, semver), same defaults (`license` written as `MIT`).
- `languages` is today's `PluginLanguages` verbatim: per language `source`,
  `package`, `codegenVersion`. `codegenVersion` stays because the mismatch check
  in `PluginConfigPresent.assertNoCodegenVersionMismatch` depends on it.
  `packageConfiguration` and `source.repositoryType` from the design sketch are
  not modelled in this release. A hand-written file carrying `packageConfiguration`
  keeps it, because unknown fields in these blocks are preserved. A hand-written
  `source.repositoryType` does **not** survive a source-code publish: today's
  `upsertLanguage` sets `source: entry.source ?? existingEntry?.source`, which
  replaces the whole `source` object rather than merging into it, so keys inside
  it are lost the moment a run supplies its own. Preservation is per entry, not
  per leaf. This is today's behaviour and the move does not change it; it is
  stated because the shape above invites the opposite reading, and because the
  later `packageConfiguration` plan has to decide whether to fix it.

What the synthesized upload file looks like, so the server sees no change:

```json
{ "pluginId": "...", "pluginName": "...", "pluginVersion": "...", "author": {...}, "license": "MIT",
  "languages": { "typescript": { "source": {...}, "package": {...}, "codegenVersion": "v2" } } }
```

That is `{ ...plugin, languages }`, with any unknown fields of `plugin` carried
along, which is what a hand-edited `plugin-config.json` uploads today.

## 4. Behaviour per command, and what does not change

| Command | Today | After |
|---|---|---|
| `portal generate`, `portal serve` | Missing `src/portal.json` → `missingConfig`, which points at quickstart. Invalid → every error listed. | Missing `apimatic.json` → `missingConfig`. Present without `portal`, or with a `portal` that is not a JSON object → `invalidConfig` with one error, `'portal' is required`. That message carries the same "run quickstart to set one up" line `missingConfig` does, so a file that exists without the block is no worse off than no file at all. Until the quickstart PR lands that line points at a command that refuses a non-empty directory; `dev` is not released before it does (section 8). Invalid `portal` fields and a bad `schemaVersion` → `invalidConfig` with every error. Unknown root keys are ignored, and a malformed `plugin` or `languages` block never reaches this command (section 2). Errors name the block: `'portal.title' is required...`. |
| `portal quickstart` | Writes `src/portal.json` from the spec, prints the `src/` tree, serves. | Writes `<input>/apimatic.json` with `schemaVersion` and `portal`. Prints the tree with the file above `src/` (section 6). The input directory is empty by the time this runs — quickstart loops until the user names an empty one — so in this PR the file is always created, never merged into. |
| `plugin generate` | Missing or metadata-less config → prompts, writes identity, `license: MIT`, author from the account. Uploads `src/` zipped. | Same prompts, same write into `plugin`. Uploads a copy of `src/` with `plugin-config.json` synthesized into it (overwriting a legacy one that may still sit there, so the server never reads a stale file). |
| `plugin publish` | Missing file → `pluginConfigMissing`; no release → `pluginDetailsNotSet`. | Unchanged but for the file name. Missing file → `pluginConfigMissing`; no release → `pluginDetailsNotSet`. A file that parses but carries no `plugin` block — the shape `sdk publish` alone produces — is `pluginDetailsNotSet`, as it is today: it exists, so saying it "was not found" would be false. |
| `sdk publish` | Records the language entry into `src/plugin-config.json` after a successful publish, creating `{ "languages": {...} }`. `--update-plugin-config` in non-interactive runs. | Records into `languages` of `apimatic.json`, creating `{ "schemaVersion": 1, "languages": {...} }` when there is no file and adding `languages` alone to one that exists. The flag keeps its name and behaviour this release; its description says `apimatic.json`. Renaming the flag is a separate decision (section 11). |
| `sdk generate` | Uploads `src/` including whatever `portal.json` and `plugin-config.json` sit there. | Unchanged. It still uploads `src/` with whatever is in it — which, for a project scaffolded by this release, no longer includes either file, and for a project upgraded from 1.5 still includes its `plugin-config.json`, because section 9 leaves it on disk. Section 8 has the one thing to verify. |

Invariants that hold before and after:

- A publish that succeeded is never turned into a failure by the recording
  step. An unreadable `apimatic.json` prints the same message it does today and
  leaves the file alone.
- `plugin generate` and `plugin publish` refuse the same states with the same
  messages, with the file name swapped.
- Every portal error is reported at once, so one edit fixes the file.

## 5. Types

New:

- `src/types/apimatic-config/document.ts`: `ApimaticConfigDocument`, the parsed
  root as a plain record with the blocks pulled out: `portal: unknown`,
  `plugin: Record<string, unknown> | undefined`,
  `languages: Record<string, unknown> | undefined`, `schemaVersion`, and the
  remaining keys in order. A parsed-document type like
  `types/portal/portal-config.ts` and `types/plugin/plugin-config.ts`, so it
  sits in a subfolder; the flat-`src/types/` rule in `.ai/skills/context.md` is
  for contexts. `parse(text)` strips a leading byte-order mark (it never refuses
  one — section 2), does the JSON parse, the object check, the `schemaVersion`
  check, the shape checks the merge needs (`plugin` an object, `languages` an
  object of objects), and the two `plugin` checks that make the file
  `unreadable` today — `PLUGIN_ID_PATTERN` on `pluginId`, semver on
  `pluginVersion` — tagged to the `plugin` block, so the plugin path still
  refuses them and the portal path never sees them. Every finding carries the
  block it came from, and each caller is handed only the blocks it owns
  (section 2): the portal path gets root-level and `portal` findings as a
  `string[]` of field errors, the plugin path gets root-level, `plugin` and
  `languages` findings as one `reason` sentence. Both are rendered from the
  same findings, so the wording cannot drift.
  `serialize(indent, trailingNewline)` writes it back in key order and adds
  nothing; `schemaVersion` is put in by the create path alone.
- `src/types/apimatic-config-context.ts`: `ApimaticConfigContext(inputDirectory)`,
  flat beside the thirteen contexts already there, as `.ai/skills/context.md`
  requires. Owns the path, `exists()`, `read()`, and `merge(apply)` with the
  read-modify-write and failure rules `PluginConfigContext.merge` has today.
  `apply` receives the whole document and returns the whole document; the
  context knows no block (section 2). Indentation detection lives here, and the
  write itself is `FileService.replaceContents`, so every writer gets both
  without repeating them.

Changed:

- `FileService` gains `replaceContents(filePath, contents)`: write to a
  temporary file beside the target, rename over the target, remove the
  temporary file when the rename fails. `writeContents` stays for the callers
  that do not need it.
- `PortalConfig.parse(json)` becomes `PortalConfig.fromBlock(block: unknown)`.
  Same validators, same near-miss map, messages prefixed with `portal.`. The
  JSON-level checks it does today move to the document parser.
- `PluginConfigContext` becomes a thin owner of the plugin and languages blocks
  over `ApimaticConfigContext`: `getPluginConfigState()`, `upsertMetadata()`,
  `upsertLanguage()` keep their signatures and results. `PluginConfigPresent`
  is unchanged; it is constructed from `{ ...plugin, languages }`, which is the
  shape it already reads. `present` keeps meaning "the document parsed", never
  "the `plugin` block is there": a document without one is `present` carrying an
  identity-less config, which is what `sdk publish` alone has always written and
  what `hasMetadata()`, `getRelease()` and `PluginRecordSdkAction`'s
  `configExisted` already read correctly. Keying the state on the block instead
  would silence the codegen-version guard for every project that publishes SDKs
  before it builds a plugin.
- `PluginConfigData` splits into `PluginIdentityData` (the `plugin` block, with
  the index signature) and the existing `PluginLanguages`; the upload shape is
  rebuilt from the two by `PluginConfigContext`, which owns both (section 6).
- `PortalSourceContext(inputDirectory)` derives `src/` itself and reads the
  document through `ApimaticConfigContext`. `resolve()` returns the same
  `PortalSource`; `PortalSourceProblem` gains nothing, since a missing `portal`
  block is an `invalidConfig`.
- `Directory.fileDescriptions` drops `portal.json` and gains `apimatic.json`.
  Quickstart builds the root node itself (section 6): the input directory is
  not walked, because `getDirectory` recurses into every entry and skips
  nothing, and quickstart admits a directory that holds only dot-entries.

Removed: `PortalConfig.parse` (string form), the `plugin-config.json` path in
`PluginConfigContext`.

## 6. Actions, commands, prompts

- Commands that read the config pass the input directory as well as `src/`:
  `portal generate`, `portal serve`, `portal quickstart`, `plugin generate`,
  `plugin publish`, `sdk publish`. Every one of them already derives the input
  directory — it is the `workingDirectory` they call `.join('src')` on — so
  nothing new has to be computed, only threaded.
- Which actions take what, checked against what each one does with the argument
  today rather than assumed:
  - `PluginRecordMetadataAction` and `PluginRecordSdkAction` use it for the
    config alone, so they take the input directory instead of `buildDirectory`.
  - `PluginPublishAction` does **not**. Its `buildDirectory` is also the
    `buildDirectory.isEqual(pluginDirectory)` guard that stops a plugin being
    written into `src/`, and the path its `pluginConfigMissing` message names.
    It takes both: the input directory for the config, `src/` for the guard.
  - `PluginGenerateAction`, `PortalGenerateAction` and `PortalServeAction` take
    both, for the same reason. `PluginGenerateAction` also builds the context
    itself and hands `buildDirectory` to `PluginRecordMetadataAction`, so it is
    re-threaded in the same step as the context (section 12).
  - `SdkPublishInteractiveAction` and `SdkPublishNonInteractiveAction` are the
    intermediaries that reach `PluginRecordSdkAction`, and both need the input
    directory threaded through them. The interactive one already has it
    (`workingDirectory`, from its own directory prompt); the non-interactive one
    receives only `buildDirectory` today, so its signature grows.
- `PluginGenerateAction`: copy `src/` into the temp directory, write the
  synthesized `plugin-config.json` into the copy, zip the copy. Today it zips
  `src/` in place. `BuildContext.getBuildZipPath` already does exactly this
  copy-then-zip — it is the shape to follow, not a new pattern to invent.
- The synthesized object is `{ ...plugin, languages }`. `PluginConfigPresent`
  keeps it private, so the zip site cannot get it from there, and the action
  does not combine raw blocks either: `PluginConfigContext`, which owns the two
  blocks, gains a method that writes the synthesized `plugin-config.json` into
  a directory the action names — the temp copy of `src/` — so the upload shape
  lives in the context that owns it and the file is read once.
- `PortalSourceContext.scaffold` writes the config through `ApimaticConfigContext`,
  so the path, the key order and the serializer are owned in one place rather
  than by a second `JSON.stringify` call. The directory is empty when it runs
  (section 4), so this is always a create. It still writes `spec/`,
  `content/index.md` and `content/nav.json` under `src/`. This moves with the
  context in step 3, not later: once `resolve` demands a `portal` block, a
  `scaffold` still writing the old shape leaves quickstart serving nothing.
- Quickstart's tree: a root node for `<input>` holding an `apimatic.json` file
  item, described through `Directory.fileDescriptions` like any other, and the
  `src/` walk as today. Not `getDirectory(inputDirectory)`: that walk recurses
  into every entry and skips nothing, and quickstart admits a directory that
  holds only dot-entries, so a user who ran `git init` first would be shown the
  whole `.git` tree. `printDirectoryStructure`'s heading still announces
  "`src` directory containing source files created at `<input>`", which is no
  longer what the tree shows; it names the input directory instead.
- `reportSourceProblem` takes one directory today and now needs two bases:
  `missingConfig` and `invalidConfig` name `<input>`, while `missingLogo`,
  `noSpecs`, `unreadableContent` and `invalidNavigation` keep naming `src/`.
  A blanket rename of the file string is not enough here.
- The near-miss and unknown-field messages in `portal-config.ts` read
  `'x' is not a portal.json setting`. They become `'x' is not a 'portal'
  setting`, not `... an apimatic.json setting`: the field is unknown to the
  block, and the root is lenient (section 2).
- `types/flags-provider.ts` describes `-i` as "the parent directory containing
  the 'src' directory, which includes API specifications and configuration
  files". Every command's help shows it. The second half is now false for the
  portal and still true for `sdk generate`, whose `src/` holds
  `APIMATIC-BUILD.json`, so the rewording has to hold for both.
- Prompt text and command descriptions: every `portal.json`, `src/portal.json`
  and `plugin-config.json` becomes `apimatic.json`, and any `src/` that
  qualified it goes with it. Files: `prompts/portal/source.ts`,
  `prompts/portal/serve.ts`, `prompts/portal/quickstart.ts`, `prompts/plugin/generate.ts`,
  `prompts/plugin/publish.ts`, `prompts/plugin/record-metadata.ts`,
  `prompts/plugin/record-sdk.ts`, `prompts/sdk/publish/non-interactive.ts`,
  `commands/portal/generate.ts`, `commands/portal/serve.ts`,
  `commands/plugin/generate.ts`, `commands/sdk/publish.ts`, `types/build/build.ts`
  (comment), `types/portal/openapi-document.ts` (comment), `types/portal/portal-navigation.ts`
  (one user-facing message names `portal.json`'s `title`; it becomes `'portal.title' in apimatic.json`).
- The `PLUGIN_CONFIG_FILE` constant duplicated across four prompt files becomes
  one `APIMATIC_CONFIG_FILE_NAME` exported beside the context.
- `PortalQuickstartPrompts.nextSteps` points at the reference documentation
  page that documents `src/portal.json`; the copy on that page moves with the
  release, and the link is checked rather than assumed.

## 7. Tests

Existing files to move with the code, keeping every case:

- `test/types/portal/portal-config.test.ts` → block form; the JSON-level cases
  (`not valid JSON`, `must contain a JSON object`, the byte-order mark) move to
  a new `test/types/apimatic-config/document.test.ts`, which also holds the
  `plugin` checks that stay `unreadable`.
- `test/types/plugin-config-context.test.ts` → the same cases against
  `apimatic.json`, plus: a file holding only `portal` gets `languages` merged
  in with `portal` untouched and first; unknown root keys and unknown `plugin`
  fields survive a write; four-space indentation and a missing trailing
  newline survive a write; a file without `schemaVersion` does not gain one on
  a merge; a `schemaVersion` of `2` is `unreadable` with the reason naming the
  version. The existing byte-order-mark case inverts: a file that starts with
  one is now read, not reported `unreadable` (section 2), and the `reason`
  string goes with it.
- `test/infrastructure/file-service.test.ts` (new) → `replaceContents` writes
  the content, leaves no temporary file behind on success, and removes it when
  the rename is made to throw, with the target untouched.
- `test/types/portal-source-context.test.ts` → config at the root; new cases
  for `portal` absent reported as `'portal' is required` and nothing else, an
  unknown root key ignored, a malformed `languages` block not failing the
  resolve, `$schema` present and ignored, `schemaVersion` absent and `1`
  accepted.
- `test/actions/plugin/generate.test.ts` → asserts the uploaded zip contains
  `plugin-config.json` equal to `{ ...plugin, languages }`, and that a legacy
  `src/plugin-config.json` is not what gets uploaded. Today it stubs the
  service and never opens the zip, which is why the synthesis cannot be a step
  of its own (section 12).
- `test/actions/plugin/{publish,record-metadata,record-sdk}.test.ts` → the
  config path. In `record-sdk.test.ts` one case more than that: the case that
  starts without a file deep-equals the whole written document and gains
  `schemaVersion: 1`; the cases that start from a written file do not, since a
  merge adds nothing (section 2).
- The scaffold cases in `test/types/portal-source-context.test.ts` → the file
  lands at the root of the input directory rather than in `src/`. There is no
  `test/actions/portal/quickstart.test.ts` and no portal prompt test either —
  `test/prompts/` holds `prompt.test.ts` and `sdk/` — so the tree is uncovered
  today. A new `test/prompts/portal/quickstart.test.ts` renders the root node
  for `apimatic.json` and a `src/` tree and asserts the file's description and
  the heading.
- `test/infrastructure/services/plugin-service.test.ts` → unchanged; it
  asserts the server's `pluginConfig` error key, which this plan keeps.
- `test/resources/portal-inputs/default` → the fixture that
  `test/actions/portal/generate.test.ts`, `test/actions/portal/serve.test.ts`
  and `test/e2e/portal-build.test.ts` all build on. It is `src`-shaped —
  `portal.json` sits at its root beside `content/`, `spec/` and `static/` — so
  moving the config out means giving the fixture a parent directory and
  pointing those three tests, and the `PortalSourceContext` each constructs,
  one level up. This is the largest test change in the release and was missing
  from this list.
- `test-source/` is gitignored and untracked: a local scratch directory for
  manual runs, not a fixture. Nothing in the suite reads it, so it is not part
  of this change.

One new test guards the invariant that matters most: with an `apimatic.json`
whose `portal` block is invalid, `PluginRecordSdkAction` still records the
language and returns success.

## 8. Risks

- **The SDK generation upload changes contents.** `src/` uploaded by `sdk generate`
  used to carry `portal.json` and `plugin-config.json` when present; it no
  longer does — for a project scaffolded by this release. A project upgraded
  from 1.5 still has its `src/plugin-config.json`, because section 9 leaves it
  there, so its uploads are byte-identical to today's. The contents only
  change for the projects that were never at risk. Nothing in the CLI suggests
  the SDK generator reads either. Decision (2026-09-22): assumed ignored; the
  PR description says so, and the reviewer is the check.
- **Users on 1.5.x with a `src/plugin-config.json`.** After upgrading, `plugin
  generate` prompts for identity again and `sdk publish` starts a fresh
  `languages` block; the old file is neither read nor deleted, and the CLI
  says nothing about it. The re-prompt can mint a different `pluginId` from the
  one already published, which the user has to notice themselves. This is the
  breaking change of the move and it ships in a major (section 2), carried by
  the release notes.
- **`dev` merged into `main` mid-series.** Nothing on `dev` carries a
  `BREAKING CHANGE:` footer — #343 removed the 1.x portal with an empty commit
  body — so a merge before the last PR ships the whole line as 1.6.0, with the
  Fumadocs portal and this move unnamed in the notes. The release row in
  section 2 is the guard; the PR description repeats it.
- **Formatting churn on a shared file.** Preserving indentation and the
  trailing newline is new: today's plugin writer is a bare
  `JSON.stringify(config, null, 2)` with no trailing newline, and the portal
  scaffold appends one, so the two disagree. The new writer keeps key order,
  indentation and the trailing newline as found, and writes two spaces with a
  trailing newline for a file it creates. What it cannot keep is anything
  `JSON.parse` discards, so a hand-formatted file with aligned values or
  unusual spacing inside a line is still normalised on the first CLI write.
  Line endings go with it: the output is `\n`, so a CRLF file is rewritten LF.
  That much is what `plugin-config.json` does today and is accepted.
- **A failed write can now damage hand-authored content.** The write is not
  atomic. Today a torn write costs a `plugin-config.json` the CLI wrote itself;
  now it can cost a `portal` block the user wrote by hand, which after the
  previous risk is the only copy. Writing to a temporary file in the same
  directory and renaming over the target is the cheap fix and is taken in
  step 1 (section 2, writer row) rather than after the first report. A rename
  over a file another program holds open can fail on Windows where an in-place
  overwrite would not; that surfaces as today's `unwritable` message, with the
  target untouched and the temporary file removed.
- **Two readers, one file.** `portal serve` does not watch the config today,
  so an `sdk publish` writing `languages` during a preview has no effect until
  restart. When the portal-config plan adds re-apply on save, that watcher
  must ignore writes that leave `portal` unchanged.
- **An existing project has no CLI route to a `portal` block.** Quickstart only
  runs in an empty directory, so a user upgrading a project they already have
  writes the `portal` block by hand. `plugin generate` and `sdk publish` do
  create `apimatic.json`, but neither writes `portal`. Accepted for this PR:
  teaching quickstart to adopt an existing directory is the next PR of the
  series (section 1), and until it lands the "run quickstart" line under
  `'portal' is required` points at a command that will refuse. `dev` is not
  released before that PR (section 2, release row), so no user meets the dead
  end.

## 9. Legacy files

Decided 2026-09-22: no message. A leftover `src/plugin-config.json` is ignored
in silence, the same way the 1.x build file is. `src/portal.json` is not a
legacy file: no released CLI wrote one (section 2), so only a directory built
from `dev` holds one, and it gets no rule either. The release notes name the
move from `APIMATIC-BUILD.json`'s portal settings and from
`src/plugin-config.json` into the `portal`, `plugin` and `languages` blocks.
The alternatives considered were a one-line hint in the two "file missing"
messages, and an import on first write; both were declined so that the CLI
carries no migration code for the major.

## 10. Documentation and neighbours

- `README.md`: the hand-written "Upgrading from 1.x" section is rewritten to
  name `apimatic.json` and its `portal` block directly; `src/portal.json` never
  shipped and does not appear in it. Everything else the plan touches there
  — the `plugin generate` description, the `portal generate`/`serve`
  descriptions, the `--update-plugin-config` line — sits inside oclif's
  generated command blocks, so it is not edited by hand: the README is
  regenerated once the command and flag strings change, and the regeneration is
  part of step 7.
- `.ai/plans/portal-config.md`: the schema file becomes `apimatic.schema.json`
  with the `portal` block as one definition; `$schema` URL follows. The
  scaffold section writes `apimatic.json`. Its `sdks.languages` is dropped and
  its "Rejected: top-level `languages`" entry reversed: the portal derives its
  language list from the shared top-level `languages` block, which is the one
  reading under which section 1's "the two halves can never disagree about
  which SDKs a project has" is true. That plan's required-key set loses its
  only required path, so `portal.title` becomes the only one until the series'
  last PR makes a `languages` entry required for `portal generate` (section 1).
  `.ai/plans/fumadocs-portal.md`
  input-layout row and `.ai/plans/portal-navigation.md` mentions of
  `portal.json`.
- `.ai/skills/context.md` if it cites `PluginConfigContext` or
  `PortalSourceContext` as examples.
- `sample-docs-as-code-portal` v2 branch: `src/portal.json` → `apimatic.json`,
  and the quickstart URLs noted in memory.
- Release notes: the move from `APIMATIC-BUILD.json`'s portal settings and
  `src/plugin-config.json`, the leftover-file line for `src/plugin-config.json`,
  and that the upload contract is unchanged. Drafted in this PR; shipped by the
  last PR's footer (section 2).

## 11. Decisions taken 2026-09-22

Asked and answered before implementation started; recorded in the table in
section 2.

1. Legacy-file message: none.
2. `--update-plugin-config`: name kept, description updated.
3. SDK generation upload: assumed to ignore the two files; stated in the PR.
4. Quickstart on an existing `apimatic.json`: does not arise in this PR.
   Quickstart keeps its empty-directory rule and always creates the file;
   adopting a populated directory is the next PR of the series.

Taken after an adversarial review of this plan against the codebase, same date:

5. Byte-order mark: stripped everywhere. The plugin path's refusal goes.
6. `plugin publish` on a file with no `plugin` block: today's
   `pluginDetailsNotSet`, not `pluginConfigMissing`. The state stays keyed on
   the document, so the codegen-version guard in `PluginRecordSdkAction` keeps
   working for projects that publish SDKs before they build a plugin.
7. Unknown root keys: lenient, with no near-miss hint. The only root-level
   report is the block a command needs being absent.
8. Findings are partitioned by block, so a malformed `languages` entry cannot
   fail a portal build. Revisited when `portal generate` starts reading
   `languages` for `x-codeSamples`.
9. `sdks.languages` is dropped from `.ai/plans/portal-config.md`; the portal
   reads the shared top-level `languages`.
10. Release: 2.0.0, carried by a `BREAKING CHANGE:` footer on the commit.
    **Superseded by 12.**
11. New types live flat in `src/types/`, per `.ai/skills/context.md`.
    **Narrowed by 19.**

Taken after a second adversarial review, same date, against the series in
section 1:

12. Footer: on the last PR of the series, not this one; this commit is an
    ordinary `feat:`. `dev` is not merged into `main` until then. The footer
    names `src/plugin-config.json` and the 1.x portal removal, not
    `src/portal.json`.
13. `schemaVersion`: written on create only. A merge into a file that lacks it
    adds nothing.
14. `pluginId` pattern and `pluginVersion` semver: `plugin`-block findings,
    `unreadable` on the plugin path as today.
15. The plugin path reads `plugin` and `languages`; `portal` is never one of
    its inputs. The partition in 8 stands.
16. `merge(apply)` is block-agnostic, and `portal` is written once "in this
    release" rather than "never again", so the quickstart PR writes `portal`
    without reopening the writer.
17. Steps 2 and 3 are one step: between them `plugin generate` uploads a `src/`
    with no `plugin-config.json` while its test, which stubs the service and
    never opens the zip, stays green.
18. `src/portal.json` is not a legacy file. Section 9, the README section and
    the notes describe the break users meet: the `APIMATIC-BUILD.json` portal
    and `src/plugin-config.json`.
19. The document type lives in `src/types/apimatic-config/`; only the context
    is flat in `src/types/`.
20. The atomic write is a `FileService` method with its own test, and removes
    its temporary file when the rename fails.
21. Quickstart's tree gets a prompt test; the earlier claim that prompt tests
    already cover it was false.

Taken after a third pass over the rewritten plan, same date:

22. `scaffold` moves with `PortalSourceContext` in step 3. Once the context is
    on the input directory, `resolve` demands a `portal` block, so a scaffold
    still writing the old shape would leave quickstart serving nothing between
    steps, with no test to say so.
23. Quickstart builds the root tree node itself and adds `apimatic.json` to
    `Directory.fileDescriptions` in the same step. Walking the input directory
    was rejected: `getDirectory` recurses into every entry and skips nothing,
    and quickstart admits a directory that holds only dot-entries.
24. The upload synthesis is a `PluginConfigContext` method that writes
    `plugin-config.json` into a directory the action names. The action never
    holds the raw blocks.
25. A block a caller adds is appended after the last key. Section 3's order is
    what a file created whole looks like, not a rule the writer enforces.

## 12. Implementation steps

Each step leaves build, lint on touched files, and the affected tests green.
That is only true if each step carries its own call sites with it: a step that
re-points a constructor and leaves the wiring to a later step breaks every
caller in between. So the wiring is folded into the two steps that move a
context, and step 5 keeps only what is genuinely independent of them.
Stop after each for a go-ahead; ask before every commit.

1. **Document, context and the write primitive.** Add `ApimaticConfigDocument`,
   `ApimaticConfigContext` and `FileService.replaceContents`, each with tests.
   Nothing uses them yet.
2. **Plugin side, with the upload synthesis.** One step, not two (section 11,
   decision 17). Re-seat `PluginConfigContext` over the new context; move the
   JSON-level checks; update `plugin-config-context.test.ts`. In the same
   step, thread the input directory: `PluginGenerateAction` (which builds the
   context itself and hands `buildDirectory` to the metadata action),
   `PluginRecordMetadataAction`, `PluginRecordSdkAction`, `PluginPublishAction`,
   both `SdkPublish{Interactive,NonInteractive}Action`, and the three commands
   that construct them. `PluginGenerateAction` copies `src/`, writes the
   synthesized file and zips the copy, and its test asserts the zip. Actions
   and prompts still say `plugin-config.json` at this point but the file is
   `apimatic.json`. Tests for the actions get the new path, and the one
   whole-document case in `record-sdk.test.ts` its `schemaVersion`.
3. **Portal side.** `PortalConfig.fromBlock`, `PortalSourceContext` on the
   input directory, `scaffold` writing `{ schemaVersion, portal }` through
   `ApimaticConfigContext` with its cases, and in the same step its three call
   sites (`actions/portal/{generate,serve,quickstart}.ts`), `reportSourceProblem`'s
   two directory bases, the new source-context cases, and the
   `test/resources/portal-inputs/default` fixture with the three tests that
   read it. Nothing here can be deferred: the portal is broken from the moment
   the constructor changes until every caller follows, and so is quickstart —
   once `resolve` demands a `portal` block, a `scaffold` still writing the old
   shape leaves it serving nothing, and no test would say so (section 11,
   decision 22).
4. **Quickstart.** The root tree node, with `apimatic.json` added to
   `Directory.fileDescriptions` so its description resolves like any other
   file's, the tree heading and the closing note, with the new prompt test.
5. **Wiring.** What is left once steps 2 and 3 have carried their own callers:
   every remaining prompt string and command description, the `-i` flag
   description in `flags-provider.ts`, the near-miss message wording, and the
   shared file-name constant.
6. **Invariant test** from section 7: an invalid `portal` block does not stop
   `PluginRecordSdkAction` from recording a language.
7. **Docs and release.** README, plans, skills, the release note draft naming
   the move from `APIMATIC-BUILD.json`'s portal settings and
   `src/plugin-config.json` into the three blocks, and the PR description's
   note on the SDK generation upload and its reminder that `dev` is not merged
   into `main` before the series ends. This commit is an ordinary `feat:`; the
   `BREAKING CHANGE:` footer belongs to the last PR of the series (section 2).
   The sample repository is a separate PR in its own repo.
