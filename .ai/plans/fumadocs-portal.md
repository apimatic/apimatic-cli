# Plan: Local Fumadocs Portal Generation (next major release)

Status: approved design after adversarial review (three independent reviews,
2026-09-16). Implementation not started. Last updated 2026-09-16.

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
| Input layout | Additive. `src/APIMATIC-BUILD.json` stays for SDK/plugin commands only and is removed later once SDK generation works without it. Portal reads `src/portal.json`, `src/spec/` (shared with SDK generation), `src/content/`, `src/static/`. |
| Commands | `portal generate` replaced in place (keeps `--zip` and `--auth-key`). `portal serve` kept, rebuilt on the Vite dev server. `portal toc new`, `portal recipe new`, `portal copilot` removed, hidden stubs kept for one major. `quickstart` portal step scaffolds the new layout. |
| Node | Engine `>=22.12.0` (TanStack Start requirement; Node 20 is EOL). Explicit runtime check before building. |
| Authorization | Gate on `portal generate` and `portal serve` only (section 6). Entitlement is the boolean `isOnPremGenerationAllowed`; no spec pruning or endpoint limits for portals. |
| Delivery | One PR against `dev` containing everything (section 10). Carries the `BREAKING CHANGE` footer. |
| `$ref` handling | Deferred: Fumadocs' built-in bundling is used as-is in v1 (known risk, section 9). |

## 3. Input layout and `portal.json`

```
src/
  APIMATIC-BUILD.json   untouched; SDK/plugin commands only
  portal.json           portal-only config
  spec/                 one or more OpenAPI 3.x JSON/YAML files; one sidebar section each
  content/              .md/.mdx pages with frontmatter; optional meta.json per folder (Fumadocs format)
  static/               served verbatim at the site root
```

`portal.json` v1 schema:

```json
{ "title": "My API", "description": "optional", "logo": "static/logo.png" }
```

`title` is required. `logo` is a path relative to `src/` and must point inside
`static/`; the CLI rewrites it to the site URL (`static/images/logo.png` becomes
`/images/logo.png`). Validation errors name the field. A `languages` section
will be added later and checked against the subscription (section 6). Fields
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
named "unknown", the section title is the spec filename, `meta.json` entries
with no matching page are silently ignored, a `$ref` to a missing file fails
the build with the bundler's error, and cross-file `$ref`s are bundled by
Fumadocs.

Content: `.md` and `.mdx` are both accepted (`.mdx` is executable authoring,
as in every MDX-based tool; `<include>` targets are confined to `src/content/`).
If `content/index.md` or `index.mdx` is absent, the CLI generates a home page
from `title` and `description` so `/` always resolves. Folders without
`meta.json` are ordered alphabetically by Fumadocs.

Sidebar order: content pages in `meta.json` order first, then one section per
spec file in filename order, grouped by tag inside each spec.

## 4. Template (`portal-template/`)

Shipped inside the npm package (add to `files`). Derived from the spike, which
was itself based on the official `tanstack-start-openapi` and
`tanstack-start-spa` Fumadocs examples. Kept as the spike has it (Geist fonts
from Google Fonts at runtime, Fumadocs page actions) except where noted.

- `vite.config.ts`: `fumadocsMdx()`, `tailwindcss()`, `react()`, and
  `tanstackStart({ spa: { enabled: true, maskPath: '/spa-shell', prerender: { enabled: true, crawlLinks: true } }, pages: [...] })`.
  No `nitro()`. The `pages` list is mandatory: without it only the shell is
  prerendered (verified). It lists `/`, the docs root, `/api/search`,
  `/llms.txt`, `/llms-full.txt`, every content page and every page's `.md`
  URL (so the "Copy Markdown" / "Open in ..." actions resolve).
- `src/routes/spa-shell.tsx`: empty route used as the SPA mask path so that `/`
  is written as a real `index.html` (verified: without it the shell masks `/`
  and no root `index.html` exists).
- Docs mounted at `/`, not `/docs`.
- `content/` and `spec/` are read directly from the user's `src/` by absolute
  path (verified); `static/` is Vite's `publicDir`. Nothing of the user's is
  copied.
- One `createOpenAPI()` server per spec file, each with `staticSource({ baseDir: 'api/<slug>', groupBy: 'tag', meta: true })` for `generate` and `dynamicSource()` for `serve` (so spec edits are picked up). Sharing one server across base dirs duplicates pages and clobbers the root `meta.json` (verified).
- Route code treats every non-`docs` source key as an OpenAPI page.
- Per-route `head()` with title, meta description (frontmatter or operation summary) and canonical URL.
- Static Orama search index (`server.staticGET()`), `llms.txt` with a cheap per-page renderer (never serialize the spec per page).
- Reads `portal.config.json` written by the CLI into the build directory (title, description, logo URL, absolute input paths).
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
2. `withDirPath` temp dir under a short base path (Windows long paths may be off).
3. Copy `portal-template/` into it.
4. Create a real `tempDir/node_modules/` directory and add one junction
   (Windows) or symlink (elsewhere) per template dependency, each resolved to
   its package root with `createRequire(import.meta.url)`. A single junction to
   "the CLI's node_modules" does not work under pnpm global, `npx` or
   `pnpm dlx` (the package has no nested `node_modules`), and lets Vite write
   `.vite-temp` into the CLI's own install directory (verified). Vite's binary
   is located the same way.
5. Write `portal.config.json` (absolute paths to the user's `content/`,
   `spec/` files and `static/`, plus title/description/logo).
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

Measured on Windows, Node 23 (must be re-measured on the installable
versions, see section 7):

| Case | Build time | Output |
|---|---|---|
| 2 small specs + 3 pages | 20 to 40 s | 14 MB |
| 150 operations across 3 specs | 41 s | 136 MB on disk; ~37 KB gzipped per page |

Every page embeds the full sidebar tree and every OpenAPI page ships a
~490 KB static-loader JSON containing the bundled spec. Accepted for the first
cut. Deep non-recursive `$ref` chains inflate pages geometrically (a synthetic
60-deep chain OOMed at 4 GB); real specs are fine.

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
- **`portal serve`** (rewritten on the Vite dev server, decided): gate once, prepare the same temp project as `generate` (template + linked deps + config pointing at the user's `src/`), start `vite dev` on the chosen port with the same env isolation, open the browser. Content edits hot-reload in the browser in under a second; spec edits are picked up through the OpenAPI dynamic source; compile errors appear in Vite's browser overlay with file and line. No Express, livereload or chokidar in the portal path (remove those dependencies if nothing else uses them). Ctrl+C returns `ActionResult.stopped()` (exit 130, convention) and quickstart's result check is adjusted. Flags: `--input`, `--port`, `--no-open`, `--auth-key`; `--hot-reload` is dropped (always on). Measured dev-server startup: ~9 s.
- **Migration hint**: both commands print one when `APIMATIC-BUILD.json` has `generatePortal` or `generateVersionedPortal` and `portal.json` is missing, listing the old fields with no v1 equivalent and a minimal `portal.json` to copy.
- **Removals**: `portal toc new`, `portal recipe new`, `portal copilot` commands, actions, prompts, application code (`application/portal/toc`, `application/portal/recipe`), related types and the `ToCCreationFailedEvent`/`RecipeCreationFailedEvent` telemetry events and tests. Hidden stub commands with the same ids remain for one major, print "removed in v2, see <migration notes>" and exit 1 (otherwise users get "not a command", exit 127). Update `test/commands/examples-parse.test.ts`, the `.ai/skills/*.md` files and `.ai/instructions.md` that cite the deleted files as examples, and remove the `portal:toc` topic from `package.json`. Release notes mention `apimatic autocomplete --refresh-cache`.
- **Quickstart**: the portal step writes `portal.json`, `content/index.md`, `content/meta.json` and calls the new serve; its language-selection, build-file and prune steps are dropped for the portal path until `portal.json` gains `languages`. Its summary and closing "next steps" copy no longer mention themes, recipes or Copilot. The sample repository (`sample-docs-as-code-portal`) gets a new branch with the new layout; `sdk quickstart` keeps using the current one.
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
- Large APIs yield large output folders (see section 5).
- Generated site is not self-contained: Geist fonts load from Google Fonts at runtime and Fumadocs' page actions link to ChatGPT/Claude/Cursor (decided to keep as-is for v1).
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
- `portal serve` uses the Vite dev server with HMR.
- Template kept as the spike has it, plus per-page `.md` output so its buttons work.
- One PR for everything.
