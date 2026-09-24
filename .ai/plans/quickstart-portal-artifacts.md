# Plan: quickstart and the portal build come from `/portal-artifacts`

Written 2026-09-24, against codegen-v2 [#489](https://github.com/apimatic/codegen-v2/pull/489)
on the assumption it merges into `GA-dev-branch` as written, and on top of
[#352](https://github.com/apimatic/apimatic-cli/pull/352), which already built the half of this
that renders code samples.

Decisions in §2 were settled 2026-09-24. §5 is what is left open.

---

## 1. What the server gives us

`POST /portal-artifacts` is the initiate/poll/download triple the CLI already speaks:

| | |
|---|---|
| Initiate | `POST /portal-artifacts`, multipart, field `file` = the zipped `src/` |
| Poll | `GET /portal-artifacts/{id}/status` |
| Download | `GET /portal-artifacts/{id}/download` |

One zip back, `portal-artifacts.zip`:

```
sdk/<language>.zip            one per language declared in apimatic.json
code-samples/<language>.json  per language whose stack renders a catalog
plugin.zip                    only when apimatic.json carries a `plugin` block
```

From #489's plan, the facts that shape our side:

- **A `plugin` block in `apimatic.json` is the opt-in** (§3.6). There is no `contextPlugins`
  flag — the one in `QUICKSTART-FLOW.md` was specified against `portal.json`, which #348 deleted.
  Writing the block *is* how we ask for a plugin.
- **One link, one zip** (§3.1). No second download for the plugin.
- **All or nothing** (§3.5). Any language lane failing, or the plugin failing, means no zip;
  failures come back keyed by language plus `plugin`.
- **The server budget is 25 minutes** (§3.4). Ours must be longer.
- **A bundled language ships twice** (§3.1) — as `sdk/<lang>.zip` and again expanded inside
  `plugin.zip`. A three-language unpublished project roughly doubles the download.
- **The subscription gate reads `x-subscription-features`** — injected by the gateway, so
  nothing for us to send (§2.3).

## 2. What we decided

### 2.1 Every command that builds a portal calls the endpoint, once per invocation

`quickstart`, `portal generate` and `portal serve` all call it. Artifacts are never cached:
each run downloads a fresh bundle into a temp directory and builds from it.

This is affordable because `generate()` is called **once, before the dev server starts** —
`serve.ts:68`, outside `withBuildDirectory`. Hot reload is the dev server watching the prepared
project; it does not re-enter the action. So the cost is startup time per `portal serve`, not
per file change.

**Name the cost plainly:** `portal serve` on a three-language project goes from seconds to
minutes to first paint. The refinement that does not contradict the decision is to skip the call
entirely when `apimatic.json` declares no languages *and* no plugin — a docs-only portal then
starts as fast as it does today, because there is nothing to generate.

### 2.2 `PortalArtifactsService.generate()` is the only thing that changes

#352 already built the bridge and left the seam. Today:

```ts
// Stands in for a call to `/api/portal-artifacts` until that endpoint exists.
public async generate(): Promise<Result<CodeSamples, ServiceError>> {
  const samplesPath = process.env.APIMATIC_CODE_SAMPLES_PATH;
  ...
}
```

Everything downstream — `CodeSampleCatalog.fromJson`, `PortalProjectService.addCodeSamples`
writing `x-apimatic-codeSamples` onto a *copy* of each spec, the template's example selector and
per-language tabs — stays exactly as merged. The env var goes.

**The return type widens.** It returns samples alone today; it must now also yield the SDK zips
and the plugin. Proposed:

```ts
public async generate(build: FilePath, into: DirectoryPath): Promise<Result<PortalArtifacts, ServiceError>>

class PortalArtifacts {
  readonly codeSamples: CodeSamples;
  readonly sdks: ReadonlyMap<Language, FilePath>;   // unpacked from sdk/<lang>.zip
  readonly plugin: DirectoryPath | undefined;       // expanded from plugin.zip
}
```

`into` is the caller's temp directory, which all three callers already have.

### 2.3 Auth and the subscription gate

The gateway injects `x-subscription-features`; we send only the auth key, as `PluginService`
does. This is what lets §2.5 delete the account lookup — quickstart no longer needs to know the
subscription to decide anything.

A `403` still has to be readable: it names the feature (`portal`, `plugin`), not the header.

### 2.4 Where the artifacts land

| Entry | Goes to |
|---|---|
| `code-samples/<lang>.json` | nowhere on disk — read into `CodeSamples`, merged into the build copy of the spec |
| `sdk/<lang>.zip` | `src/static/`, one per language, as they arrive |
| `plugin.zip` | expanded to `./plugin`, **and** the zip copied to `src/static/plugin.zip` |

Per-language SDK zips, not one `sdk.zip`: a reader wanting the Python SDK should download the
Python SDK. The journey doc's singular was written when a run meant one language. The portal's
download page has to list one entry per language — that page does not exist yet, and this is the
contract it should be built against.

`./plugin` is what the What's next box installs from and what `plugin publish` reads.
`src/static/plugin.zip` is what the portal serves so the installer can take a public URL.

**All three commands do exactly this** — `quickstart`, `portal generate` and `portal serve`
alike. One placement path, nothing to remember about which command leaves what behind, and a
preview always shows the same downloads the built portal will.

**Two consequences that follow, neither of them optional:**

1. **`portal serve` mutates the source tree.** A preview command now writes `src/static/*.zip`
   and expands `./plugin`. That is the accepted trade for one code path, but it means a serve on
   a clean checkout leaves a dirty one.
2. **So quickstart writes `.gitignore` entries** — `/plugin/` and the artifact paths under
   `src/static/`. `/plugin/` especially: `plugin publish` runs `git init -b main` *inside* that
   directory and pushes it as its own repository, so a parent repo tracking it would nest one
   repo inside another. Adopting an existing directory means appending to whatever `.gitignore`
   is there, never replacing it.

### 2.5 Quickstart becomes one funnel

`QuickstartAction.selectQuickstartFlow()` — "API Portal" or "SDK" — goes, and with it
`SdkQuickstartAction` (229 lines) and most of `prompts/sdk/quickstart.ts` (272). Anyone wanting
an SDK alone runs `apimatic sdk generate`, which the journey names as the power-user path.

The account lookup those carried goes too (§2.3).

What quickstart asks, per the journey doc: the spec path **only when the directory is empty**,
then the language multiselect. Nothing about plugins.

### 2.6 Language selection, and what it writes

A multiselect over `AVAILABLE_LANGUAGES`, every language pre-checked, with `UPCOMING_LANGUAGES`
named underneath — all three already exist from #359, wording included
(`Java, Ruby, Go and PHP are coming soon`).

It writes through `PluginConfigContext.requestLanguages()` from #351: each selected language
becomes an empty `{}` entry, which is the four-state contract's "asked for, nothing published
yet" — exactly what `/portal-artifacts` reads to decide its lanes.

### 2.7 The `plugin` block, written without asking

Per §3.6 this is the opt-in, so quickstart writes it or no plugin is generated.
`PluginRecordMetadataAction` writes this block today but prompts for all three fields, and the
journey allows no plugin questions. Quickstart derives:

- `pluginId` — the working directory's name, kebab-cased (the rule `plugin publish` already
  assumes, since it hands `pluginId` to `gh repo create`)
- `pluginName` — the directory name as typed
- `pluginVersion` — `0.1.0`

Put the derivation on `PluginConfigContext` so the prompting action keeps prompting and the rule
lives next to the write.

### 2.8 A failed run reports and stops

Failures arrive as `{ "csharp": ["SDK generation failed"], "plugin": ["skills generation failed"] }`
and nothing is delivered. Name every one of them and exit non-zero. No partial build, no
automatic re-run — the user can re-run having deselected the language, and that is a choice they
should make rather than one we make for them.

This matches the endpoint's own semantic; anything softer would have to be invented here.

---

## 3. The work

1. **`PortalArtifactsService.generate()`** — real call, widened return (§2.2). Model on
   `PluginService`: same auth resolution, same `pollUntilCompleted`, same `ServiceError`. The
   failure formatter renders the language/`plugin` map (§2.8). Timeout chosen against the
   server's 25 minutes, not copied from the plugin service.
2. **Unpacking and placement** — `sdk/*.zip` → `src/static/`, `plugin.zip` → `./plugin` and
   `src/static/`, samples → `CodeSamples` (§2.4).
3. **Quickstart collapse** — delete the flow question, `SdkQuickstartAction`, the SDK prompts and
   the account lookup (§2.5).
4. **Language multiselect** writing via `requestLanguages()` (§2.6).
5. **Derived plugin identity** (§2.7).
6. **The skip** when nothing is declared (§2.1).
7. **Output** — the `Generating artifacts` spinner, the preview-only warning (`previewOnly()`
   from #351), the What's next box.

## 4. Sequencing

1. #358 `feat/local-plugin-generation` → `dev` — the `apimatic.json` reader and writer
2. #352 `feat/code-samples-portal` → `dev` — the service seam and the whole sample path
3. #351 `feat/plugin-language-selection` — `requestLanguages()`, `previewOnly()`,
   `installPluginLocally()`
4. #359 `feat/journey-command-updates` — `AVAILABLE_LANGUAGES`, `UPCOMING_LANGUAGES`,
   `format.relative`
5. codegen-v2 #489 deployed to dev
6. This

## 5. Still open

### 5.1 The portal's SDK download page does not exist

§2.4 fixes the contract it will read — one zip per language under `static/`. Nobody is building
that page yet, so the files will sit there unreferenced until someone does.

### 5.2 First-paint time for `portal serve`

Accepted in §2.1, mitigated by the skip in the same section. Worth measuring once against a
real three-language project before anyone calls it fine.
