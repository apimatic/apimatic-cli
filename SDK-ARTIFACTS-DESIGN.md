# Code samples in the portal — the `/api/portal-artifacts` contract

**Status:** codegen-v2 endpoint implemented, catalog merged ([#406](https://github.com/apimatic/codegen-v2/pull/406)); CLI renders samples from a fixture catalog; apimatic-io not started.
**Purpose:** the single place the CLI, apimatic-io and codegen-v2 agree on what crosses the
wire, so the Azure Function can be written from it. Every claim under
[Verified facts](#8-verified-facts) carries a `file:line` reference and can be re-checked.

---

## 1. Scope

**In scope.**

- The code-sample catalog: what codegen-v2 renders, how it is keyed, how it is packaged.
- `/api/portal-artifacts`: the async endpoint that produces the artifacts portal generation
  needs, and the apimatic-io route that fronts it.
- The portal: how the CLI merges the catalog into the spec and how fumadocs renders it.

**Out of scope — named so nobody reads silence as omission.**

| Concern | Owner / when |
|---|---|
| `apimatic.json` itself — the file, its parser, the migration from `src/portal.json` | Another developer. codegen-v2 reads it through the shared `ApimaticConfig` model and validator from `GA-dev-branch`. |
| Bundling the SDK inside the plugin; `languages.<lang>: {}` becoming valid | codegen-v2, separately (apimatic-io#2216 M1) |
| The `quickstart` rewrite and the v3 retirement | apimatic-io#2216 M3 |
| `docs/<language>.json` (generated MDX pages) in the artifact zip | Future — the layout reserves room for it, see [§4.4](#44-response-the-artifact-zip) |
| `plugin/plugin.zip` in the artifact zip | Future — same |

---

## 2. Shape of the thing

```
apimatic {quickstart | portal generate | portal serve}
  │
  │  zip src/  ──────────────────────────────────▶  apimatic-io
  │                                                 POST api/portal-artifacts
  │                                                   │  X-APIMatic-UserId / TenantId
  │                                                   │  X-APIMatic-SubscriptionFeatures
  │                                                   ▼
  │                                                 codegen-v2
  │                                                 POST api/portal-artifacts
  │                                                   │  portal entitlement ──▶ 403
  │                                                   ├─ ReadPortalArtifactsRequest
  │                                                   ├─ language + plugin entitlement
  │                                                   ├─ ValidateSpecFile
  │                                                   ├─ fan out per language ─────┐
  │                                                   │    GenerateSdk             │
  │                                                   │    GenerateCodeSamples     │
  │                                                   └─ AggregatePortalArtifacts ─┘
  │                                                        one zip
  │  poll ◀────── status ──────────────────────────────────┤
  │  download ◀── portal-artifacts.zip ────────────────────┘
  │
  ├─ write code-samples/<lang>.json into the temp project as one code-samples.json
  ├─ place sdk/<lang>.zip under the portal output's static assets
  └─ vite build (or vite dev) over src/spec/, placing x-apimatic-codeSamples as it bundles ──▶ portal
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
| D6 | **Every `languages` key must be an allowed language on the subscription**, or the run fails with `SubscriptionError`. |
| D8 | **Raw axios in a dedicated service**, not a new `@apimatic/sdk` controller, until a v4 TypeScript SDK of apimatic-io exists. The precedent is already in the file we extend. |

### Wire format

| # | Decision |
|---|---|
| D9 | **The CLI synthesizes the zip**, with the language request carried by a config file inside it, mirroring how `plugin-config.json` drives the plugin flow. |
| D11 | **Key a sample on `path` + `method`.** That is the document's own addressing and is guaranteed to be present and to match; `operationId` is optional in OpenAPI and codegen-v2 synthesizes one when it is absent. |
| D12 | **Carry every declared example** on the wire, keyed by its OpenAPI `examples:` map key, and **special-case no key**: `"Example"` is only the placeholder for an operation's one snippet, so a spec's own `Example` beside other examples is kept like any other. |
| D13 | **The portal template places the samples, on each spec as it bundles it**, reading `src/spec/` where it is. Every `$ref` resolves as it would without samples, and path items behind a `$ref` are reached like inline ones. |
| D16 | **One `<language>.json` per language in the artifact zip**; a language that yields nothing is omitted entirely. |
| D17 | The Func wiring is the critical path and is what this document specifies. |
| D18 | **One `x-apimatic-codeSamples` entry per language, its `sources` keyed by example id**, and the tab follows the portal's example selector, which lists the ids codegen-v2 keys snippets by. `x-codeSamples` is ignored, hand-written or not: each entry is a fixed tab the selector cannot switch, and fumadocs-openapi 11.4.1 renders it empty. |
| D19 | **One tab per language, in configured order**: `TypeScript, C#, …`. There is no cURL tab beside them: fumadocs renders it from the example on its own terms, so it cannot agree with the SDK samples. An operation without SDK samples shows fumadocs' cURL tab alone. |
| D21 | **One display map, nothing else, is per-language knowledge in the CLI.** `LANGUAGE_CHOICES` already is that map. No title-casing logic. |
| D22 | **Reuse codegen-v2's status vocabulary verbatim**, `SubscriptionError` included. The CLI's poller already handles all of it; the `SubscriptionError` callback status is new, so apimatic-io's callback handler must accept it. |
| D24 | **Webhooks carry no request samples.** The catalog carries `paths` only. |
| D26 | **The endpoint is `/api/portal-artifacts`**, existing only to produce what portal generation needs — an all-or-nothing async orchestrator in codegen-v2 that takes a build directory and returns one zip of artifacts. The thing that crosses the wire is a **code-sample catalog**. |

### Build input, artifacts and budgets

<a id="d27"></a>

| # | Decision |
|---|---|
| D27 | **All three commands generate fresh artifacts on every run** — `quickstart`, `portal generate` and `portal serve` alike, as the CLI has always done. There is no cache and no skip flag. |
| D28 | **A failed call fails the command.** No fallback to a portal without SDK samples. `languages` must carry at least one key, so a docs-only user still generates SDKs for every language they enabled; a user with a `plugin` property gets plugins too. |
| D29 | **`apimatic.json` lives inside `src/`.** Today's `src/portal.json` becomes the `portal` property inside it. |
| D30 | **Absent or empty `languages` is a validation error.** Portals without SDK samples may be allowed later; they are not allowed now. |
| D31 | **`src/` *is* the build directory**, zipped exactly the way the SDK and plugin flows zip theirs. codegen-v2 learns to read `apimatic.json`. |
| D32 | <a id="d32"></a>**codegen-v2 enforces entitlement** from the `X-APIMatic-SubscriptionFeatures` header, in order: portal generation must be allowed, or the POST returns **403** before any work; every `languages` key must be allowed ([D6](#scope-and-transport)); a `plugin` property requires the context plugin. A failure after the POST ends the run with `SubscriptionError`. `plugin` is optional. |
| D33 | **Artifact zip layout as in [§4.4](#44-response-the-artifact-zip)**, with `plugin/` and `docs/` reserved for later. |
| D34 | **Func budget 25 min, CLI budget 30 min, poll interval 5s.** The client must always outlive the server, or it reports failures the server never had. |
| D35 | <a id="d35"></a>**Artifacts are never written back into `src/`.** Everything the CLI unpacks lands in the built portal's output directory — `static/` inside it for the SDK zips — which `portal generate` already forces to sit outside the source tree. |

---

## 4. The wire contract

This section is the Func's specification. Everything in it is a statement about bytes on
the wire, not about implementation.

### 4.1 Routes

**codegen-v2** — four routes, mirroring the plugin's four. Routes carry no
`api/` prefix in the attribute; the Functions host adds it.

```
POST api/portal-artifacts                 -> 202 { id }  |  403  |  400 bad subscription header
GET  api/portal-artifacts/{id}/status     -> 200 { status, errors? }
GET  api/portal-artifacts/{id}/download   -> 200 application/zip
GET  api/portal-artifacts/{id}/build/download -> 200 application/zip   (the uploaded build, for debugging)
```

The POST is multipart/form-data with file part `file`. No query parameters. The language request travels inside the zip ([§4.2](#42-request-the-build-zip)).
Return **202** on accept, matching the plugin trio; the SDK trio's 200 is the odd one out.

**apimatic-io** — a fronting controller shaped like `ContextPluginApiController`, because
the CLI cannot call codegen-v2 directly: its triggers are `AuthorizationLevel.Anonymous`
and trust `X-APIMatic-*` headers that only apimatic-io may set.

```
POST api/portal-artifacts                 -> 202 { id, links: { status, download } }  |  403
GET  api/portal-artifacts/{id}/status     -> 200 { status, errors? }  |  302 -> download
GET  api/portal-artifacts/{id}/download   -> 200 application/zip
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
flows zip their build directories, and posts it as the multipart `file` part. A file that is
not a zip ends the run with `ValidationError`.

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
  "languages": {                                     // >= 1 key, each from the Language enum
    "typescript": { "packageConfiguration": { "…": "…" } },       // only `packageConfiguration` required
    "csharp":     { "packageConfiguration": { "…": "…" },
                    "publishing": { "source": { "…": "…" }, "package": { "…": "…" } } }   // optional
  },
  "portal":  { /* today's portal.json */ },          // unread here
  "plugin":  { /* today's plugin-config.json */ }    // optional; presence => context-plugin entitlement
}
```

`languages` **keys** are the whole of the language request; SDK stability is fixed at `Beta`
until `apimatic.json` carries it. `ReadPortalArtifactsRequest`
validates the file with the same `ApimaticConfigValidator` the plugin flow uses: only
`csharp`, `typescript` and `python` are recognised, other keys are ignored, and a file with
none of the three is rejected. Generation order is fixed; tab order comes from the CLI's own
read of `apimatic.json` ([D19](#wire-format)).

### 4.3 Status

The token set is **closed**. Emit only what `GenerationStatus` already defines:

```
Queued  ExecutionStarted  GeneratingArtifacts  Completed  Failed  ValidationError  SubscriptionError  Unknown
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
  }
}
```

Rules, all of which the consumer depends on:

- **Path is the template verbatim, with its leading slash**, exactly as the document writes
  it. **Method is uppercase.**
- **The example id is an OpenAPI `examples:` map key** — the request body's, or, when the
  body names none, that of the first query, header or path parameter that does, the order
  codegen-v2 takes them in. The portal's example selector lists the same ids, so a snippet
  lines up with the example it was rendered from.
- **`"Example"` is a placeholder only when it is the one key**: an operation that declares
  no example gets its single snippet under `"Example"`. Beside other keys it is an ordinary
  example id a spec may declare, so neither the CLI nor the portal filters or renames it
  ([D12](#wire-format)). The portal shows an operation's only snippet for its only example,
  which fumadocs names `_default`, whatever the key.
- **Code is raw and unfenced.** The consumer wraps it in whatever it writes into.
- **Declaration order is authorial intent and is preserved.** Do not sort.

### 4.6 Determinism

Three rules the orchestrator must hold, all of which are ways to get burned by
`Task.WhenAll`:

1. **Return failures, do not throw them.** `Task.WhenAll` surfaces one exception and
   abandons the other results, so a three-language run would report one failure and
   silently lose two. Each fan-out activity returns a Result; the orchestrator keys
   failures by language, with a generic `<step> failed` reason — the failure's own message
   can carry internals, so it goes to the log only.
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
| `ReadPortalArtifactsRequest` | **new** — validates `apimatic.json` and returns its languages and whether `plugin` is present, which the orchestrator checks against the subscription |
| `ValidateSpecFile` | exists — writes the parsed SDL every downstream activity reads |
| `GenerateSdk` × N | exists — fan out, one activity per selected language |
| `GenerateCodeSamples` × N | **new** — same parsed SDL, `RenderGuides()` per language, which yields `code-samples.json` |
| `AggregatePortalArtifacts` | **new** — assemble the zip of [§4.4](#44-response-the-artifact-zip) |
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
3. **Retries.** `PortalArtifactsRun.Retries` is the codebase's first Durable retry policy:
   5 attempts, 10s first interval, backoff ×2. It retries **transient storage failures
   only** (`RequestFailedException`, however deeply wrapped); a network or generator fault
   fails the lane on the first attempt. **Retries require retry-safe activities**: an activity whose
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
throw `NoSdkGenerator()` from `CreateBlueprint`; Go cannot even be a plugin language. The
`apimatic.json` model therefore recognises only those three `languages` keys.

---

## 6. apimatic-io — what is new

Very little. The fronting layer keeps **no record** of a generation: `/api/sdk/v2` and
`/api/plugin` pass codegen-v2's own id straight back, wrapped with apimatic-io's URLs.
No Hangfire, no DB row.

1. A controller — `[WebApiAuthorize]`, `[RoutePrefix("api/portal-artifacts")]` — validating
   the multipart `file` part the way both existing controllers do (presence, non-zero
   length, content-type in `application/zip` / `x-zip-compressed` / `octet-stream`). No
   `language` or `stability` form field: the zip carries the request.
2. Three methods on `CodegenV2ApiService`, alongside the seven already there, adding
   `X-APIMatic-UserId` / `X-APIMatic-TenantId` / `X-APIMatic-SubscriptionFeatures` via
   `HttpRequestMessageFactory` and forwarding `X-APIMatic-CallbackUrl` when the inbound
   request carries one. The POST's 403 passes through to the CLI.
3. Download re-wrapped as `FileStreamResult` — a direct stream pass-through, no
   re-packaging, no size limit. Unchanged from the SDK path.

**Entitlement** ([D32](#d32)) is enforced by codegen-v2; apimatic-io only sets
`X-APIMatic-SubscriptionFeatures`, Base64 of the JSON the legacy v1 service already sends.
Its feature names are legacy: `OnPremPortalGeneration` gates the portal, `CursorIntegration`
the context plugin, and `BuildFeatures.Platforms` lists the allowed languages. A missing
header allows nothing, so the POST returns 403. Checks run at generate time only, never on
status or download.

---

## 7. CLI — what is new

### 7.1 Where the code goes

Following the 5-layer stack in `.ai/instructions.md`:

| Concern | Layer | Proposed |
|---|---|---|
| Call the endpoint, poll, download | Infrastructure service | `PortalArtifactsService` (`services/portal-artifacts-service.ts`), axios-auth variant |
| Parse `code-samples/<lang>.json` | Types (value object) | `CodeSampleCatalog` |
| The downloaded zip as a thing | Types (value object) | `PortalArtifacts` — `catalogs()`, `sdkZips()`, ignores unknown folders |
| Write the samples for the template | Types (value object) + Infrastructure | `CodeSamples.toJson()`, written by `PortalProjectService.prepare()` as `code-samples.json` |
| Inject `x-apimatic-codeSamples` | Portal template | `placeCodeSamples(document, samples)` in `code-samples.server.ts`, run on each bundled spec |
| List each spec's endpoints for the unplaced warning | Types (value object) + context | `OpenApiDocument.endpoints()`, plus `pathItemReferences()` / `endpointsAt()` for path items in other files, read by `PortalSourceContext` |
| Place `sdk/<lang>.zip` in the built site | Infrastructure | `PortalContext` — it already owns the output directory ([D35](#d35)) |
| Poll loop | — | **reuse** `pollUntilCompleted`; [D22](#wire-format) makes it a no-change |

Injection is a pure function over the bundled document: it has the most edge cases and
most needs tests that touch neither network nor filesystem, and only once bundled is every
operation an inline object, however the spec is split.

### 7.2 Merging the catalog into the spec

`PortalProjectService.prepare()` already writes `portal.config.json` with a `specs` map of
slug → **absolute path** into `src/spec/`. That is the whole seam ([D13](#wire-format)):

1. Write every language's catalog into the temp project as one `code-samples.json`, keyed
   by path, then upper-case method, then a list of `{ lang, label, sources }` in configured
   order, and name it in `portal.config.json` as `codeSamples` (`null` when there are none).
2. The template's `openApiSection` bundles each spec as before, then `placeCodeSamples`
   walks `paths` and gives each operation its endpoint's list as `x-apimatic-codeSamples`,
   replacing any the operation already carries. With `codeSamples: null` the spec is left
   as written.

Placement runs after `bundleSpecification` has inlined path items, so an operation behind a
`$ref`, into the document or another file, is annotated like an inline one. Paths that
reference one path item share its operation objects, so each path item is rebuilt, never
edited. The walk skips a path item's non-method keys (`summary`, `description`, `servers`,
`parameters`) and keeps declaration order.

The unplaced-sample warning runs in the CLI over each spec's endpoints: inline operations,
path items behind a `#/` reference, and path items in another local file, which
`PortalSourceContext` reads once. A file that refers on to a third is not followed.

### 7.3 Rendering the tabs

```jsonc
"x-apimatic-codeSamples": [
  { "lang": "typescript", "label": "TypeScript", "sources": { "minimal": "...", "full": "..." } },
  { "lang": "csharp",     "label": "C#",         "sources": { "minimal": "..." } }
]
```

- `lang` is the `Language` enum value verbatim. It is simultaneously the catalog filename,
  the tab id and the Shiki grammar key — one token, three uses, no mapping table.
- `label` is the bare language name from `LANGUAGE_CHOICES`; the example is chosen by
  the example selector, never by the label.
- Order: languages in configured order ([D19](#wire-format)).

`api-page.tsx` gives fumadocs an empty generator registry and replaces two of its slots.
Fumadocs' selector lists request body examples only, so `example-layout.tsx` replaces it
with one over `request-examples.ts`: the body's examples, or, when the body names none — no
`examples`, or a lone placeholder key, `Example` or the `default` fumadocs' 3.0 → 3.1
upgrade gives a singular `example` — the ids of the first parameter that names any, in
codegen-v2's order. `usage-tabs.tsx` replaces the usage tabs with one per language, each
showing its snippet for the example the layout selects, or a lone cURL tab for an operation
without SDK samples ([D19](#wire-format)). The layout opens on the example fumadocs picks from
`x-exclusiveCodeSample` or `x-selectedCodeSample`, and leaves the selector out when fumadocs
does. Parameters and examples given as `$ref`s are followed with fumadocs' own resolver. A
language without a snippet for that example shows a note, never another example's code;
an empty snippet is still a snippet. With one example, the language's only snippet shows
whatever its key. A malformed entry is skipped rather than failing the page.
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

Read from source on 2026-09-22, codegen-v2 re-read on 2026-09-23. CLI facts are on
`feat/code-samples-portal` (= `dev` at `073d09a`); codegen-v2 and apimatic-io from their working trees.

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
| fumadocs-openapi 11.4.1 renders an `x-codeSamples` entry as an empty tab: it registers the entry per operation, but the tab body reads only the page registry | `fumadocs-openapi/dist/ui/operation/usage-tabs.js:51,108` |
| fumadocs-openapi 11.4.1 takes example ids from the preferred media type's request body `examples` only, else one `_default`; ignores `setExample` for an id outside that list; and does not export `getExampleRequests` | `dist/utils/get-example-requests.js`, `dist/ui/operation/context.js:14-15`, `package.json` `exports` |
| A per-language `plugin-config.json` entry requires `codegenVersion` — so `{}` is not valid *today* | `src/types/plugin/plugin-config.ts:48-66` |
| **`apimatic.json` does not exist anywhere in the repo** | repo-wide grep |

### 8.2 codegen-v2

| Fact | Where |
|---|---|
| Routes are `generate`, `generate/{id}/status`, `generate/{id}/download`; `plugin`, `plugin/{id}/status`, `plugin/{id}/download`, `plugin/{id}/build/download`; `portal-artifacts` with the same four | `Functions/Sdk/*.cs`, `Functions/Plugin/*.cs`, `Functions/PortalArtifacts/*.cs` |
| SDK generate returns **200**, plugin generate returns **202** | `Functions/Sdk/GenerateFunction.cs:38`, `Functions/Plugin/GenerateFunction.cs:32` |
| Plugin fan-out is **two lanes** (V4 skills, V3 skills); each loops languages inside one activity | `Functions/Plugin/GenerateFunction.cs:116-142`, `GenerateV4Skills.cs:79` |
| `AggregatePlugin` unzips each lane into a subtree, walks the tree, renders manifests, rezips | `Application/Features/AggregatePlugin.cs:77-143` |
| `GenerationStatus` = `Queued, ExecutionStarted, GeneratingArtifacts, Completed, Failed, ValidationError, SubscriptionError, Unknown` | `Domain/Models/GenerationStatus.cs:12-24` |
| `GenerationOperation` has `Sdk`, `Plugin` and `PortalArtifacts`; each owns a callback event, a download link and tracking events | `Domain/Enums/GenerationOperation.cs` |
| Extraction paths: `extract/`, `extract/spec`, config at the extract root | `Domain/Models/GenerateWorkspace.cs:14-17`, `ValidatePluginConfig.cs:88-91` |
| `host.json` pins both concurrency limits to **1**; no `retryOptions`, no function timeout | `src/CodegenV2.Func/host.json:1-28` |
| The only Durable retry policy is `PortalArtifactsRun.Retries`, and it retries `RequestFailedException` only | `Domain/Models/PortalArtifacts/PortalArtifactsRun.cs:13-24` |
| `CanGenerateSdk` true only for C#, TypeScript, Python; Java/PHP/Ruby/Go throw `NoSdkGenerator()`; Go cannot be a plugin language either | `Domain/Enums/SdkLanguage.cs:17-157` |
| All HTTP triggers are `AuthorizationLevel.Anonymous`; `X-APIMatic-*` headers are attribution, **not** access control, and default to `"undefined"` when absent | `Extensions/ApimaticHeaders.cs:5-21`, `Extensions/HttpExtensions.cs:18-33` |
| The code-sample catalog is merged ([codegen-v2#406](https://github.com/apimatic/codegen-v2/pull/406)); `ISdkBlueprint.RenderGuides()` yields it as `code-samples.json`, with a single `paths` key | `CodegenV2.Common/Blueprint/ISdkBlueprint.cs:22-24`, `CodegenV2.TypeScript/DocsRendering/CodeSamplesRenderer.cs:53` |

The catalog shape in [§4.5](#45-the-code-sample-catalog) matches the merged renderer.

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
| **Nothing named `portal-artifacts` exists in the repo** | repo-wide grep |

---

## 9. Risks and open items

| # | Item |
|---|---|
| R1 | **Only TypeScript emits a catalog.** C#/Python return empty until their stacks are driven off the ASG's resolved examples. |
| R2 | **`portal serve` now costs a full orchestration at startup** — serially, given the pinned concurrency, against a 25-minute budget. Accepted under [D27](#d27), but it is the single biggest change to the feel of the command. |
| R3 | **Retry-safety is a prerequisite, not a follow-up.** Retries are limited to transient storage failures, but a retried activity that does not clean up stale state still produces a run that never finishes — a worse failure than the transient one being papered over. |
| R4 | **`apimatic.json` is owned elsewhere.** This document treats it as fixed input; if its shape moves, [§4.2](#42-request-the-build-zip) moves with it. The portal's `PortalConfig.parse` and the signup page's *Download build* must change together, or the first command on a downloaded build hard-stops. |
| R6 | **The API playground follows fumadocs' own example list**, so a parameter-derived id does not reach it. |

---

## 10. Test plan

**CLI and template, unit.** Injection is a pure function, so most of this needs no filesystem:

- A catalog entry keyed by a path/method the document does not contain → warn, do not fail.
- An operation's only snippet shows for its only example whatever its key; `"Example"`
  beside other keys is kept as an ordinary id; a body that names no id selects among its
  parameters' ids; a language without a snippet for the selected example shows a note.
- Tab order: languages in configured order.
- A path item that is itself a `$ref`, into the document or another file → its operations
  get their samples, and do not count as unplaced.
- Non-method keys on a path item (`summary`, `parameters`, `servers`) → not treated as
  operations.
- Declaration order preserved, not sorted.
- A language present in `languages` but absent from the zip → its tabs are simply absent.
- An unknown top-level folder in the artifact zip → ignored, not an error.
- Every slug points at the user's own file in `src/spec/`, samples or not.

**CLI, integration** (nock): 202 → poll → 302 → download; `Failed` with errors; a status
token outside the closed set (asserts the timeout, documenting the hang); the 30-minute
budget outliving a 25-minute server.

**codegen-v2:** one lane fails → aggregation does not run and the call fails once, with
every lane's error keyed by language, not just the first. Aggregation receives its blob
names rather than listing storage. A retried activity produces the same zip as a
first-attempt one.

**Manual** (`APIMATIC_BASE_URL` → `api.dev.apimatic.io`): a three-language portal switches
every language's snippet with the example selector; a spec with a sibling `$ref` still builds;
`portal serve` starts after a full generation and shows a spec edit on refresh; Ctrl+C mid-generation leaves nothing behind.
