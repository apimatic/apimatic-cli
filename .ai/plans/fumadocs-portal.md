# Plan: Local Fumadocs Portal Generation (next major release)

Status: implemented on branch `saeedjamshaid/fumadocs-portal` (steps 1 to 3
committed 2026-09-16 and 2026-09-17, plus the review fixes listed in section
12). Not merged; the PR against `dev` is not yet open. Last updated
2026-09-17. Section 12 lists what remains.

## 1. Goal and scope

Replace server-side portal generation (`DocsPortalGenerationAsyncController` in
`PortalService`) with a portal built locally by the CLI on top of
[Fumadocs](https://fumadocs.dev), producing a fully static site (SSG, no Node
server at runtime).

First cut is deliberately minimal: a basic out-of-the-box portal from a new
input layout. No feature of the current portal is ported unless explicitly
requested later (SDK code samples, language switcher, theming, versioned
portals, recipes, Copilot, `:::visible` blocks and `page:` links are all out
of scope). Only OpenAPI 3.x input is supported; other spec formats are
rejected with a clear error (see section 3).

## 2. Decisions (locked)

| Topic | Decision |
|---|---|
| Framework | TanStack Start, SPA + prerender mode, no Nitro. Exact versions pinned in the CLI lockfile. |
| Output | Static files only (`dist/client` of the template build). Root hosting only (no `basePath`). |
| Input layout | Additive. `src/APIMATIC-BUILD.json` stays for SDK/plugin commands only and is removed later once SDK generation works without it. Portal reads the `portal` block of `src/apimatic.json` (which replaced `src/portal.json` on 2026-09-22, see `.ai/plans/apimatic-config.md`), `src/spec/` (shared with SDK generation), `src/content/`, `src/static/`. |
| Commands | `portal generate` replaced in place (keeps `--zip` and `--auth-key`). `portal serve` kept, rebuilt on the Vite dev server. `portal toc new`, `portal recipe new`, `portal copilot` removed, hidden stubs kept for one major. `quickstart` portal step scaffolds the new layout. |
| Node | Engine `>=22.12.0` (TanStack Start requirement; Node 20 is EOL). Explicit runtime check before building. |
| Authorization | Gate on `portal generate` and `portal serve` only (section 6). Entitlement is the boolean `isOnPremGenerationAllowed`; no spec pruning or endpoint limits for portals. |
| Delivery | One PR against `dev` containing everything (section 10). Carries the `BREAKING CHANGE` footer. |
| `$ref` handling | Deferred: Fumadocs' built-in bundling is used as-is in v1 (known risk, section 9). |

## 3. Input layout and `apimatic.json`

Amended 2026-09-22: `portal.json` became the `portal` block of `src/apimatic.json`, one
file shared with the plugin commands (`.ai/plans/apimatic-config.md`). Mentions of
`portal.json` further down this plan are historical and read as that block.

```
src/
  APIMATIC-BUILD.json   untouched; SDK/plugin commands only
  apimatic.json         portal, plugin and languages blocks (was portal.json)
  spec/                 one or more OpenAPI 3.x JSON/YAML files; one sidebar section each
  content/              .md/.mdx pages with frontmatter; optional nav.json per folder (page order)
  static/               served verbatim at the site root
```

*Amended 2026-09-23:* the v1 shape below is superseded by the nested block of
`.ai/plans/portal-config.md` (`site`, `brand`, `navigation`, `home`, `api`, `ai`,
`advanced`), which also requires a top-level `languages` entry. The text below
is kept as it was. *Amended 2026-09-24:* the first release trims that block to
`site`, `brand`, `navigation` and `ai` (that plan's section 15).

The `portal` block, v1 shape:

```json
{ "portal": { "title": "My API", "description": "optional", "logo": "static/logo.png" } }
```

`title` is required. `logo` is a path relative to `src/` and must point inside
`static/`; the CLI rewrites it to the site URL (`static/images/logo.png` becomes
`/images/logo.png`). Validation errors name the field. A `languages` section
was to be added later and checked against the subscription (section 6); it
becomes a *required* property instead, in the change that follows the
navigation work, so that it lands before the next major rather than as a second
breaking change (`.ai/plans/portal-navigation.md`, section 4). Fields
of the old `generatePortal` block that have no v1 equivalent (`navTitle`,
`logoLink`, `headIncludes`, `themeOverrides`, ...) are listed by the migration
hint so the loss is visible; they return only when explicitly specified.

Spec discovery in `spec/`: every `.json`, `.yaml` or `.yml` file whose top-level
document has an `openapi` key becomes a sidebar section, in filename order.
Files without that key (for example `APIMATIC-META.json`, which SDK generation
keeps in the same folder, or files that only hold `$ref` targets) are ignored
for sectioning and are not copied into the output. Swagger 2.0 and
non-OpenAPI formats fail validation with a message naming the file. At least
one OpenAPI document is required. Everything else follows vanilla Fumadocs
behaviour (decided: minimum rules only): untagged operations land in a group
named "unknown", the section title is the spec filename, a `$ref` to a missing
file fails the build with the bundler's error, and cross-file `$ref`s are
bundled by Fumadocs. Navigation is the one place this no longer holds: a
`nav.json` entry matching no page fails the build naming the entry, rather than
being dropped the way Fumadocs drops it (`.ai/plans/portal-navigation.md`).
With a single specification the section level is also lifted away, so the tag
groups sit directly under "API Reference".

Content: `.md` and `.mdx` are both accepted (`.mdx` is executable authoring,
as in every MDX-based tool; `<include>` targets are confined to `src/content/`).
The quickstart scaffolds a `content/index.md`, and a portal whose content
directory has none still has a `/`: the fallback home page promised here was
built in #343. `src/routes/$.tsx` answers the empty slug with a generated
landing page carrying the portal's title and description, and
`prerender-pages.ts` always seeds `/`, so the static build emits an
`index.html` either way. What it is not is a composed home page -- a title and
a description, nothing drawn from the content or the specifications -- and
making it more than that is worth its own decision rather than a line in a
layout section. Folders without `nav.json` are ordered alphabetically by
Fumadocs.

Sidebar order: set by `nav.json` per folder, with the whole API reference
positioned as one node by the `apimatic:api` token. Unnamed pages keep
Fumadocs' alphabetical order, and with no `nav.json` at all the reference sits
last. Inside the reference there is one section per spec file in filename
order, grouped by tag — except for a single specification, whose section level
is inlined. See `.ai/plans/portal-navigation.md`.

*Amended 2026-09-24* (`.ai/plans/generated-pages.md`): the top level is shown as
tabs, and two of them are pages the CLI generates: SDKs, an SDKs page and one
page per language in the `languages` block, positioned by `apimatic:sdks`; and
Context Plugin, when there is a `plugin` block, positioned by `apimatic:plugin`.
Unnamed, both sit before the API reference.

## 4. Template (`portal-template/`)

Shipped inside the npm package (add to `files`). Derived from the spike, which
was itself based on the official `tanstack-start-openapi` and
`tanstack-start-spa` Fumadocs examples. Kept as the spike has it (Geist fonts
from Google Fonts at runtime, Fumadocs page actions) except where noted.

*Amended 2026-09-23* (`.ai/plans/portal-config.md`, sections 4 and 6): the
fixed `neutral.css` import and the Geist lines have left `app.css`. The preset,
the fonts and the colour overrides are in a `src/styles/theme.css` the CLI
generates, which `app.css` imports last, and the fonts load through a head
link. The identity literal substituted into `portal.ts` is gone: `portal.ts`
imports a CLI-written `portal.identity.json`, and `portal.config.json` holds
only what the build set-up reads. The layout is chosen in `src/lib/layout.tsx`.

*Amended 2026-09-24* (`.ai/plans/portal-config.md`, section 15): the first
release cuts the preset, the fonts and the layout. `app.css` imports
`neutral.css` again and sets Geist and Geist Mono in `@theme`, `__root.tsx`
links their Google Fonts stylesheet, the generated `theme.css` holds only the
primary colour's two rules, and `layout.tsx` renders the notebook layout alone.

*Amended 2026-09-25* (PR #366): the Google Fonts link is gone. `app.css`
imports `@fontsource-variable/geist` and `geist-mono`, which the CLI copies into
the build project, and sets `--font-sans` / `--font-mono` in `@theme`.

*Amended 2026-09-24* (`.ai/plans/generated-pages.md`, sections 4 and 6):
`src/lib/source.ts` declares a second collection over the relative literal
`'generated'`, where the CLI writes the SDK and context plugin pages from the
templates in the package's `portal-pages/`; `source.server.ts` passes it to
`loader()` under the `generated` key, and `vite.config.ts` registers a
serve-only plugin that reloads the collection when a generated page is added
or removed.

- `vite.config.ts`: `fumadocsMdx()`, `tailwindcss()`, `react()`, and
  `tanstackStart({ spa: { enabled: true, maskPath: '/spa-shell', prerender: { enabled: true } }, pages: [...], prerender: { crawlLinks: false }, importProtection: { behavior: 'error' } })`.
  No `nitro()`. The `pages` list is mandatory: without it only the shell is
  prerendered (verified). Link crawling stays off: the list is complete, and the
  crawler follows root-relative links out of spec descriptions (Stripe links to
  `/docs/connect`), which 404 and fail the whole build (verified). It lists `/`, the docs root, `/api/search`,
  `/llms.txt`, `/llms-full.txt`, every content page and every page's `.md`
  URL (so the "Copy Markdown" / "Open in ..." actions resolve).
- `src/routes/spa-shell.tsx`: empty route used as the SPA mask path so that `/`
  is written as a real `index.html` (verified: without it the shell masks `/`
  and no root `index.html` exists).
- Docs mounted at `/`, not `/docs`.
- `content/`, `spec/` and `static/` are read directly from the user's `src/`
  by absolute path; nothing of the user's is copied (verified: build and dev
  server both work with all three outside the template root, and `static/`
  files land in the output through Vite's `publicDir`). One constraint: the
  `dir` of Fumadocs' `defineDocs` macro must be a string literal (the build
  fails otherwise, verified), so the CLI substitutes the placeholder in `src/lib/source.ts`
  (or substitutes a placeholder in `source.ts`) with the literal path when it
  prepares the temp project. Spec paths, static dir, title, description and
  logo come from `portal.config.json`.
- One `createOpenAPI()` server per spec file, each with `staticSource({ baseDir: 'api/<slug>', groupBy: 'tag', meta: true })`, for both `generate` and `serve`. In the dev server a spec edit is reflected immediately with the static source (verified), so `dynamicSource()` is not needed; the multi-source `loader({...})` form does not accept it anyway (`source.files is not iterable`, verified). Sharing one server across base dirs duplicates pages and clobbers the root `meta.json` (verified).
- The prerender `pages` list for spec-derived pages (and their `.md` URLs) has to be computed at build time, since the CLI cannot know Fumadocs' slugs in advance. Intended approach: enumerate the same loader inside `vite.config.ts` (`defineConfig` accepts an async function). Not yet verified; first implementation task.
- Route code treats every non-`docs` source key as an OpenAPI page.
- Anything that reads the specification off disk lives in a `*.server.ts` module
  (`source.server.ts`, `openapi.server.ts`, `llms.server.ts`, `sitemap.server.ts`)
  and is only imported from server functions and server route handlers.
  `src/lib/source.ts` keeps just the `defineDocs` collection the browser needs.
  TanStack's import protection fails the build if client code imports a
  `.server` module; before the split the loader shipped to the browser, threw
  there, and left every page unhydrated (blank under `serve`, inert under
  `generate`).
- Per-page payload is trimmed: the page tree is loaded once by the root route
  (one cache file), and `slimOpenAPIPageProps` cuts each operation page's
  bundled document to its own path item, its webhooks and the components they
  reach. Without this every page carried the whole specification twice (inlined
  router state plus the server-function cache file), so output grew with
  pages x document size: 150 Stripe operations produced 812 MB.
- Request samples: fumadocs generates cURL only (`createOpenAPIPage({ codeUsages })` with an
  empty registry, `src/components/api-page.tsx`). Every language comes from
  `x-apimatic-codeSamples`, which the template places on each operation as it bundles the
  spec, from the `code-samples.json` the CLI writes; `src/components/usage-tabs.tsx` renders
  a cURL tab, then one tab per language, following the example selector.
- Per-route `head()` with title, meta description (frontmatter or operation summary) and canonical URL.
- Static Orama search index (`server.staticGET()`), `llms.txt` with a cheap per-page renderer (never serialize the spec per page).
- Reads `portal.config.json` written by the CLI into the build directory (title, description, logo URL, absolute spec paths, absolute static dir); the content dir is the generated literal described above.
- Uses `staticFunctionMiddleware` from `@tanstack/start-static-server-functions` so loaders run at build time.
- The spike's placeholder GitHub link to the Fumadocs repository and its dead `src/lib/cn.ts` re-export are removed (`cn` is not a CLI dependency).
- `app.css` adds `@source not "./dist";` so Tailwind never scans previous output.
- No `.gitignore` inside the template (`npm pack` honours nested `.gitignore` files and would drop content). The template's own `package.json` is shipped: TanStack Start reads it from cwd.
- Excluded from the CLI's `tsc`, ESLint and Prettier runs (`tsconfig.json` `exclude`, `eslint.config.js` ignores, `.prettierignore`).
- After the build the CLI copies `_shell.html` to `404.html`. GitHub Pages and Netlify pick it up automatically; S3 needs the error document configured.

Tailwind 4 is mandatory for Fumadocs UI.

## 5. Build mechanics (`portal generate`)

1. Preflight: Node `>=22.12.0` (engines is warn-only for npm installs), and
   resolve the platform bindings for rolldown, lightningcss and
   `@tailwindcss/oxide`; fail with a named error if missing.
2. Temp dir via `withBuildDirectory`: the system temp directory, unless it is on a
   different Windows drive from the source, in which case a self-ignoring
   `.apimatic-build/` folder beside `src/` is used and removed afterwards. Vite's
   `import.meta.glob` needs a relative path from the project to the content
   directory and `path.relative` cannot express one across drives, so the content
   pages silently vanished (found on GitHub's Windows runners: workspace on D:,
   temp on C:; reproduced locally with `subst`).
3. Copy `portal-template/` into it.
4. Create a real `tempDir/node_modules/` directory and add one junction
   (Windows) or symlink (elsewhere) per template dependency, each resolved to
   its package root with `createRequire(import.meta.url)`. A single junction to
   "the CLI's node_modules" does not work under pnpm global, `npx` or
   `pnpm dlx` (the package has no nested `node_modules`), and lets Vite write
   `.vite-temp` into the CLI's own install directory (verified). Vite's binary
   is located the same way. Cleanup must go through Node's `fs.rm` (which
   `tmp-promise` uses and which removes a junction without following it,
   verified); never a shell `rm -rf`, which follows junctions on Windows and
   deletes the linked packages (verified the hard way during the spike).
5. Write `portal.config.json` (absolute paths to the user's `spec/` files and
   `static/`, plus title/description/logo) and the generated content-dir
   literal (section 4).
6. Run `process.execPath <vite>/bin/vite.js build` through `execa` with
   `cwd: tempDir` (TanStack Start resolves entries from `process.cwd()`,
   verified), `extendEnv: false` and an allow-listed env (`PATH`,
   `HOME`/`USERPROFILE`, `TEMP`/`TMP`, `NODE_OPTIONS` with
   `--max-old-space-size=4096` appended to any existing value). The auth key
   is never passed to the child; no `VITE_*` variable can leak into the bundle.
   A child process isolates a build crash or out-of-memory from the CLI.
   `tempDir/dist` is removed before the build.
7. Assert the prerender emitted more than the shell and that `index.html`
   exists; otherwise fail.
8. Copy `dist/client` to the destination, add `404.html`, and zip to
   `portal.zip` when `--zip` is set (existing `ZipService`). On failure, copy
   the build log to `<destination>/apimatic-debug/build.log` and print its
   tail (the temp dir is deleted before the message is shown).

Measured 2026-09-17 on Windows, Node 23.4, with the pinned versions and the
payload trim from section 4 in place:

| Case | Build time | Output |
|---|---|---|
| Calculator fixture, 1 operation + 1 page | 6 s | 11 MB, of which 10.9 MB is the fixed JavaScript bundle (framework plus Shiki grammars) |
| Stripe, 20 operations | 15 s | 68 MB; 1.2 MB of HTML plus a 1.8 MB cache file per operation |
| Stripe, 150 operations | 45 s | 469 MB (812 MB before the trim, when every page carried the whole document) |

Each page writes its loader payload twice: inlined as router state in the
HTML, and as `__tsr/staticServerFnCache/<hash>.json` for client-side
navigation. The payload is the trimmed document, so the per-page cost depends
on how connected the spec's schema graph is. Stripe reaches about 870 of its
1454 schemas from a single operation, so the full 594-operation spec projects
to about 1.2 GB of document bytes; GitHub's 1239 operations project to about
44 MB; Petstore-shaped specs stay at a few kilobytes per page. Deep
non-recursive `$ref` chains inflate pages geometrically (a synthetic 60-deep
chain OOMed at 4 GB); real specs are fine.

## 6. Authorization gate (`portal generate` and `portal serve` only)

1. Resolve key: `--auth-key` flag, then the stored key in `config.json`. Same
   two-tier resolution as every other command; no environment variable tier.
   The flag value is never persisted.
2. No key: fail, hint to run `apimatic auth login`.
3. Call existing `GET /account/profile` via `ApiService.getAccountInfo` with an
   explicit ~10 s timeout.
   - 401: fail with the login hint.
   - Any other failure (timeout, DNS, 5xx): fail closed, "could not verify your
     subscription with api.apimatic.io" (or the configured base URL).
4. Check `isOnPremGenerationAllowed`. Denied: "Your subscription does not
   include portal generation" plus account/pricing link. This is the whole
   policy: an account with the flag gets unlimited portal generation; the
   endpoint caps and feature pruning the server applied to the old portal do
   not apply (decided).
5. Only then start the build or dev server. `portal serve` runs the gate once
   at startup, never on rebuilds.
6. Later: when `portal.json` gains `languages`, check them against
   `allowedLanguages`.

Implemented as `PortalAuthorizationService` (infrastructure, returns `Result`
with variants unauthenticated / unverifiable / notEntitled), called first by
both actions, each variant mapped to its own prompt (one shared wording with
the existing quickstart message).

## 7. CLI architecture changes

Follow the five-layer conventions in `.ai/instructions.md` and the skills in
`.ai/skills/`.

- **Types**: `PortalConfig` value object (parses/validates `portal.json`); `PortalSourceContext` (layout existence and validation: `portal.json` present and valid, at least one OpenAPI document in `spec/`, `content/` and `static/` optional). `BuildContext` unchanged. `src/types/file/directory.ts` refactored so it no longer imports the deleted TOC types or describes `toc.yml`.
- **Infrastructure**: `PortalBuildService` (section 5), `PortalDevServerService` (section 7 serve), `PortalAuthorizationService` (section 6). Remove `generatePortal`, `generateSdl`, `generateTocData` and the portal status polling from `PortalService`.
- **`portal generate`** (`GenerateAction` rewritten): gate, validate source, confirm overwrite, build with a spinner showing elapsed time, report. Flags: `--input`, `--destination`, `--force`, `--zip`, `--auth-key`. Command class uses `export default class` (convention).
- **`portal serve`** (rewritten on the Vite dev server, decided): gate once, prepare the same temp project as `generate` (template + linked deps + config pointing at the user's `src/`), start `vite dev` on the chosen port with the same env isolation, open the browser. Content edits are live in under a second and spec edits immediately (both verified against the dev server: content change visible after ~0.8 s, spec summary change visible on the next request); compile errors appear in Vite's browser overlay with file and line. Express, livereload, connect-livereload and chokidar are used only by the current serve action (verified), so they are removed from `package.json`. Ctrl+C returns `ActionResult.stopped()` (exit 130, convention) and quickstart's result check is adjusted. Flags: keep `--input`, `--port`, `--open`, `--auth-key`; drop `--destination` (the dev server has no output folder) and `--no-reload` (reload is always on). Measured dev-server startup: 9 to 18 s with a warm Vite cache, 45 to 60 s on the first run while Vite pre-bundles dependencies; the CLI shows a spinner until the server answers.
- **Migration hint**: both commands print one when `APIMATIC-BUILD.json` has `generatePortal` or `generateVersionedPortal` and `portal.json` is missing, listing the old fields with no v1 equivalent and a minimal `portal.json` to copy. **Removed 2026-09-22** on `saeedjamshaid/portal-navigation`: the CLI carries no messaging that maps the 1.x setup onto the 2.0 one. A missing `portal.json` points at `quickstart`, whatever sits beside it.
- **Removals**: `portal toc new`, `portal recipe new`, `portal copilot` commands, actions, prompts, application code (`application/portal/toc`, `application/portal/recipe`), related types and the `ToCCreationFailedEvent`/`RecipeCreationFailedEvent` telemetry events and tests. Hidden stub commands with the same ids remain for one major, print "removed in v2, see <migration notes>" and exit 1 (otherwise users get "not a command", exit 127). Update `test/commands/examples-parse.test.ts`, the `.ai/skills/*.md` files and `.ai/instructions.md` that cite the deleted files as examples, and remove the `portal:toc` topic from `package.json`. Release notes mention `apimatic autocomplete --refresh-cache`.
- **Quickstart**: the portal step writes `portal.json`, `content/index.md`, `content/meta.json` and calls the new serve; its language-selection, build-file and prune steps are dropped for the portal path until `portal.json` gains `languages`. Its summary and closing "next steps" copy no longer mention themes, recipes or Copilot. The sample repository (`sample-docs-as-code-portal`) has a permanent `v2` branch with the new layout; both quickstarts download their defaults from it.
- **Telemetry**: `portal generate` and `portal serve` emit no telemetry events today and none are added.
- **Packaging/tooling**: engine `>=22.12.0`; pinned exact versions of the runtime set: `@tanstack/react-router`, `@tanstack/react-start`, `@tanstack/start-static-server-functions`, `fumadocs-core`, `fumadocs-mdx`, `fumadocs-openapi`, `fumadocs-ui`, `react`, `react-dom`, `lucide-react`, `shiki`, `yaml`, `vite`, `@vitejs/plugin-react`, `tailwindcss`, `@tailwindcss/vite`. All ship as hard dependencies (decided; a companion package is a possible later optimisation). Production-only install measured at 235 MB / 363 packages (lucide-react alone 39 MB). Every version the spike built with was published inside the repo's 7-day `minimumReleaseAge` window; before implementation the spike is re-verified on the newest installable set (today: fumadocs-core/ui 16.15.8, fumadocs-openapi 11.4.1, fumadocs-mdx 15.4.0, `@tanstack/react-start` 1.168.50, vite 8.2.2, react 19.0.8, lucide-react 1.43.0) and those are pinned. `fumadocs-ui` pins `fumadocs-core` to an exact version, so Renovate groups `fumadocs-*`, `@tanstack/*` and `vite`/`@vitejs/*` with a 7-day minimum age. `pnpm-workspace.yaml` already has `allowBuilds: esbuild: true`; nothing to add. README is regenerated (`pnpm readme`) in the PR.

## 8. Tests and CI

- Unit: `PortalConfig` parsing, `PortalSourceContext` validation, migration hint, `PortalAuthorizationService` precedence and the three failure paths (nock), dependency linking (per-package resolution), a test that every bare import in `portal-template/` is a direct CLI dependency, and an `npm pack --dry-run` check that the template ships completely.
- End-to-end: one real build against a new fixture in the `portal.json` layout (the Calculator spec) asserting page count, `index.html`, `404.html` and content presence, gated behind an env variable (~30 s).
- CI: `check_build.yml` runs only `pnpm build` on Ubuntu today and nothing runs the tests. Add a test job on `ubuntu-latest`, `windows-latest` and `macos-latest` with Node 22.12 and 24 that runs `pnpm test` including the gated e2e build (the spike ran on Node 23 only). Prefer a Windows runner with long paths disabled.
- Remove tests of deleted commands.

## 9. Risks (accepted or deferred)

- **`$ref` file read / SSRF (deferred, known risk).** Fumadocs bundles refs with Scalar json-magic's directory confinement and private-network guard disabled. Verified: a `$ref` to an absolute path, a `../` traversal or a loopback URL is read during the build and embedded in the published static-loader JSON. Exposure is the machine running `portal generate`/`serve` on a spec it did not author (for example a spec from an untrusted pull request in CI). Mitigation options, all small (~20 to 100 lines): reject non-`#/` refs; validate refs to stay inside `src/spec/`; or pre-bundle with json-magic's guards on. Decided to ship v1 with Fumadocs' behaviour and document it in the release notes; revisit in a follow-up.
- TanStack Start is a release candidate; mitigated by exact pinning.
- Large, densely connected APIs still yield large output folders (section 5:
  a Stripe-shaped spec approaches 1 GB at full size). The remaining lever is the
  second copy of each page's payload; see section 12.
- Generated site is not self-contained: Geist fonts load from Google Fonts at runtime and Fumadocs' page actions link to ChatGPT/Claude/Cursor (decided to keep as-is for v1). *Amended 2026-09-23:* the fonts are now a shortlist in `portal.brand.fonts`, each still from Google Fonts, and `system` for both makes no font request at all; `portal.ai.pageActions: false` removes the external links. *Amended 2026-09-24:* the shortlist is cut for the first release, so Geist and Geist Mono are fixed and load from Google Fonts again, as in v1; `portal.ai.pageActions: false` still removes the external links. *Amended 2026-09-25:* the fonts are bundled with the site from `@fontsource-variable` (PR #366), because the Google stylesheet held up first paint and hydration by 1–3 s on a first visit; only the page actions still reach another origin.
- Verified on Windows only; macOS/Linux via the new CI matrix.
- Try-it playground requires CORS on the customer's API (Fumadocs' proxy needs a server). Out of scope.
- Fumadocs UI is mid-transition to `@fumadocs/base-ui`; fumadocs-openapi has had three majors in about a year; several single-maintainer and 0.x packages in the tree (`lucide-react`, `yuku-analyzer` with native binaries, `zbsearch`, `h3` RC). Mitigated by pinning and the e2e test.
- Licenses in the tree are permissive but not all MIT: `lightningcss` MPL-2.0, `caniuse-lite` CC-BY-4.0. No CI gate (decided).
- 235 MB of build-time dependencies land on every user, including SDK-only users (decided for v1).

## 10. Delivery

One PR against `dev` (decided) containing: dependencies and engine bump,
`portal-template/`, `PortalConfig`/`PortalSourceContext`, the three services,
rewritten `portal generate` and `portal serve`, quickstart portal step,
command removals with stubs, README regeneration, tests and the new CI test
workflow. The squash commit carries a `BREAKING CHANGE:` footer (engine bump,
removed commands, new input layout) so semantic-release cuts the major.
`release.config.cjs` gains a `1.x` maintenance branch so 1.x hotfixes keep a
release path once `2.0.0` prereleases exist. Prerequisite outside this repo:
the new-layout branch in the sample repository.

## 11. Resolved questions (2026-09-16)

- Portal entitlement field on `/account/profile` is `isOnPremGenerationAllowed`; policy is boolean, no limits.
- No `basePath` in the first cut; root or sub-domain hosting only.
- Non-OpenAPI-3 specs fail with a clear error; no automatic conversion.
- `--zip` is kept (removing it would fail existing CI invocations at flag parsing).
- No `APIMATIC_AUTH_KEY` environment tier.
- `$ref` sanitisation deferred.
- Spec edge cases: minimum rules only (at least one OpenAPI document).
- `portal serve` uses the Vite dev server with HMR (static OpenAPI source is enough; no dynamic source).
- The content directory is injected as a string literal into the template at prepare time (Fumadocs macro constraint); everything else via `portal.config.json`.
- Template kept as the spike has it, plus per-page `.md` output so its buttons work.
- One PR for everything.

## 12. Status and next steps (2026-09-17)

### Done, on `saeedjamshaid/fumadocs-portal`

- Step 1 (`cead557`): dependencies, engine bump, `portal-template/`.
- Step 2 (`e34e878`): `PortalConfig`, `PortalSourceContext`, the three
  services, the authorization gate, `portal generate`, `portal serve`, per-page
  head tags, sitemap and robots.
- Step 3 (`3a6d892` to `b581c75`): command removals with hidden stubs,
  quickstart scaffolding the new layout, the reserved `search` slug, tests, the
  CI test matrix, the `1.x` release branch, project docs and README.
- Review fixes (`e0907b2` to `8ca60cb`): crawler off; server-only module
  split with import protection (the blank page under `serve` and the inert
  pages under `generate`); payload trim (root-route tree loader and
  `slimOpenAPIPageProps`); eslint ignores for the scratch directories. Suite at
  328 tests including the gated end-to-end build.
- Verified in headless Chrome, not only by reading HTML: a generated operation
  page hydrates with no console errors, and `portal serve` renders the Petstore
  sample's home and operation pages.

### Remaining before the PR merges

1. **PR #343 against `dev` is open** (2026-09-17). Its first run of the test matrix
   found two problems, both fixed on the branch: pnpm 11 needs Node 22.13, so the
   22.12 jobs could not install (now a standalone pnpm), and Windows builds lost
   the content pages across drives (section 5, step 2). Node 24 on Linux and
   macOS passed the full suite including the end-to-end build on the first run.
2. **Squash commit with the `BREAKING CHANGE:` footer**: engine `>=22.12.0`;
   `portal toc new`, `portal recipe new` and `portal copilot` removed (hidden
   stubs exit 1); new `src/portal.json` layout; `portal serve` drops
   `--destination` and `--no-reload`. Release notes also mention
   `apimatic autocomplete --refresh-cache`, the deferred `$ref` file-read risk
   (section 9) and that generated sites load Geist from Google Fonts.
   *Amended 2026-09-25:* drop the Google Fonts line; the fonts are bundled with the site (PR #366).
3. **Sample repository** `sample-docs-as-code-portal`: done 2026-09-17. `v2` is a
   permanent branch for the CLI 2 layout (`54d2cb3`: spec renamed
   `spec/petstore.json`, deploy workflow pinned to `@apimatic/cli@2`, artifact
   upload only); `master` stays the CLI 1 sample, its workflow pinned to `@1`
   (`3b148cd`). Both quickstarts download their defaults from `v2`.
4. **Dependency update policy.** No Renovate or Dependabot configuration exists
   in the repository, so the grouping described in section 7 is not in place.
   Decide whether to add one; until then the pinned runtime set only moves by
   hand.
5. **Packaging check.** `files` in `package.json` lists `./portal-template`
   (verified by hand 2026-09-17); the `npm pack --dry-run` assertion from
   section 8 is not automated.

### Follow-ups, not blocking the release

- **Browser-level smoke test in CI.** The hydration regression was invisible to
  every HTML-reading test. The end-to-end suite now greps the client bundle for
  the loader's error string, which catches that one leak, not the class. A
  headless-Chrome check exists as a scratch script (serve `dist/client`, spawn
  Chrome asynchronously with `--dump-dom`, and for the dev server add a
  virtual time budget and load twice); consider a gated e2e step on runners
  that ship a browser.
- **Dev-server output.** `PortalDevServerService` stops relaying Vite's output
  once it sees the `Local:` line, so anything Vite reports afterwards is lost.
  Keep relaying, or at least surface errors.
- **Untagged operations** are grouped under `unknown`
  (`/api/<spec>/unknown/<operationId>`) in URLs and the sidebar. Choose a
  fallback group name.
- **Cross-drive builds and fumadocs-mdx.** The `.apimatic-build/` fallback (section 5,
  step 2) stays until fumadocs-mdx handles content on another Windows drive.
  Evaluated 2026-09-17: the config-file mode with `index: { target: 'default' }`
  does not help, because `formatImportPath` also uses `path.relative` and emits
  `./D:/...` for a cross-drive file (run against the package's own codegen). The
  fix belongs upstream: emit an absolute path (or `/@fs/`) when `path.relative`
  returns one. File an issue with fumadocs-mdx; remove the fallback once a fixed
  version is pinned.
- **Sidebar tree dominates at scale.** Whole-spec prerenders measured 2026-09-17:
  Stripe (594 operations) 2.2 GB in 375 s, GitHub (1,511 pages) 2.4 GB in 229 s.
  A GitHub page is 1,971 KB: 1,453 KB of inlined router state (almost all the
  sidebar tree; the trimmed document is ~44 KB) plus 470 KB of sidebar markup,
  with 48 KB for the page itself. Loading the tree from its single cache file
  instead of dehydrating it into every page would cut GitHub-sized output by
  roughly two thirds; the sidebar markup would still repeat. SSR and pure SPA
  builds of the same specs are 11 to 14 MB but need a Node server (SSR, plus
  the ~235 MB dependency install at runtime) or ship no page data at all (SPA).
- **Second payload copy.** Each page still carries its trimmed document twice
  (inline router state and cache file). Dropping the inline copy means the
  client fetches the cache file during hydration; it roughly halves the output
  for spec-heavy portals at the cost of a fetch before the page is interactive.
  The sidebar tree is also dehydrated into every page's HTML and into the SPA
  shell that becomes `404.html` (87 KB at 150 operations); kept so a host that
  rewrites unknown paths to the shell can still render the layout.
- **Trim limitation.** A `$ref` into another path item (`#/paths/...`) rather
  than into `components` would be left dangling. Not seen in practice, since
  bundlers hoist such references; the unit tests cover components,
  `discriminator.mapping` and JSON-pointer-escaped names.
- Section 9 items stand: `$ref` file-read/SSRF deferred, Google Fonts at
  runtime, try-it playground needs CORS on the customer's API.
  *Amended 2026-09-25:* the Google Fonts item is closed; the fonts are bundled (PR #366).
