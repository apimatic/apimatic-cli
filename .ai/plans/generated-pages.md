# Plan: the generated SDK pages

Status: designed 2026-09-24 and committed on `saeedjamshaid/portal-config` so it
travels with PR #355, which it builds on. **Not started.** Implementation begins
on a branch cut from `dev` once #355 merges (section 12). The questions asked
and answered the same day are recorded in section 2, and section 14 records
what an adversarial review of the first draft changed.

Follows on from `.ai/plans/portal-navigation.md`, whose section 4 specified "the
injected SDK page" and whose section 11 deferred its shape, and from
`.ai/plans/portal-config.md`, which renamed the token to `apimatic:sdks`,
reserved the SDKs tab, and left both resolving to nothing. Section 11 lists what
those plans need amended once this is implemented.

## 1. Goal and scope

Three kinds of page the CLI generates and injects into the portal, none of which
exists in the user's `src/`:

- **SDKs**, at `/sdks`: one page carrying a card per configured language.
- **One page per language**, at `/sdks/<language>`, all rendered from one
  template.
- **Context plugin**, at `/sdks/context-plugin`, present only when
  `apimatic.json` has a `plugin` block.

Which pages exist, and in what order, comes from `apimatic.json`: the
`languages` block, required since #355, gives the languages in the order
written, and the presence of the `plugin` block gives the plugin page.
`nav.json` positions the whole set as the SDKs tab through `apimatic:sdks`,
which #355 already accepts; it cannot remove them (portal-navigation, section 2).

This change ships the **flow**: deciding the pages, rendering them from
templates, writing them into the build project, compiling them as a second
Fumadocs collection, placing them in the sidebar and the tab bar, prerendering
them, and regenerating them under `portal serve`. The templates it ships are
**placeholders**: a design team is writing the real pages in parallel, and the
data that will fill them comes from a backend call `portal generate` does not
make yet. Both are later PRs (section 10); this one leaves them a file to
replace and an object to fill.

Out of scope: the real page designs; the backend call and its data; validating
the `plugin` block, which that call does on the server and refuses when the
block is empty or invalid (decided 2026-09-24); `apimatic.schema.json`, which
gains no key; and quickstart, which writes nothing new.

## 2. Decisions (2026-09-24)

| Topic | Decision |
|---|---|
| Where the pages are compiled | A second `defineDocs` collection in `portal-template/src/lib/source.ts` over `<projectDirectory>/generated/`, passed to `loader()` under the `generated` key `navigation.ts` already exports as `GENERATED_SOURCE`. The user's `src/` is not touched and not copied. Verified to coexist with the content collection in portal-navigation section 10. |
| The collection's `dir` | The relative literal `'generated'`, no placeholder. fumadocs-mdx resolves it against the Vite root, which is the project directory both commands run from, and embeds the literal itself in the browser bundle as the collection's `base`. An absolute path here would publish the build directory to every visitor and fail the end-to-end assertion that no project path is published (section 14, finding 1). The content directory keeps its placeholder because it lies outside the project. |
| Shape | A folder: `generated/sdks/index.mdx`, one `generated/sdks/<language>.mdx` per language, `generated/sdks/context-plugin.mdx` when there is a `plugin` block, and a `generated/sdks/nav.json` ordering and naming them. URLs `/sdks`, `/sdks/<language>`, `/sdks/context-plugin`. |
| Tab | The `sdks` folder itself becomes the SDKs tab, as a `root: true` folder does today: its index page is listed first, then the languages, then the plugin page, flat. Positioned by `apimatic:sdks`; at the anchor before the API reference when the token is absent. The synthetic `/tab/sdks` stays for loose generated pages, of which there are none today. |
| Tab label | "SDKs", fixed, as portal-config section 2 decided for the tabs the CLI names. Set by `title` in the generated `nav.json`, which the transformer already applies to any folder below the root, so the label is the CLI's whatever the design team titles the index page. |
| Plugin page condition | The `plugin` key holds a JSON object, which is what `ApimaticConfigDocument.plugin()` answers; a bare `{}` counts. Nothing in the block is read or checked: the backend validates the file on the coming `portal generate` call and refuses an empty or invalid block, so a malformed block here is treated as absent and left to that call. |
| Language order | As written in the `languages` block. `sdk publish` appends, and the user reorders by editing the file. |
| Reserved address | `/sdks` and everything below it is the CLI's. A content page whose slugs begin with `sdks` is refused by `PortalSourceContext.resolve()` naming each file: `content/sdks.md`, `content/sdks.mdx`, anything under `content/sdks/`, and the same behind a `(group)` folder, which the content source drops from the address (`getSlugs('(intro)/sdks.mdx')` is `['sdks']`). Two pages at one address are settled without a word by whichever source was scanned last (portal-navigation, section 10). A root `nav.json` entry `sdks` is refused as today, with a hint naming the token. |
| Templates | Three `.mdx` files in a new top-level `portal-pages/` directory, shipped in the npm package beside `portal-template/`. Dynamic text is `{{key}}`. A renderer of a few lines substitutes flat string keys and refuses an unknown or unfilled key, so a template and its data cannot drift silently. No dependency today; mustache, whose `{{key}}` is the same, is adopted when the real templates need sections (section 10). Rendering happens before MDX compilation, so the braces never reach MDX. |
| Data today | `sdks.mdx` and `context-plugin.mdx` take `{}`. `sdk.mdx` takes `{ language, name }`, the enum value and a display name, so the per-language pages have distinct titles and sidebar rows. Everything else waits for the backend data. |
| Display names | A `Record<Language, string>` beside `GeneratedPages`: `csharp` C#, `go` Go, `java` Java, `php` PHP, `python` Python, `ruby` Ruby, `typescript` TypeScript. `LANGUAGE_CHOICES` in `src/types/sdk/generate.ts` spells "Typescript" for the quickstart prompt and is left alone. |
| `portal serve` | The watcher that re-applies the `portal` block also regenerates the pages: a language added or removed, or a `plugin` block added, rewrites `generated/` (changed files written, stale files deleted) and Vite reloads. The generated directory sits inside the Vite root, which Vite watches, unlike the user's content directory, whose additions need a restart today; whether an added or removed page reaches the tree without a restart is the first thing implementation verifies (section 13, step 1). If it does not, the serve notice names the case among the edits that need a restart, and the rewritten index page and `nav.json` still reload. |
| Prerender | `prerender-pages.ts` enumerates the generated directory as it enumerates the content directory. `portal.config.json` gains `generatedDir`, absolute and server-only, as `contentDir` is. |
| Backend data | Not in this PR. `portal generate` will call the backend, which validates `apimatic.json` and answers with what the pages show; `GeneratedPages.of(...)` is where that answer lands (section 10). |

Rejected, with reasons:

- **Writing the pages into the user's `content/`.** The user's `src/` is never
  copied or written to by a build (portal-navigation, section 2); a generated
  file would land in a directory they keep in git.
- **Copying the user's content and the generated pages into one build
  directory.** The content-directory literal in `source.ts` exists so that
  nothing of the user's is copied and edits reload live; a copy loses both.
- **One `defineDocs` over both directories.** `dir` is a single string in
  fumadocs-mdx 15.4.0 (`core-ZgBVAQdE.d.ts`), and the source key is how the
  transformer tells a generated page from the user's, so the pages have to be
  their own source anyway.
- **A second absolute-path placeholder for the generated directory.** The first
  draft's choice, for symmetry with the content directory. The literal is
  embedded in the browser bundle (section 14), so it would publish the build
  directory; a relative literal cannot, and needs no substitution.
- **Gathering the folder into the synthetic SDKs tab.** A tab named SDKs
  holding one collapsible folder named SDKs, with the pages a level down.
- **Flat generated pages** (`sdks.mdx`, `sdks-typescript.mdx`). The URLs read
  badly, and a page and a folder sharing the name `sdks` render as two nodes.
- **File-name prefixes to order the languages** (`01-typescript.mdx`). They
  land in the URL. Fumadocs' own order is alphabetical by path, which puts
  `context-plugin` before every language, so an order file is needed and the
  transformer already applies one.
- **Naming the tab from the index page's title.** The first draft's choice.
  Home, Guides and the API tab are named by the CLI; the folder's `nav.json`
  `title` names this one the same way, at no cost, and leaves the page title
  to the design team.
- **A plugin page at the content root** (`/context-plugin`) or **as a tab of
  its own** with an `apimatic:plugin` token. Asked and declined: one tab, one
  folder, one token.
- **Requiring a recorded identity** (`pluginId`, `pluginName`) for the plugin
  page, or **validating the block** in the CLI. The backend validates the file
  on the coming `portal generate` call; the CLI reads presence alone.
- **A fixed or alphabetical language order.** Asked and declined in favour of
  the order written.
- **Mustache now.** A dependency for no loop yet. The renderer's `{{key}}` is
  mustache's, so adopting it later changes no template.
- **Static MDX plus a JSON data file and React components.** Fumadocs-native,
  but it moves the dynamic parts into `portal-template/src/components/` as
  React rather than into MDX the design team writes, which is not the shape
  they are working in.
- **Copying the templates verbatim with no renderer.** Seven language pages
  with one title, and no seam for the data.
- **Reserving the name case-insensitively.** `content/SDKs/` is another
  virtual path and another address, as `content/API/` is today. That two
  addresses differing only in case overwrite each other when the static site
  is written on Windows or macOS is true of every pair of pages and is not
  this plan's to settle; section 9 records it.

## 3. What is generated

For an `apimatic.json` with `languages: { typescript: {}, python: {} }` and a
`plugin` block, `PortalProjectService.prepare` writes:

```
<projectDirectory>/generated/
  sdks/
    index.mdx           portal-pages/sdks.mdx, data {}                              /sdks
    typescript.mdx      portal-pages/sdk.mdx, data { language, name }               /sdks/typescript
    python.mdx          portal-pages/sdk.mdx, data { language, name }               /sdks/python
    context-plugin.mdx  portal-pages/context-plugin.mdx, data {}; only with `plugin` /sdks/context-plugin
    nav.json            { "title": "SDKs", "pages": ["typescript", "python", "context-plugin"] }
```

The directory always exists and always holds `sdks/index.mdx`, since #355 made
at least one language a requirement. `nav.json` names the tab, then the
languages in the order written and the plugin page last; the index page is the
folder's own link and is not named (portal-navigation, section 10). The CLI
writes this file into its own directory, not the user's, so
`PortalNavigation.validate` never sees it.

### The templates

```
portal-pages/
  sdks.mdx             the SDKs page
  sdk.mdx              one language's page
  context-plugin.mdx   the context plugin page
```

Placeholders, in this PR, of the form:

```mdx
---
title: "{{name}}"
description: "The {{name}} SDK for this API."
---

Installation and usage for the {{name}} SDK will be documented here.
```

Rules the renderer holds them to, which the design team's pages inherit:

- `{{key}}`, with optional inner whitespace, names a flat string in the data
  object. A key the data does not carry fails the build naming the template
  and the key; a key the template does not use is fine.
- Nothing else between double braces is accepted yet, so a section such as
  `{{#languages}}` is refused today rather than written through as text; it
  arrives with mustache (section 10).
- Values are written as they are, with no escaping. When mustache is adopted,
  it is configured not to HTML-escape either, so `{{key}}` keeps its meaning
  and no template needs `{{{key}}}`.
- Front matter values that take a placeholder are quoted, as above: `C#` is
  safe in YAML, but a name followed by ` #` would start a comment, and the
  scaffold already quotes titles for the same reason.
- A template is rendered before MDX ever sees it, so a raw template is not
  valid MDX (`{{` opens a JavaScript expression there). The e2e build is what
  proves the rendered pages compile.

### Data

| Template | Data today | Later |
|---|---|---|
| `sdks.mdx` | `{}` | The languages with their names and page URLs, for the cards; needs a section, hence mustache. |
| `sdk.mdx` | `{ language: 'typescript', name: 'TypeScript' }` | Package name, version, install command, source repository, from the `publishing` record and the backend. |
| `context-plugin.mdx` | `{}` | Plugin id, name, version, install instructions, from the `plugin` block and the backend. |

## 4. Mechanism

### The second collection

`portal-template/src/lib/source.ts` gains a second `defineDocs`, with the same
`docs` options as the first and the same `meta: { files: ['**/nav.json'] }`
restriction, over a relative literal:

```ts
export const generated = defineDocs({
  dir: 'generated',
  docs: { async: true, postprocess: { includeProcessedMarkdown: true } },
  meta: { files: ['**/nav.json'] }
});
```

The macro takes a string literal only. fumadocs-mdx resolves it with
`path.resolve(root, dir)`, where `root` is Vite's, which is the project
directory: `PortalBuildService` and `PortalDevServerService` both run Vite with
`cwd` set to it. The literal is then written into the browser bundle as the
collection's `base` (the built `source.ts` chunk reads
`` base: `…/src/content` `` today for the content collection, which is the leak
portal-navigation section 11 records), so a relative one publishes the word
`generated` and nothing about the machine. The generated directory sits inside
the project, so the cross-drive fallback of `withBuildDirectory` never applies
to it, and nothing is substituted into `source.ts` for it.

`source.server.ts` passes it to `loader()` as the third source:

```ts
{ docs: docs.toFumadocsSource(), [GENERATED_SOURCE]: generated.toFumadocsSource(), [OPENAPI_SOURCE]: await openApiSource() }
```

Every page of it is stamped `type: 'generated'`, which is what
`isFromSource(…, GENERATED_SOURCE)` in `navigation.ts` reads and what the
existing tests already feed in. With no `baseDir`, the folder lands at the
virtual root as `sdks/`, beside the user's content.

### Rendering a generated page

`source.getPage(slugs)` answers with `page.type` of `'docs'`, `'generated'` or
`'openapi'`. `$.tsx`'s server loader today treats anything but `'docs'` as an
OpenAPI page; it changes to treat `'openapi'` as one and the other two as
Markdown pages, and its answer carries which collection the page is from
(`collection: 'docs' | 'generated'`) beside `path`. The client `Content`
component picks `docs` or `generated` by that field for `getPage(path)`,
`preload()` and `body`, since a page's `path` is relative to its own
collection's directory. `llms.server.ts`'s `renderPage` makes the same split, so
the `.md` twin and `llms-full.txt` carry a generated page's processed Markdown
rather than its title alone. The search index, the sitemap and `llms.txt` go
through `source.getPages()` and need nothing.

### Tailwind

`app.css` gains `@source '../../generated';`, written as the existing
`@source not '../../dist';` is, relative to `src/styles/`. Tailwind's automatic
detection is rooted at the project and would likely find the directory on its
own, but the content directory's line exists for a reason that reads the same
here, and a fixed relative path costs nothing.

### Prerender

`portal.config.json` gains `generatedDir` (absolute, server-only, always
present), `PortalConfig` in `portal-template/portal-config.ts` declares it, and
`prerenderPages` calls `contentUrls` on it as it does on `contentDir`. The
slug rules are the content source's own, so `sdks/index.mdx` yields `/sdks` and
`sdks/typescript.mdx` yields `/sdks/typescript`, each with its `.md` twin;
`nav.json` is not a page and is passed over by the extension filter. No
collision handling crosses the two directories, because the CLI refuses every
content page that would land under `/sdks` (section 7).

## 5. Sidebar and tabs

Two changes to `navigation.ts`, both small, both keeping the rules #346 and
#355 set:

- **A generated folder is injected.** `isInjected` answers true for a page from
  the generated source, as today, and for a folder whose index page or first
  page beneath it is, the way `isSpecSection` recognises a specification's
  section through `firstPageIn`. `firstPageIn` walks `children` alone, so the
  folder's `index` is checked first: a folder holding only its index page has
  no page in `children` at all. `reorder` needs nothing else: the token claims
  the folder, the band collects it at the anchor when the token is absent, and
  the root `nav.json` cannot name it individually because the CLI refuses the
  entry (section 7).
- **A generated folder at the root is a tab.** `groupIntoTabs` passes it to
  `asTab`, as it passes the API reference and a `root: true` folder: `root` is
  set, the index page moves to the front of the children, and `$ref` is
  deleted so Fumadocs does not point the tab at a same-named page in another
  tab. Loose generated pages still gather into the synthetic `/tab/sdks`.

The folder's own `nav.json` is applied by the `folder` hook before the `root`
hook runs, through `readSettings(this, 'sdks')`, which resolves
`sdks/nav.json` from the generated collection's metadata: `pages` orders the
children and `title` names the folder, and so the tab. The tab lists:

```
SDKs                                     the tab, named by nav.json's title
  <index page title>   /sdks             the index, lifted first by asTab
  TypeScript           /sdks/typescript  nav.json order
  Python               /sdks/python
  Context Plugin       /sdks/context-plugin  named last by nav.json
```

`tabs.ts` needs nothing: `portalTabs` links a tab to its first page, which is
`/sdks`. Tab order follows the rules of portal-config section 5 unchanged: the
SDKs tab sits where the root `nav.json` puts `apimatic:sdks`, or before the API
reference and after the user's pages when it does not.

## 6. Template changes

- `src/lib/source.ts`: the second `defineDocs` over `'generated'`.
- `src/lib/source.server.ts`: the third source under `GENERATED_SOURCE`.
- `src/lib/navigation.ts`: `isInjected` accepting a folder; `groupIntoTabs`
  making a generated folder a tab.
- `src/routes/$.tsx` and `src/lib/llms.server.ts`: pages routed by
  `'openapi'` versus the two Markdown collections, and the collection carried
  in the loader's answer.
- `portal-config.ts` and `prerender-pages.ts`: `generatedDir`.
- `src/styles/app.css`: the second `@source` line.

No new dependency, so `TEMPLATE_DEPENDENCIES` is unchanged.

## 7. CLI changes

Following `.ai/instructions.md` and the skills in `.ai/skills/`.

- **`PageTemplate`** (`src/types/portal/page-template.ts`, value object): wraps a
  template's text; `render(data: Record<string, string>): Result<string, string>`
  substitutes `{{key}}` and refuses an unknown key or any other brace form,
  naming the key. Pure.
- **`GeneratedPages`** (`src/types/portal/generated-pages.ts`, pure): built by
  `GeneratedPages.of(languages: PortalLanguages, plugin: boolean)`. Answers
  the list of pages, each with its path under the generated directory, the
  template it uses and its data; and the `nav.json` text. Exports the reserved
  name (`SDK_PAGES_NAME = 'sdks'`), the template names and the display-name
  table. The languages come from `PortalLanguages.all()`, which keeps the
  block's key order.
- **`PortalSource`** gains `generatedPages: GeneratedPages`, computed in
  `PortalSourceContext.parseConfig` from the `PortalLanguages` it already
  builds and discards, and from `document.plugin() !== undefined`. What
  `resolveConfig` answers for the watcher widens from `PortalConfig` to the
  pair of `config` and `generatedPages` (a `PortalSettings` type in
  `portal-source.ts`), so a `languages` edit under `portal serve` reaches the
  generator by the same path a `portal` edit reaches the identity file. Every
  `PortalSource` literal in the tests, and the `resolveConfig` stub in
  `test/actions/portal/serve.test.ts`, gains the field.
- **Reserved address.** `resolve()` walks the content tree already; from the
  pages it collects, it takes each one's path segments with `(group)` folders
  dropped, as `getSlugs` drops them, and refuses every page whose first
  segment is `sdks`, or whose only segment is `sdks.md` or `sdks.mdx`, as a new
  `PortalSourceProblem` variant, `{ kind: 'reservedAddress'; name: string;
  files: FilePath[] }`, before the navigation scan. `reportSourceProblem` names
  each file relative to `src/` and says the address is kept for the SDK pages
  the portal generates. A `nav.json` alone under `content/sdks/` is not a page
  and is left to the walk, which already treats a directory with no page as no
  folder.
- **Navigation hint.** `PortalNavigation.suggestion` answers an entry of
  `sdks` at the content root with "The SDK pages are positioned with
  'apimatic:sdks'.", as it answers `api` with the API token. The entry stays
  refused; only the hint is new.
- **`PortalPagesService`** (`src/infrastructure/portal-pages-service.ts`):
  reads the three templates from `portal-pages/` once, renders a
  `GeneratedPages` and writes it under a given directory. Each file is written
  only when its contents differ, files the plan no longer names are deleted,
  and the answer says whether anything changed, which is the same contract
  `applyConfig` has for the appearance files. A missing templates directory or
  a rendering failure is a `Result` error with a message, never a throw. The
  package root it looks under is the one `PortalProjectService.templateDirectory`
  computes today; that computation moves to one shared place, `env-info.ts`
  being the singleton that already answers questions about the installation,
  rather than being written a second time.
- **`PortalProjectService`**: `prepare` writes the generated directory after
  the configuration and adds `generatedDir` to `portal.config.json`; nothing
  is substituted for it. `applyConfig` takes the `PortalSettings` pair,
  regenerates the pages beside rewriting the appearance files, and answers
  true when either wrote.
- **`PortalServeAction.watchConfig`**: passes the pair through; `PreviewConfig`
  keeps taking the `PortalConfig` half. The serve notice says that adding or
  removing a language, or the `plugin` block, updates the SDK pages, or names
  the case as needing a restart if step 1 finds Vite does not pick up the
  change (section 13).
- **Packaging.** `portal-pages` joins `files` in `package.json`.
- **Prompts and copy.** The `portal generate` and `portal serve` descriptions
  say the portal carries generated SDK pages; the README's hand-written 2.0
  list names the SDKs tab among the tabs. `pnpm readme` follows the description
  change (the README is CRLF; convert before running it, see the repository
  memory on `oclif readme`).

Nothing changes in `apimatic.schema.json`, `PortalConfig`, `PortalLanguages`,
`ApimaticConfigDocument` or quickstart.

## 8. Tests

- `PageTemplate`: a key substituted, whitespace inside the braces tolerated, an
  unknown key refused naming it, a section form refused, a template with no
  placeholders rendered unchanged, no escaping of the value.
- `GeneratedPages`: one language gives the index, one language page and the
  order file with its title; several keep the block's order; the plugin page
  and its entry appear only with a `plugin` block; each language's display
  name; every template name it uses exists in `portal-pages/`, and each
  placeholder renders with the data the plan gives it (the one test that holds
  the templates and the generator together).
- `PortalSourceContext`: `generatedPages` carries the block's languages in
  order and the plugin page only with the block; `content/sdks.md`,
  `content/sdks.mdx`, a page under `content/sdks/` and `content/(intro)/sdks.md`
  each refused naming the file, several at once; a `nav.json` alone under
  `content/sdks/` not refused; a `sdks` entry in the root `nav.json` refused
  with the token hint.
- `reportSourceProblem` (`test/prompts/portal/source.test.ts`): the new
  variant's wording for one file and for several.
- `PortalPagesService`: writes the files; a second write of the same pages
  changes nothing and says so; a language removed deletes its file; a template
  directory that is missing is reported, not thrown.
- `PortalProjectService`: `portal.config.json` carries `generatedDir` (the
  key-list assertion gains it); the generated directory holds the expected
  files after `prepare`; `applyConfig` with a language added writes its page
  and answers true, with nothing changed answers false; `portal.identity.json`
  still names no path from this machine.
- Template units (`test/portal-template/`): in `navigation.test.ts`, a
  generated folder (index, two languages, `nav.json` with title and order) is
  claimed by `apimatic:sdks`, collects at the anchor without it, follows the
  user's pages when the reference is named first, keeps its own `nav.json`
  order with the plugin page last, and is recognised when it holds only its
  index page; in `tabs.test.ts`, the folder becomes a tab named "SDKs" from its
  `nav.json` whatever its index page is called, listing the index first, with
  `$ref` gone and exactly one tab active on each of its pages; in
  `prerender-pages.test.ts`, the generated directory's pages and their `.md`
  twins are listed, and the config literal gains `generatedDir`. The existing
  cases that describe the generated source as "the case today" or "while
  nothing is generated" keep their assertions and lose that wording.
- `portal-template.test.ts`: `source.ts` declares the generated collection
  over the relative literal `'generated'`; `generated/` and its files among
  what the template does not ship; `portal-pages` listed in `files` and every
  template packed.
- End to end (`test/e2e/portal-build.test.ts`): the default fixture's root
  `nav.json` names `apimatic:sdks` between `index` and `apimatic:api`, so the
  build proves the token; `sdks/index.html`, `sdks/typescript/index.html`,
  `sdks.md` and `sdks/typescript.md` exist; the SDKs tab sits in the header
  where the file puts it; the tree cache lists TypeScript under SDKs; no
  `sdks/context-plugin/` for a fixture with no `plugin` block; and the
  existing assertion that no project path is published still holds, which is
  what the relative literal is for. The branded fixture gains a `plugin` block
  and asserts `sdks/context-plugin/index.html`. The existing sidebar-order and
  tab-order assertions gain the SDKs entries.

## 9. Verified, and to verify

Read from the pinned `fumadocs-mdx@15.4.0`, `fumadocs-core@16.15.8` and
`vite@8.2.2` on 2026-09-24, and from portal-navigation section 10 where marked:

- Two `defineDocs` collections coexist in one template, and a second one with
  no `baseDir` lands at the virtual root (portal-navigation, **ran it**).
- A collection's `dir` is one string, resolved against the Vite root with
  `path.resolve` (`core-BHawVsTm.js`) and globbed relative to the macro's
  output directory (`codegen-BYYNMDsX.js`); the macro accepts a literal only
  (portal-navigation, and `core-ZgBVAQdE.d.ts`).
- The literal is embedded in the browser bundle as the collection's `base`: a
  local build of the `test-source` fixture carries
  `` base: `C:/repos/apimatic-cli/test-source/src/content` `` in its `source.ts`
  chunk. This is the content-directory leak of portal-navigation section 11,
  and the reason the generated collection's literal is relative.
- Both commands run Vite from the project directory (`cwd` in
  `PortalBuildService.build` and `PortalDevServerService.start`), so the
  relative literal resolves to the same directory under `generate` and `serve`.
- The `folder` hook for `''` runs before any `root` hook, so the tabs are
  formed from an ordered root (portal-config, **confirmed in step 4** there).
- A metadata file is resolved through `resolveFlattenPath(…, 'meta')` across
  the whole storage, whichever source it came from (portal-navigation, **ran
  it** for the content collection; the generated one is the same kind).
- A `(group)` folder drops out of a page's slugs and `index` collapses into
  its parent (`getSlugs`, run on 2026-09-24: `(intro)/sdks.mdx`, `sdks/index.mdx`
  and `sdks.mdx` all give `['sdks']`), which is why the reservation is by
  address rather than by directory name.
- `firstPageIn` in `navigation.ts` walks a folder's `children` and never its
  `index`.

To verify in step 1, against a running dev server and a real build, before
anything is built on it:

- A file added to or removed from the generated directory while `vite dev`
  runs reaches the page tree without a restart. The directory is inside the
  Vite root, which Vite's watcher covers, and the user's content directory,
  whose additions need a restart today, is not; but the metadata collection
  and the async docs mode have not been observed under an add or a remove. If
  it fails, `applyConfig` still writes the files and the serve notice names
  the case as needing a restart.
- The built `source.ts` chunk carries `base: 'generated'` for the second
  collection and no path into the project directory, so the end-to-end
  assertion `publishes neither the specification paths nor the project
  directory` stays green.
- A Tailwind utility written in a generated page reaches the built CSS with
  the second `@source` line in place.
- The `.md` twin of a generated page carries its body under the collection
  split in `llms.server.ts`.

Known and left alone: two content addresses that differ only in case, such as
`/SDKs` and `/sdks`, are two pages to Fumadocs and one file to a Windows or
macOS filesystem when the static site is written, so one overwrites the other.
This holds for every pair of pages today and is not specific to the reserved
address; the reservation is exact-case, as `content/api/` is.

## 10. Later PRs, and the seams left for them

- **The real templates.** Replace the three files in `portal-pages/`. If they
  need a loop (the cards on the SDKs page will), add `mustache` (stable for
  years, so clear of `minimumReleaseAge`) and swap `PageTemplate.render` to it
  with escaping turned off; the `{{key}}` forms stay as they are. Any component
  the pages use beyond `fumadocs-ui/mdx`'s defaults goes in
  `portal-template/src/components/` and into `useMDXComponents`.
- **The backend data.** `portal generate` will call the backend after the
  authorization gate and before `prepare`; the call validates `apimatic.json`
  (including the `plugin` block) and answers with what the pages show.
  `GeneratedPages.of(languages, plugin)` gains that answer as its data source,
  and each template's data object fills out (section 3). How `portal serve`
  refreshes that data on an edit is decided then.
- **`languages` from quickstart.** Unchanged by this plan; the language-step PR
  of `.ai/plans/portal-config.md` section 12 stands.

## 11. Changes to the other plans

Made in the implementation PR's last step, as dated amendments:

`.ai/plans/portal-navigation.md`:

- Section 4, "The injected SDK page": implemented as a folder, not a page,
  over a relative literal rather than a second placeholder; the `childNames`
  note is answered by reserving the address instead of adding the name.
- Section 11, the deferred shape question: answered, a folder with a page per
  language and the plugin page. Open question 3, the content directory's
  published path: unchanged for the content directory, and the generated one
  publishes only `generated`.
- Section 14, "Second change": the collision failure is the reserved-address
  refusal.

`.ai/plans/portal-config.md`:

- Section 1, out of scope: the generated SDK page has landed.
- Section 5: "In this release SDKs is therefore never created" no longer
  holds; the tab is the generated folder, labelled by its `nav.json`.

`.ai/plans/fumadocs-portal.md`: section 3's sidebar paragraph gains the SDKs
tab; section 4 gains the second collection.

## 12. Delivery

This document is committed on `saeedjamshaid/portal-config` so that it merges
with #355, which it depends on: `PortalLanguages`, the tabs transformer,
`applyConfig`, the watcher and `GENERATED_SOURCE` all come from that PR.
**Implementation waits for #355 to merge**, then starts on
`saeedjamshaid/generated-pages` cut from `origin/dev`, as the navigation work
waited for #343 (portal-navigation, section 16). Stacking on #355 would run no
CI on the stacked PR (repository memory: stacked PRs get no Tests or Build).

One PR against `dev`, `feat(portal)`. It adds a reserved address and a second
collection to a portal no release has shipped, so it carries no
`BREAKING CHANGE:` footer. The steps of section 13 are each reviewed and
committed on their own inside the PR, with a stop for a go-ahead after each and
before every commit.

## 13. Implementation steps

Ordered so the unknowns are retired first, and so each step stands alone with
build, lint on touched files and the affected tests green.

1. **Retire the unknowns.** A throwaway second collection over `'generated'`
   and a generated folder in a prepared project: under `vite dev`, add and
   remove a page and a `nav.json` entry and watch the tree; under `vite build`,
   read the `source.ts` chunk for the collection's `base` and grep the output
   for the project directory; write a utility class in a generated page and
   read the CSS. Record what holds in section 9 and settle the serve notice
   wording. Nothing from this step is kept but the findings.
2. **Types.** `PageTemplate`, `GeneratedPages` with the display names and the
   `nav.json` title, `PortalSource.generatedPages`, `resolveConfig` answering
   the pair, the reserved-address refusal and its prompt, the navigation hint.
   CLI only; unit and prompt tests.
3. **Templates and the writer.** `portal-pages/` with the three placeholders,
   the shared package-root lookup, `PortalPagesService`,
   `PortalProjectService.prepare` and `applyConfig` writing the generated
   directory, `generatedDir` in `portal.config.json`, `files` in
   `package.json`, the packaging and project-service tests. The template does
   not read the directory yet, so a build at this point is unchanged.
4. **Template.** The second `defineDocs`, the third loader source, `$.tsx` and
   `llms.server.ts` split by collection, `prerender-pages.ts` and
   `portal-config.ts`, `app.css`, the transformer's folder support and the
   tab. Template unit tests. A build now carries the pages.
5. **Serve.** The watcher passing the pair, the notice wording from step 1,
   the serve tests.
6. **Surfacing.** Fixtures (`apimatic:sdks` in the default root `nav.json`, a
   `plugin` block in the branded one), the e2e cases, command descriptions and
   the README by hand and through `pnpm readme`, the amendments of section 11,
   and this plan's status.

## 14. What the review of the first draft changed (2026-09-24)

An adversarial pass over the first draft against the pinned packages and a
local build, the same day it was written. Kept so the reasoning is not redone.

1. **The second placeholder would have published the build directory.** The
   draft substituted an absolute `__APIMATIC_GENERATED_DIR__` into `source.ts`,
   for symmetry with the content directory. The `dir` literal is embedded in
   the browser bundle as the collection's `base` (section 9), so the temp
   project's path would have shipped in every portal, and the end-to-end
   assertion that no project path is published would have failed in step 6.
   Fixed with a relative literal, which also removes the substitution and the
   Tailwind placeholder.
2. **Reserving the directory name missed `(group)` folders.** A page at
   `content/(intro)/sdks.mdx` is served at `/sdks` and would have collided in
   silence. The reservation is now by address, computed as `getSlugs` computes
   it.
3. **The draft's test that `content/SDKs/` is accepted enshrined a case that
   breaks on Windows and macOS.** Dropped; the behaviour is a pre-existing one
   for every pair of pages and is recorded in section 9 rather than tested for.
4. **`firstPageIn` ignores a folder's index page**, so a generated folder
   holding only its index would not have been recognised as injected. The
   detection checks `index` first. Impossible today, since at least one
   language page always exists, but one line keeps it from becoming a puzzle.
5. **The tab label.** The draft named the tab from the index page's title;
   portal-config section 2 had decided the CLI names its tabs. The generated
   `nav.json` carries `title: "SDKs"`, which the transformer already applies,
   so the decision is honoured with no new code.
6. **The serve unknown had a likely answer the draft did not give.** The user's
   content directory sits outside the Vite root, which is why adding a page
   there needs a restart today; the generated directory sits inside it.
   Recorded as the reason to expect the reload to work, still verified.
7. **Tests the draft left out**: the prompt for the new problem variant, the
   `resolveConfig` stub in the serve action tests, the `PortalSource` literals
   in two test files, the stale "which is the case today" wording in the
   template tests, and the `prerender-pages` config literal's new key.
8. **Names.** `PortalSource.pages` read as the user's pages beside
   `hiddenPages`; it is `generatedPages`. The package-root lookup is shared
   rather than written twice.
