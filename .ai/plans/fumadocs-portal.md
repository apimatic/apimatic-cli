# Plan: Local Fumadocs Portal Generation (next major release)

Status: approved design, implementation not started. Last updated 2026-09-16.

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
| Output | Static files only (`dist/client` of the template build). |
| Input layout | Additive. `src/APIMATIC-BUILD.json` stays for SDK/plugin commands only and is removed later once SDK generation works without it. Portal reads `src/portal.json`, `src/spec/` (shared with SDK generation), `src/content/`, `src/static/`. |
| Commands | `portal generate` replaced in place. `portal serve` kept and rewired to the local build. `portal toc new`, `portal recipe new`, `portal copilot` removed. `quickstart` portal step scaffolds the new layout. |
| Node | Engine bumped to `>=22.12.0` (required by TanStack Start and Vite 8; Node 20 is EOL). |
| Authorization | New gate on `portal generate` and `portal serve` only (see section 6). Other commands keep their existing auth handling. |

## 3. Input layout and `portal.json`

```
src/
  APIMATIC-BUILD.json   untouched; SDK/plugin commands only
  portal.json           portal-only config
  spec/                 one or more OpenAPI 3.x JSON/YAML files; one sidebar section each
  content/              .md/.mdx pages with frontmatter; optional meta.json per folder (Fumadocs format)
  static/               copied verbatim to the site root
```

`portal.json` v1 schema:

```json
{ "title": "My API", "description": "optional", "logo": "static/logo.png" }
```

`title` is required. `logo` is a path relative to `src/` and must point inside
`static/`; the CLI rewrites it to the site URL (`static/images/logo.png` becomes
`/images/logo.png`). Validation errors name the field. A `languages` section
will be added later and checked against the subscription (section 6).

Spec discovery in `spec/`: every `.json`, `.yaml` or `.yml` file whose top-level
document has an `openapi` key becomes a sidebar section, in filename order.
Files without that key (for example `APIMATIC-META.json`, which SDK generation
keeps in the same folder, or files that only hold `$ref` targets) are copied
along but do not become sections. Swagger 2.0 and non-OpenAPI formats fail
validation with a message naming the file. Fumadocs bundles cross-file `$ref`s.

Content: if `content/index.md` or `index.mdx` is absent, the CLI generates a
home page from `title` and `description` so `/` always resolves. Folders
without `meta.json` are ordered alphabetically by Fumadocs.

Sidebar order: content pages in `meta.json` order first, then one section per
spec file in filename order, grouped by tag inside each spec.

## 4. Template (`portal-template/`)

Shipped inside the npm package (add to `files`). Derived from the spike, which
was itself based on the official `tanstack-start-openapi` and
`tanstack-start-spa` Fumadocs examples.

- `vite.config.ts`: `fumadocsMdx()`, `tailwindcss()`, `tanstackStart({ spa: { enabled: true, prerender: { enabled: true, crawlLinks: true } } })`, `react()`. No `nitro()`.
- One `createOpenAPI()` server per spec file, each with `staticSource({ baseDir: 'api/<name>', groupBy: 'tag', meta: true })`. Sharing one server across base dirs duplicates pages and clobbers the root `meta.json` (verified).
- Route code treats every non-`docs` source key as an OpenAPI page.
- Docs mounted at `/`, not `/docs`.
- Per-route `head()` with title, meta description (frontmatter or operation summary) and canonical URL.
- Static Orama search index (`server.staticGET()`), `llms.txt` with a cheap per-page renderer (never serialize the spec per page).
- Reads `portal.config.json` written by the CLI into the build directory.
- Uses `staticFunctionMiddleware` from `@tanstack/start-static-server-functions` so loaders run at build time.
- Excluded from the CLI's `tsc`, ESLint and Prettier runs (`tsconfig.json` `exclude`, `eslint.config.js` ignores, `.prettierignore`).
- After the build the CLI copies `_shell.html` to `404.html` so static hosts (GitHub Pages, Netlify, S3) serve the app shell for unknown routes without a rewrite rule.

Tailwind 4 is mandatory for Fumadocs UI. Tailwind auto-source detection skips
`node_modules`, which is fine because the build runs from a temp directory
outside the package (section 5).

## 5. Build mechanics (verified in spike)

1. `withDirPath` temp dir.
2. Copy `portal-template/` (without `node_modules`) into it.
3. Link `node_modules` in the temp dir to the CLI package's own `node_modules`: directory junction on Windows, symlink elsewhere. Verified: a junctioned copy builds identically.
4. Copy `spec/`, `content/`, `static/` into the template's expected folders; write `portal.config.json` from `portal.json`.
5. Run the build in a child process with `execa` (already a dependency): `node <cli>/node_modules/vite/bin/vite.js build`, `cwd: tempDir`, `NODE_OPTIONS=--max-old-space-size=4096`. TanStack Start's prerender resolves the router entry from `process.cwd()`, so cwd must be the temp dir (verified failure otherwise). A child process avoids mutating the CLI's own cwd, isolates a build crash or out-of-memory from the CLI process, and lets stdout/stderr stream to a log file. In-process `createBuilder({ root }).buildApp()` after `process.chdir` also works (verified) and stays as the fallback if spawning proves problematic; plain `build()` does not, it only builds the client environment.
6. Copy `dist/client` to the destination and add `404.html` (section 4). Build log is written to a file in the temp dir and shown on failure.

Measured on Windows, Node 23:

| Case | Build time | Output |
|---|---|---|
| 2 small specs + 3 pages | 20 to 40 s | 14 MB |
| 150 operations across 3 specs | 41 s | 136 MB on disk; ~37 KB gzipped per page |

Every page embeds the full sidebar tree and every OpenAPI page ships a
~490 KB static-loader JSON containing the bundled spec. Accepted for the first
cut. Deep non-recursive `$ref` chains inflate pages geometrically (a synthetic
60-deep chain OOMed at 4 GB); real specs are fine, a depth guard is a follow-up.

## 6. Authorization gate (`portal generate` and `portal serve` only)

1. Resolve key: `--auth-key` flag > `APIMATIC_AUTH_KEY` env > stored key in `config.json`. Flag and env values are never persisted.
2. No key: fail, hint to run `apimatic auth login`.
3. Call existing `GET /account/profile` via `ApiService.getAccountInfo`.
   - 401: fail with the login hint.
   - Any other failure (timeout, DNS, 5xx): fail closed, "could not verify your subscription".
4. Check portal entitlement on the profile: `isOnPremGenerationAllowed` must be true. Denied: "Your subscription does not include portal generation" plus account/pricing link.
5. Only then start the local build. `portal serve` runs the gate once at startup, never on rebuilds.
6. Later: when `portal.json` gains `languages`, check them against `allowedLanguages`.

No spec pruning. Implemented as `PortalAuthorizationService` (infrastructure,
returns `Result` with variants unauthenticated / unverifiable / notEntitled),
called first by both actions, each variant mapped to its own prompt.

## 7. CLI architecture changes

Follow the five-layer conventions in `.ai/instructions.md` and the skills in
`.ai/skills/`.

- **Types**: `PortalConfig` value object (parses/validates `portal.json`); `PortalSourceContext` (layout existence and validation; `spec/` non-empty, `content/` and `static/` optional). `BuildContext` unchanged.
- **Infrastructure**: `PortalBuildService` (section 5), `PortalAuthorizationService` (section 6). Remove `generatePortal` and portal status polling from `PortalService` once nothing calls them.
- **Actions/Prompts**: `GenerateAction` rewritten (gate, validate source, confirm overwrite, build with spinner, report). `PortalServeAction` keeps its shape: gate once, build, serve `dist/client` via Express + livereload with SPA fallback to `_shell.html`, watch `spec/`, `content/`, `static/`, `portal.json`, debounce, rebuild, refresh. Rebuild latency is 20 to 40 s; Vite dev mode with HMR is a follow-up (dev server starts in ~9 s but content sync into the temp dir is undesigned).
- **Commands**: `portal generate` keeps `--input`, `--destination`, `--force`, `--auth-key`; drops `--zip`. `portal serve` keeps its flags plus `--auth-key`. Both print a migration hint when `APIMATIC-BUILD.json` has `generatePortal` and `portal.json` is missing. Delete `portal/toc/new`, `portal/recipe/new`, `portal/copilot` commands, actions, prompts, application code (`application/portal/toc`, `application/portal/recipe`), related types/events and tests. Remove the `portal:toc` topic from `package.json`. Update `quickstart` portal step to write `portal.json`, `content/index.md`, `content/meta.json` and call the new serve; its language-selection, build-file and prune steps are dropped for the portal path until `portal.json` gains `languages`.
- **Telemetry**: `portal generate` and `portal serve` emit no telemetry events today and none are added. `ToCCreationFailedEvent` and `RecipeCreationFailedEvent` are deleted with their commands.
- **Packaging/tooling**: engine `>=22.12.0`; pinned exact versions of the runtime set: `@tanstack/react-router`, `@tanstack/react-start`, `@tanstack/start-static-server-functions`, `fumadocs-core`, `fumadocs-mdx`, `fumadocs-openapi`, `fumadocs-ui`, `react`, `react-dom`, `lucide-react`, `shiki`, `yaml`, `vite`, `@vitejs/plugin-react`, `tailwindcss`, `@tailwindcss/vite`. Production-only install measured at 235 MB / 363 packages (lucide-react alone 39 MB; trimming candidate). Add `onlyBuiltDependencies: [esbuild]` to `pnpm-workspace.yaml`. Versions must be at least 7 days old (`minimumReleaseAge`).

## 8. Tests

- Unit: `PortalConfig` parsing, `PortalSourceContext` validation, migration hint, `PortalAuthorizationService` key precedence and the three failure paths (nock), serve watcher wiring with the build service stubbed.
- End-to-end: one real build against `test/resources/build-inputs/default/spec/Apimatic-Calculator.json` asserting page count and content presence, gated behind an env variable (~30 s). Run it in CI on `ubuntu-latest`, `windows-latest` and `macos-latest` so the junction/symlink path and the spawn path are exercised on every OS (`check_build.yml` currently runs on Ubuntu only).
- Remove tests of deleted commands.

## 9. Risks (accepted)

- TanStack Start is a release candidate; mitigated by pinning.
- Large APIs yield large output folders (see section 5).
- Verified on Windows only; macOS/Linux via CI.
- Try-it playground requires CORS on the customer's API (Fumadocs' proxy needs a server). Out of scope.
- Fumadocs UI is mid-transition to `@fumadocs/base-ui`; expect UI-layer churn on upgrades.
- Fumadocs is a single-maintainer project (MIT, active, Vercel OSS program).

## 10. Sequencing (one PR each, against `dev`)

1. Dependencies, engine bump, pnpm config, `portal-template/` with tooling exclusions.
2. `PortalConfig`, `PortalSourceContext`, `PortalBuildService`, `PortalAuthorizationService`, new `GenerateAction` + prompts, `portal generate` command, tests.
3. `portal serve` rewired; `quickstart` portal step updated.
4. Remove `toc new`, `recipe new`, `copilot`; README and topic cleanup.

## 11. Resolved questions (2026-09-16)

- Portal entitlement field on `/account/profile` is `isOnPremGenerationAllowed` (confirmed).
- No `basePath` in the first cut: asset and link URLs are root-absolute, so the portal must be hosted at the root of a domain or sub-domain. Revisit when sub-path hosting is needed (maps to Vite `base`).
- Non-OpenAPI-3 specs fail with a clear error; users convert with `apimatic api transform` first. No automatic conversion.
- `--zip` on `portal generate` is dropped.
