# Plan: `apimatic.json` replaces `portal.json` and `plugin-config.json`

Status: in progress, 2026-09-22. Branch `saeedjamshaid/apimatic-config`, cut from `dev`.

**Amended 2026-09-23** by `.ai/plans/portal-config.md`, whose PR changes this
plan in five places, each noted where it applies: the `portal generate` half of
"requires a `languages` entry" lands in that PR (section 1); the portal path
now reads `languages` findings, and an unknown `portal` key gets no near-miss
hint (section 2); its portal-config bullet is superseded (section 10); and the
release notes name the new `portal` namespaces and the `languages` requirement
(section 13).

## 1. Goal and scope

One file, `src/apimatic.json`, sitting where `src/portal.json` and
`src/plugin-config.json` sit today, carries what they carry. The file has three
blocks: `portal` for the portal, `plugin` for the context plugin's identity, and
`languages` for per-language settings that both the portal and the plugin will
read. `languages` exists once so the two halves can never disagree about which
SDKs a project has.

This release moves the files and little else. Every command produces the same
output, asks the same questions and fails on the same inputs as it does today;
only the file it reads and writes changes. Three behaviour changes are
deliberate, each forced by two files becoming one and each decided in section 2:
a byte-order mark is stripped rather than refused on the plugin path, the
writer preserves indentation and the trailing newline, and it writes
atomically. All three are more permissive or more careful than today, so none
can break a project that works now, with the one Windows caveat on the rename
in section 8. A fourth rule is new rather than changed: the root level, which
neither old file had, is lenient about keys it does not know.

This PR is the first of a series that ends in the 2.0.0 cut; the release is the
series, not this PR. The PRs after it, in order: quickstart adopts a directory
that already holds an `apimatic.json` — it uses the `portal` and `languages`
blocks it finds and writes the ones it does not; then `portal generate`
requires `portal` and at least one entry in `languages`, and `plugin generate`
requires `plugin` and at least one `languages` entry carrying what plugin
generation needs. Where a decision below is shaped by what a later PR will do,
its row says so. *(Amended 2026-09-23: the `portal generate` half, for
`portal serve` too, lands with `.ai/plans/portal-config.md`, as at least one
`languages` entry keyed by a known language; the `plugin generate` half stays
in this series.)*

The backend is changed alongside this series to read `plugin` and `languages`
from the `apimatic.json` inside the `src/` it is sent, and this PR merges only
once it does. The CLI synthesizes nothing for the server and keeps no
compatibility of any kind (decided 2026-09-22, section 11).

The new capabilities the shared `languages` block is for (package information
on the injected portal pages, `packageConfiguration` per language) are later
plans. The `portal` block keeps today's flat shape; the restructuring in
`.ai/plans/portal-config.md` lands inside the block in a later PR of the
series, before the cut (section 2, release row). That plan is not untouched by
this move, though: its `sdks.languages` is dropped in favour of the shared
top-level `languages`, which section 10 records.

Out of scope: `APIMATIC-BUILD.json`, which stays beside the new file for SDK
generation; the published JSON schema (section 10 notes what it will be
called); the backend change itself.

## 2. Decisions

| Topic | Decision |
|---|---|
| Location | `<input>/src/apimatic.json`, where the two files it replaces sit today. Decided 2026-09-22 (section 11): `sdk generate` and `plugin generate` upload `src/` wholesale and the backend reads `plugin` and `languages` from the `apimatic.json` inside that upload, so the file travels with `src/`. The portal block rides along and the server ignores it. |
| Root keys | `$schema`, `schemaVersion`, `portal`, `plugin`, `languages`. All optional at the file level; each command requires what it needs (section 4). |
| `schemaVersion` | Optional. Accepted when absent or `1`. Any other value is an error naming the CLI version that reads it, so a future format is refused rather than misread. Written by the create path only (writer row). |
| `$schema` | Accepted and ignored, as the portal-config plan already says. Not written by the scaffold until the schema file exists. *(Amended 2026-09-23: `apimatic.schema.json` exists, and the quickstart scaffold writes `$schema` first in the file; files the plugin and publishing commands create do not carry it.)* |
| Ownership per block | `portal` is user-authored. In this release the CLI writes it once, from quickstart, and never again; the quickstart PR that adopts an existing directory (section 1) writes it into a file that already exists, which is why the writer below knows no block. `plugin` and `languages` are shared, as `plugin-config.json` was designed to be: the user may edit them and the CLI merges into them after `plugin generate` and `sdk publish`. |
| Validation per block | `portal` keeps today's strictness: every field validated, unknown fields reported with the near-miss hint. `plugin` and `languages` keep today's leniency: shape checks that protect the merge, unknown fields preserved, and the two `plugin` checks that make the file `unreadable` today — `PLUGIN_ID_PATTERN` on `pluginId`, semver on `pluginVersion` — kept as `plugin` findings (decided 2026-09-22, section 11). The two policies already exist; they now apply to blocks instead of files. *(Amended 2026-09-23: the near-miss hints are gone. An unknown `portal` key is reported by its dotted path with no hint, as the portal-config plan decides for keys that never shipped.)* |
| Byte-order mark | Stripped, then parsed. `portal.json` strips one today and `plugin-config.json` refuses one as `unreadable`; with one file the parser has to pick, and stripping is the only choice that cannot break a project that works today. The plugin path's byte-order-mark `reason` is deleted. Windows is where a byte-order mark comes from — Notepad and PowerShell redirection write it — and it is now the portal's file too. Reading past a mark is enough only while the file stays here: `plugin generate` zips `src/` and sends it to a parser that is not this one, so that path takes the mark off the file before the zip (section 6). Only the mark is removed; the rest of the file is written back byte for byte, so a layout the CLI never chose survives a rewrite it never asked for. |
| Unknown root keys | Ignored, and preserved untouched by the writers — the same leniency `plugin` and `languages` get, for the same reason: a file written by a later CLI that adds a root block must still be readable by this one, which is what `schemaVersion` exists to gate instead. No near-miss hint at the root; a misspelled block is reported only as the required block being absent. |
| A required block is absent | Reported by the command that needs it, naming the block and nothing else: `'portal' is required`. That is the whole root-level report, so a user who wrote `portla` is told what is missing rather than what is unrecognised. |
| Which findings reach which command | Every finding carries the block it came from. `portal generate` and `portal serve` see root-level and `portal` findings; the plugin path sees root-level, `plugin` and `languages`, and never `portal`. A malformed `languages` entry therefore cannot fail a portal build, which is what the ownership split above and the invariants in section 4 both require. When `portal generate` later reads `languages` (the series' last PR, and `x-codeSamples` after it), it opts into those findings deliberately and this row is revisited. *Revisited 2026-09-23 as anticipated (`.ai/plans/portal-config.md`, section 8): the portal path reads `root` and `languages` findings, so a malformed `languages` block now fails a portal build; the plugin path is unchanged.* |
| Writer | Read the document, hand the whole of it to the caller's `apply`, write back the whole of what comes back. The writer knows no block: this release's two callers replace `plugin` and `languages`, and the quickstart PR replaces `portal` without reopening it. Every key the caller did not touch keeps its position, a block the caller adds is appended after the last key — so section 3's order is what a file created whole looks like, and a project that publishes SDKs before it builds a plugin ends up with `languages` before `plugin` — and the file is written with the indentation it already uses and the trailing newline as found. A file the writer creates gets two spaces, a trailing newline and `schemaVersion: 1`; a merge into a file that lacks `schemaVersion` adds nothing (decided 2026-09-22, section 11). Today's two writers disagree on the newline (the plugin writer omits it, the portal scaffold appends it), so it is decided here rather than left to whichever runs first. Preserving indentation and the newline is new behaviour, not preserved behaviour (section 8). The write goes through `FileService.replaceContents`: the content is written to a temporary file beside the target and renamed over it, so a torn write cannot destroy a hand-authored `portal` block, and the temporary file is removed if the rename fails, so a failed write leaves nothing behind. A file that exists but cannot be parsed is left alone, as today. |
| Legacy files | `src/plugin-config.json` is not read, not imported and not mentioned by the CLI. Same rule as the 1.x portal setup: the release notes carry the move, the CLI carries no migration messaging. `src/portal.json` needs no rule: no released CLI ever wrote one — npm `latest` is 1.5.0 and `beta` is 1.3.0-beta.2, and both trees predate the Fumadocs portal — so only a directory built from `dev` holds one. The break users actually meet is `APIMATIC-BUILD.json`'s portal settings and `src/plugin-config.json`, and that is what the notes describe (section 9). |
| `--update-plugin-config` | Keeps its name this release; only its description changes to say `apimatic.json`. Renaming is a separate decision. |
| Quickstart on an existing file | Does not arise in this PR. Quickstart refuses a non-empty input directory, so it always creates the file. Adopting a directory that already holds an `apimatic.json` is the next PR of the series (section 1). |
| Backend contract | Changed, not kept. The server reads `plugin` and `languages` from the `apimatic.json` in the uploaded `src/`; it is being changed alongside this PR, which merges only once it does. No `plugin-config.json` is synthesized into the upload and no compatibility is kept (decided 2026-09-22, section 11). |
| Uploads | `sdk generate` and `plugin generate` zip `src/` wholesale, as today, so both now carry `apimatic.json` with its portal block. The backend change above covers it; nothing is verified against the server beforehand. |
| Release | The move is breaking, but this commit is an ordinary `feat:`; the `BREAKING CHANGE:` footer rides on the last PR of the series (decided 2026-09-22, section 11). That footer names what users lose: `src/plugin-config.json`, and the 1.x portal — the `APIMATIC-BUILD.json` portal settings and the `portal copilot`, `portal recipe new` and `portal toc new` commands, which #343 removed with an empty commit body. Until that PR lands, `dev` is not merged into `main`. Since 2026-09-23 `dev` carries a breaking marker of its own (#347, `build!:` for Node 24), so its next release is 2.0.0 regardless; the guard now protects the notes and the half-moved portal, not the version number. PRs into `dev` are squash-merged and commitlint never sees the squash message, so the footer goes in that PR's description too and is checked at merge time. The `1.x` branch in `release.config.cjs` carries 1.x fixes afterwards; it does not exist yet and is created from `v1.5.0` when first needed. |

Rejected:

- **Keep the file at the input root, beside `src/`.** The plan's first choice,
  so the portal block would stay off the server. Reversed on 2026-09-22 when the
  backend was committed to reading `apimatic.json` from the upload: a root file
  would have to be copied into every `plugin generate` zip, and the layout the
  user wants has everything the server reads in `src/`. Section 11, decision 26.
- **One validation policy for the whole file.** Strict everywhere would make
  `sdk publish` refuse to record a successful publish because of a typo in a
  portal colour; lenient everywhere would let a misspelled portal field produce
  a portal that is quietly wrong, which is the one mistake the portal parser
  exists to catch.
- **Auto-import `src/plugin-config.json`.** Cheap to write, but it is a
  migration path that lives in the code for a major, and the project has
  already decided the 1.x portal setup gets no such path.
- **Synthesize a `plugin-config.json` into the upload.** Kept the server's
  contract untouched at the price of a copy-then-write before every zip and a
  compatibility shim in the CLI. Dropped 2026-09-22 with the location: the
  backend reads the new file instead.

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
      "publishing": {
        "source": { "repositoryUrl": "https://github.com/acme/payments-typescript", "branch": "main" },
        "package": { "name": "@acme/payments", "version": "1.2.0" },
        "codegenVersion": "v4"
      }
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
- `languages` is today's `PluginLanguages` with its per-language record moved one
  level down, under `publishing`: `source`, `package`, `codegenVersion`.
  **Amended 2026-09-23.** This PR first shipped the record flat at the entry
  level, which is not the shape the backend binds — codegen-v2 reads
  `languages.<lang>.publishing`, so a flat entry arrived with every field skipped
  as an unknown key and the language read as carrying nothing. Restored here,
  because it is also load-bearing beyond the wire: the entry is shared state that
  the plugin's skills, the portal's SDK page and publishing all read, so the rest
  of it has to stay free for settings that are not about publishing, and an entry
  with **no** `publishing` block is how "this language was asked for, nothing is
  published yet" is expressed — the state local plugin generation turns into a
  bundled SDK.
  `codegenVersion` stays, inside `publishing`, because the mismatch check
  in `PluginConfig.assertNoCodegenVersionMismatch` depends on it.
  `packageConfiguration` and `source.repositoryType` from the design sketch are
  not modelled in this release. A hand-written file carrying `packageConfiguration`
  keeps it, because unknown fields in these blocks are preserved. A hand-written
  `source.repositoryType` does **not** survive a source-code publish: today's
  `upsertLanguage` sets `source: entry.source ?? existingEntry?.source`, which
  replaces the whole `source` object rather than merging into it, so keys inside
  it are lost the moment a run supplies its own. Preservation is per publishing
  record, not per leaf. This is today's behaviour and the move does not change
  it; it is stated because the shape above invites the opposite reading, and
  because the later `packageConfiguration` plan has to decide whether to fix it.

The upload carries this file as it is. There is no synthesized
`plugin-config.json`; the server reads `plugin` and `languages` from here.

## 4. Behaviour per command, and what does not change

| Command | Today | After |
|---|---|---|
| `portal generate`, `portal serve` | Missing `src/portal.json` → `missingConfig`, which points at quickstart. Invalid → every error listed. | Missing `src/apimatic.json` → `missingConfig`. Present without `portal` → `invalidConfig` with one error, `'portal' is required`, flagged `missingPortal` so the prompt adds the same "run quickstart to set one up" line `missingConfig` does; a file that exists without the block is no worse off than no file at all. A `portal` that is not a JSON object → `'portal' must be a JSON object`, without the hint: there is a block to fix. Until the quickstart PR lands that line points at a command that refuses a non-empty directory; `dev` is not released before it does (section 8). Invalid `portal` fields and a bad `schemaVersion` → `invalidConfig` with every error. Unknown root keys are ignored, and a malformed `plugin` or `languages` block never reaches this command (section 2). Errors name the block: `'portal.title' is required...`. |
| `portal quickstart` | Writes `src/portal.json` from the spec, prints the `src/` tree, serves. | Writes `src/apimatic.json` with `schemaVersion` and `portal`. Prints the `src/` tree as today, with the new file in it. The input directory is empty by the time this runs — quickstart loops until the user names an empty one — so in this PR the file is always created, never merged into. |
| `plugin generate` | Missing or metadata-less config → prompts, writes identity, `license: MIT`, author from the account. Uploads `src/` zipped. | Same prompts, same write into `plugin`. Uploads `src/` zipped as today; the server reads `plugin` and `languages` from the `apimatic.json` in it. |
| `plugin publish` | Missing file → `pluginConfigMissing`; no release → `pluginDetailsNotSet`. | Unchanged but for the file name. Missing file → `pluginConfigMissing`; no release → `pluginDetailsNotSet`. A file that parses but carries no `plugin` block — the shape `sdk publish` alone produces — is `pluginDetailsNotSet`, as it is today: it exists, so saying it "was not found" would be false. |
| `sdk publish` | Records the language entry into `src/plugin-config.json` after a successful publish, creating `{ "languages": {...} }`. `--update-plugin-config` in non-interactive runs. | Records into `languages` of `src/apimatic.json`, creating `{ "schemaVersion": 1, "languages": {...} }` when there is no file and adding `languages` alone to one that exists. The flag keeps its name and behaviour this release; its description says `apimatic.json`. Renaming the flag is a separate decision (section 11). |
| `sdk generate` | Uploads `src/` including whatever `portal.json` and `plugin-config.json` sit there. | Unchanged in code. The upload now carries `apimatic.json`, portal block and all, and no longer `portal.json` or `plugin-config.json` for a project set up by this release. A project upgraded from 1.5 still carries its old `plugin-config.json`, which the server no longer reads (section 9). |

Invariants that hold before and after:

- A publish that succeeded is never turned into a failure by the recording
  step. An unreadable `apimatic.json` prints the same message it does today and
  leaves the file alone.
- `plugin generate` and `plugin publish` refuse the same states with the same
  messages, with the file name swapped.
- Every portal error is reported at once, so one edit fixes the file.

## 5. Types

New (step 1, landed):

- `src/types/apimatic-config/document.ts`: `ApimaticConfigDocument`, the parsed
  root as a plain record with the blocks pulled out: `portal(): unknown`,
  `plugin()` and `languages()` as `Record<string, unknown> | undefined`, and the
  remaining keys in order. A parsed-document type like
  `types/portal/portal-config.ts` and `types/plugin/plugin-config.ts`, so it
  sits in a subfolder; the flat-`src/types/` rule in `.ai/skills/context.md` is
  for contexts. `parse(text)` strips a leading byte-order mark (it never refuses
  one — section 2), does the JSON parse and the object check, and refuses only
  those: everything else parses, and what is wrong inside is carried as
  findings — the `schemaVersion` check at the root, the shape checks the merge
  needs (`plugin` an object, `languages` an object of objects), and the two
  `plugin` checks that make the file `unreadable` today (`PLUGIN_ID_PATTERN` on
  `pluginId`, semver on `pluginVersion`), each tagged to its block so the plugin
  path still refuses them and the portal path never sees them. A finding is
  `block`, `field` and `problem`, rendered two ways from the same data:
  `findingSentences` for the portal path's list, `findingClause` for the plugin
  path's one reason. `with(block, value)` replaces a block in place or appends
  it; `serialize(indent, trailingNewline)` writes it back in key order and adds
  nothing, `schemaVersion` being put in by `empty()` alone. The file-name
  constant `APIMATIC_CONFIG_FILE_NAME` lives here, since the context imports it.
- `src/types/apimatic-config-context.ts`: `ApimaticConfigContext(sourceDirectory)`,
  flat beside the thirteen contexts already there, as `.ai/skills/context.md`
  requires. Owns the path, `exists()`, `read()` — `missing`, `unparseable` with
  the root findings, or `parsed` with a document that may still carry findings
  for its callers to partition — and `merge(blocks, apply)`, with the
  read-modify-write and failure rules `PluginConfigContext.merge` had. `blocks`
  names what the caller is about to write; a finding in one of them, or at the
  root, refuses the write. `apply` receives the whole document and returns the
  whole document. Indentation detection lives here, and the write itself is
  `FileService.replaceContents`.

Changed:

- `FileService` gains `replaceContents(filePath, contents)` (step 1, landed):
  write to a temporary file beside the target, rename over the target, remove
  the temporary file when the rename fails. `writeContents` stays for the
  callers that do not need it.
- `PortalConfig.parse(json)` becomes `PortalConfig.fromBlock(block: unknown)`.
  Same validators, same near-miss map, messages prefixed with `portal.`. The
  JSON-level checks it does today move to the document parser.
- `PluginConfigContext` (step 2) keeps its constructor and becomes a thin owner
  of the `plugin` and `languages` blocks over `ApimaticConfigContext` on the
  same directory: `getPluginConfigState()`, `upsertMetadata()`,
  `upsertLanguage()` keep their signatures and results, and the JSON-level
  checks it duplicated are gone. `PluginConfig` is unchanged; it is
  constructed from `{ ...plugin, languages }`, which is the shape it already
  reads. `present` keeps meaning "the document parsed with nothing wrong in the
  plugin's blocks", never "the `plugin` block is there": a document without one
  is `present` carrying an identity-less config, which is what `sdk publish`
  alone has always written and what `hasMetadata()`, `getRelease()` and
  `PluginRecordSdkAction`'s `configExisted` already read correctly. Keying the
  state on the block instead would silence the codegen-version guard for every
  project that publishes SDKs before it builds a plugin.
- `PluginConfigData` splits into `PluginIdentityData` (the `plugin` block, with
  the index signature) and the existing `PluginLanguages`; `PluginConfigData`
  is the two together, which `PluginConfig` judges. `PLUGIN_ID_PATTERN`
  moves to `types/plugin/plugin-config.ts` so the document can use it without
  reaching into the context.
- `PortalSourceContext` keeps its constructor and reads the document through
  `ApimaticConfigContext` on the same directory. `resolve()` returns the same
  `PortalSource`; `PortalSourceProblem` gains nothing, since a missing `portal`
  block is an `invalidConfig`.
- `Directory.fileDescriptions` drops `portal.json` and gains `apimatic.json`.
  The quickstart tree is otherwise as today: the file sits in the `src/` it
  already walks.

Removed: `PortalConfig.parse` (string form), the `plugin-config.json` path and
its parser in `PluginConfigContext`.

## 6. Actions, commands, prompts

- No action or command signature changes. Every reader already holds `src/` —
  as `buildDirectory` on the plugin side, `sourceDirectory` on the portal side —
  and the file is there. `PluginGenerateAction` zips `src/` in place as today;
  `apimatic.json` travels in it and nothing is synthesized (section 2). Because
  it travels, that action asks the context to take a byte-order mark off the
  file before the zip, and fails with a message naming the file if it cannot:
  the mark this CLI reads past is one the service's own parser would meet. It
  runs after the guards, so a run that stops short of the zip — no metadata, no
  published SDKs — never rewrites anything.
- `PortalSourceContext.scaffold` writes the config through `ApimaticConfigContext`,
  so the path, the key order and the serializer are owned in one place rather
  than by a second `JSON.stringify` call. The directory is empty when it runs
  (section 4), so this is always a create. It still writes `spec/`,
  `content/index.md` and `content/nav.json`. This moves with the context in
  step 3, not later: once `resolve` demands a `portal` block, a `scaffold` still
  writing the old shape leaves quickstart serving nothing. It returns
  `Result<void, PortalScaffoldProblem>` rather than throwing: the merge reports a
  write fault as a value, and the file-service faults it always propagated are
  caught with it, so the wizard reports the failure instead of ending in an oclif
  stack. The problem is a variant per message, as `PortalSourceProblem` is, so the
  sentences stay in the prompts with the rest of the portal's wording.
- Quickstart's tree: unchanged code. `apimatic.json` shows in the `src/` walk
  with its description from `Directory.fileDescriptions`, and the heading
  "`src` directory containing source files created at `<input>`" stays true.
- `reportSourceProblem` keeps its one directory: every message it prints still
  names `src/`.
- The near-miss and unknown-field messages in `portal-config.ts` read
  `'x' is not a portal.json setting`. They become `'x' is not a 'portal'
  setting`, not `... an apimatic.json setting`: the field is unknown to the
  block, and the root is lenient (section 2).
- `types/flags-provider.ts` describes `-i` as "the parent directory containing
  the 'src' directory, which includes API specifications and configuration
  files". Still true; untouched.
- Prompt text and command descriptions: every `portal.json` and
  `plugin-config.json` becomes `apimatic.json`, and a `src/` that qualified it
  stays. Files: `prompts/portal/source.ts`, `prompts/portal/serve.ts`,
  `prompts/portal/quickstart.ts`, `prompts/plugin/generate.ts`,
  `prompts/plugin/publish.ts`, `prompts/plugin/record-metadata.ts`,
  `prompts/plugin/record-sdk.ts`, `prompts/sdk/publish/non-interactive.ts`,
  `commands/portal/generate.ts`, `commands/portal/serve.ts`,
  `commands/plugin/generate.ts`, `commands/sdk/publish.ts`, `types/build/build.ts`
  (comment), `types/portal/openapi-document.ts` (comment), `types/portal/portal-navigation.ts`
  (one user-facing message names `portal.json`'s `title`; it becomes `'portal.title' in apimatic.json`).
- The `PLUGIN_CONFIG_FILE` constant duplicated across four prompt files becomes
  the one `APIMATIC_CONFIG_FILE_NAME` the document module exports.
- `PortalQuickstartPrompts.nextSteps` points at the reference documentation
  page that documents `src/portal.json`; the copy on that page moves with the
  release, and the link is checked rather than assumed.

## 7. Tests

Existing files to move with the code, keeping every case:

- `test/types/portal/portal-config.test.ts` → block form; the JSON-level cases
  (`not valid JSON`, `must contain a JSON object`, the byte-order mark) are
  already in `test/types/apimatic-config/document.test.ts` (step 1), which also
  holds the `plugin` checks that stay `unreadable`.
- `test/types/plugin-config-context.test.ts` (step 2) → the same cases against
  `src/apimatic.json` in block shape, plus: a file holding only `portal` gets
  the plugin block written after it with `portal` untouched; a malformed
  `portal` block is read past by both the reader and the writer; unknown root
  keys and unknown `plugin` fields survive a write; the file's indentation
  survives a write; no `schemaVersion` is added on a merge; a `schemaVersion` of
  `2` is `unreadable` with the reason naming it. The byte-order-mark case
  inverts: a file that starts with one is now read, not reported `unreadable`
  (section 2), and the `reason` string goes with it. Field paths in reasons
  read `'plugin.pluginId'` and `'languages.csharp'`, like the portal's
  `'portal.title'`.
- `test/infrastructure/file-service.test.ts` (step 1) → `replaceContents`
  writes the content, leaves no temporary file behind on success, and removes
  it when the rename is made to throw, with the target untouched.
- `test/types/portal-source-context.test.ts` → new cases for `portal` absent
  reported as `'portal' is required` and nothing else, an unknown root key
  ignored, a malformed `languages` block not failing the resolve, `$schema`
  present and ignored, `schemaVersion` absent and `1` accepted.
- `test/actions/plugin/generate.test.ts` (step 2) → asserts the uploaded zip
  carries `apimatic.json` as written beside the build file, and nothing named
  `plugin-config.json`. The zip is read while the service stub runs, since its
  temporary directory is gone once the action returns.
- `test/actions/plugin/{publish,record-metadata,record-sdk}.test.ts` (step 2) →
  the config path and the block shapes. The one case in `record-sdk.test.ts`
  that starts without a file deep-equals the whole written document and gains
  `schemaVersion: 1`; the cases that start from a written file do not, since a
  merge adds nothing (section 2). `publish.test.ts` gains the case for a file
  with no `plugin` block at all, which is `pluginDetailsNotSet`, and one for a
  malformed `portal` block, which it publishes past.
- The scaffold cases in `test/types/portal-source-context.test.ts` → the file
  is `apimatic.json` holding `schemaVersion` and the `portal` block. There is no
  `test/actions/portal/quickstart.test.ts`, and the tree code does not change,
  so none is added.
- `test/infrastructure/services/plugin-service.test.ts` → unchanged; it
  asserts the server's `pluginConfig` error key, which the backend keeps.
- `test/resources/portal-inputs/default` → its `portal.json` becomes
  `apimatic.json` holding the `portal` block. The three tests that build on it
  (`test/actions/portal/generate.test.ts`, `test/actions/portal/serve.test.ts`,
  `test/e2e/portal-build.test.ts`) are otherwise untouched.
- `test-source/` is gitignored and untracked: a local scratch directory for
  manual runs, not a fixture. Nothing in the suite reads it, so it is not part
  of this change.

One new test guards the invariant that matters most: with an `apimatic.json`
whose `portal` block is invalid, `PluginRecordSdkAction` still records the
language and returns success.

## 8. Risks

- **The uploads change contents.** `src/` uploaded by `sdk generate` and
  `plugin generate` now carries `apimatic.json`, portal block included, and a
  project set up by this release no longer carries `portal.json` or
  `plugin-config.json`. The backend is being changed to read the new file
  (section 2); this PR merges after it has. A project upgraded from 1.5 still
  carries a `plugin-config.json` the server no longer reads, which section 9
  leaves in place.
- **Users on 1.5.x with a `src/plugin-config.json`.** After upgrading, `plugin
  generate` prompts for identity again and `sdk publish` starts a fresh
  `languages` block; the old file is neither read nor deleted, and the CLI
  says nothing about it. The re-prompt can mint a different `pluginId` from the
  one already published, which the user has to notice themselves. This is the
  breaking change of the move and it ships in a major (section 2), carried by
  the release notes.
- **`dev` merged into `main` mid-series.** Until 2026-09-23 nothing on `dev`
  carried a `BREAKING CHANGE:` footer — #343 removed the 1.x portal with an
  empty commit body — so a merge before the last PR would have shipped the
  whole line as 1.6.0. #347 (`build!:`, Node 24) now carries one, so the version
  is 2.0.0 either way; what a mid-series merge would still ship is the
  half-moved portal, with the Fumadocs portal and this move unnamed in the
  notes. The release row in section 2 is the guard; the PR description repeats
  it.
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
in silence, the same way the 1.x build file is; it still rides in the uploads,
where the server no longer reads it. `src/portal.json` is not a legacy file: no
released CLI wrote one (section 2), so only a directory built from `dev` holds
one, and it gets no rule either. The release notes name the move from
`APIMATIC-BUILD.json`'s portal settings and from `src/plugin-config.json` into
the `portal`, `plugin` and `languages` blocks. The alternatives considered were
a one-line hint in the two "file missing" messages, and an import on first
write; both were declined so that the CLI carries no migration code for the
major.

## 10. Documentation and neighbours

- `README.md`: the hand-written "Upgrading from 1.x" section is rewritten to
  name `src/apimatic.json` and its `portal` block directly; `src/portal.json`
  never shipped and does not appear in it. Everything else the plan touches
  there — the `plugin generate` description, the `portal generate`/`serve`
  descriptions, the `--update-plugin-config` line — sits inside oclif's
  generated command blocks, so it is not edited by hand: the README is
  regenerated once the command and flag strings change, and the regeneration is
  part of step 7.
- *(Superseded 2026-09-23: `.ai/plans/portal-config.md` was rewritten for
  `apimatic.json` and is implemented; its schema covers the whole file and its
  `portal` block is the nested one. The bullet below is kept as it was.)*
  `.ai/plans/portal-config.md`: the schema file becomes `apimatic.schema.json`
  with the `portal` block as one definition; `$schema` URL follows. The
  scaffold section writes `src/apimatic.json`. Its `sdks.languages` is dropped
  and its "Rejected: top-level `languages`" entry reversed: the portal derives
  its language list from the shared top-level `languages` block, which is the
  one reading under which section 1's "the two halves can never disagree about
  which SDKs a project has" is true. That plan's required-key set loses its
  only required path, so `portal.title` becomes the only one until the series'
  last PR makes a `languages` entry required for `portal generate` (section 1).
  `.ai/plans/fumadocs-portal.md`
  input-layout row and `.ai/plans/portal-navigation.md` mentions of
  `portal.json`.
- `.ai/skills/context.md` if it cites `PluginConfigContext` or
  `PortalSourceContext` as examples.
- `sample-docs-as-code-portal` v2 branch: `src/portal.json` → `src/apimatic.json`,
  and the quickstart URLs noted in memory.
- Release notes: the move from `APIMATIC-BUILD.json`'s portal settings and
  `src/plugin-config.json`, the leftover-file line for `src/plugin-config.json`,
  and that the server now reads `apimatic.json`. Drafted in this PR; shipped by
  the last PR's footer (section 2).

## 11. Decisions taken 2026-09-22

Asked and answered before implementation started; recorded in the table in
section 2.

1. Legacy-file message: none.
2. `--update-plugin-config`: name kept, description updated.
3. SDK generation upload: assumed to ignore the two files; stated in the PR.
   **Superseded by 26**: the server reads the new file.
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
    without reopening the writer. In the code the writer takes the blocks the
    caller is about to write, so it knows which findings refuse the write
    without knowing what any block means.
17. Steps 2 and 3 are one step. **Moot after 26**: with nothing synthesized,
    the plugin side is one step on its own.
18. `src/portal.json` is not a legacy file. Section 9, the README section and
    the notes describe the break users meet: the `APIMATIC-BUILD.json` portal
    and `src/plugin-config.json`.
19. The document type lives in `src/types/apimatic-config/`; only the context
    is flat in `src/types/`.
20. The atomic write is a `FileService` method with its own test, and removes
    its temporary file when the rename fails.
21. Quickstart's tree gets a prompt test; the earlier claim that prompt tests
    already cover it was false. **Moot after 26**: the tree code does not
    change.

Taken after a third pass over the rewritten plan, same date:

22. `scaffold` moves with `PortalSourceContext` in step 3. Once the context
    reads `apimatic.json`, `resolve` demands a `portal` block, so a scaffold
    still writing the old shape would leave quickstart serving nothing between
    steps, with no test to say so.
23. Quickstart builds the root tree node itself. **Moot after 26**: the file
    sits in the `src/` the tree already walks.
24. The upload synthesis is a `PluginConfigContext` method. **Superseded by
    26**: nothing is synthesized.
25. A block a caller adds is appended after the last key. Section 3's order is
    what a file created whole looks like, not a rule the writer enforces.

Taken from the user during step 2, same date:

26. `apimatic.json` lives in `src/`, not at the input root. `plugin generate`
    zips `src/` as it stands, the backend reads `plugin` and `languages` from
    the `apimatic.json` in the zip and is changed alongside this PR, which
    merges only once it has. No `plugin-config.json` is synthesized, no
    `portal.json` either, and no backward compatibility of any kind is kept.
    Flips the Location row's first choice; removes the input-directory
    threading, the root tree node and the synthesis from the steps.

## 12. Implementation steps

Each step leaves build, lint on touched files, and the affected tests green.
Stop after each for a review; the user lifted the go-ahead and commit gates for
this series on 2026-09-22, so each step is reviewed, committed and pushed
before the next begins, and a question is asked only when a decision is
genuinely the user's.

1. **Document, context and the write primitive.** Done, `fcf93ff`. Add
   `ApimaticConfigDocument`, `ApimaticConfigContext` and
   `FileService.replaceContents`, each with tests. Nothing uses them yet.
2. **Plugin side.** Done, `c9cfa13`. Re-seat `PluginConfigContext` over the new context on the
   same `src/`; delete the JSON-level checks it duplicated; split
   `PluginIdentityData` out and move `PLUGIN_ID_PATTERN` beside it; update
   `plugin-config-context.test.ts` to the block shapes. No signature changes
   anywhere. The four action tests get the new path and shapes, the `generate`
   test its upload assertion, and the one whole-document case in
   `record-sdk.test.ts` its `schemaVersion`. Actions and prompts still say
   `plugin-config.json` at this point but the file is `apimatic.json`.
3. **Portal side.** Done, `cd49f6a`. `PortalConfig.fromBlock`, `PortalSourceContext` reading and
   scaffolding through `ApimaticConfigContext` (`{ schemaVersion, portal }`),
   the new source-context cases, the fixture's `portal.json` → `apimatic.json`,
   and `Directory.fileDescriptions`. Nothing here can be deferred: the portal
   is broken from the moment `resolve` reads the new file until `scaffold`
   writes it, and no quickstart test would say so (section 11, decision 22).
4. **Wiring.** Done, `64c3592`. Every remaining prompt string and command description, the
   near-miss message wording, the shared file-name constant, and the quickstart
   closing note.
5. **Invariant test** from section 7: an invalid `portal` block does not stop
   `PluginRecordSdkAction` from recording a language. Done in the commit after
   step 4.
6. **Docs and release.** Done in the commit after step 5. README, plans, skills, the release note draft naming
   the move from `APIMATIC-BUILD.json`'s portal settings and
   `src/plugin-config.json` into the three blocks, and the PR description's
   note that the backend must read `apimatic.json` before this merges and its
   reminder that `dev` is not merged into `main` before the series ends. This
   commit is an ordinary `feat:`; the `BREAKING CHANGE:` footer belongs to the
   last PR of the series (section 2). The sample repository is a separate PR in
   its own repo.

## 13. Drafts for the last PR of the series

Kept here so the PR that carries the footer has them to hand. Both describe the
whole series, not this PR alone.

### Release notes

**Breaking changes**

- `src/plugin-config.json` is no longer read or written. What it held lives in
  `src/apimatic.json`: the context plugin's identity in the `plugin` block, the
  SDKs you have published in the `languages` block. After upgrading, run
  `apimatic sdk publish` for each SDK and `apimatic plugin generate` once to
  record them again, then delete the old file. The server reads `apimatic.json`
  from the uploaded `src/`.
- The documentation portal is described by the `portal` block of
  `src/apimatic.json` — `site`, `brand`, `navigation` and `ai` (amended
  2026-09-23, when it listed the flat `dev` keys, and 2026-09-24, when it listed
  the `home`, `api` and `advanced` namespaces the first release cut; see
  `.ai/plans/portal-config.md` section 15) — and needs at
  least one entry in the file's `languages` block;
  `APIMATIC-BUILD.json` no longer configures it. `apimatic quickstart` scaffolds
  the file. Portals are built on your machine from `src/spec/`, `src/content/`
  and `src/static/`.
- `portal toc new`, `portal recipe new` and `portal copilot` are removed, and
  `portal serve` no longer takes `--destination` or `--no-reload`. Run
  `apimatic autocomplete --refresh-cache` to drop them from shell completion.

**Footer** for the squash commit and the PR description:

```
BREAKING CHANGE: `src/plugin-config.json` is replaced by the `plugin` and
`languages` blocks of `src/apimatic.json`, and the portal is configured by its
`portal` block instead of `APIMATIC-BUILD.json`. `portal toc new`,
`portal recipe new` and `portal copilot` are removed.
```

### PR description for this PR

> One file, `src/apimatic.json`, replaces `src/portal.json` and
> `src/plugin-config.json`. It holds `portal`, `plugin` and `languages`; the
> portal reads the first, the plugin commands the other two, and a malformed
> block one command owns never stops another. The writer keeps key order,
> indentation and the trailing newline, and writes atomically.
>
> **Merge only once the backend reads `plugin` and `languages` from the
> `apimatic.json` inside the uploaded `src/`.** Nothing is synthesized for it
> and no compatibility is kept; a project with an old `plugin-config.json`
> records its SDKs and identity again.
>
> **Do not merge `dev` into `main` until the series ends.** `dev` already
> carries a breaking marker (#347, Node 24), so its next release is 2.0.0
> whatever this PR does; the reason to wait is that a half-finished series
> would ship, with `src/portal.json` gone and `quickstart` not yet adopting an
> existing `apimatic.json`. This commit is an ordinary `feat:`; the
> `BREAKING CHANGE:` footer that describes the config move rides on the last PR.
>
> First of a series: next, quickstart adopts a directory that already holds an
> `apimatic.json`; then `portal generate` and `plugin generate` require a
> `languages` entry.
