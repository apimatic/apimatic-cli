# Plan: `portal.json` v2 — site, brand and navigation configuration

Status: decided 2026-09-21 with no open questions, not started. Builds on `.ai/plans/fumadocs-portal.md`
(implemented, PR #343) and `.ai/plans/portal-navigation.md` (`nav.json`, the SDK
page; not yet implemented, assumed to ship in the same 2.0 release). Section 13
lists what those two plans need amended.

Reference: the PM's proposal "Portal Configuration: MVP Structure" (Abdul Hannan,
2026-09-18). It was used for *capabilities*; key names were chosen here against
Fumadocs' own prop names, Mintlify's `docs.json`, Starlight and Docusaurus.

## 1. Goal and scope

Give `portal.json` the shape it will keep, and make the portal brandable: logo,
favicon, colour preset, primary colour, fonts, light/dark mode, layout, header
links, and top-level sections rendered as tabs. Every key is optional except
`sdks.languages`, which must name at least one language, and `site.name` when
the project holds more than one spec. A file holding the languages and
`site.url` builds a correct single-spec portal.

The `portal.json` schema is unreleased, so restructuring it is free until 2.0
ships and a breaking change after. That is why the whole key structure lands in
this release even where a behaviour ships thin (section 11).

In scope: the schema, the CLI-side validation and defaults, the template changes
that apply each key, the quickstart scaffold, and a published JSON schema for
editors. (The migration hint from the pre-2.0 build file was in scope when this
was written; it was removed on 2026-09-22 and is not to be brought back, see
section 8.)

Out of scope: a contrast gate on raw token overrides, per-language SDK settings
beyond the list the navigation plan requires, i18n, the AI section's pages, and
a hidden sidebar on the Home tab (section 12).

## 2. Decisions (locked, 2026-09-21)

| Topic | Decision |
|---|---|
| Navigation model | Sections as tabs, always. Each entry of `navigation.sections` becomes a root folder in the page tree; there is no flat-sidebar mode. `nav.json` orders pages inside Guides only, and its `apimatic:api` / `apimatic:pages` tokens are dropped from the navigation plan before it is built. |
| Home | `content/index.md` rendered in the docs layout, with an optional CTA button under the title. No landing layout. The Home tab's sidebar holds only the home page; hiding it is deferred. |
| Sections without pages | `sdks` and `ai` are accepted now and resolve to nothing until their pages exist. A section with no pages emits no tab. |
| Sections left out of the array | Appended after the listed ones, in default order, with their default label. Listing a section sets its label and position; nothing hides it. Hiding, if ever needed, arrives as an explicit `hidden: true` on the entry, which is additive, so this default never has to change. Same rule the navigation plan applies to unnamed pages. |
| `languages` | Lives at `sdks.languages`, not top level. Required, with at least one entry, as the navigation plan already says; the only required path in the file. |
| Layouts | `docs`, `notebook`, `notebook-navbar`, `glass`. Default `notebook-navbar`. `flux` is not exposed. |
| Primary colour | Overrides `--color-fd-primary`, a contrast-picked `--color-fd-primary-foreground`, and `--color-fd-ring`. The preset supplies every other token. |
| Fonts | A validated shortlist plus `system`. No free text. Loaded from Google Fonts at runtime, as Geist is today; `system` makes no network request. |
| Favicon default | The light logo, as today; none when there is no logo. The APIMatic mark is never shipped onto a customer's domain. |
| Site name default | Derived from `info.title` when the project has exactly one spec. With two or more specs `site.name` is required. |
| JSON schema | `portal.schema.json` ships in the npm package and is referenced from a CDN URL; the scaffold writes the `$schema` line; a test keeps schema and parser in step. |
| Key names | The five deviations from the PM draft stand: `brand.colors.preset`, `brand.colorMode`, `brand.fonts`, `navigation.links`, `showInternal`. |
| Raw tokens | `advanced.tokens.{light,dark}` are validated by name and passed through in this release, because the same generated stylesheet carries them for free. The contrast gate is post-MVP. |
| Colour formats | `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `hsl()` for `brand.colors.primary`, because the foreground derivation has to parse it. Raw tokens accept any CSS colour string. |
| Defaults | Applied twice, deliberately: the scaffold writes them into the file ("ship populated"), and `resolve()` fills them for a hand-written minimal file. An explicit default and an absent key produce the same portal. |
| Generated files, not substitution | The CLI writes two files the template imports: `portal.identity.json` (client-safe, read by `portal.ts`) and `src/styles/theme.css`. Re-applying a config edit under `portal serve` is then a plain write of those two files, and the only substitutions left are the content-directory literals prepare makes once. |
| Operation filtering | `showDeprecated` and `showInternal` are applied to the bundled document before pages are generated, not to the generated pages. Fumadocs bundles once; the filtered document is handed back as a document object. |

Rejected, with reasons:

- **Sections opt-in with a flat sidebar by default.** Two navigation models to
  build, test and document, and the PM's default layout puts tabs in the navbar,
  which is designed around sections existing.
- **Home as a plain tab, not a root folder.** Fumadocs builds tab groups from
  the root folders on the current page's path. A page outside every root folder
  renders no tabs at all (section 10), so the index page cannot sit at the tree
  root.
- **A landing page on Fumadocs' HomeLayout.** A second layout with its own
  navbar rules and a fourth page type in the routes, for a CTA a button covers.
- **Top-level `languages`.** Every other key lives under a concept; the bare
  word means locales in Fumadocs' and Mintlify's own configs; and the SDK page
  will want package and repository fields next to the list.
- **Tinting accent, secondary and muted from the primary.** Hue and chroma math
  per preset, and it fights presets like `vitepress` and `ocean` that restyle
  surfaces themselves. `advanced.tokens` is the escape hatch.
- **Free-text Google Fonts family names.** A typo only shows as a fallback font
  at runtime, and the weight axis differs per family so the URL cannot be
  derived reliably.
- **Filtering the document before Fumadocs bundles it.** The document-object
  input form carries no base path for relative `$ref`s to resolve against, and
  the portal plan relies on Fumadocs bundling cross-file references. The
  filter runs on the bundled document instead, where every reference is
  already internal (section 7).
- **Filtering the generated pages after `staticSource`.** Works, but leaves
  emptied tag folders whose `meta.json` has to be found and removed too, and
  the pages' own `payload.bundled` would still carry the hidden operations.
  Filtering the document first makes both problems not arise.
- **Substituting a literal into `portal.ts` for the identity.** Chosen in the
  portal plan because `portal.config.json` held the build machine's paths and a
  JSON module is retained whole. A separate client-safe file has nothing to
  leak, and a file is what a watcher can rewrite.
- **`brand.preset` as its own key.** The preset is a palette; beside the
  primary it seeds under `brand.colors` it reads as one decision and avoids the
  preset / theme / layout muddle.

## 3. The schema

```json
{
  "$schema": "https://cdn.jsdelivr.net/npm/@apimatic/cli@2/portal.schema.json",
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
    "links": [{ "label": "Status", "url": "https://status.example.com" }],
    "sections": [
      { "id": "home", "label": "Home", "cta": { "label": "Get an API key", "url": "/authentication" } },
      { "id": "guides", "label": "Guides" },
      { "id": "api", "label": "API Reference", "groupBy": "tag", "showDeprecated": true, "showInternal": false },
      { "id": "sdks", "label": "SDKs" },
      { "id": "ai", "label": "AI" }
    ]
  },
  "sdks": { "languages": ["typescript", "python"] },
  "ai": { "pageActions": true },
  "advanced": { "tokens": { "light": {}, "dark": {} } }
}
```

| Key | Type | Default | Rule |
|---|---|---|---|
| `$schema` | string | none | Accepted and ignored by the parser. |
| `site.name` | string | `info.title` of the only spec | Required when `spec/` holds two or more documents. Header, page titles, `og:site_name`. |
| `site.url` | string | none | Origin only, as today. Enables canonical links, sitemap, robots, absolute `og:url`. |
| `site.description` | string | first paragraph of `info.description` of the only spec, whitespace-collapsed, capped at 300 characters on a word boundary | Blank is none. A change from today's `suggestedConfig`, which collapses the whole description: a paragraph ends at a blank line, so wrapped prose without one is still whole, which is what that code's comment guards against. |
| `brand.logo` | string or `{light, dark}` | none | Paths relative to `src/` inside `static/`; a string sets both. Each file must exist. |
| `brand.favicon` | string | the light logo | Path inside `static/`; must exist. Any image the logo may be; the link's `type` is set when the extension is known. |
| `brand.colors.preset` | enum | `neutral` | `neutral`, `black`, `vitepress`, `dusk`, `catppuccin`, `ocean`, `purple`, `solar`, `emerald`, `ruby`, `aspen`. |
| `brand.colors.primary` | colour or `{light, dark}` | the preset's | A string sets both modes. Formats per section 2. |
| `brand.fonts.body` | enum | `geist` | `geist`, `inter`, `ibm-plex-sans`, `roboto`, `open-sans`, `source-sans-3`, `manrope`, `dm-sans`, `system`. |
| `brand.fonts.mono` | enum | `geist-mono` | `geist-mono`, `jetbrains-mono`, `ibm-plex-mono`, `fira-code`, `source-code-pro`, `system`. |
| `brand.colorMode` | enum | `both` | `light`, `dark`, `both`. A forced mode hides the switch and the `D` hotkey. |
| `navigation.layout` | enum | `notebook-navbar` | `docs`, `notebook`, `notebook-navbar`, `glass`. |
| `navigation.links[]` | `{label, url}` | `[]` | Rendered in the navbar and the mobile menu. Absolute URLs are marked external. |
| `navigation.sections[]` | see below | all five, in the order shown | Array order is tab order. A section left out of the array keeps its default label and follows the listed ones in default order, so nothing a build produces is unreachable. |
| `sections[].id` | enum | required | `home`, `guides`, `api`, `sdks`, `ai`. Each at most once. |
| `sections[].label` | string | Home, Guides, API Reference, SDKs, AI | Tab text and root-folder name. |
| `sections[].cta` | `{label, url}` | none | `home` only. |
| `sections[].groupBy` | enum | `tag` | `api` only. `tag`, `route`, `none`; Fumadocs' own values. Changes operation URLs: `tag` yields `/api/<spec>/<tag>/<operation>`, `route` `/api/<spec>/<path>/<method>`, `none` `/api/<spec>/<operation>`. |
| `sections[].showDeprecated` | boolean | `true` | `api` only. `true` keeps deprecated operations, struck through in the sidebar as Fumadocs already renders them. |
| `sections[].showInternal` | boolean | `false` | `api` only. Operations carrying `x-internal: true`. |
| `sdks.languages` | string[] | none, required | At least one entry, each a value of the `Language` enum in `src/types/sdk/generate.ts`: `csharp`, `java`, `php`, `python`, `ruby`, `typescript`, `go`. A missing or empty list, or an unknown id, is reported like any other error. The navigation plan owns the entitlement check. |
| `ai.pageActions` | boolean | `true` | Today's top-level `aiPageActions`, moved. |
| `advanced.tokens.light`, `.dark` | map | `{}` | Keys must match `--color-fd-*` and be one of the token names in section 10. Values pass through. |

Unknown keys are reported with a hint when a rename explains them: `title`,
`pageTitle` → `site.name`; `description` → `site.description`; `siteUrl`, `url`
→ `site.url`; `logo`, `logoUrl` → `brand.logo`; `aiPageActions` →
`ai.pageActions`; `languages` → `sdks.languages`; `headerLinks` →
`navigation.links`; `preset` → `brand.colors.preset`; `mode` → `brand.colorMode`;
`typography` → `brand.fonts`; `hideInternal` → `showInternal` with the opposite
value. Every error carries its dotted path, and all errors are reported at once,
as `PortalConfig.parse` does today.

## 4. How each key reaches the portal

The split the navigation plan's section 9 asked for already exists: the browser
gets an identity with nothing machine-specific in it; everything that addresses
the build machine stays in `portal.config.json` behind `portal.server.ts`. This
plan widens both, and moves the identity from a literal substituted into
`portal.ts` to a `portal.identity.json` that `portal.ts` imports, so a config
edit under `portal serve` is a file write Vite hot-reloads.

Browser identity: `name`, `description`, `siteUrl`, `logo` (`{light, dark}` or
null), `faviconUrl`, `layout`, `colorMode`, `links`, `sections`
(`{id, label, cta}`), `pageActions`.

Server-only: `specs`, `contentDir`, `staticDir`, `api` (`groupBy`,
`showDeprecated`, `showInternal`), and later `sdks.languages`.

Generated stylesheet: the CLI writes `src/styles/theme.css` into the build
project; `app.css` imports it last and is otherwise fixed apart from the
content-directory `@source` line prepare already substitutes (section 6).
Nothing about colour or font is decided in the template at runtime.

| Key | Applied where | Fumadocs mechanism |
|---|---|---|
| `site.*` | `__root.tsx`, `$.tsx` head, `seo.ts`, `llms.server.ts` | As today. |
| `brand.logo` | `layout.shared.tsx` `nav.title` | Two `<img>` with `dark:hidden` / `hidden dark:block`; the `dark` variant is defined by Fumadocs' `base.css`. |
| `brand.favicon` | `__root.tsx` `links` | `<link rel="icon">` with `type` from the extension. |
| `brand.colors.preset` | `theme.css` | `@import 'fumadocs-ui/css/<preset>.css'` at the top of the generated file; today's fixed `neutral.css` line leaves `app.css`. |
| `brand.colors.primary` | `theme.css` | `:root:not(.dark) { --color-fd-primary; --color-fd-primary-foreground; --color-fd-ring }` and the dark trio under `.dark`. Both blocks are always emitted. The light block is scoped with `:not(.dark)` because a bare `:root` has the same specificity as the presets' `.dark` block and comes later, so a light-only value would win in dark mode. |
| `brand.fonts` | `__root.tsx` head, `theme.css` | A `<link rel="stylesheet">` to the Google Fonts URL from the identity, then `@theme { --default-font-family; --default-mono-font-family }`. `system` emits no link and the OS stacks. A link rather than a CSS `@import` because a remote import nested inside an imported stylesheet would land mid-file after bundling, where browsers ignore it. |
| `brand.colorMode` | `__root.tsx` `RootProvider`, layout props | `theme={{ forcedTheme, enableSystem: false, hotKey: false }}` when forced; `themeSwitch={{ enabled: false }}` on the layout. `both` is Fumadocs' default. |
| `navigation.layout` | new `src/lib/layout.tsx`, `theme.css` | One switch that exports the layout and page components for the chosen layout (section 6). For glass, `theme.css` also imports `fumadocs-ui/css/generated/glass.css`. |
| `navigation.links` | `layout.shared.tsx` `links` | Fumadocs `MainItemType` `{ text, url, external }`. |
| `navigation.sections` | page-tree transformer, `source.server.ts` | Root folders (section 5). |
| `sections[api].*` | shared OpenAPI source module | `groupBy` passes through to `staticSource`; the two `show*` flags filter its files (section 7). |
| `ai.pageActions` | `$.tsx` | As today. |
| `advanced.tokens` | `theme.css` | Appended to the same `:root:not(.dark)` / `.dark` blocks after the primary, so a light-only token never reaches dark mode. |

## 5. Sections as root folders

Fumadocs renders a folder flagged `root: true` as a layout tab, orders tabs by
tree order, links each tab to the folder's `index` or first page, and scopes the
sidebar to the root folder containing the current page. The switcher renders in
the top bar for `notebook-navbar`, and as a dropdown at the top of the sidebar for
the other three layouts.

The transformer the navigation plan registers through `pageTree.transformers`
gains a `root` hook. It receives the assembled root, whose children today are
the index page, the user's other content pages and folders, the `api` folder,
and (later) the generated SDK page. It regroups them into one synthetic
`Folder` per configured section, in array order:

| Section | Children | Tab URL |
|---|---|---|
| `home` | the index page, or a synthetic page node for `/` when the content has no index (see below) | `/` |
| `guides` | every other content node, in `nav.json` order | first page |
| `api` | what the navigation plan's section 7 produces for the `api` folder: tag folders for one spec, spec folders for several | first operation |
| `sdks` | the generated SDK page or pages | its URL |
| `ai` | nothing yet | none |

How the hook tells the root's children apart: the index page by its URL `/`;
the API reference by its folder path `api`; the injected pages by the reserved
slugs the navigation plan gives them (its open question 1 has to settle the
SDK page's slug for this reason too); everything else is Guides.

Rules:

- A section with no children is not created, so it has no tab.
- When exactly one section remains, its children are inlined into the root
  instead of wrapped, so the sidebar shows pages rather than one folder and no
  switcher renders.
- Tab URLs are computed in the template, not by Fumadocs. `getLayoutTabs` links
  a root folder to its `index` or its first *direct* page child, and the API
  folder has only folders under it, as does a Guides section whose pages sit in
  sub-folders. `layout.tsx` therefore passes an explicit `tabs` list: one per
  root folder, `$folder` bound so active-state detection keeps working, `url`
  the first page found by depth-first walk. Every layout in section 6 accepts
  `tabs`.
- A section left out of the array is appended after the listed ones with its
  default label (section 3). Nodes never sit outside every root folder, which
  is the state section 2 rejects for Home.
- The fallback home page gets a tree node. `$.tsx` already renders a landing
  page at `/` when the content has no `index.md`, but that page has no node in
  the tree, so it would sit outside every root folder and show no tabs. When no
  index page exists, the hook adds a synthetic `page` node named after the Home
  label with URL `/` to the Home folder. The route keeps rendering the fallback;
  the node only gives it tab context.
- `label` is the folder `name`; `id` seeds `$id`, which the builder would
  otherwise only assign to folders it created itself, so React keys and the
  tree context's root tracking stay stable across renders.
- The hook reads `sections` from the same identity file the browser gets,
  through `portal.ts`; server modules may import client-safe ones.
- Sections do not change URLs. Fumadocs derives them from slugs, not tree
  position, so a guide stays at `/authentication` and an operation at
  `/api/petstore/pet/addPet`. Only `groupBy` moves operation URLs (section 3).
- The `nav.json` at the content root orders the Guides children. Its
  `apimatic:` tokens are errors (section 13).

The Home CTA renders in `$.tsx` under the title of the index page and of the
fallback home alike, as an anchor styled with `buttonVariants` from
`fumadocs-ui/components/ui/button`, when `sections` contains `home` with a
`cta`.

## 6. Template changes

- **`src/lib/layout.tsx`** (new): maps `portal.layout` to the layout component
  and its page module, and returns the layout props each needs. Notebook takes
  `nav.mode: 'top'` and `tabMode: 'sidebar' | 'navbar'`; docs has no `nav.mode`
  and its own `tabMode: 'top' | 'auto'`, left at the default; glass's `sidebar`
  prop is only `collapsible`, and its page module exposes only `toc`, `full`
  and `tableOfContent`. The same module computes the explicit `tabs` list from
  section 5. All four modules are imported statically; if the bundle
  grows by more than a few hundred kilobytes, the import specifiers become a
  prepare-time substitution instead (measure in section 12).
- **`app.css`**: loses the Google Fonts and `neutral.css` lines and gains a
  fixed `@import './theme.css'` after the Fumadocs and OpenAPI presets, so the
  generated rules come last. Its only substitution stays the content-directory
  `@source` line prepare makes once.
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
- **`$.tsx`**: components from `layout.tsx`; the CTA on the index page.
- **`source.server.ts`** and the navigation plan's transformer module: the
  `root` hook from section 5.
- **`src/lib/openapi-source.server.ts`** (new): the single place that bundles
  each document, filters it (section 7), and calls `staticSource` on the result
  with the configured `groupBy`. Both `openapi.server.ts` and
  `prerender-pages.ts` call it; today each builds the source itself, and they
  would drift. `prerender-pages.ts` runs inside the Vite config, where the `@/`
  alias does not apply and imports carry the `.ts` extension, so it imports the
  module by relative path. The `.server` suffix keeps TanStack's import
  protection on it.
- **`src/prompts/portal/serve.ts`**: the note that says `portal.json` edits need
  a restart changes with section 8.

## 7. Deprecated and internal operations

Fumadocs stores `deprecated` on each generated page's `_openapi` metadata and
renders it struck through, so `showDeprecated: true` costs nothing. It has no
notion of `x-internal`.

The shared source module filters the document, not the pages:

1. Create the server on the file path as today and take `getSchema(id).bundled`,
   the document with every external reference already folded into
   `#/components` or `x-ext`.
2. Walk `paths` and `webhooks`. Remove an operation when it is `deprecated` and
   `showDeprecated` is false, or carries `x-internal: true` and `showInternal`
   is false. Remove a path item left with no operations.
3. Create a second server with the filtered document as its `input` value,
   which `createOpenAPI` accepts, and call `staticSource` on that one.

Because the page generator never sees a removed operation, no page, sidebar row
or emptied tag folder exists for it, and each page's own `payload.bundled` is
the filtered document too. `llms.server.ts`, `sitemap.server.ts` and the search
index read the loader, so they follow without further work. The prerender list
does not: `prerender-pages.ts` builds its own source today, which is why
section 6 routes it through the shared module.

## 8. CLI changes

Following `.ai/instructions.md` and the skills in `.ai/skills/`.

- **Types.** `PortalConfig` becomes the root of nested value objects, one per
  namespace: `SiteConfig`, `BrandConfig` (holding `Logo`, `BrandColors`,
  `Fonts`), `NavigationConfig` (holding `Section`), `SdkConfig`, `AiConfig`,
  `AdvancedTokens`. Each parses its own subtree and returns errors with dotted
  paths; `PortalConfig.parse` concatenates them. Two helpers: `Color` (parse the
  accepted formats, relative luminance, WCAG contrast ratio, foreground choice
  between the neutral preset's 98 % and 9 % greys) and the font table (id, CSS
  family string, Google Fonts URL, fallback stack).
- **Completion.** `PortalSourceContext.resolve()` already parses every spec. It
  completes the config from the single spec (name, description) or reports
  `site.name` missing when there are several, and checks each logo and the
  favicon exist. Anything worth a warning rides the Ok value the way
  `shadowedFiles` does, since the types layer cannot print; both actions report
  it through their prompts.
- **Stylesheet.** A `PortalStylesheet` value object renders `theme.css`, its
  import lines included, and the Google Fonts URL for the head link from a
  completed config, so the CSS is unit-testable without a build.
- **Project service.** Writes `theme.css`, `portal.identity.json` and the
  widened server-only file. The content-directory substitutions into
  `source.ts` and `app.css` stay as they are. The identity substitution into
  `portal.ts` goes away.
- **`portal serve` re-applies `portal.json`.** Today the project is prepared
  once and a config edit needs a restart, which was tolerable for a title and a
  logo and is not for colour and font tweaks. A new infrastructure service
  watches the file and reports each change as a `Result`; the serve action
  re-parses on change, and on success asks `PortalProjectService` to rewrite
  `theme.css` and `portal.identity.json`, which Vite hot-reloads. Nothing is
  re-substituted, so the content-directory literals prepare wrote are never at
  risk. On failure the prompts print the same errors `generate` would and the
  last good state stays. Changes to the API section options and to the specs
  still need a restart, because `vite.config.ts` reads them once; the prompt
  says so when those keys change.
- **Quickstart.** `scaffold` writes a populated `portal.json`: `$schema`, the
  derived `site` fields, every brand and navigation default spelled out, all
  five sections, and `sdks.languages` from the wizard's language step, which the
  portal path dropped in the portal plan and brings back here since the key is
  required. `site.url` stays absent and the closing note names it.
- **Migration hint.** **Superseded 2026-09-22: the hint was removed from the
  CLI, and the decision is that no message maps 1.x settings onto 2.0 ones.
  The table below is kept as a record of the correspondence, not as work to
  do; the `pageTitle` and `logoUrl` "did you mean" suggestions in
  `PortalConfig.parse` went with it.** Original text follows. Extended from
  three fields to the table below. Fields with no v2 home stay in the
  unsupported list. Reporting moves from top-level keys
  to leaves: today `Object.keys(generatePortal)` minus the migrated set is the
  unsupported list, which would name `portalSettings` as unsupported while
  migrating values inside it. The hint walks `portalSettings.theme` and lists
  what it did not carry over by dotted path, and lists every other
  `portalSettings.*` key the same way.

| Pre-2.0 field | v2 key |
|---|---|
| `pageTitle` | `site.name` |
| `baseUrl` | `site.url` |
| `logoUrl` | `brand.logo.light` (only when inside `static/`, as today) |
| `logoUrlDark` | `brand.logo.dark` (same rule) |
| `faviconUrl` | `brand.favicon` (same rule) |
| `portalSettings.theme.colors.primaryColor.{light,dark}` | `brand.colors.primary` (when the value parses) |
| `portalSettings.theme.colorMode` | `brand.colorMode` when the old object resolves to light, dark or both; its exact shape is read off the build schema during implementation, and anything else is unsupported |
| `portalSettings.theme.cssStyles.fontFamily` | `brand.fonts.body` (when the name is on the shortlist) |
| `languageConfig` keys | `sdks.languages` (mapped to the navigation plan's language ids) |
| `tableOfContentsPath` | still the `nav.json` note |
| `navTitle`, `logoLink`, `logoAltText`, `headIncludes`, `tailIncludes`, `whiteLabel`, `theme.fontSource`, `theme.layout.*`, everything else | unsupported |

- **JSON schema.** `portal.schema.json` at the repository root, listed in
  `files`. Hand-written; a test runs every fixture through both `ajv` (dev
  dependency) and `PortalConfig.parse` and asserts they agree on validity. The
  `$schema` URL is `https://cdn.jsdelivr.net/npm/@apimatic/cli@2/portal.schema.json`.
- **Prompts.** New source problems: a missing dark logo or favicon named with its
  key; `site.name` required for several specs; the serve watcher's re-applied,
  rejected and restart-needed messages.

## 9. Tests

- Value objects: every key's accepted and rejected forms, every renamed-key
  hint, the `hideInternal` inversion hint, `$schema` ignored, duplicate section
  ids, section-specific keys on the wrong section, colour formats, font ids,
  and `sdks.languages` missing or empty reported alongside the other errors.
- `Color`: parsing, luminance against known values, the foreground choice on
  both sides of the crossover.
- `PortalStylesheet`: the emitted CSS for each preset, `system` fonts emitting
  no link, glass adding its import, tokens landing after the primary, the light
  block scoped with `:not(.dark)`, both blocks present when the primary is one
  string.
- Completion: name and description derived from one spec, `site.name` required
  for two, missing files reported.
- Migration: dropped with the hint (section 8). Instead, one test that a missing
  `portal.json` is reported the same way with and without an old build file.
- Schema conformance: every fixture agrees between `ajv` and the parser.
- Template units, in `test/portal-template/`: the `root` hook on a synthetic
  tree (five sections to five root folders in array order, empty sections
  dropped, a single section inlined into the root, a section left out of the
  array appended with its default label, Home holding the index, a synthetic
  Home node when there is no index, injected pages recognised by slug), the
  explicit tab list (a URL found through nested folders, `$folder` bound), and
  the document filter (deprecated and internal operations removed, an emptied
  path item removed, `x-ext` references intact, `showDeprecated: true`
  untouched).
- End-to-end, extending `test/e2e/portal-build.test.ts`: the default fixture
  with the scaffolded config; the emitted CSS carries the preset's tokens and
  the primary override; a `colorMode: dark` fixture emits no theme switch and
  names `dark` in next-themes' inline script (the class itself is applied by
  that script at load, so the HTML text never carries it; the DOM check stays a
  manual headless-Chrome step, as for hydration today); the `notebook-navbar`
  header carries the tabs; a
  `showDeprecated: false` fixture emits no page and no sidebar row for the
  deprecated operation; one `glass` build succeeds and type-checks.

## 10. Verified Fumadocs behaviour

Read from the pinned `fumadocs-ui@16.15.8`, `fumadocs-core@16.15.8`,
`fumadocs-openapi@11.4.1` and `next-themes@0.4.6` on 2026-09-21.

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
  `sidebar` prop is its own provider's `{ collapsible }`, not the shared
  sidebar's; its page module has `toc`, `full`, `tableOfContent` only. Flux
  imports `motion`.
- **Tabs.** `getLayoutTabs` walks the tree in order and emits one tab per
  folder with `root`, linking to `index?.url` or the first child of type
  `page`; it does not descend, so a root folder holding only folders yields no
  tab. All four layouts accept an explicit `tabs: LayoutTab[]` instead, and
  `isLayoutTabActive` uses the bound `$folder`. `useTabsGroups` builds the visible tab group from
  the root folders on the current page's path; a page outside every root folder
  yields no group, so no folder-derived tabs render (tabs passed without a
  `$folder` form their own group, which is why a plain Home tab would render
  alone). The sidebar root is the last root folder on the path, else the whole
  tree.
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
- **Fonts.** `app.css` already loads Geist and Geist Mono from Google Fonts and
  sets `--default-font-family` / `--default-mono-font-family` in `@theme`.
- **Pre-2.0 build schema** (`titan.apimatic.io/api/build/schema`): `logoUrlDark`,
  `faviconUrl`, `baseUrl`, `portalSettings.theme.colors.primaryColor.{light,dark}`,
  `theme.colorMode`, `theme.cssStyles.fontFamily`, `theme.fontSource`,
  `theme.layout.sidebar.{mode,variation,size}`. Fonts offered were Rubik, Roboto,
  Inter, Open Sans, Montserrat and Courier Prime, Anonymous Pro, IBM Plex Mono.

## 11. Delivery

Two PRs against `dev`, both before the 2.0 stable cut, after PR #343 merges.

1. **Schema, brand and layout.** Sections 3, 4, 6 (all but the transformer
   and the shared OpenAPI source module), 8 and 9 minus the section and filter
   tests. Includes `navigation.sections` parsing and the identity fields, so
   the file shape is complete, but the transformer and the API options wait
   for the second PR. Until then the sidebar is whatever the tree produces at
   that point, and `sections` only validates.
2. **Sections and API options.** Sections 5 and 7 plus the shared OpenAPI
   source module, after the `nav.json` PR has landed, since the `root` hook
   extends its transformer.

Both are ordinary `feat(portal)` commits. The `BREAKING CHANGE:` footer is
PR #343's, and it already names the new `portal.json` layout; these PRs change
a schema no release has shipped.

## 12. To verify during implementation

No open questions remain; the two the review surfaced on 2026-09-21 are
decided in section 2 (`sdks.languages` required, unlisted sections appended).
The PM's draft reads omission as removal; that expectation is the one to
amend, not the navigation plan.

- An unlayered `:root:not(.dark) { --color-fd-primary }` after the preset
  import beats the preset's `@theme` declaration under Tailwind 4's layering,
  and stays out of dark mode. Expected yes; confirm in the built CSS in both
  modes.
- A bare-specifier `@import 'fumadocs-ui/css/<preset>.css'` at the top of
  `theme.css`, itself imported from `app.css`, resolves through the linked
  `node_modules` under Tailwind 4's Vite plugin.
- A bundled document handed back to `createOpenAPI` as a document object
  round-trips: `x-ext` references stay resolvable and the pages match those the
  file-path server produced for an unfiltered spec.
- The client bundle carries `portal.identity.json` whole and nothing else from
  the CLI-written files; extend the navigation plan's absolute-path grep over
  `dist/client` to assert it.
- Synthetic root folders survive `serializePageTree` / `deserializePageTree`
  and `$id`-based tab matching on the client.
- Bundle delta from importing all four layouts statically (section 6).
- The Google Fonts weight axis for each shortlisted family; the CSS2 URL
  differs between variable fonts (`wght@100..900`) and static ones
  (`wght@100;200;...`).
- A `full` OpenAPI page under the glass layout.
- Whether the one-entry sidebar on the Home tab grates enough to hide it. Docs
  has `sidebar.enabled`; notebook and glass do not, so hiding would be CSS on a
  data attribute. Deferred.

## 13. Changes to the other plans

`.ai/plans/portal-navigation.md`, before it is implemented:

- Section 2 and 3: drop the `apimatic:api` and `apimatic:pages` tokens. The
  content root's `nav.json` orders the Guides section; both tokens become
  errors naming this plan.
- Section 4: `languages` moves to `sdks.languages`. It stays required with at
  least one entry (confirmed 2026-09-21).
- Section 6: the defaults paragraph describes tabs, not one flat list. The
  "nothing can disappear" rule now also covers sections: one left out of the
  array is appended, not hidden. Its claim that the fallback home page was
  never implemented is stale: `$.tsx` renders one, and this plan's section 5
  gives it a tree node.
- Section 9: the identity is a client-safe JSON file, not a literal, so the
  absolute-path assertion over `dist/client` covers that file's contents.
- Section 11: the SDK page's slug is reserved and fixed, because the `root`
  hook in this plan's section 5 recognises injected pages by it.
- Section 7: the API structure is applied inside the `api` root folder; the
  wrapper's label comes from `sections[api].label`.
- Section 13: `scaffold` writes the `portal.json` from this plan's section 8.

`.ai/plans/fumadocs-portal.md`:

- Section 3: replace the v1 `portal.json` schema with a pointer to this plan.
- Section 9: the Google Fonts risk now covers a shortlist and has a `system`
  opt-out.
- Section 4: the template's fixed `neutral.css` import and Geist lines move
  into the generated `theme.css` and a head link; the identity literal in
  `portal.ts` becomes a JSON import.
