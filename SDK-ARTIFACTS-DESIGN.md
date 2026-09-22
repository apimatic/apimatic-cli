# Code samples in the portal — the `/api/sdk-artifacts` contract

**Status:** design settled, nothing implemented.
**Purpose:** the single place the CLI, apimatic-io and codegen-v2 agree on what crosses the
wire, so the Azure Function can be written from it. Every claim under
[Verified facts](#8-verified-facts) carries a `file:line` reference and can be re-checked.

---

## 1. Scope

**In scope.**

- The code-sample catalog: what codegen-v2 renders, how it is keyed, how it is packaged.
- `/api/sdk-artifacts`: the async endpoint that produces it, and the apimatic-io route
  that fronts it.
- The portal: how the CLI merges the catalog into the spec and how fumadocs renders it.

**Out of scope — named so nobody reads silence as omission.**

| Concern | Owner / when |
|---|---|
| `apimatic.json` itself — the file, its parser, the migration from `src/portal.json` | Another developer, later. This doc treats it as a fixed input. |
| Bundling the SDK inside the plugin; `languages.<lang>: {}` becoming valid | codegen-v2, separately (apimatic-io#2216 M1) |
| The `quickstart` rewrite and the v3 retirement | apimatic-io#2216 M3 |
| Subscription / entitlement enforcement on the new endpoint | Deliberately a **second PR** — see [D32](#d32) |
| `docs/<language>.json` (generated MDX pages) in the artifact zip | Future — the layout reserves room for it, see [§4.4](#44-response-the-artifact-zip) |
| `plugin/plugin.zip` in the artifact zip | Future — same |

---

## 2. Shape of the thing

```
apimatic {quickstart | portal generate | portal serve}
  │
  │  zip src/  ──────────────────────────────────▶  apimatic-io
  │                                                 POST api/sdk-artifacts
  │                                                   │  X-APIMatic-UserId / TenantId
  │                                                   ▼
  │                                                 codegen-v2
  │                                                 POST api/sdk-artifacts
  │                                                   │
  │                                                   ├─ ValidateSpecFile
  │                                                   ├─ ValidateApimaticConfig
  │                                                   ├─ fan out per language ──┐
  │                                                   │    GenerateSdk          │
  │                                                   │    GenerateCodeSamples  │
  │                                                   └─ AggregateSdkArtifacts ─┘
  │                                                        one zip
  │  poll ◀────── status ──────────────────────────────────┤
  │  download ◀── artifacts.zip ────────────────────────────┘
  │
  ├─ merge code-samples/<lang>.json into a COPY of the spec tree as x-codeSamples
  ├─ place sdk/<lang>.zip under the portal output's static assets
  └─ vite build (or vite dev) over the annotated copy ──▶ portal
```

**The portal build runs on the user's machine.** APIMatic's backend estate is .NET end to
end and has no Node build infrastructure; the CLI is already a Node program.

---

## 3. Decision log

Numbers are stable identifiers, so gaps are decisions that a later one replaced.

### Scope and transport

| # | Decision |
|---|---|
| D2 | **Samples-only payload; the CLI merges.** The server never returns a rewritten spec. The CLI already parses every spec file, and a Stripe-sized document is tens of MB to upload and download again for a few hundred KB of samples. |
| D3 | **The CLI uploads a build zip**, not a bare spec. D31 names the directory. |
| D5 | **Ship the samples codegen-v2 renders**, value-bearing where the stack supports it. |
| D6 | **No subscription language gate for now** — all of v4 is beta. Add the check when anything reaches stable. |
| D8 | **Raw axios in a dedicated service**, not a new `@apimatic/sdk` controller, until a v4 TypeScript SDK of apimatic-io exists. The precedent is already in the file we extend. |

### Wire format

| # | Decision |
|---|---|
| D9 | **The CLI synthesizes the zip**, with the language request carried by a config file inside it, mirroring how `plugin-config.json` drives the plugin flow. |
| D11 | **Key a sample on `path` + `method`.** That is the document's own addressing and is guaranteed to be present and to match; `operationId` is optional in OpenAPI and codegen-v2 synthesizes one when it is absent. |
| D12 | **Carry every declared example** on the wire, keyed by its OpenAPI `examples:` map key. |
| D13 | **Copy the spec tree into the temp project and annotate the copy.** Relative `$ref`s then keep resolving. See D20 for refs that escape `src/spec/`. |
| D16 | **One `<language>.json` per language in the artifact zip**; a language that yields nothing is omitted entirely. |
| D17 | The Func wiring is the critical path and is what this document specifies. |
| D18 | **One `x-codeSamples` array entry per (language × example).** Upstream `fumadocs-openapi` gives each entry its own `lang` and `label`, so every example gets a tab with no fork and no patch. |
| D19 | **Tab order: curl first, then languages in configured order, examples in catalog order** — and all tabs of one language stay adjacent: `curl, TypeScript · minimal, TypeScript · full, C# · minimal, …`. |
| D20 | **A spec with an escaping `$ref` falls back to its original file** and loses only its samples. Name the affected files in the warning; do not enumerate individual refs. |
| D21 | **One display map, nothing else, is per-language knowledge in the CLI.** `LANGUAGE_CHOICES` already is that map. No title-casing logic. |
| D22 | **Reuse codegen-v2's status vocabulary verbatim.** The CLI's poller then needs no change. |
| D24 | **Webhooks stay curl-only.** The wire format reserves the space now — see D33. |
| D26 | **The endpoint is `/api/sdk-artifacts`**, an all-or-nothing async orchestrator in codegen-v2 that takes a build directory and returns one zip of artifacts. The thing that crosses the wire is a **code-sample catalog**. |

### Build input, artifacts and budgets

<a id="d27"></a>

| # | Decision |
|---|---|
| D27 | **All three commands generate fresh artifacts on every run** — `quickstart`, `portal generate` and `portal serve` alike, as the CLI has always done. There is no cache and no skip flag. |
| D28 | **A failed call fails the command.** No curl-only fallback. `languages` must name at least one language, so a docs-only user still generates SDKs for every language they enabled; a user with a `plugin` property gets plugins too. |
| D29 | **`apimatic.json` lives inside `src/`.** Today's `src/portal.json` becomes the `portal` property inside it. |
| D30 | **Absent `languages` is a validation error.** Curl-only portals may be allowed later; they are not allowed now. |
| D31 | **`src/` *is* the build directory**, zipped exactly the way the SDK and plugin flows zip theirs. codegen-v2 learns to read `apimatic.json`. |
| D32 | <a id="d32"></a>**Entitlement keys off field presence**: a `plugin` property means the context-plugin check applies, a `portal` property means the docs-as-code check applies. `apimatic.json` always exists; `plugin` is optional. **Ship in two PRs** — the endpoint without any subscription check first, so dev-environment iteration is not blocked, then the checks. |
| D33 | **Artifact zip layout as in [§4.4](#44-response-the-artifact-zip)**, with `plugin/` and `docs/` reserved for later. |
| D34 | **Func budget 25 min, CLI budget 30 min, poll interval 5s.** The client must always outlive the server, or it reports failures the server never had. |
| D35 | <a id="d35"></a>**Artifacts are never written back into `src/`.** Everything the CLI unpacks lands in the built portal's output directory — `static/` inside it for the SDK zips — which `portal generate` already forces to sit outside the source tree. |

---

## 4. The wire contract

This section is the Func's specification. Everything in it is a statement about bytes on
the wire, not about implementation.

### 4.1 Routes

**codegen-v2** — three functions, mirroring the two trios that exist today. Routes carry no
`api/` prefix in the attribute; the Functions host adds it.

```
POST api/sdk-artifacts                 -> 202 { id }        multipart/form-data, file part `file`
GET  api/sdk-artifacts/{id}/status     -> 200 { status, errors? }
GET  api/sdk-artifacts/{id}/download   -> 200 application/zip
```

No query parameters. The language request travels inside the zip ([§4.2](#42-request-the-build-zip)).
Return **202** on accept, matching the plugin trio; the SDK trio's 200 is the odd one out.

**apimatic-io** — a fronting controller shaped like `ContextPluginApiController`, because
the CLI cannot call codegen-v2 directly: its triggers are `AuthorizationLevel.Anonymous`
and trust `X-APIMatic-*` headers that only apimatic-io may set.

```
POST api/sdk-artifacts                 -> 202 { id, links: { status, download } }
GET  api/sdk-artifacts/{id}/status     -> 200 { status, errors? }  |  302 -> download
GET  api/sdk-artifacts/{id}/download   -> 200 application/zip
```

Three details are load-bearing and all three already exist:

- **Completion is a redirect.** The v2 SDK status route answers a finished generation with
  a 302 to the download URL rather than `{status:"Completed"}`, and the CLI already handles
  exactly that (`maxRedirects: 0`, 302 → `Completed`). Copy it; do not invent a third shape.
- **Errors ride on `Failed`.** The plugin status handler populates `errors` for `Failed`;
  the SDK one does not. Follow the plugin.
- **Put `[RouteDataGuidValidator]` on the status route as well as download.** The plugin
  controller does; the SDK controller forgets to on status.

### 4.2 Request: the build zip

The CLI zips the contents of the project's `src/` directory, exactly as the SDK and plugin
flows zip their build directories, and posts it as the multipart `file` part.

```
<zip root>/
  apimatic.json          ← the language request and the artifact request
  spec/                  ← one or more OpenAPI documents
  content/               ← portal Markdown (ignored by codegen-v2)
  static/                ← portal assets   (ignored by codegen-v2)
```

This lands where codegen-v2 already looks: it extracts to `extract/`, reads specs from
`extract/spec`, and reads its config file from the extract root — which is where
`apimatic.json` naturally ends up when `src/` is zipped with its contents at the root.
`src/` is input only ([D35](#d35)), so the upload is the same size on the tenth run as on
the first.

`apimatic.json`, as far as this endpoint is concerned:

```jsonc
{
  "languages": ["typescript", "csharp", "python"],  // >= 1, from the Language enum
  "portal":  { /* today's portal.json */ },          // presence => docs-as-code entitlement applies
  "plugin":  { /* today's plugin-config.json */ }    // optional; presence => generate a plugin
}
```

`languages` is the whole of the language request. `ValidateApimaticConfig` rejects an
absent or empty array, and rejects a name outside the enum by naming the valid set.

### 4.3 Status

The token set is **closed**. Emit only what `GenerationStatus` already defines:

```
Queued  ExecutionStarted  GeneratingArtifacts  Completed  Failed  ValidationError  Unknown
```

Map every intermediate step — the whole fan-out included — onto `GeneratingArtifacts`.
The CLI's poller treats any token it does not recognise as healthy and keeps polling to its
deadline, so **a token outside this set costs the user a 30-minute hang, not an error**.

Budgets ([D34](#d27)): orchestrator 25 minutes, CLI 30 minutes, poll every 5 seconds.
The gap is deliberate — a run finishing at 29:50 against a 30-minute client budget is
reported to the user as a platform fault that never happened.

> ⚠️ apimatic-io's HTTP client to codegen-v2 has a **4-minute** timeout, and it re-reads the
> uploaded zip from disk and re-uploads it rather than streaming through, so a large build
> directory crosses the wire twice inside those four minutes. The POST must return 202
> immediately and do no work inline.

### 4.4 Response: the artifact zip

```
sdk/<language>.zip             ← one per language that generated an SDK
code-samples/<language>.json   ← one per language that rendered a non-empty catalog
plugin/plugin.zip              ← RESERVED, not in the first cut
docs/<language>.json           ← RESERVED, not in the first cut
```

**A language that produces nothing is omitted entirely rather than written empty.** That is
what makes a new language stack cost the CLI zero: the CLI renders whatever files it finds,
so the day C# and Python ship, no CLI release is needed.

`docs/<language>.json` is reserved for generated MDX page content, keyed by page —
`{"getting-started": "..."}`. The consumer must therefore treat unknown top-level folders
in the zip as ignorable, and must not fail on them.

### 4.5 The code-sample catalog

One file per language. Language is the artifact boundary — the catalog hangs off the
per-language blueprint, so there is deliberately no language field inside the file.

```jsonc
{
  "paths": {
    "/payments/{paymentId}": {
      "POST": {
        "minimal": "const response = await client.payments.create(...)",
        "full":    "const response = await client.payments.create(...)"
      }
    },
    "/health": { "GET": { "Example": "await client.ping()" } }
  },
  "webhooks": {}
}
```

Rules, all of which the consumer depends on:

- **Path is the template verbatim, with its leading slash**, exactly as the document writes
  it. **Method is uppercase.**
- **The example id is the OpenAPI `examples:` map key** — an author-written name, so tab
  captions read `minimal` / `full` rather than `example1`.
- **`"Example"` is a reserved sentinel**, not a real id. An operation's id set is the union
  of its members' declared example names; a position the spec left silent carries the name
  `"Example"`. It is filtered out, and stands in only when the union would otherwise be
  empty. **The CLI must never render it as a caption.**
- **Code is raw and unfenced.** The consumer wraps it in whatever it writes into.
- **Declaration order is authorial intent and is preserved.** Do not sort.
- **`webhooks` is emitted, empty, from day one.** Webhook operations get no samples
  ([D24](#wire-format)) — but the key exists so that adding them later is not a breaking
  change. This is the one-line decision that is very expensive to retrofit: OpenAPI 3.1's
  `webhooks` map is keyed by *name*, not by path, so a bare path map has nowhere to put a
  webhook sample without overloading the path key.

### 4.6 Determinism

Three rules the orchestrator must hold, all of which are ways to get burned by
`Task.WhenAll`:

1. **Return failures, do not throw them.** `Task.WhenAll` surfaces one exception and
   abandons the other results, so a three-language run would report one failure and
   silently lose two. Each fan-out activity returns a Result; the orchestrator keys
   failures by language.
2. **Order the fan-out, not the results.** `Task.WhenAll` returns results in the order the
   tasks were handed to it, never completion order. The aggregation activity must be
   *handed* its input blob names and must never discover them by listing storage.
3. **All-or-nothing.** If any lane failed, aggregation does not run and the call fails with
   one error. A half-populated zip would leave the portal advertising an SDK that is not
   there.

---

## 5. codegen-v2 — what is new

### 5.1 Activity graph

| Activity | State |
|---|---|
| `ValidateSpecFile` | exists — writes the parsed SDL every downstream activity reads |
| `ValidateApimaticConfig` | **new** — `ValidatePluginConfig` is the template; reads `apimatic.json` instead |
| `GenerateSdk` × N | exists — fan out, one activity per selected language |
| `GenerateCodeSamples` × N | **new** — same parsed SDL, `RenderCodeSamples()` per language |
| `AggregateSdkArtifacts` | **new** — assemble the zip of [§4.4](#44-response-the-artifact-zip) |
| `PostGeneration` | exists — needs a third `GenerationOperation` variant |

Records only, for everything passed to and from an activity.

`GenerationOperation` is a closed two-member enum today (`Sdk`, `Plugin`); each member owns
a callback event name, a download link and its tracking events. A third variant must supply
all three.

### 5.2 Four things with no precedent in the repo

None of these can be lifted from an existing orchestrator — they are the reasons this
endpoint is more than a copy of one.

1. **Per-language fan-out.** The plugin orchestrator's `Task.WhenAll` has exactly **two**
   lanes — V4 skills and V3 skills — and each lane loops languages *inside* one activity.
   A genuine per-language fan-out is new.
2. **Result-returning generation activities.** Only the three *validation* activities carry
   `IsSuccess`/`Errors`. `GenerateSdk` and `GenerateV4Skills` return bare `Unit` and throw.
   Determinism rule 1 therefore has nothing to copy.
3. **Retries.** There is **no** Durable retry policy anywhere in the codebase — no
   `TaskOptions`, no `TaskRetryOptions`, no `RetryPolicy`, and no `retryOptions` in
   `host.json`. The agreed policy (exponential backoff in powers of 2, else linear 10s;
   max 4 retries) is a first. **Retries require retry-safe activities**: an activity whose
   stale state is not cleaned up before the retried attempt starts can produce a run that
   never finishes.
4. **Concurrency.** `host.json` pins both `maxConcurrentActivityFunctions` and
   `maxConcurrentOrchestratorFunctions` to **1**, so a three-language fan-out buys no
   wall-clock on one host instance — the lanes queue and run one at a time. What it does
   buy is per-language isolation, per-language errors and one activity per language in the
   durable history. Whether this orchestrator raises those limits sets the timeout budget,
   and the budget in [§4.3](#43-status) assumes it does not.

### 5.3 Language capability

`CanGenerateSdk` is true for **C#, TypeScript and Python** only. Java, PHP, Ruby and Go
throw `NoSdkGenerator()` from `CreateBlueprint`; Go cannot even be a plugin language. So a
`languages` array is validated against `CanGenerateSdk`, not against the seven-member enum.

---

## 6. apimatic-io — what is new

Very little. The fronting layer keeps **no record** of a generation: `/api/sdk/v2` and
`/api/plugin` pass codegen-v2's own id straight back, wrapped with apimatic-io's URLs.
No Hangfire, no DB row.

1. A controller — `[WebApiAuthorize]`, `[RoutePrefix("api/sdk-artifacts")]` — validating
   the multipart `file` part the way both existing controllers do (presence, non-zero
   length, content-type in `application/zip` / `x-zip-compressed` / `octet-stream`). No
   `language` or `stability` form field: the zip carries the request.
2. Three methods on `CodegenV2ApiService`, alongside the seven already there, adding
   `X-APIMatic-UserId` / `X-APIMatic-TenantId` via `HttpRequestMessageFactory` and
   forwarding `X-APIMatic-CallbackUrl` when the inbound request carries one.
3. Download re-wrapped as `FileStreamResult` — a direct stream pass-through, no
   re-packaging, no size limit. Unchanged from the SDK path.

**Entitlement, PR 2** ([D32](#d32)). Today `/api/sdk/v2` checks *no* entitlement at all —
only a hard-coded `CodeGeneratorVersion.V4.AvailableLanguages` allowlist — while
`/api/plugin` gates on `CanGenerateContextPlugin` → `IsCursorIntegrationAllowed`. The new
route gates on field presence: `plugin` present → the context-plugin check; `portal`
present → `CanGenerateOnPremPortal`.

> ⚠️ apimatic-io#2216 quotes a message for the latter that does not exist. The real one is
> *"Docs as code is not allowed on your subscription"*.

Checks run at generate time only, never on status or download — the existing comment in
`GetContextPluginStatusCommandHandler` states that rule explicitly.

---

## 7. CLI — what is new

### 7.1 Where the code goes

Following the 5-layer stack in `.ai/instructions.md`:

| Concern | Layer | Proposed |
|---|---|---|
| Call the endpoint, poll, download | Infrastructure service | `SdkArtifactsService` (`services/sdk-artifacts-service.ts`), axios-auth variant |
| Parse `code-samples/<lang>.json` | Types (value object) | `CodeSampleCatalog` |
| The downloaded zip as a thing | Types (value object) | `SdkArtifacts` — `catalogs()`, `sdkZips()`, ignores unknown folders |
| Inject `x-codeSamples` | Application | pure: `(document, catalogs, languageOrder) -> document` |
| Detect escaping `$ref`s | Application | pure: `(document, specRoot) -> FileName[]` |
| Copy + annotate the spec tree, repoint slugs | Infrastructure | `PortalProjectService` |
| Place `sdk/<lang>.zip` in the built site | Infrastructure | `PortalContext` — it already owns the output directory ([D35](#d35)) |
| Poll loop | — | **reuse** `pollUntilCompleted`; [D22](#wire-format) makes it a no-change |

Injection belongs in `src/application/` as a pure function: it has the most edge cases and
most needs tests that touch neither network nor filesystem. That directory is currently
empty — this is what brings it back.

### 7.2 Merging the catalog into the spec

`PortalProjectService.prepare()` already writes `portal.config.json` with a `specs` map of
slug → **absolute path**, and each slug is independent. That is the whole seam:

1. Copy `src/spec/` into the temp project ([D13](#wire-format)).
2. For each spec, walk `paths` and inject `x-codeSamples` from each language's catalog.
3. Point that slug at the annotated copy.
4. For a spec with a `$ref` escaping `src/spec/`, **skip steps 1–3 and point the slug at
   the original file** ([D20](#wire-format)). It then builds exactly as it does today and
   loses only its samples.

The walk needs no library. `document.paths` is a flat map; the traps are that a path item
carries non-method keys (`summary`, `description`, `servers`, `parameters`) and that a
whole path item can itself be a `$ref`, in which case there is no inline operation to
annotate. Every library that does this walk also *normalizes* the document — upgrades
3.0 → 3.1, rewrites refs, drops unrecognised keys — which for a docs portal is actively
harmful: the customer's document is what must render.

Escaping-ref detection is a scan of `$ref` string values: skip `#/...` (internal) and URLs
(which resolve identically from anywhere), resolve the rest against the file's directory,
test containment in `src/spec/`.

### 7.3 Rendering the tabs

```jsonc
"x-codeSamples": [
  { "lang": "typescript", "label": "TypeScript · minimal", "source": "..." },
  { "lang": "typescript", "label": "TypeScript · full",    "source": "..." },
  { "lang": "csharp",     "label": "C# · minimal",         "source": "..." }
]
```

- `lang` is the `Language` enum value verbatim. It is simultaneously the catalog filename,
  the `x-codeSamples` language and the Shiki grammar key — one token, three uses, no
  mapping table.
- `label` comes from `LANGUAGE_CHOICES`, suffixed ` · <exampleId>` **only when the
  operation declares more than one id**. When the id set is just the `"Example"` sentinel,
  the label is the bare language name.
- Order: curl, then languages in configured order, examples in catalog order, all tabs of
  one language adjacent ([D19](#wire-format)).

Nothing in the portal template needs to change. `api-page.tsx` registers curl alone and its
comment already names `x-codeSamples` as the source of the other tabs, and
`shiki-bundle.ts` already bundles grammars for **all seven** CLI languages, keyed by the
same enum values.

### 7.4 Command behaviour

Every run generates fresh artifacts ([D27](#d27)), and a failure fails the command
([D28](#build-input-artifacts-and-budgets)) — for `portal generate`, nothing is written; for
`portal serve`, the dev server never starts.

Generation is **startup-only**, and that is free rather than enforced: the CLI has no file
watcher of its own, `prepare()` runs exactly once per command, and `vite dev` owns reload.
`portal serve`'s own help text already tells the user that structural edits need a restart.

---

## 8. Verified facts

Read from source on 2026-09-22. CLI facts are on `feat/code-samples-portal` (= `dev` at
`073d09a`); codegen-v2 and apimatic-io from their working trees.

### 8.1 CLI

| Fact | Where |
|---|---|
| Config is `portal.json` **inside `src/`**; five fields: `title`, `description`, `logo`, `siteUrl`, `aiPageActions` | `src/types/portal-source-context.ts:46-48`, `src/types/portal/portal-config.ts:5-11,29` |
| `PortalConfig.parse` collects **all** field errors at once, plus unknown-field "did you mean" hints | `portal-config.ts:64-91,106-115`; renames at `:33-38` |
| `PortalSourceProblem` variants: `missingConfig` (carries a `PortalMigration` hint), `invalidConfig`, `unreadableSpec`, `unsupportedSpec`, `noSpecs`, `missingLogo` | `src/types/portal/portal-source.ts:24-30` |
| `writeConfiguration` writes `specs[slug] = <absolute posix path>` — each slug independent | `src/infrastructure/portal-project-service.ts:153-193`; map at `:159-162` |
| `prepare()` runs **once per command**, never per rebuild | `src/actions/portal/generate.ts:76-77`, `src/actions/portal/serve.ts:70-71` |
| `portal generate` **refuses** a destination equal to or containing the source, and empties it before writing | `src/actions/portal/generate.ts:33-43`; save via `PortalContext` at `:92` |
| **No file watcher exists anywhere in the CLI** — no chokidar, no `fs.watch`; `vite dev` owns reload | repo-wide grep |
| Poller: 3s interval, **30-minute** budget; an unrecognised status keeps the run alive until the deadline | `src/infrastructure/generation-status-poller.ts:6,13,68-75` |
| v2 status already handles completion-by-redirect: `maxRedirects: 0`, 302 → `Completed` | `src/infrastructure/services/sdk-generation-service.ts:225` |
| Build zip = copy the whole build directory, optionally add `package-settings/`, zip | `src/types/build-context.ts:42-50`, called from `src/actions/sdk/generate.ts:109` |
| `Language` enum values are `csharp java php python ruby typescript go` | `src/types/sdk/generate.ts:3-11` |
| `LANGUAGE_CHOICES` is read in exactly one file, as prompt text only | `src/types/sdk/generate.ts:45-53`, used at `src/prompts/sdk/quickstart.ts:12,159-160,163,168` |
| `shiki-bundle.ts` bundles grammars for **all seven** languages, keyed by the enum values | `portal-template/src/lib/shiki-bundle.ts` |
| `api-page.tsx` registers curl only; its comment already names `x-codeSamples` | `portal-template/src/components/api-page.tsx:1-11` |
| A per-language `plugin-config.json` entry requires `codegenVersion` — so `{}` is not valid *today* | `src/types/plugin/plugin-config.ts:48-66` |
| **`apimatic.json` does not exist anywhere in the repo** | repo-wide grep |

### 8.2 codegen-v2

| Fact | Where |
|---|---|
| Routes are `generate`, `generate/{id}/status`, `generate/{id}/download`; `plugin`, `plugin/{id}/status`, `plugin/{id}/download`, `plugin/{id}/build/download` | `Functions/Sdk/*.cs`, `Functions/Plugin/*.cs` |
| SDK generate returns **200**, plugin generate returns **202** | `Functions/Sdk/GenerateFunction.cs:38`, `Functions/Plugin/GenerateFunction.cs:32` |
| Plugin fan-out is **two lanes** (V4 skills, V3 skills); each loops languages inside one activity | `Functions/Plugin/GenerateFunction.cs:116-142`, `GenerateV4Skills.cs:79` |
| `AggregatePlugin` unzips each lane into a subtree, walks the tree, renders manifests, rezips | `Application/Features/AggregatePlugin.cs:77-143` |
| `GenerationStatus` = `Queued, ExecutionStarted, GeneratingArtifacts, Completed, Failed, ValidationError, Unknown` | `Domain/Models/GenerationStatus.cs:12-24` |
| `GenerationOperation` has exactly `Sdk` and `Plugin`; each owns a callback event, a download link and tracking events | `Domain/Enums/GenerationOperation.cs:11-78` |
| Extraction paths: `extract/`, `extract/spec`, config at the extract root | `Domain/Models/GenerateWorkspace.cs:14-17`, `ValidatePluginConfig.cs:88-91` |
| `host.json` pins both concurrency limits to **1**; no `retryOptions`, no function timeout | `src/CodegenV2.Func/host.json:1-28` |
| **Zero** Durable retry policy in the repo — no `TaskOptions`/`TaskRetryOptions`/`RetryPolicy` | repo-wide grep |
| `CanGenerateSdk` true only for C#, TypeScript, Python; Java/PHP/Ruby/Go throw `NoSdkGenerator()`; Go cannot be a plugin language either | `Domain/Enums/SdkLanguage.cs:17-157` |
| All HTTP triggers are `AuthorizationLevel.Anonymous`; `X-APIMatic-*` headers are attribution, **not** access control, and default to `"undefined"` when absent | `Extensions/ApimaticHeaders.cs:5-21`, `Extensions/HttpExtensions.cs:18-33` |
| ⚠️ **The code-sample catalog is not merged.** It exists only as `origin/asadali214/code-sample-catalog`, open as [codegen-v2#406](https://github.com/apimatic/codegen-v2/pull/406) | no `CodeSamples.cs` / `RenderCodeSamples` / `SampledPath` in the working tree |

The catalog shape in [§4.5](#45-the-code-sample-catalog) was read from that branch
(`CodegenV2.Common/Models/CodeSamples.cs`, `docs/plans/code-sample-catalog.md`) in an
earlier session, and is the one part of this document not re-verifiable from a checked-out
tree. **Re-check it against [PR #406](https://github.com/apimatic/codegen-v2/pull/406)
before implementing** — it may have moved under review.

### 8.3 apimatic-io

| Fact | Where |
|---|---|
| `CodegenV2ApiService` — static `HttpClient`, **4-minute** timeout, base URL from `ApimaticCodegenV2Api_Url` | `APIMatic.Web/Services/CodegenV2ApiService.cs:22-23`, `Web.config:65` |
| Build zip is re-read from disk and re-uploaded as fresh multipart — **not** a stream pass-through | `CodegenV2ApiService.cs:36-41` |
| `X-APIMatic-UserId` / `TenantId` / `User-Agent` on every call; `X-APIMatic-CallbackUrl` on the two POSTs, forwarded from the inbound request | `Services/Common/HttpRequestMessageFactory.cs:23-34`, `CodegenV2ApiService.cs:45-48,104-107` |
| `X-APIMatic-SubscriptionFeatures` exists but is set **only** by the legacy v1 service | `Application/Common/ApimaticHeaders.cs:15`, `CodegenApiService.cs:87,114,146,288` |
| No Hangfire, no DB row — codegen-v2's id is passed straight through, wrapped with io's URLs | `Application/CodegenV2Api/GenerateSdk/GenerateSdkCommandHandler.cs:23-48` |
| v2 SDK status **redirects** to download on completion | `APIControllers/Sdk/GenerateV2SdkApiController.cs:110-116` |
| Plugin status carries `errors` on `Failed`; SDK status does not | `GetContextPluginStatusCommandHandler.cs:33-35` vs `GetSdkStatusCommandHandler.cs:30-34` |
| `/api/sdk/v2` performs **no** entitlement check — only a hard-coded v4 language allowlist | `GenerateSdkCommandHandler.cs:20-21`, `Domain/Enums/CodeGeneratorVersion.cs:9-16` |
| `/api/plugin` gates on `CanGenerateContextPlugin` → `IsCursorIntegrationAllowed`, at generate time only | `GenerateContextPluginCommandHandler.cs:36-39`, `SubscriptionManager.cs:2140-2148` |
| `CanGenerateOnPremPortal` message is *"Docs as code is not allowed on your subscription"* | `SubscriptionManager.cs:2120-2133` |
| **Nothing named `sdk-artifacts` exists in the repo** | repo-wide grep |

---

## 9. Risks and open items

| # | Item |
|---|---|
| R1 | **The catalog branch is unmerged** — [codegen-v2#406](https://github.com/apimatic/codegen-v2/pull/406). Nothing in codegen-v2's main line emits a catalog, and C#/Python return empty until their stacks are driven off the ASG's resolved examples. The CLI can be built and tested against a fixture; the endpoint cannot be integration-tested until the PR lands. |
| R2 | **`portal serve` now costs a full orchestration at startup** — serially, given the pinned concurrency, against a 25-minute budget. Accepted under [D27](#d27), but it is the single biggest change to the feel of the command. |
| R3 | **Retry-safety is a prerequisite, not a follow-up.** Adding retries to activities that do not clean up stale state produces runs that never finish — a worse failure than the transient one being papered over. |
| R4 | **`apimatic.json` is owned elsewhere.** This document treats it as fixed input; if its shape moves, [§4.2](#42-request-the-build-zip) moves with it. The portal's `PortalConfig.parse` and the signup page's *Download build* must change together, or the first command on a downloaded build hard-stops. |
| R5 | **`--verbose` does not exist.** [D20](#wire-format) names affected spec files rather than individual `$ref`s because there is no verbose mode to put the detail behind. **TODO:** enumerate the exact refs once a `--verbose` flag exists. |

---

## 10. Test plan

**CLI, unit.** Injection is a pure function, so most of this needs no filesystem:

- A catalog entry keyed by a path/method the document does not contain → warn, do not fail.
- The `"Example"` sentinel renders a bare language label; two declared ids render suffixes.
- Tab order: curl first, languages in configured order, one language's tabs adjacent.
- A path item that is itself a `$ref` → skipped without throwing.
- Non-method keys on a path item (`summary`, `parameters`, `servers`) → not treated as
  operations.
- Declaration order preserved, not sorted.
- A language present in `languages` but absent from the zip → its tabs are simply absent.
- An unknown top-level folder in the artifact zip → ignored, not an error.
- Escaping-`$ref` detection: internal `#/...` and URL refs do not count; a `../` ref does.
- A spec with an escaping ref keeps its slug pointed at the **original** file.

**CLI, integration** (nock): 202 → poll → 302 → download; `Failed` with errors; a status
token outside the closed set (asserts the timeout, documenting the hang); the 30-minute
budget outliving a 25-minute server.

**codegen-v2:** one lane fails → aggregation does not run and the call fails once, with
every lane's error keyed by language, not just the first. Aggregation receives its blob
names rather than listing storage. A retried activity produces the same zip as a
first-attempt one.

**Manual** (`APIMATIC_BASE_URL` → `api.dev.apimatic.io`): a three-language portal renders
every example tab on an operation page; a spec with a sibling `$ref` still builds;
`portal serve` starts after a full generation; Ctrl+C mid-generation leaves nothing behind.
