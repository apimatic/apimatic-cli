# Plan: the `portal` block v2 — site, brand, tabs and API options

Status: rewritten 2026-09-23 for `src/apimatic.json`, not started. Replaces the
2026-09-21 draft written against `portal.json`; section 14 records what changed
and why, so the older reasoning is not rediscovered.

Builds on `.ai/plans/fumadocs-portal.md` (PR #343), `.ai/plans/portal-navigation.md`
(`nav.json`, PR #346) and `.ai/plans/apimatic-config.md` (`apimatic.json`,
PR #348, with the language entry's `publishing` level from #350), all
implemented on `dev`. Section 13 lists what those plans need amended.

Reference: the PM's proposal "Portal Configuration: MVP Structure" (Abdul Hannan,
2026-09-18). It was used for *capabilities*; key names were chosen against
Fumadocs' own prop names, Mintlify's `docs.json`, Starlight and Docusaurus. The
proposal is internal, so deviating from it needs no sign-off; the deviations are
listed in section 2.

## 1. Goal and scope

Give the `portal` block of `src/apimatic.json` the shape it will keep, make the
portal brandable — logo, favicon, colour preset, primary colour, fonts,
light/dark mode, layout, header links — and render the top level of the site as
tabs. The tabs come from the root `nav.json`, which already orders the top
level; `apimatic.json` says how the portal looks and behaves, `nav.json` says
how it is arranged.

The block is unreleased: today's flat shape (`title`, `description`, `logo`,
`siteUrl`, `aiPageActions`) exists only on `dev`. Restructuring it is free until
2.0 ships and a breaking change after, which is why the whole key structure
lands in this release even where a behaviour ships thin.

Required for `portal generate` and `portal serve`: the `portal` block, a
top-level `languages` block with at least one entry, and `portal.site.name`
when `spec/` holds two or more specifications. Everything else is optional.

In scope: the block's schema, the `languages` requirement on the portal path,
CLI-side validation and defaults, tabs from `nav.json`, the template changes
that apply each key, the API section options, re-applying the config under
`portal serve`, the quickstart scaffold, and `apimatic.schema.json` for editors.

Out of scope:

- The generated SDK page and its content. `apimatic:sdks` is reserved and
  resolves to nothing until that page exists, so no SDKs tab renders in this
  release (section 5). The page is the navigation plan's second change.
- Writing `languages` for a portal project. For now the user adds it to
  `src/apimatic.json` by hand; a quickstart step that writes it is a separate
  PR (section 12).
- A contrast gate on raw token overrides, i18n, the AI section's pages, and a
  hidden sidebar on the Home tab.

Delivered as **one PR** (section 11).

## 2. Decisions (2026-09-23)

| Topic | Decision |
|---|---|
| Where navigation lives | The root `src/content/nav.json`. Its entries, in order, decide the tabs and their order (section 5). `apimatic.json` carries no tab order and no section list. |
| Tabs | Always on. Each top-level node belongs to exactly one tab; there is no flat-sidebar mode. |
| Content tabs | A folder directly under `content/` becomes its own tab when its own `nav.json` sets `"root": true` — Fumadocs' own key for the same thing. Otherwise it stays a group in the Guides sidebar. |
| Tab labels | Fixed for the three tabs no folder backs: "Home", "Guides", "SDKs". A folder tab takes its `nav.json` `title`, then its index page's title, then the folder name; the API tab takes `content/api/nav.json`'s `title`, then a `content/api/index` page, then "API Reference" — both as `dev` already does. Only root-level tabs are affected; nothing nested changes. |
| Tokens | `apimatic:api` stays and places the API tab. `apimatic:pages` is renamed `apimatic:sdks` and places the SDKs tab; the old name is reported as an unknown entry. A later AI section gets its own token rather than sharing a group, because each generated section is its own tab. |
| Home | `content/index.md` rendered in the docs layout, in its own Home tab, with an optional CTA under the title from `portal.home.cta`. The Home tab is first unless the root `nav.json` names `index` explicitly, in which case it sits where `index` sits. |
| `languages` | The shared top-level block `sdk publish` writes. Required for the portal: at least one entry, each keyed by a `Language` enum value and holding an object. Its `publishing` record (#350) is optional: an entry without one is a language that is wanted but not yet published, and counts. An unknown language key is an error on the portal path (the plugin path stays lenient and preserves it). |
| Layouts | `docs`, `notebook`, `notebook-navbar`, `glass`. Default `notebook-navbar`. `flux` is not exposed. |
| Primary colour | Overrides `--color-fd-primary`, a contrast-picked `--color-fd-primary-foreground`, and `--color-fd-ring`. The preset supplies every other token. |
| Fonts | A validated shortlist plus `system`. No free text. Loaded from Google Fonts at runtime, as Geist is today; `system` makes no network request. |
| Favicon default | The light logo; none when there is no logo. The APIMatic mark is never shipped onto a customer's domain. |
| Site name default | Derived from `info.title` when the project has exactly one spec. With two or more, `site.name` is required. |
| Unknown keys | Reported by dotted path, `'portal.brand.colour' is not a 'portal' setting.` No near-miss hints, including for today's flat keys: `title` is reported as unknown like any other key. The live `url`/`site` → `siteUrl` hints are deleted. |
| JSON schema | `apimatic.schema.json` describes the whole file: root lenient, `portal` strict, `plugin` and `languages` typed with additional properties allowed. Ships in the npm package, referenced from a CDN URL; the scaffold writes `$schema`. A test keeps the `portal` definition and the parser in step. |
| Defaults | Applied twice, deliberately: the scaffold writes every default into the block ("ship populated"), and `resolve()` fills them for a hand-written minimal block. An explicit default and an absent key produce the same portal. |
| Generated files, not substitution | The CLI writes `portal.identity.json` (client-safe, imported by `portal.ts`) and `src/styles/theme.css`. Re-applying a config edit under `portal serve` is a plain write of those two files; the only substitutions left are the content-directory literals prepare makes once. |
| Operation filtering | `api.showDeprecated` and `api.showInternal` are applied to the bundled document before pages are generated (section 7). |
| Raw tokens | `advanced.tokens.{light,dark}` are validated by name and passed through. The contrast gate is post-MVP. |
| Colour formats | `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `hsl()` for `brand.colors.primary`, because the foreground derivation has to parse it. Raw tokens accept any CSS colour string. |
| Key names | Deviations from the PM draft: `brand.colors.preset`, `brand.colorMode`, `brand.fonts`, `navigation.links`, `api.showInternal`, and tabs in `nav.json` rather than a `sections` list. |

Rejected, with reasons:

- **Tabs as `portal.navigation.sections` in `apimatic.json`** (the 2026-09-21
  draft). Splits ordering across two files — tab order in one, page order in
  the other; tab reordering would need the config watcher rather than
  Fumadocs' native metadata reload; it throws away the `nav.json` tokens #346
  shipped; and five fixed section ids allow exactly one content tab. What it
  offered — per-tab options beside the tab — is covered by `portal.home` and
  `portal.api`, which are behaviour rather than arrangement anyway.
- **Per-tab options inside `nav.json`.** Fumadocs validates every `nav.json`
  against its `metaSchema`: `pages` entries must be strings and unknown keys are
  stripped before the template sees them (section 10). An object entry or a
  custom key would need a schema override in the template.
- **Every top-level folder as a tab.** A project that groups its guides into
  folders would grow a row of tabs on upgrade. Opt-in via `"root": true`.
- **Configurable labels for Home, Guides and SDKs.** No place for them in
  `nav.json` (see above), and a second place to name tabs in `apimatic.json` for
  three words nobody has asked to change. Additive later if asked for.
- **Near-miss hints for the flat `dev` keys.** The flat block never shipped, and
  the project carries no migration messaging.
- **Home as a plain tab, not a root folder.** Fumadocs builds tab groups from
  the root folders on the current page's path; a page outside every root folder
  renders no tabs at all (section 10).
- **A landing page on Fumadocs' HomeLayout.** A second layout with its own
  navbar rules and a fourth page type in the routes, for a CTA a button covers.
- **Tinting accent, secondary and muted from the primary.** Hue and chroma math
  per preset, and it fights presets like `vitepress` and `ocean` that restyle
  surfaces themselves. `advanced.tokens` is the escape hatch.
- **Free-text Google Fonts family names.** A typo only shows as a fallback font
  at runtime, and the weight axis differs per family so the URL cannot be
  derived reliably.
- **Filtering the document before Fumadocs bundles it.** The document-object
  input form carries no base path for relative `$ref`s to resolve against. The
  filter runs on the bundled document instead (section 7).
- **Filtering the generated pages after `staticSource`.** Leaves emptied tag
  folders whose metadata has to be found and removed too, and each page's
  `payload.bundled` would still carry the hidden operations.
- **Substituting a literal into `portal.ts` for the identity** (today's
  mechanism). A separate client-safe file has nothing to leak, and a file is
  what a watcher can rewrite.
- **`brand.preset` as its own key.** The preset is a palette; beside the
  primary under `brand.colors` it reads as one decision.

## 3. The file

```json
{
  "$schema": "https://cdn.jsdelivr.net/npm/@apimatic/cli@2/apimatic.schema.json",
  "schemaVersion": 1,
  "portal": {
    "site": {
      "name": "Calculator API",
      "url": "https://docs.example.com",
      "description": "A tiny calculator, documented."
    },
    "brand": {
      "logo": { "light": "static/images/logo.svg", "dark": "static/images/logo-dark.svg" },
      "favicon": "static/favicon.ico",
      "colors": { "preset": "neutral", "primary": { "light": "#1d4ed8", "dark": "#93c5fd" } },
      "fonts": { "body": "geist", "mono": "geist-mono" },
      "colorMode": "both"
    },
    "navigation": {
      "layout": "notebook-navbar",
      "links": [{ "label": "Status", "url": "https://status.example.com" }]
    },
    "home": { "cta": { "label": "Get an API key", "url": "/authentication" } },
    "api": { "groupBy": "tag", "showDeprecated": true, "showInternal": false },
    "ai": { "pageActions": true },
    "advanced": { "tokens": { "light": {}, "dark": {} } }
  },
  "languages": {
    "typescript": {
      "publishing": { "package": { "name": "@acme/calculator", "version": "1.0.0" }, "codegenVersion": "v4" }
    },
    "python": {}
  }
}
```

Since #350 a language entry carries its publishing record one level down, under
`publishing` (`source`, `package`, `codegenVersion`), and an entry with no
`publishing` block — `"python": {}` above — means "this language is wanted,
nothing is published yet". That is exactly the entry the portal asks a user to
write by hand (section 12).

`$schema` and `schemaVersion` are root keys, owned by `ApimaticConfigDocument`:
`$schema` is ignored, and `schemaVersion` stays `1` — the block's restructure
happens before any release, so no reader of version 1 ever saw the flat shape.
`plugin` is omitted above and untouched by this plan.

| Key | Type | Default | Rule |
|---|---|---|---|
| `portal.site.name` | string | `info.title` of the only spec | Required when `spec/` holds two or more specifications, counted as `PortalSourceContext.specs()` counts them: a JSON file with no OpenAPI or Swagger version key, such as `APIMATIC-META.json`, is not one. Header, page titles, `og:site_name`. |
| `portal.site.url` | string | none | Origin only, as today's `siteUrl`. Enables canonical links, sitemap, robots, absolute `og:url`. |
| `portal.site.description` | string | first paragraph of `info.description` of the only spec, whitespace-collapsed, capped at 300 characters on a word boundary | Blank is none. A change from today's `OpenApiDocument.suggestedConfig`, which collapses the whole description: a paragraph ends at a blank line, so wrapped prose without one is still whole. |
| `portal.brand.logo` | string or `{light, dark}` | none | Paths relative to `src/` inside `static/`; a string sets both. Each file must exist. |
| `portal.brand.favicon` | string | the light logo | Path inside `static/`; must exist. The link's `type` is set when the extension is known. |
| `portal.brand.colors.preset` | enum | `neutral` | `neutral`, `black`, `vitepress`, `dusk`, `catppuccin`, `ocean`, `purple`, `solar`, `emerald`, `ruby`, `aspen`. |
| `portal.brand.colors.primary` | colour or `{light, dark}` | the preset's | A string sets both modes. Formats per section 2. |
| `portal.brand.fonts.body` | enum | `geist` | `geist`, `inter`, `ibm-plex-sans`, `roboto`, `open-sans`, `source-sans-3`, `manrope`, `dm-sans`, `system`. |
| `portal.brand.fonts.mono` | enum | `geist-mono` | `geist-mono`, `jetbrains-mono`, `ibm-plex-mono`, `fira-code`, `source-code-pro`, `system`. |
| `portal.brand.colorMode` | enum | `both` | `light`, `dark`, `both`. A forced mode hides the switch and the `D` hotkey. |
| `portal.navigation.layout` | enum | `notebook-navbar` | `docs`, `notebook`, `notebook-navbar`, `glass`. |
| `portal.navigation.links[]` | `{label, url}` | `[]` | Rendered in the navbar and the mobile menu. `label` a non-empty string. `url` an absolute `http:` or `https:` URL, marked external, or a site-relative path starting with `/`; anything else (`mailto:`, a bare `docs/x`, `javascript:`) is refused. |
| `portal.home.cta` | `{label, url}` | none | Rendered under the title of the home page, including the fallback home. `label` and `url` follow the `links` rules. |
| `portal.api.groupBy` | enum | `tag` | `tag`, `route`, `none`; Fumadocs' own values. Changes operation URLs: `tag` yields `/api/<spec>/<tag>/<operation>`, `route` `/api/<spec>/<path>/<method>`, `none` `/api/<spec>/<operation>`. |
| `portal.api.showDeprecated` | boolean | `true` | `true` keeps deprecated operations, struck through in the sidebar as Fumadocs already renders them. |
| `portal.api.showInternal` | boolean | `false` | Operations carrying `x-internal: true`. |
| `portal.ai.pageActions` | boolean | `true` | Today's `aiPageActions`, moved. |
| `portal.advanced.tokens.light`, `.dark` | map | `{}` | Keys are the full custom-property name, as browser dev tools show it: `"--color-fd-accent"`, not `"accent"`. Each must be `--color-fd-` followed by one of the seventeen token names in section 10. Values are non-empty strings without `;`, `{`, `}` or `/*`, and pass through. |
| `languages` | map | none, required | At least one entry. Keys are `Language` values from `src/types/sdk/generate.ts`: `csharp`, `java`, `php`, `python`, `ruby`, `typescript`, `go`. Each value an object, and its `publishing`, when present, an object too — both shape checks are `ApimaticConfigDocument`'s findings, which the portal now reads (section 8). Nothing inside `publishing` is checked by the portal in this release. |

Every error carries its dotted path from the root, and every error is reported
at once, as `PortalConfig.fromBlock` does today. `languages` errors are listed
with the `portal` errors in the same report.

## 4. How each key reaches the portal

The browser gets an identity with nothing machine-specific in it; everything
that addresses the build machine stays in `portal.config.json` behind
`portal.server.ts`. This plan widens both, and moves the identity from the
`__APIMATIC_PORTAL_IDENTITY__` literal substituted into `portal.ts` to a
`portal.identity.json` that `portal.ts` imports, so a config edit under
`portal serve` is a file write Vite hot-reloads.

Browser identity: `name`, `description`, `siteUrl`, `logo` (`{light, dark}` or
null, the same URL twice for one image), `favicon` (`{url, type}` or null, the
type from the extension), `fontsUrl` (the Google Fonts URL or null), `layout`,
`colorMode`, `links` and `homeCta` (each `{label, url, external}`),
`pageActions`. Tabs are not in it: they come from the page tree, which already
carries `nav.json`.

Server-only (`portal.config.json`): `specs`, `contentDir`, `staticDir`, and
`api` (`groupBy`, `showDeprecated`, `showInternal`). The prerender list also
needs `siteUrl`, which `vite.config.ts` reads from `portal.identity.json`.

Generated stylesheet: the CLI writes `src/styles/theme.css` into the build
project; `app.css` imports it last and is otherwise fixed apart from the
content-directory `@source` line prepare already substitutes.

| Key | Applied where | Fumadocs mechanism |
|---|---|---|
| `site.*` | `__root.tsx`, `$.tsx` head, `seo.ts`, `llms.server.ts` | As today. |
| `brand.logo` | `layout.shared.tsx` `nav.title` | Two `<img>` with `dark:hidden` / `hidden dark:block`; the `dark` variant is defined by Fumadocs' `base.css`. |
| `brand.favicon` | `__root.tsx` `links` | `<link rel="icon">` with `type` from the extension. |
| `brand.colors.preset` | `theme.css` | `@import 'fumadocs-ui/css/<preset>.css'` at the top of the generated file; today's fixed `neutral.css` line leaves `app.css`. |
| `brand.colors.primary` | `theme.css` | `:root:not(.dark) { --color-fd-primary; --color-fd-primary-foreground; --color-fd-ring }` and the dark trio under `.dark`. Both blocks always emitted. The light block is scoped with `:not(.dark)` because a bare `:root` has the same specificity as the presets' `.dark` block and comes later, so a light-only value would win in dark mode. |
| `brand.fonts` | `__root.tsx` head, `theme.css` | A `<link rel="stylesheet">` to the Google Fonts URL, then `@theme { --default-font-family; --default-mono-font-family }`. `system` emits no link and the OS stacks. A link rather than a CSS `@import` because a remote import nested inside an imported stylesheet lands mid-file after bundling, where browsers ignore it. |
| `brand.colorMode` | `__root.tsx` `RootProvider`, layout props | `theme={{ forcedTheme, enableSystem: false, hotKey: false }}` when forced; `themeSwitch={{ enabled: false }}` on the layout. `both` is Fumadocs' default. |
| `navigation.layout` | new `src/lib/layout.tsx`, `theme.css` | One switch that exports the layout and page components for the chosen layout (section 6). For glass, `theme.css` also imports `fumadocs-ui/css/generated/glass.css`. |
| `navigation.links` | `layout.shared.tsx` `links` | Fumadocs `MainItemType` `{ text, url, external }`. |
| `home.cta` | `$.tsx` | An anchor styled with `buttonVariants` from `fumadocs-ui/components/ui/button`, under the title of the index page and of the fallback home alike. |
| `api.*` | `openapi-section.server.ts` | `groupBy` passes through to `staticSource`; the two `show*` flags filter the bundled document (section 7). |
| `ai.pageActions` | `$.tsx` | As today. |
| `advanced.tokens` | `theme.css` | Appended to the same `:root:not(.dark)` / `.dark` blocks after the primary, so a light-only token never reaches dark mode. |
| `languages` | nowhere yet | Validated only. The SDK page reads it when it lands. |

## 5. Tabs from `nav.json`

### What the user writes

The root `src/content/nav.json` orders the top level as it does today. The only
format changes are the token rename and one new key in a folder's own file:

```json
{ "pages": ["index", "...", "tutorials", "apimatic:sdks", "apimatic:api"] }
```

```json
// src/content/tutorials/nav.json
{ "title": "Tutorials", "root": true, "pages": ["first-call", "..."] }
```

That yields the tabs Home, Guides, Tutorials, SDKs (once the page exists) and
API Reference, in that order.

### How nodes map to tabs

After `navigationTransformer` has ordered the root (unchanged), each top-level
node is assigned to one tab:

| Node | Tab | Label |
|---|---|---|
| the `index` page, or the synthetic fallback-home node | Home | "Home" |
| a folder whose `nav.json` has `"root": true` | its own | `title`, then index page title, then folder name |
| the `api` folder | API | `content/api/nav.json` `title`, then `content/api/index` title, then "API Reference" |
| an injected page (`GENERATED_SOURCE`) | SDKs | "SDKs" |
| any other page or folder | Guides | "Guides" |

Tab order is the order in which each tab's first node appears in the ordered
root. The Guides tab keeps its nodes in that same relative order, so
`["a", "tutorials", "b"]` gives Guides (holding `a` and `b`), then Tutorials.
The one exception is Home: when the root `nav.json` does not name `index`, Home
is moved to the front, so a file like `["authentication", "..."]` still opens on
Home.

Defaults follow from the existing ordering rules with no new ones: no
`nav.json` at all gives Home, Guides, SDKs, API; an unnamed `apimatic:api`
keeps the API last; an unnamed `apimatic:sdks` keeps the SDKs before the API.

### Mechanism

A second transformer, `tabsTransformer`, registered after `navigationTransformer`,
has only a `root` hook. It receives the assembled root, which the `folder` hook
at `''` has already ordered (confirmed on the pinned version: `root()` builds
the content root's folder, running every `folder` hook, before any `root`
hook), and regroups the children into one `Folder` per tab with `root: true`:

- A tab is told apart by what `dev` already uses: `index` by URL `/`, the API by
  `$ref.folder === apiBaseDir`, injected pages by the loader source key
  (`isFromSource(…, GENERATED_SOURCE)`), and folder tabs by the `root` setting
  read through `readSettings`. No slug is reserved for this.
- A folder tab keeps its own node, flagged `root: true`, rather than being
  wrapped, so its `$ref` stays as it is. Its index page, if any, moves from
  `index` to the front of its children: a root folder's own link is not listed
  in its sidebar, and `isLayoutTabActive` searches only a tab's children. So
  the CLI refuses an `index` entry in a tab's `nav.json` with its own sentence,
  as it does in any folder below the root. The same applies to the API tab.
- Fumadocs never reads `root` from `nav.json`: its builder takes a folder's
  metadata from `meta.json` only, which the content collection does not load.
  A folder is therefore built, and named, as any other, and `root` takes effect
  only where this hook honours it: on a folder directly under the content root,
  other than `api`. Under `portal serve` an edited `nav.json` reaches the
  transformer without passing the CLI again, and a nested `"root": true` typed
  mid-edit produces no nested tab groups the CLI would refuse at the next
  start — the same rule `reorder` already follows for the `apimatic:` tokens.
- A synthetic tab's `name` is its fixed label and its `$id` is fixed
  (`tab:home`, `tab:guides`, `tab:sdks`), so React keys and the tree context's
  root tracking stay stable across renders.
- A tab with no nodes is not created. In this release SDKs is therefore never
  created, and Guides is absent when every top-level node is in a folder tab.
- The fallback home page gets a tree node. `$.tsx` already renders a landing
  page at `/` when the content has no `index.md`, but that page has no node in
  the tree, so it would sit outside every root folder and show no tabs. When no
  index page exists the hook adds a synthetic `page` node with URL `/` to Home.
- Tab URLs are computed in the template, not by Fumadocs. `getLayoutTabs` links
  a root folder to its `index` or its first *direct* page child; the API tab
  has only folders under it, as does a Guides tab whose pages sit in folders.
  `layout.tsx` passes an explicit `tabs` list, computed in `src/lib/tabs.ts`:
  one per root folder, `$folder` bound so active-state detection keeps
  working, `url` the first page found depth-first.
- Tabs do not change URLs. Fumadocs derives them from slugs, not tree position,
  so a root-level guide stays at `/authentication`. A folder tab's pages were
  already at `/tutorials/...`.
- Every portal has at least Home and API, so there is always a tab switcher.
  The single-tab inlining rule of the 2026-09-21 draft is dropped.

The switcher renders in the top bar for `notebook-navbar`, and as a dropdown at
the top of the sidebar for the other three layouts. `nav.json` edits reload
under `portal serve` as they do today, tabs included, with no config watcher.

### Validation (CLI, `PortalNavigation`)

- `apimatic:sdks` replaces `apimatic:pages`; the old token is reported as an
  unknown entry like any other `apimatic:` string. Both tokens stay valid only
  in the content root's file.
- `root` joins `pages` and `title` as a known key. It must be a boolean, and is
  accepted only in a `nav.json` of a directory directly under `content/` that
  holds a page. At the content root it names nothing; deeper it would nest tab
  groups; in `content/api/` it is redundant because the API is always a tab.
  Each case is reported with its own sentence.
- The root-`title` refusal message names `portal.site.name` instead of
  `portal.title`.
- `PortalSourceContext.navigation`'s `visit` gains a flag for "directly under
  the content root", beside the `isContentRoot` and `isApiDirectory` it already
  passes, and `PortalNavigation.validate`'s context gains the same field. Today
  the walk cannot tell a top-level folder from a nested one.

## 6. Template changes

- **`src/lib/navigation.ts`**: `tabsTransformer` from section 5, registered
  in `source.server.ts` after `navigationTransformer`; `INJECTED_PAGES_TOKEN`
  becomes `apimatic:sdks`; `readSettings` returns `root`.
- **`src/lib/tabs.ts`** (new): the explicit tab list, kept apart from
  `layout.tsx` so it is unit-testable without the generated identity file.
- **`src/lib/layout.tsx`** (new): maps `portal.layout` to the layout component
  and its page module, and returns the layout props each needs. Notebook takes
  `nav.mode: 'top'` and `tabMode: 'sidebar' | 'navbar'`; docs has no `nav.mode`
  and its own `tabMode: 'top' | 'auto'`, left at the default; glass's `sidebar`
  prop is only `collapsible`, and its page module exposes only `toc`, `full`
  and `tableOfContent`. The same module computes the explicit `tabs` list. All
  four modules are imported statically; if the bundle grows by more than a few
  hundred kilobytes, the import specifiers become a prepare-time substitution
  instead (section 12).
- **`app.css`**: loses the Google Fonts, `neutral.css` and Geist `@theme` lines
  and gains a fixed `@import './theme.css'` after the Fumadocs and OpenAPI
  presets, so the generated rules come last.
- **`src/styles/theme.css`** (written by the CLI, rewritten on re-apply): the
  preset import, the glass import when the layout is glass, `@theme` with the
  two font families, `:root:not(.dark)` with the light primary trio and light
  tokens, `.dark` with the dark trio and dark tokens.
- **`portal.identity.json`** (written by the CLI, rewritten on re-apply) and
  **`portal.ts`**, which imports it and exports it typed as `Portal`. The file
  holds the identity fields from section 4 and nothing else, which is what makes
  a whole-module JSON import safe here.
- **`__root.tsx`**: favicon link; the Google Fonts stylesheet link;
  `RootProvider` theme props from `colorMode`.
- **`layout.shared.tsx`**: two logos, `links`, `themeSwitch.enabled`.
- **`$.tsx`**: components from `layout.tsx`; the Home CTA.
- **`src/lib/openapi-section.server.ts`**: already the one place both
  `openapi.server.ts` and `prerender-pages.ts` build a section from. It takes the
  `api` options, bundles, filters (section 7) and calls `staticSource` with the
  configured `groupBy` instead of today's hard-coded `'tag'`.
  `prerender-pages.ts` passes them from the `PortalConfig` it already reads.
- **`portal-config.ts`**: the server-only interface gains `api`.

## 7. Deprecated and internal operations

Fumadocs stores `deprecated` on each generated page's `_openapi` metadata and
renders it struck through, so `showDeprecated: true` costs nothing. It has no
notion of `x-internal`.

`openApiSection` filters the document, not the pages:

1. Create the server on the file path as today and take `getSchema(id).bundled`,
   the document with every external reference already folded into
   `#/components` or `x-ext`.
2. Walk `paths` and `webhooks`. Remove an operation when it is `deprecated` and
   `showDeprecated` is false, or carries `x-internal: true` and `showInternal`
   is false. Remove a path item left with no operations.
3. Create a second server with the filtered document as its `input` value,
   which `createOpenAPI` accepts, and call `staticSource` on that one.

Step 1 and the walk always run, since only the walk can tell whether anything
is to be removed. When it removes nothing, step 3 is skipped and the first
server's `staticSource` is used, so the common case costs no second server;
that is the whole saving.

Because the page generator never sees a removed operation, no page, sidebar row
or emptied tag folder exists for it, and each page's `payload.bundled` is the
filtered document too. `llms.server.ts`, `sitemap.server.ts`, the search index
and the prerender list all go through `openApiSection` or the loader, so they
follow.

## 8. CLI changes

Following `.ai/instructions.md` and the skills in `.ai/skills/`.

- **Types.** `PortalConfig` becomes the root of nested value objects, one per
  namespace: `SiteConfig`, `BrandConfig` (holding `Logo`, `BrandColors`,
  `Fonts`), `NavigationConfig`, `HomeConfig`, `ApiConfig`, `AiConfig`,
  `AdvancedTokens`. Each parses its own subtree and returns errors with dotted
  paths; `PortalConfig.fromBlock` concatenates them. Two helpers: `Color` (parse
  the accepted formats, relative luminance, WCAG contrast ratio, foreground
  choice between the neutral preset's 98 % and 9 % greys) and the font table
  (id, CSS family string, Google Fonts URL, fallback stack). `RENAMED_FIELDS`
  goes; `unknownFieldErrors` is called without a rename map.
- **`PortalLanguages`** (new value object, `src/types/portal/`): built from
  `ApimaticConfigDocument.languages()` plus that block's findings. Refuses an
  absent or empty block and an unknown language key; an entry that is not an
  object, or whose `publishing` is not one, arrives as a document finding.
  Holds the language list, and whether each is published, for the SDK page to
  read later.
- **Finding partition.** `PortalSourceContext.readConfig` reads
  `findingsFor('root', 'languages')` instead of `'root'` alone, and adds the
  `portal` and `PortalLanguages` errors to the same `invalidConfig` report. This
  revisits `apimatic-config.md` decision 8 as that plan anticipated: a
  malformed `languages` block now fails a portal build, and the plugin path is
  unchanged. `missingPortal` keeps its meaning; a missing `languages` block gets
  no quickstart hint, since quickstart does not write one yet.
- **Completion.** `resolve()` already parses every spec. It completes the
  config from the single spec (name, description) or reports `site.name`
  missing when there are several, and checks the dark logo and the favicon
  exist as it checks the logo today. Warnings ride the Ok value the way
  `shadowedFiles` does, since the types layer cannot print.
- **Stylesheet.** A `PortalStylesheet` value object renders `theme.css`, its
  import lines included, and the Google Fonts URL from a completed config, so
  the CSS is unit-testable without a build.
- **Project service.** `PortalProjectService` writes `theme.css`,
  `portal.identity.json` and the widened `portal.config.json`. The
  content-directory substitutions into `source.ts` and `app.css` stay; the
  identity substitution into `portal.ts` and `PORTAL_IDENTITY_PLACEHOLDER` go.
- **`portal serve` re-applies `apimatic.json`.** Today a config edit needs a
  restart, which was tolerable for a title and a logo and is not for colour and
  font tweaks. A new infrastructure service watches `src/apimatic.json` and
  reports each change as a `Result`. On change the serve action re-runs the
  config half of `resolve()` — the block and `languages` parsers, the
  existence checks on the logo, dark logo and favicon, the name and
  description derived from the spec, and the `site.name` rule for several
  specs — so an edit is accepted under exactly the rules `generate` applies,
  and a mistyped favicon path is refused rather than re-applied as a broken
  link. That half is split out of `resolve()` as its own method for this; the
  spec list it needs is the one read at startup, since changing the specs
  needs a restart anyway. It then compares the result with the last good one;
  a write that changes neither — `sdk publish` or `plugin
  generate` touching only their blocks — is ignored without a message. On a
  real change that parses, it asks `PortalProjectService` to rewrite
  `theme.css` and `portal.identity.json`, which Vite hot-reloads. On failure
  the prompts print the same errors `generate` would and the last good state
  stays. Changes to `portal.api.*` and to the specs still need a restart,
  because `vite.config.ts` and the prerender list read them once; the prompt
  says so when those keys change. The serve command description and
  `prompts/portal/serve.ts` stop saying every `apimatic.json` edit needs a
  restart.
- **Quickstart.** `scaffold` writes, through `ApimaticConfigContext.merge`,
  `$schema`, `schemaVersion` and a populated `portal` block: the derived `site`
  fields and every brand, navigation, API and AI default spelled out.
  `site.url` stays absent and the closing note names it; `home.cta` stays absent.
  `PortalConfig.toJSON`'s "minimal" rule goes with it. No `languages` block is
  written: the user adds it by hand, so the action stops after the scaffold
  rather than serving a project that cannot validate (decided 2026-09-23,
  section 12). `PortalQuickstartAction` no longer calls `PortalServeAction`;
  `nextSteps` is printed directly instead of from the serve callback, and
  shows the `languages` entry to add and the `apimatic portal serve` command
  to run after. The Node-version and portal-entitlement checks stay where
  they are, before any question: the user's next command is `portal serve`,
  which refuses on both, and learning that after the wizard is the outcome
  those checks exist to prevent. When the language-step PR lands, the serve
  call comes back. The scaffolded root `nav.json` stays `["index", "..."]`.
- **JSON schema.** `apimatic.schema.json` at the repository root, listed in
  `files`. Hand-written. Root: `$schema`, `schemaVersion` (`const: 1`),
  `portal`, `plugin`, `languages`, `additionalProperties: true`. `portal`:
  strict, `additionalProperties: false` at every level. `plugin`: today's
  identity fields typed, `pluginId` pattern and semver pattern, additional
  properties allowed. `languages`: `propertyNames` limited to the seven
  `Language` values, so a misspelt key is flagged in the editor as the portal
  would refuse it (nothing on the plugin path reads the schema, so this makes
  no command stricter). Each entry an object with an optional `publishing`
  object, additional properties allowed at both levels, so the hand-written
  `"typescript": {}` section 12 recommends validates. Inside `publishing`,
  `source`, `package` (per language, as `plugin-config.ts` types them) and
  `codegenVersion` (`v3`, `v4`) are typed and none is required, matching the
  plugin path's leniency: `assertNoCodegenVersionMismatch` already reads a
  missing `codegenVersion` as no mismatch. `languages` is optional in the schema: the "at least one"
  rule is the portal command's, and a file `sdk publish` alone created is
  valid. The `$schema` URL
  is `https://cdn.jsdelivr.net/npm/@apimatic/cli@2/apimatic.schema.json`.
- **Prompts.** New source problems: a missing dark logo or favicon named with
  its key; `site.name` required for several specs; the languages errors; the
  serve watcher's re-applied, rejected and restart-needed messages.
- **Messages elsewhere.** `portal-navigation.ts` names `portal.site.name`;
  README's "Upgrading from 1.x" names the new keys (`site`, `brand`, ...) and
  the `languages` requirement; the README is regenerated if a command or flag
  description changes.

## 9. Tests

- Value objects: every key's accepted and rejected forms, unknown keys at every
  level reported by dotted path, a flat `dev` key such as `title` reported as
  unknown with no hint, colour formats, font ids, link and CTA URLs (absolute
  `https:`, site-relative `/x` accepted; `mailto:`, `docs/x`, `javascript:`
  refused), token keys (`--color-fd-accent` accepted; `accent` and
  `--color-fd-info` refused).
- `PortalLanguages`: absent, empty, not an object, an unknown key, an entry that
  is not an object, a `publishing` that is not an object, one valid entry with
  no `publishing` block, one with a full `publishing` record.
- `PortalSourceContext`: the languages errors reported beside `portal` errors
  in one list; a malformed `plugin` block still not failing the resolve; name
  and description derived from one spec, `site.name` required for two, missing
  dark logo and favicon reported.
- `Color`: parsing, luminance against known values, the foreground choice on
  both sides of the crossover.
- `PortalStylesheet`: the emitted CSS for each preset, `system` fonts emitting
  no link, glass adding its import, tokens landing after the primary, the light
  block scoped with `:not(.dark)`, both blocks present when the primary is one
  string.
- `PortalNavigation`: `apimatic:sdks` accepted at the root, `apimatic:pages`
  reported, `root` accepted on a top-level folder and refused at the root, in a
  nested folder, in `content/api/`, and when not a boolean.
- Schema conformance: every `portal` block fixture agrees between `ajv` (dev
  dependency) run against the `portal` definition and `PortalConfig.fromBlock`;
  every `languages` fixture agrees between the `languages` definition's key
  rule and `PortalLanguages` (the schema's minimum of zero entries aside); one
  whole-file fixture with unknown root keys and unknown `plugin` fields
  validates, and so does one whose only language entry is `{}`.
- Scaffold: the written file carries `$schema`, `schemaVersion` and every
  default; resolving it with a `languages` entry added gives the same config as
  resolving an empty `portal` block with that entry.
- Serve watcher: a favicon edited to a missing file is refused with the
  `generate` message and the last good files kept;
  a change outside `portal` and `languages` re-applies nothing;
  a brand change rewrites both generated files; an invalid edit keeps the last
  good files and reports; a `portal.api` change reports restart-needed.
- Template units, in `test/portal-template/`, on synthetic trees: Home, Guides,
  a `root: true` folder and API to four root folders in first-appearance order;
  Home moved first when `index` is not named and kept in place when it is;
  loose pages either side of a folder tab both in Guides; an empty Guides not
  created; `root: true` ignored on a nested folder and on `api`; the synthetic
  Home node when there is no index; folder-tab and API
  labels from `nav.json` `title`; the explicit tab list (a URL found through
  nested folders, `$folder` bound); the document filter (deprecated and internal
  operations removed, an emptied path item removed, `x-ext` references intact,
  the defaults leaving the document untouched).
- Fixtures: `test/resources/portal-inputs/default/apimatic.json` moves to the
  nested shape and gains a `languages` entry.
- End-to-end, extending `test/e2e/portal-build.test.ts`: the default fixture;
  the emitted CSS carries the preset's tokens and the primary override; a
  `colorMode: dark` fixture emits no theme switch and names `dark` in
  next-themes' inline script (the DOM check stays a manual headless-Chrome
  step); the `notebook-navbar` header carries the tabs; a `showDeprecated:
  false` fixture emits no page and no sidebar row for the deprecated operation;
  one `glass` build succeeds and type-checks; the client-bundle assertion also
  covers `portal.identity.json`.

## 10. Verified Fumadocs behaviour

Read from the pinned `fumadocs-ui@16.15.8`, `fumadocs-core@16.15.8`,
`fumadocs-openapi@11.4.1` and `next-themes@0.4.6` on 2026-09-21, and
`metaSchema` re-read on 2026-09-23 after #347 (Node 24, TypeScript 7), which
did not change the pins. Re-check each entry if a pin moves.

- **Metadata schema.** `fumadocs-core/source/schema`'s `metaSchema` is a plain
  Zod object of `title`, `pages` (strings only), `pagesIndex`, `description`,
  `root` (boolean or string), `defaultOpen`, `collapsible`, `icon`. Unknown
  keys are stripped. This is why section 5 adds `root` and nothing custom, and
  why per-tab options live in `apimatic.json`.
- **Presets.** `fumadocs-ui/css/` holds twelve theme files. `shadcn.css` maps
  every token to a host application's own variables, so eleven are usable
  standalone. Each is `@theme { --color-fd-* }` for light plus a `.dark { }`
  block; `vitepress` also restyles the sidebar and prose, `ocean` adds a dark
  gradient. The seventeen overridable tokens: `background`, `foreground`,
  `muted`, `muted-foreground`, `popover`, `popover-foreground`, `card`,
  `card-foreground`, `border`, `primary`, `primary-foreground`, `secondary`,
  `secondary-foreground`, `accent`, `accent-foreground`, `ring`, `overlay`.
  `info`, `warning`, `error`, `success`, `idea` and the four `diff-*` tokens are
  `@theme static` and not per-mode.
- **Layout variables.** Docs and notebook expose `--fd-layout-width`,
  `--fd-sidebar-width`, `--fd-toc-width`, `--fd-header-height` among others;
  glass uses `--fd-main-width`, `--fd-left-width`, `--fd-right-width` instead.
- **Layouts.** `layouts/docs`, `layouts/notebook`, `layouts/glass`,
  `layouts/flux`, `layouts/home`, each with its own `page` module. Notebook's
  `tabMode` is `'sidebar' | 'navbar'` and its `nav.mode` is `'top' | 'auto'`.
  In navbar mode the header renders the tabs on large screens and grows from
  `--spacing(14)` to `--spacing(24)`; the sidebar dropdown is `lg:hidden`.
  Glass's CSS is `css/generated/glass.css` and is not in `preset.css`; its
  `sidebar` prop is its own provider's `{ collapsible }`; its page module has
  `toc`, `full`, `tableOfContent` only. Flux imports `motion`.
- **Tabs.** `getLayoutTabs` walks the tree in order and emits one tab per
  folder with `root`, linking to `index?.url` or the first child of type
  `page`; it does not descend, so a root folder holding only folders yields no
  tab. All four layouts accept an explicit `tabs: LayoutTab[]` instead, and
  `isLayoutTabActive` uses the bound `$folder`. `useTabsGroups` builds the
  visible tab group from the root folders on the current page's path; a page
  outside every root folder yields no group, so no folder-derived tabs render.
  The sidebar root is the last root folder on the path, else the whole tree.
- **Page tree.** `Folder` carries `root?: boolean | string`, `index?: Item`,
  `name`, `description`, `defaultOpen`, `collapsible`, `children`, `$id`. The
  same URL may not appear twice in the tree. Transformers expose `file`,
  `folder`, `separator` and `root` hooks; `root` receives the assembled tree.
- **Theme provider.** `RootProvider.theme` is next-themes' `ThemeProviderProps`
  plus `enabled` and `hotKey` (default `d`): `forcedTheme`, `defaultTheme`,
  `enableSystem`, `attribute`, `storageKey`, `disableTransitionOnChange`.
  Layouts take `themeSwitch: { enabled, mode: 'light-dark' | 'light-dark-system' }`.
- **Links.** `BaseLayoutProps.links` accepts `main`, `icon`, `button`, `menu`
  and `custom` items with `on: 'menu' | 'nav' | 'all'` and
  `active: 'url' | 'nested-url' | 'none'`; `githubUrl` is a shortcut.
- **OpenAPI.** `groupBy` is `'tag' | 'route' | 'none' | fn`, default `none`
  (the template passes `tag`). Tags whose `kind` is neither absent nor `nav`
  are skipped when grouping. `deprecated` is copied onto each page's `_openapi`
  meta and the loader plugin wraps the sidebar name in `line-through`. Nothing
  reads `x-internal`. `input` accepts a file path, URL or document object, and
  `getSchema(id)` returns `{ bundled }`, the same document each page's
  `getOpenAPIPageProps().payload.bundled` carries.
- **Fonts.** `app.css` loads Geist and Geist Mono from Google Fonts and sets
  `--default-font-family` / `--default-mono-font-family` in `@theme`.

## 11. Delivery

One PR against `dev`, `feat(portal)`, on a branch cut from `dev`. It changes a
block no release has shipped, so it carries no `BREAKING CHANGE:` footer; that
stays on the last PR of the apimatic-config series, and the release-notes draft
there is updated to the new keys (section 13).

It is independent of the series' quickstart-adopts PR: whichever lands second
adapts the scaffold to the other.

Implementation steps inside the PR, each leaving build, lint on touched files
and the affected tests green, each stopped at for review:

1. **Block shape.** The value objects, `Color`, the font table, `PortalLanguages`,
   the finding partition, completion, the fixture. CLI only.
2. **Schema.** `apimatic.schema.json`, the conformance test, `files`.
3. **Generated files.** `PortalStylesheet`, `portal.identity.json`,
   `portal.config.json` widened, `app.css`/`portal.ts` changes, and the template
   applying site, brand, layout, links, CTA and page actions.
4. **Tabs.** `PortalNavigation` (`apimatic:sdks`, `root`), the `root` hook, tab
   URLs, the template unit tests.
5. **API options.** `openApiSection` taking `groupBy` and the filter; prerender
   through it.
6. **Serve re-apply.** The watcher service, the serve action and prompts.
7. **Scaffold, docs, e2e.** Populated scaffold with `$schema`, README, the e2e
   cases, the plan amendments in section 13, and the sample repository's v2
   branch as a separate PR in its own repo.

## 12. Risks and things to verify during implementation

- **The user writes `languages` by hand** (decided 2026-09-23). `languages` is
  required and nothing in this PR writes it for a portal project: the scaffold
  does not, and a quickstart step that does is a separate, later PR. So a fresh
  quickstart project reports `'languages' is required` until the user adds an
  entry to `src/apimatic.json`. The wizard therefore does not serve
  immediately: its closing note shows the entry to add — `"languages": {
  "typescript": {} }` — and the command to run afterwards. The missing-block
  error carries the same example, and mentions that `apimatic sdk publish`
  records an entry too. When the quickstart step lands it removes the note and
  restores the serve.
- **A portal cannot be built before a language is named.** Hand-writing an
  entry (`"typescript": {}`) is enough, since the portal checks only the key.
  Today a `{}` entry is inert for the plugin commands: `hasPublishedSdks` needs
  `publishing.source` or `publishing.package`, so `plugin generate` still
  reports no published SDKs, and `assertNoCodegenVersionMismatch` skips an
  entry with no `publishing` record.
- **The hand-written entry is not inert for long.** Since #350 an entry with no
  `publishing` block means "this language is wanted, nothing is published
  yet", which is the state the coming bundling change turns into an SDK
  generated and bundled by `plugin generate`. A user who writes
  `"typescript": {}` only to satisfy the portal is also asking for a
  TypeScript SDK in their plugin. That is the intended reading — one list of
  the project's languages, shared by both halves — but the missing-block error
  and the quickstart note say it in one line, so nobody names a language they
  do not ship.
- **`languages` is required before anything uses it.** No SDKs tab or page
  renders in this release, so the requirement buys only a schema locked before
  2.0. Kept here deliberately (decided 2026-09-23); the error message carries
  the one-line fix.
- **One large PR.** CLI types, schema, theming, tabs, the API filter and a
  watcher in one change (decided 2026-09-23). The seven steps of section 11
  are reviewed and committed one at a time inside it; the watcher, step 6, is
  the most separable if review stalls.
- An unlayered `:root:not(.dark) { --color-fd-primary }` after the preset
  import beats the preset's `@theme` declaration under Tailwind 4's layering,
  and stays out of dark mode. Confirm in the built CSS in both modes.
  *Verified in step 3:* the preset's light tokens land in `@layer theme`, the
  override is unlayered, and the generated `.dark` rule follows the preset's.
  Headless Chrome shows each mode's primary with its own foreground.
- A bare-specifier `@import 'fumadocs-ui/css/<preset>.css'` at the top of
  `theme.css`, itself imported from `app.css`, resolves through the linked
  `node_modules` under Tailwind 4's Vite plugin. *Verified in step 3.*
- A token value is written into `theme.css` as it stands, so one holding `;`,
  `{`, `}` or `/*` would reach past its declaration. *Added in step 3:* the
  parser and the schema refuse those.
- A bundled document handed back to `createOpenAPI` as a document object
  round-trips: `x-ext` references stay resolvable and the pages match those the
  file-path server produced for an unfiltered spec.
- The `root` hook runs after the `folder` hook for `''`, so it receives the
  root already ordered by `nav.json`. Confirm on the pinned version; if not,
  the hook calls `reorder` itself. *Confirmed in step 4.*
- Synthetic root folders survive `serializePageTree` / `deserializePageTree`
  and `$id`-based tab matching on the client. *Verified in step 4* in headless
  Chrome under all four layouts: the active tab follows the page.
- The client bundle carries `portal.identity.json` whole and nothing else from
  the CLI-written files.
- Bundle delta from importing all four layouts statically. *Measured in step
  3:* about 38 KB of script, 8 KB gzipped, over notebook alone.
- The Google Fonts weight axis for each shortlisted family; the CSS2 URL
  differs between variable fonts (`wght@100..900`) and static ones.
- A `full` OpenAPI page under the glass layout. *Verified in step 3* in
  headless Chrome.
- The watcher's comparison must be on the resolved config, not the file text:
  the plugin writers re-serialise the whole file, so a text diff would re-apply
  on every `sdk publish`.
- Whether the one-entry sidebar on the Home tab grates enough to hide it. Docs
  has `sidebar.enabled`; notebook and glass do not. Deferred.

## 13. Changes to the other plans

Made in step 7, as dated amendments rather than rewrites, since all three
plans are implemented.

`.ai/plans/portal-navigation.md`:

- `apimatic:pages` is renamed `apimatic:sdks` and places the SDKs tab; the group
  rationale in section 1 is superseded, because each generated section is its
  own tab and gets its own token.
- Root-level entries decide the tabs (this plan, section 5); `root` is a new
  `nav.json` key on top-level folders.
- Section 4: the `languages` requirement lands with this plan, not with the SDK
  page. Open question 2 of section 11 is answered by it.
- Section 6: the fallback home page now exists and gets a tree node here.

`.ai/plans/apimatic-config.md`:

- Section 1: the `portal generate` half of "requires a `languages` entry" moves
  into this plan's PR; the `plugin generate` half stays in the series.
- Section 2, "Which findings reach which command": revisited as that row
  anticipated — the portal path now reads `languages` findings.
- Section 10: the portal-config bullet is superseded by this plan.
- Section 13: the release-notes line listing `title`, `description`, `logo`,
  `siteUrl` names the new namespaces and the `languages` requirement.

`.ai/plans/fumadocs-portal.md`:

- Section 3: replace the v1 `portal` block shape with a pointer to this plan.
- Section 4: the template's fixed `neutral.css` import and Geist lines move
  into the generated `theme.css` and a head link; the identity literal in
  `portal.ts` becomes a JSON import.
- Section 9: the Google Fonts risk now covers a shortlist and has a `system`
  opt-out.

## 14. What changed from the 2026-09-21 draft

Kept so the older reasoning is not re-litigated:

- The file is the `portal` block of `src/apimatic.json`, not `portal.json`.
  `$schema` and `schemaVersion` are root keys; paths in messages carry the
  `portal.` prefix; `PortalConfig.parse` is `PortalConfig.fromBlock`.
- `sdks.languages` is gone; the portal requires the shared top-level
  `languages` block, in this PR.
- `navigation.sections` is gone. Tabs come from `nav.json` (section 2 records
  why). The section-specific keys moved: the Home CTA to `portal.home.cta`, the
  API options to `portal.api`. The AI section has no tab until it has pages.
- The `apimatic:` tokens are not dropped: #346 shipped them, and they now place
  tabs. `apimatic:pages` became `apimatic:sdks`.
- Injected pages are recognised by loader source key, as #346 implemented, not
  by a reserved slug.
- The shared OpenAPI module already exists (`openapi-section.server.ts`); it is
  extended rather than created.
- The rename hints and the pre-2.0 migration table are gone: no messaging for
  keys that never shipped, and none for 1.x.
- The schema covers the whole file; the draft's single-block schema is
  superseded.
- Two PRs became one.
