# Portal v2 (fumadocs) — design notes

**Status:** design in progress, nothing implemented. Written 2026-09-17.
**Purpose:** hand-off document so another agent/engineer can pick this up without
re-deriving the landscape. Everything under "Verified facts" was read from source;
file:line references included so claims can be re-checked rather than trusted.

> Naming is unsettled — see [Open questions](#open-questions). This doc says
> "Portal v2" only because that is what the conversation used. It is a bad name
> (see the "v2 collision" note) and should be replaced.

---

## 1. Goal

Generate an APIMatic developer portal as a **static site built with fumadocs**,
replacing the current portal renderer. Code samples for the customer's SDK
languages are embedded in the OpenAPI spec as `x-codeSamples` by **codegen-v2**,
so the portal renders real SDK usage per endpoint rather than only generated
HTTP snippets.

---

## 2. Target architecture (as decided)

```
apimatic portal generate (CLI, local machine)
  │
  ├─ 1. entitlement check ──────────▶ apimatic-io
  │        "is docs-as-code portal generation allowed for this account?"
  │        (no build-file upload, no pruning, no toc-data)
  │
  ├─ 2. fetch three artifacts ──────▶ apimatic-io ──▶ codegen-v2 (func-codegenv4)
  │        a. SDK zip           (per language)
  │        b. context plugin    
  │        c. OpenAPI spec annotated with x-codeSamples
  │
  └─ 3. build the site LOCALLY
           fumadocs is a direct dependency of the CLI
           spec + samples ──▶ fumadocs-openapi generateFiles() ──▶ MDX + meta.json
                          ──▶ next build (static export) ──▶ static site on disk
```

**Key property:** the portal build runs on the **user's machine**, not on APIMatic
infrastructure. This was chosen because the entire APIMatic backend estate is .NET
(apimatic-io is .NET Framework 4.7.2; both codegens are dotnet-isolated Azure
Functions) and has **no Node build infrastructure**, whereas the CLI is already a
Node program (oclif, ESM, Node >= 20).

---

## 3. Decisions made

| # | Decision | Rationale |
|---|---|---|
| D1 | Portal is built **client-side, on the user's machine** | No Node build infra exists in APIMatic's .NET estate; the CLI is already Node |
| D2 | Output is a **static site** | Preserves the on-prem promise: host on any web server, same as v1 |
| D3 | **codegen-v2** produces the code samples and writes them into the OpenAPI spec as `x-codeSamples` | Single source of truth; avoids a separate snippet API |
| D4 | **Old codegen (apimatic-codegen) is not used** for this path | Explicit product direction |
| D5 | CLI consumes **three artifacts**: SDK, context plugin, annotated OpenAPI spec | No build file, no toc |
| D6 | **fumadocs is a direct dependency of the CLI** | Simplest distribution; portal version pins to CLI version |
| D7 | **No build-file pruning, no toc generation, no build-file schema** in this path | apimatic-io's only job is the entitlement check |
| D8 | SDKs surface as a **per-language download button** in the docs | |
| D9 | Context plugins surface as **one page with a single command**: `npx context-plugins install ${id-or-path-to-plugin}` | |
| D10 | Anything fumadocs doesn't support is **dropped**, not re-homed | Keeps scope tight |
| D11 | The dependency is **upstream `fumadocs-*` from npm**, not the `apimatic-dx-portal-v2` fork | Resolves Q-C. Consequences in §5.6 — they are not small |
| D12 | A **minimal branding input survives** (6 fields, see §5.5) | Resolves Q-D. fumadocs supplies the mechanism but no input format |

---

## 4. Verified facts about the current system

All read from source. apimatic-io facts are at `origin/development` @ `607c1b079`.

### 4.1 How a portal is generated *today* (v1)

```
apimatic portal generate
  → zip <input>/src
  → POST api.apimatic.io/api/portal/v2   [Authorization: X-Auth-Key <key>]
  → POST func-codegen-{env}/api/portal   [X-APIMatic-UserId / -TenantId / -SubscriptionFeatures]
  → poll GET /api/portal/v2/{id}/status  every 3s, 30-min budget
     · Completed → HTTP 302 to the download URL
     · ValidationError | SubscriptionError → { status, errors: { field: [msg] } }
  → GET /api/portal/v2/{id}/download
  → zip containing a STATIC SITE (index.html + static/; portal JS hosted at
    https://dxjs.apimatic.io/v7/static/js/portal.v7.js)
  → extracted into <input>/portal   (or <input>/portal/portal.zip with --zip)
```

- CLI orchestration: `src/actions/portal/generate.ts`, HTTP in
  `src/infrastructure/services/portal-service.ts`, polling in
  `src/infrastructure/generation-status-poller.ts`.
- **422 is a real response**: the body is a zip containing
  `apimatic-debug/apimatic-report.html`, which the CLI extracts and opens
  (`src/types/portal-context.ts:39-43`).
- The CLI **never builds HTML itself** today. It is a thin client over the
  platform's portal generator. Nothing in the repo anticipates a second generator.

### 4.2 codegen-v2 (repo `codegen-v2`, deployed as `func-codegenv4-*`)

- C# / .NET 10, isolated-worker **Azure Functions** + Durable Functions.
- Public surface: `POST api/generate`, `GET api/generate/{id}/status`,
  `GET api/generate/{id}/download`, plus the same trio for `plugin`, plus `version`.
- Input is a **multipart build ZIP** + `language` + `stability`. It reads only
  `spec/`, `package-settings/<lang>.json` and `plugin-config.json` out of that zip
  — **`APIMATIC-BUILD.json` is never read** (zero hits repo-wide).
- Output is a **zip** (`sdk.zip`). Status tokens: `Queued`, `ExecutionStarted`,
  `GeneratingArtifacts`, `Completed`, `Failed`, `ValidationError`, `Unknown`.
- All HTTP triggers are `AuthorizationLevel.Anonymous` — **auth lives in
  apimatic-io**, identity is forwarded as trusted `X-APIMatic-*` headers.
- Optional webhook via `X-APIMatic-CallbackUrl`.

**Language support (two different gates — do not confuse them):**

| Gate | Where | Value |
|---|---|---|
| Service capability | `codegen-v2` `src/CodegenV2.Func/Domain/Enums/SdkLanguage.cs` — `CanGenerateSdk` | C#, TypeScript, Python = true; Java, PHP, Ruby, Go = false |
| Public API gate | `apimatic-io` `Domain/Enums/CodeGeneratorVersion.cs` @ `607c1b079` | C#, Python, TypeScript — **all `Beta` stability only** |

> ⚠️ **Integration gotcha:** the CLI's `--stability` flag defaults to `stable`, but
> `GenerateSdkCommandValidator` rejects anything that isn't `Beta` for V4. Callers
> must pass `--stability beta`.

### 4.3 What codegen-v2 does NOT do today

These are the gaps between the current service and the target design:

1. **No OpenAPI emission.** Zero OpenAPI libraries in `Directory.Packages.props`
   (no Microsoft.OpenApi, NSwag, Swagger, Redocly). Pipeline is one-way:
   spec → `ImportManager` → APIMatic SDL → ASG → rendered SDK. Writing an
   annotated OpenAPI document back out is a new capability.
2. **No `x-codeSamples` anywhere.** Zero hits.
3. **Samples carry no values.** Today's snippets are signature illustrations —
   the TypeScript renderer's own comment says it names *"only what the caller must
   supply and giving no value for any of it"*
   (`src/CodegenV2.TypeScript/DocsRendering/ApiReferenceRenderer.cs:183-185`).
4. **One POST generates one language.** N languages = N generations.
5. **Named examples are parsed then dropped.** `Example(Name, Description, Value)`
   is populated in `src/CodegenV2.Asg.SdlParser/{ParameterExtensions,FieldExtensions}.cs`
   and read by **nothing** downstream. This is the natural seam for per-example
   samples — the data already reaches the graph.
6. **No portal concept at all.** Zero hits for "portal". Portal generation lives in
   `apimatic-codegen`, which codegen-v2 itself calls as "CodegenV3Api" for the
   legacy skills lane.

### 4.4 apimatic-io

- .NET Framework 4.7.2, ASP.NET MVC 5 + Web API 2, MongoDB, Autofac, MediatR, Hangfire.
- Auth: `[WebApiAuthorize]` accepts `Authorization: Basic <base64>`,
  `Authorization: X-Auth-Key <key>` (what the CLI uses), or cookie/JWT.
  Tenancy is user → team → tenant; the tenant id is forwarded downstream as
  `X-APIMatic-TenantId`. Entitlements are base64-JSON in `X-APIMatic-SubscriptionFeatures`.
- **No feature flags.** The v1/v2 split is route-level: `api/sdk` → `CodegenApiService`
  (old codegen), `api/sdk/v2` → `CodegenV2ApiService`. Precedent: a new capability
  gets a new route, not a flag.
- `GET api/portal/build/{apiGroupId}/draft` **exports a complete build package**
  (`APIMATIC-BUILD.json` + `spec/` + `content/toc.yml` + `static/images`) — the
  existing bridge from the hosted editor to docs-as-code. Not needed by the new
  design, but worth knowing it exists.
- **CLI version compatibility shim:** `Domain/Common/ApimaticCliVersion.cs` parses
  the `User-Agent` prefix `APIMATIC CLI/`; callers older than `1.1.0-beta.6` get
  different validation behaviour. Marked "do not clean up".

### 4.5 apimatic-dx-portal-v2 (the fumadocs repo)

- Fork of `fuma-nama/fumadocs`, slimmed down. Only the API-reference packages we
  patch are in-repo: `packages/openapi` (**carries local patches**), `api-docs`,
  `asyncapi`, `stf`. Everything else comes from npm.
- **The fork is based on `fumadocs-openapi@11.1.1`** (`packages/openapi/package.json:3`),
  against `fumadocs-core ^16.11.5` and `fumadocs-ui: npm:@fumadocs/base-ui@^16.11.5`.
  The version was never bumped after forking, so the package advertises 11.1.1 while
  containing local patches. **Upstream is now at 11.4.3** (registry, 2026-09-17), whose
  peers are `fumadocs-core`/`fumadocs-ui` `^16.15.0` and React `^19.2.0`.
- ⚠️ **"Local patches" undersells it.** Fork point for `packages/openapi` is upstream
  commit `11e997399` (2026-07-09); since then the diff is **31 files, +1229/−253**.
  See §5.6 for the breakdown and what D11 costs.
- **Requires Node >= 24.14.0 and pnpm 11.5.3.** The CLI's current floor is Node 20 —
  adopting the portal as a dependency raises it.
- `apps/docs` reads content from `generated/` on the filesystem at runtime. There is
  **no runtime remote-content fetching** — the `PORTAL_API_URL` block in
  `lib/api.ts:75-84` is commented out.
- `MULTI_TENANT_PLAN.md` is **stale** — a finalised-but-unimplemented plan from
  2026-07 that the repo has since diverged from. Do not treat it as current.

#### x-codeSamples contract (this is what codegen-v2 must emit)

> 🔴 **Read this before using the contract below.** The `CodeSample` type and its
> `sources` field are **APIMatic-local, not upstream**. Proof: the last
> upstream-authored revision (`git show 11e997399:packages/openapi/src/types.ts`)
> declares `'x-codeSamples'?: InlineCodeUsageGenerator[]` with no `CodeSample` type,
> and the current published **upstream 11.4.3 `dist/types.d.ts` still does**, with no
> `sources` anywhere in its typings. `sources` was added by APIMatic in `ae554cfd5`
> ("feat: mre incorporated", 2026-07-31).
> **`x-codeSamples`, `x-selectedCodeSample` and `x-exclusiveCodeSample` *are* upstream**
> (`820cef2b2f`, 2026-06-07). Under D11 only the flat `source` form is available.

Type at `packages/openapi/src/types.ts:18-26` (fork):

```ts
export type CodeSample = InlineCodeUsageGenerator & { sources?: Record<string, string> };
// InlineCodeUsageGenerator = { id?: string; lang: string; label?: string;
//                              source?: string | CodeUsageGeneratorFn | false }
export type OperationObject = OpenAPIV3_2.OperationObject & {
  'x-codeSamples'?: CodeSample[];
  'x-selectedCodeSample'?: string;
  'x-exclusiveCodeSample'?: string;
};
```

- `source` — one snippet for the whole operation.
- `sources` — a map **keyed by the `requestBody.content.<media>.examples` key**, so
  the example selector rewrites the code tabs. Resolution:
  `sources?.[exampleId] ?? source` (`src/ui/operation/usage-tabs.tsx:37-43`).
- **Default registered sample ids** (`src/requests/generators/all.ts:10-19`):
  `curl`, `js`, `go`, `python`, `java`, `csharp`, `rust`. Insertion order = tab order.
  Note there is **no `typescript`, `php` or `ruby`** by default.
- **Suppression:** a sample with a falsy `source` (e.g. `{ id: 'js', source: false }`)
  **removes** that id from the registry (`packages/api-docs/src/codegen.ts:52-55`).
  This is how you kill a built-in generated tab that would otherwise render beside
  the authored ones.
- ⚠️ **Partial `sources` coverage is a loud failure**: an example with no entry
  resolves to `undefined`, which `addInline()` reads as "remove this generator", so
  the tab **disappears**. Cover every example for a language, or fall back to a
  single `source` for that language.

A working reference build exists at
`C:/Users/mrafn/Downloads/mre-build/codesamples-per-example-build` — 8 languages ×
5 examples, with `js`/`rust` suppressed. It renders correctly.

---

## 5. Known risks and constraints

### 5.1 Static export removes more than the API routes

Verified against the Next.js 16.2 docs. Unsupported under `output: 'export'`:
dynamic routes without `generateStaticParams()`, Route Handlers that read `Request`,
**Proxy/middleware**, rewrites/redirects/headers, ISR, image optimization with the
default loader, Server Actions. Route Handlers survive only as `GET` returning a
static response with no request reading.

Mapped onto `apps/docs` as it exists today:

| Feature | File | Under static export |
|---|---|---|
| API playground "Send" | `app/api/proxy/route.ts` | **Dies** — reads Request, 6 verbs |
| Search | `app/api/search/route.ts` | **Dies** — reads `?query=` |
| API Copilot chat | `app/api/chat/route.ts` | **Dies** — POST + streaming |
| `.md` / `Accept:` negotiation | `proxy.ts` | **Dies** — Proxy unsupported |
| ISR + revalidation webhook | `page.tsx:26`, `app/api/revalidate` | **Dies** |
| SDK zips + static assets | `app/static/[...path]/route.ts` | **Dies** — must be emitted as real files |
| `llms.mdx/[[...slug]]` | route handler | Survives **if** given `generateStaticParams` |
| Customer logos | `next.config.ts:30` `images.remotePatterns` | Needs `images.unoptimized: true` |
| `generateStaticParams() → []` | `page.tsx:222` | **Must enumerate every page** |

Per D10 these are dropped unless fumadocs offers an equivalent. Note two have
straightforward replacements if wanted later: fumadocs supports a **client-side
static search index**, and API Copilot is already just a bridge to
`{APIMATIC_COPILOT_HOST}/chat/{key}/{library}` which a browser can call directly.

**D8 interacts with this:** the SDK download button can't be served by
`app/static/[...path]` under static export — the zips must be emitted as real files
into the output tree.

### 5.2 Prerender size — the top engineering risk

`apps/docs/app/docs/[[...slug]]/page.tsx:222` deliberately returns `[]` from
`generateStaticParams`, with this comment:

> No build-time prerendering: a portal can have thousands of API endpoint/model
> pages, and each prerendered page embeds the full page tree (~1MB HTML + RSC),
> which balloons the deploy to gigabytes.

**A static export has no other mode** — it must prerender everything. This already
caused a production problem once.

Root cause is architectural, not a bug: `app/docs/layout.tsx:43` passes the entire
tree as `<DocsLayout tree={source.getPageTree()}>`, and fumadocs renders the sidebar
server-side from it. Every prerendered page therefore carries the navigation.

**This is not yet measured for the new design.** Before committing to a milestone,
generate a portal from a large real spec (candidates in
`C:/APIMatic/repos/Customer-build-files/`) and measure actual output size. If it is
a problem, the fix is to stop embedding the full tree in every page — lazy-load the
sidebar client-side from one shared JSON, or trim the tree per section.

#### Is this a fumadocs problem or a Next.js problem? (both, in different amounts)

It decomposes into three layers. Only the middle one is Next.js-specific.

| Layer | Cause | Framework-specific? |
|---|---|---|
| 1. Tree in every page | `<DocsLayout tree={source.getPageTree()}>` is a server-rendered prop | **No.** Any SSG target repeats the sidebar markup in every page |
| 2. Tree serialised **twice** per page | Next.js App Router static export writes `.rsc` flight data beside every `.html` | **Yes** — worth roughly 2× |
| 3. Fix: stop passing the whole tree | Shared JSON + client-side sidebar, or per-section trees | **No.** Works on every target |

Layer 2 is verified in Next.js source: `exportAppPage`
(`packages/next/src/export/routes/app-page.ts`) appends flight data to
`htmlFilepath.replace(/\.html$/, RSC_SUFFIX)` with `RSC_SUFFIX = '.rsc'`
(`packages/next/src/lib/constants.ts`), then appends the HTML. Where per-segment
prefetch is enabled it additionally writes a `<page>.segments/**.segment.rsc` tree.
So the sidebar is emitted at least twice per route, which is exactly what the
in-repo comment's "HTML + RSC" phrasing refers to.

**Fumadocs is no longer Next.js-only.** Since 15.2 it officially supports Next.js,
Astro + React, and the Vite-based frameworks (TanStack Start, Waku, React Router)
via `FrameworkProvider` from `fumadocs-core/framework/base`; the docs enumerate a
build output path per framework (`.next/server/app/…`, `.output/public/…`,
`build/client/…`, `dist/public/…`). So porting off Next.js **is** available.

**But it is the wrong lever.** Leaving Next.js buys layer 2 — about 2×, not an
order of magnitude — while costing the fork's `packages/openapi` patches and the
`fumadocs-openapi` integration this design is built on. Layer 1 is the dominant
term and layer 3 fixes it on any framework. Fix the tree; do not change framework
to escape the size problem.

There is a *separate* argument for a lighter framework — `next build` over
thousands of pages on a customer's laptop is slow, and D1 puts that build on the
user's machine. That is a build-time concern, not an output-size one, and should be
argued on its own terms.

### 5.3 The "v2" naming collision

"v2" currently denotes at least four different things:

| Name | What it actually is |
|---|---|
| `codegen-v2` (repo) | Deployed as **`func-codegenv4-*`**, i.e. the v4 generator |
| `apimatic-codegen` (repo) | The **v3** generator; codegen-v2 calls it `CodegenV3Api` |
| `/portal/v2` (route) | The **API version** of the on-prem portal endpoint — not a portal product |
| `--codegen-version v3\|v4` (CLI flag) | Yet another axis |
| `dx-portal` | Already taken — apimatic-io's public name for the on-prem portal *API* (`apimatic.io/apidocs/dx-portal-api`) |

Pick a product name that collides with none of these before it becomes load-bearing.

### 5.4 Consequences of dropping the build file and toc (D5, D7)

`fumadocs-openapi` does ship a spec→docs generator (`generateFiles` in
`packages/openapi/src/generate-file.ts:95`) which emits MDX **and `meta.json`**, so
navigation from a bare spec is genuinely supported. But dropping
`APIMATIC-BUILD.json` and `content/toc.yml` also drops:

- **Branding** — logo (light/dark), favicon, page title, nav title, theme colours.
  A portal with no customer logo is a visible regression against v1.
- **Custom content pages** — guides, getting-started, anything hand-written.
- **Navigation control** — grouping/ordering beyond what tags give you.

Decide explicitly whether this is acceptable for v1 of the product or whether a
minimal branding input needs to survive.

---

### 5.5 Branding under D12 — fumadocs has the mechanism, not the input

Fumadocs does support branding, but it is **authored in source files**, not read from
a config file. There is no JSON that fumadocs consumes for branding.

| Branding | Fumadocs surface | Kind |
|---|---|---|
| Nav title / logo | `nav.title` in `lib/layout.shared.tsx` — a **ReactNode** | TSX |
| Whole navbar | `nav.component` | TSX |
| Theme colours | `--color-fd-*` CSS variables in `@theme` + `.dark` | CSS |
| Colour presets | `@import 'fumadocs-ui/css/<theme>.css'` — neutral, ocean, dusk, catppuccin, ruby, purple, emerald | CSS |
| **Favicon** | **Not fumadocs** — Next.js `metadata.icons` | Framework |
| **Page title** | **Not fumadocs** — Next.js `metadata.title` | Framework |

Because D1 puts the build on the user's machine, something must *write* those TSX/CSS
files from customer values. That writer is exactly what D5/D7 removed — hence D12.

**The contract already exists and is small.** `apps/docs/lib/portal-meta.ts:15-28`
defines `GeneratedPortalMeta`: `title`, `navTitle`, `logo`, `logoDark`, `favicon`,
`theme`. `apps/docs/lib/portal-config.ts` is the translator (build file →
`generated/portal.config.json` + a written `app/theme.css`, mapping
`portalSettings.theme.baseTheme` onto the fumadocs presets above). Applied at
`app/layout.tsx:20-40` and `app/docs/layout.tsx:19-29`.

Two details worth carrying over rather than rediscovering:

- The favicon key must be **absent**, not `undefined` — Next applies the `app/icon`
  file convention only while `metadata.icons` is unset (`app/layout.tsx:33-39`).
- `logo: {light, dark}` is consumed by the fork-local `portal-chrome` slot, **not** by
  upstream `nav.title`, which takes a single ReactNode. Under D11, light/dark logo
  switching is hand-built (two `<img>`, CSS `dark:`). Trivial, but it is yours now.

### 5.6 What D11 (upstream, not the fork) actually costs

Verified by git archaeology against fork point `11e997399` (2026-07-09). The fork
diff is **31 files, +1229/−253** in `packages/openapi` alone — plus ~18 files in
`apps/docs` that reference the build manifest or branding fields, which is the entire
portal-chrome layer and is lost in full.

**Largely moot under D2 (static export).** The biggest cluster is the API playground —
`playground/auth.tsx` (174), `components/oauth-dialog.tsx` (192), `oauth-popup.ts` (175),
`resolve-auth-url.ts`, `download-name.ts`, `copyable-url.tsx`, `fetcher.ts`, plus four
new test files. §5.1 already kills the playground's "Send" (it needs
`app/api/proxy/route.ts`). The UI would still render and could fetch directly from the
browser, but only where CORS allows — so this investment is *devalued*, not worthless.
It is the best argument for D11.

**Not moot — these are docs-rendering fixes that a static export still needs:**

| Patch | Location | Why it matters |
|---|---|---|
| `*/*` and `application/*` media-type ranges | `src/requests/media/resolve-adapter.ts:81-87` (`7fedef14b`, broadened by `403ab5110`) | Real specs (Verizon ThingSpace) use `*/*` for JSON bodies; without it the **whole docs page throws** |
| Binary + `text/*` family fallbacks | `resolve-adapter.ts:9-30`, `:60-79` (`403ab5110`) | Same class of failure on opaque binary bodies |
| Server-selection cache validation | `src/ui/contexts/api.tsx:66-92` (`ce62a0eb4`) | A localStorage selection from a different document can resurrect an unresolvable server URL. Client-side, so it survives static export |
| `externalDocs` under operation description | `2fe9bcafd` | Content loss |
| `CodeSample.sources` | `src/types.ts:11-21`, `ui/operation/usage-tabs.tsx:31-43` (`ae554cfd5`) | Per-example samples — see Q-A |

**So D11's real bill is: re-apply four small docs-rendering patches, rebuild the
portal chrome and branding layer (D12), and accept per-operation-only code samples
(Q-A) unless `sources` is upstreamed or re-patched.** None of these are large
individually; the chrome rebuild is the biggest. Also note nothing was ever proposed
upstream (no upstream remote is even configured), so none of it is likely to arrive on
its own.

**One genuine upside beyond the playground point:** published `fumadocs-openapi@11.4.3`
declares **no `engines` field**, so the fork's Node >= 24.14.0 floor (§4.5) is a
monorepo-build constraint, not an inherited one. D11 may let the CLI keep a lower Node
floor. Verify against `next build` itself before relying on it.

## 6. Open questions

| # | Question | Owner |
|---|---|---|
| Q-A | **Per-example vs per-operation samples.** ⚠️ **Narrowed by D11:** `sources` does not exist upstream (§4.5 callout), so per-example requires re-patching `fumadocs-openapi` or upstreaming the feature. Per-operation (`source`) works on stock upstream today. The `Example` carrier already exists in the ASG but renderers emit no values. | **codegen-v2 team — TBD** |
| Q-B | **Product name.** `portal-v2` and `fuma-portal` both proposed; both need team discussion. See §5.3. | **Team — TBD** |
| Q-C | **"fumadocs as a direct dependency" — which package?** → **RESOLVED: upstream `fumadocs-*` from npm (D11).** Cost breakdown in §5.6. Implies the CLI owns a portal app template rather than inheriting `apps/docs`. | **Resolved 2026-09-17** |
| Q-D | Does branding survive in some minimal form, given D5/D7? → **RESOLVED: yes, a 6-field input (D12).** fumadocs supplies the mechanism but no input format; see §5.5. | **Resolved 2026-09-17** |
| Q-E | Prerender size on a large real spec — measure before committing. See §5.2. | **Unresolved** |

---

## 7. Where things live

| Concern | Path |
|---|---|
| CLI portal command | `apimatic-cli/src/commands/portal/generate.ts` |
| CLI portal orchestration | `apimatic-cli/src/actions/portal/generate.ts` |
| CLI portal/SDK HTTP + polling | `apimatic-cli/src/infrastructure/services/portal-service.ts` |
| CLI auth token file | `apimatic-cli/src/client-utils/auth-manager.ts` |
| CLI base-URL env override | `apimatic-cli/src/infrastructure/env-info.ts` (`APIMATIC_BASE_URL`, `;`-separated triple) |
| apimatic-io portal routes | `APIControllers/Portal/OnPremPortalV2ApiController.cs` |
| apimatic-io → codegen-v2 client | `APIMatic.Web/Services/CodegenV2ApiService.cs` |
| apimatic-io language gate | `APIMatic.Web/Domain/Enums/CodeGeneratorVersion.cs` |
| codegen-v2 HTTP entry | `codegen-v2/src/CodegenV2.Func/Functions/Sdk/GenerateFunction.cs` |
| codegen-v2 language capability | `codegen-v2/src/CodegenV2.Func/Domain/Enums/SdkLanguage.cs` |
| codegen-v2 example carrier (unused) | `codegen-v2/src/CodegenV2.Asg/Common/Example.cs` |
| fumadocs x-codeSamples type | `apimatic-dx-portal-v2/packages/openapi/src/types.ts` |
| fumadocs sample merge/suppress | `apimatic-dx-portal-v2/packages/api-docs/src/codegen.ts:49-66` |
| fumadocs spec→docs generator | `apimatic-dx-portal-v2/packages/openapi/src/generate-file.ts:95` |
| Reference build with per-example samples | `C:/Users/mrafn/Downloads/mre-build/codesamples-per-example-build` |
