# Plan: the generated SDK and context plugin pages

Status: designed 2026-09-24 and committed on `saeedjamshaid/portal-config` so it
travels with PR #355, which it builds on. **Implemented 2026-09-24** on
`saeedjamshaid/generated-pages`, PR #360, stacked on #355 (section 12); every
step of section 13 is done. The questions asked and answered the same day are recorded in
section 2, section 14 records what an adversarial review of the first draft
changed, section 15 records the later decision to give the context plugin page
a tab of its own, and section 16 what the step 1 spike changed.

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
- **Context plugin**, at `/context-plugin`, present only when `apimatic.json`
  has a `plugin` block. It is not an SDK page: it has a tab of its own, apart
  from SDKs.

Which pages exist, and in what order, comes from `apimatic.json`: the
`languages` block, required since #355, gives the languages in the order
written, and the presence of the `plugin` block gives the plugin page.
`nav.json` positions the SDKs tab through `apimatic:sdks`, which #355 already
accepts, and the Context Plugin tab through a new `apimatic:plugin`; it cannot
remove either (portal-navigation, section 2).

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
| Shape | Two folders, one per generated section. `generated/sdks/` holds `index.mdx`, one `<language>.mdx` per language and a `nav.json` ordering and naming them; URLs `/sdks` and `/sdks/<language>`. `generated/context-plugin/`, only when there is a `plugin` block, holds `index.mdx` and a `nav.json` naming it; URL `/context-plugin`. |
| Context plugin | Its own section and its own tab, not a page of the SDKs tab (decided 2026-09-24, reversing the first design; section 15). This is portal-config section 2's rule that each generated section is its own tab with its own token, which that plan wrote for the coming AI section. A folder rather than a lone page, so every generated tab is made one way and the plugin can gain pages beside its index without its address moving. |
| Tabs | Each generated folder at the root becomes a tab, as a `root: true` folder does today: its index page is listed first, then its other pages. The synthetic `/tab/sdks` is removed: the CLI writes only folders, so nothing is left for it to gather, and a tab that gathers every loose generated page under the label "SDKs" is the very grouping this decision undoes. |
| Tokens | `apimatic:sdks` positions the SDKs tab and `apimatic:plugin` the Context Plugin tab; each claims its own section's folder, `sdks` and `context-plugin`. The token takes the word the `apimatic.json` block and the `apimatic plugin` commands use, which is what the portal's author writes; the address takes the product's name, which is what the portal's readers see. Both are accepted in the root `nav.json` whether or not the page exists, as `apimatic:sdks` is in #355 while nothing is generated, so removing the `plugin` block never forces an edit to `nav.json` as well. |
| Default position | An unnamed section collects at today's anchor, before the API reference and after the user's pages, in a fixed order: SDKs, then Context Plugin. Fumadocs orders the root's folders by path, which would put `context-plugin` first, so the transformer orders the band itself. No `nav.json` at all gives Home, Guides, SDKs, Context Plugin, API Reference. |
| Tab labels | "SDKs" and "Context Plugin", fixed, as portal-config section 2 decided for the tabs the CLI names. Set by `title` in each folder's generated `nav.json`, which the transformer already applies to any folder below the root, so the labels are the CLI's whatever the design team titles the index pages. |
| Plugin page condition | The `plugin` key holds a JSON object, which is what `ApimaticConfigDocument.plugin()` answers; a bare `{}` counts. Nothing in the block is read or checked: the backend validates the file on the coming `portal generate` call and refuses an empty or invalid block, so a malformed block here is treated as absent and left to that call. |
| Language order | As written in the `languages` block. `sdk publish` appends, and the user reorders by editing the file. |
| Reserved addresses | `/sdks` and `/context-plugin`, each with everything below it, are the CLI's. A content page whose slugs begin with either name is refused by `PortalSourceContext.resolve()` naming each file: `content/sdks.md`, `content/sdks.mdx`, anything under `content/sdks/`, the same for `context-plugin`, and the same behind a `(group)` folder, which the content source drops from the address (`getSlugs('(intro)/sdks.mdx')` is `['sdks']`). Without the refusal, two pages at one address would fail the build with Fumadocs' opaque `Duplicated slugs` error, or, when one of them is an index page, move it to `…/index` without a word (the slugs plugin of `fumadocs-core@16.15.8`, read on 2026-09-24). `/context-plugin` is reserved with or without a `plugin` block, so adding the block never starts refusing a page that built the day before. A root `nav.json` entry `sdks` or `context-plugin` is refused as today, with a hint naming the token, and so is `plugin` when no page of that name exists, since the token invites the guess. |
| Templates | Three `.mdx` files in a new top-level `portal-pages/` directory, shipped in the npm package beside `portal-template/`. Dynamic text is `{{key}}`. A renderer of a few lines substitutes flat string keys and refuses an unknown or unfilled key, so a template and its data cannot drift silently. No dependency today; mustache, whose `{{key}}` is the same, is adopted when the real templates need sections (section 10). Rendering happens before MDX compilation, so the braces never reach MDX. |
| Data today | `sdks.mdx` and `context-plugin.mdx` take `{}`. `sdk.mdx` takes `{ language, name }`, the enum value and a display name, so the per-language pages have distinct titles and sidebar rows. Everything else waits for the backend data. |
| Display names | A `Record<Language, string>` beside `GeneratedPages`: `csharp` C#, `go` Go, `java` Java, `php` PHP, `python` Python, `ruby` Ruby, `typescript` TypeScript. `LANGUAGE_CHOICES` in `src/types/sdk/generate.ts` spells "Typescript" for the quickstart prompt and is left alone. |
| `portal serve` | The watcher that re-applies the `portal` block also regenerates the pages: a language added or removed, or the `plugin` block added or removed, rewrites `generated/` (changed files written, stale files and emptied directories deleted) and Vite reloads, so the Context Plugin tab appears and disappears with the block. Step 1 found that an edited generated file reaches the preview on its own but an added or removed one does not, and that a removed one fails every request until a restart (section 16). A serve-only Vite plugin in the template makes adds and removes reach it as edits do (section 4), so no case needs a restart. |
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
  `python` before `typescript` whatever the block says, so an order file is
  needed and the transformer already applies one.
- **Naming the tab from the index page's title.** The first draft's choice.
  Home, Guides and the API tab are named by the CLI; the folder's `nav.json`
  `title` names this one the same way, at no cost, and leaves the page title
  to the design team.
- **The plugin page inside the SDKs folder** (`/sdks/context-plugin`, listed
  last in the SDKs tab). The first design, reversed the same day: the context
  plugin is not an SDK, and portal-config gives each generated section a tab
  of its own (section 15).
- **The plugin page as a lone page** (`generated/context-plugin.mdx`) in a
  synthetic tab of its own. The same address, but a second way of making a
  generated tab, a fixed label in the template rather than in the CLI's
  `nav.json`, and no room for the plugin to gain a page without moving the
  first one.
- **Keeping the synthetic `/tab/sdks`** for loose generated pages. The CLI
  writes none, and if it ever did the tab would file them under SDKs whatever
  they were, which is how the plugin page would have landed there.
- **The address `/plugin`.** Tried the same day to match the token. A reader
  of the portal is told nothing by `/plugin`, where the CLI's own copy says
  "context plugin" in every sentence; a published address is hard to change;
  and `plugin` is a name a user's own page is far likelier to have, which the
  reservation would then refuse whether or not there is a `plugin` block.
- **The token `apimatic:context-plugin`**, to match the address. The token is
  written by the portal's author, who knows the feature as the `plugin` block
  and the `apimatic plugin` commands. Choosing `apimatic:plugin` instead
  gives up the rule that a token is its folder's name after `apimatic:`, and
  nothing depends on that rule: the sections table maps each token to its
  folder.
- **Refusing `apimatic:plugin` when there is no `plugin` block.**
  Removing the block would then fail the build until `nav.json` was edited as
  well, and under `portal serve` the file is not re-checked when the block
  goes, since the watcher re-reads only `apimatic.json`, so the preview and the
  next build would disagree. The token positions nothing, as `apimatic:sdks`
  did before any page existed.
- **Reserving `/context-plugin` only when there is a `plugin` block.** Adding
  the block would then start refusing a user's page that had built without
  complaint.
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
    index.mdx        portal-pages/sdks.mdx, data {}                    /sdks
    typescript.mdx   portal-pages/sdk.mdx, data { language, name }     /sdks/typescript
    python.mdx       portal-pages/sdk.mdx, data { language, name }     /sdks/python
    nav.json         { "title": "SDKs", "pages": ["typescript", "python"] }
  context-plugin/                                                      only with a `plugin` block
    index.mdx        portal-pages/context-plugin.mdx, data {}          /context-plugin
    nav.json         { "title": "Context Plugin" }
```

The directory always exists and always holds `sdks/index.mdx`, since #355 made
at least one language a requirement. Each section's `nav.json` names its tab;
the SDKs one also lists the languages in the order written. An index page is
its folder's own link and is not named (portal-navigation, section 10), so the
plugin's file orders nothing. The CLI writes these files into its own
directory, not the user's, so `PortalNavigation.validate` never sees them.

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
  arrives with mustache (section 10). That includes a JSX object written
  straight inside an expression, `style={{ color: 'red' }}`: the refusal says
  to write it `style={ { color: 'red' } }`, which is the same JSX. The
  template's own components style with Tailwind classes, so the case is rare.
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
existing tests already feed in. With no `baseDir`, the folders land at the
virtual root as `sdks/` and `context-plugin/`, beside the user's content.

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

Nothing changes. Tailwind's automatic detection is rooted at the project and
scans `generated/` as it scans `src/`, which step 1 confirmed in a plain
directory and in one whose `.gitignore` is `*`, as the cross-drive
`.apimatic-build/` fallback's is (section 16). `app.css` names the content
directory with `@source` only because that directory lies outside the project.

### Adding and removing pages under `portal serve`

fumadocs-mdx's macro expands each collection into a glob of imports. Under
`vite dev` an edit to a file the glob found reloads the server's modules, but
the glob itself is not expanded again when a file is added or removed, so an
added page never appears and a removed one leaves an import of a missing file
that fails every request with a 500 until a restart (step 1, section 16).

A small Vite plugin, `generatedPagesReload()` in a new
`portal-template/generated-pages-reload.ts`, registered in `vite.config.ts` and
applied under `serve` only, closes the gap: when the
watcher reports an `add` or `unlink` of a page or `nav.json` under
`<root>/generated/`, or an `unlinkDir` there, it emits a `change` for
`<root>/src/lib/source.ts`. The temporary file each page is written through
(below) is not one the collection reads, so it sets off nothing. Vite handles that as an edit to
the module that declares the collections: it transforms it again, which
expands the glob afresh, and reloads the server's program. Step 1 ran exactly
this: a page added, a page removed, a folder removed and a folder added each
reached the tree within half a second, with no failed request.

The user's content directory has the same limitation today and is left alone.
It lies outside the Vite root, which is all the watcher covers besides the
files already imported, so a fix there would also have to add the directory to
the watcher; that is a change of its own.

### Prerender

`portal.config.json` gains `generatedDir` (absolute, server-only, always
present), `PortalConfig` in `portal-template/portal-config.ts` declares it, and
`prerenderPages` calls `contentUrls` on it as it does on `contentDir`. The
slug rules are the content source's own, so `sdks/index.mdx` yields `/sdks`,
`sdks/typescript.mdx` yields `/sdks/typescript` and `context-plugin/index.mdx`
yields `/context-plugin`, each with its `.md` twin; `nav.json` is not a page
and is passed over by the extension filter. No collision handling crosses the
two directories, because the CLI refuses every content page that would land
under either reserved address (section 7).

## 5. Sidebar and tabs

Three changes to `navigation.ts`, all keeping the rules #346 and #355 set:

- **A generated folder is injected.** `isInjected` answers true for a page from
  the generated source, as today, and for a folder whose index page or first
  page beneath it is, the way `isSpecSection` recognises a specification's
  section through `firstPageIn`. `firstPageIn` walks `children` alone, so the
  folder's `index` is checked first: the plugin's folder holds only its index
  page and has no page in `children` at all.
- **Each token claims its own section.** `INJECTED_PAGES_TOKEN` gives way to a
  table of the generated sections in their default order, `apimatic:sdks` for
  `sdks` and `apimatic:plugin` for `context-plugin`, exported as
  `GENERATED_SOURCE` is so that a test can hold it against the CLI's list
  (section 8). In `reorder`, a section token claims the injected folder whose
  `$ref.folder` is the table's folder for it, where today's token claims every
  injected node; both stay honoured at the content root only. The unnamed
  sections collect at the anchor as the band does today, sorted by the table
  rather than left in Fumadocs' path order. Where the band goes is unchanged: the anchor and
  `afterNamedContent` still treat every injected node alike. The root
  `nav.json` cannot name a section's folder by its name, because the CLI
  refuses the entry (section 7).
- **A generated folder at the root is a tab.** `groupIntoTabs` passes it to
  `asTab`, as it passes the API reference and a `root: true` folder: `root` is
  set, the index page moves to the front of the children, and `$ref` is
  deleted so Fumadocs does not point the tab at a same-named page in another
  tab. The `sdks` entry of `SYNTHETIC_TABS`, the branch that gathered loose
  injected pages into it, and the comments that name it go (section 2).

Each folder's own `nav.json` is applied by the `folder` hook before the `root`
hook runs, through `readSettings(this, 'sdks')` and
`readSettings(this, 'context-plugin')`, which resolve the files from the
generated collection's metadata: `pages` orders the children and `title` names
the folder, and so the tab. The two tabs list:

```
SDKs                                     named by sdks/nav.json
  <index page title>   /sdks             the index, lifted first by asTab
  TypeScript           /sdks/typescript  sdks/nav.json order
  Python               /sdks/python

Context Plugin                           named by context-plugin/nav.json
  <index page title>   /context-plugin   its only page, lifted by asTab
```

`tabs.ts` needs nothing: `portalTabs` links a tab to its first page, which is
its index page. Tab order follows the rules of portal-config section 5 with
one tab more: each generated tab sits where the root `nav.json` puts its token,
and an unnamed one before the API reference and after the user's pages, SDKs
ahead of Context Plugin. A file that names only one token leaves the other at
the anchor: `["index", "apimatic:api", "apimatic:sdks"]` puts Context Plugin
before the API Reference and SDKs after it, and naming both tokens keeps the
two together.

## 6. Template changes

- `src/lib/source.ts`: the second `defineDocs` over `'generated'`.
- `src/lib/source.server.ts`: the third source under `GENERATED_SOURCE`.
- `src/lib/navigation.ts`: `isInjected` accepting a folder; the exported
  table of sections and their tokens, each token claiming its own folder and
  the band sorted by the table; `groupIntoTabs` making a generated folder a
  tab; the synthetic SDKs tab removed.
- `src/routes/$.tsx` and `src/lib/llms.server.ts`: pages routed by
  `'openapi'` versus the two Markdown collections, and the collection carried
  in the loader's answer.
- `portal-config.ts` and `prerender-pages.ts`: `generatedDir`.
- `generated-pages-reload.ts` (new) and `vite.config.ts`: the serve-only plugin
  that turns an add or remove under `generated/` into an edit to
  `src/lib/source.ts`.

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
  template it uses and its data; and each section's `nav.json` text. Exports
  the sections, each with its name, its token and the words a message uses
  for it (`sdks`, `apimatic:sdks`, "the SDK pages"; `context-plugin`,
  `apimatic:plugin`, "the context plugin page"), the template names
  and the display-name table. The sections are the one list the reserved
  addresses, the tokens and the hints are read from, so a third section, such
  as the AI one portal-config expects, is one entry. The languages come from
  `PortalLanguages.all()`, which keeps the block's key order.
- **`PortalSource`** gains `generatedPages: GeneratedPages`, computed in
  `PortalSourceContext.parseSettings` (formerly `parseConfig`) from the
  `PortalLanguages` it already builds and discards, and from
  `document.plugin() !== undefined`. `PortalSource` extends a new
  `PortalSettings`, the pair of `config` and `generatedPages`, and what the
  watcher calls widens to answer it: `resolveConfig` becomes
  `resolveSettings`, so a `languages` edit under `portal serve` reaches the
  generator by the same path a `portal` edit reaches the identity file. The
  `PortalSource` literal in the project-service tests and the stub in
  `test/actions/portal/serve.test.ts` follow.
- **Reserved addresses.** `resolve()` walks the content tree already; from the
  pages it collects, it computes each one's slugs as `getSlugs` does (`(group)`
  folders dropped, an `index` page at its folder's address) and refuses every
  page whose first slug is a section's folder, before the navigation scan. One
  `PortalSourceProblem` carries them all, `{ kind: 'reservedAddresses'; pages:
  { file, address, section }[] }`, since `resolve` answers with one problem;
  `reportSourceProblem` lists each file relative to `src/`, where it would be
  served, the section's address when that differs, and what it is kept for. A
  `nav.json` alone under `content/sdks/` or `content/context-plugin/` is not a
  page and is left to the walk, which already treats a directory with no page
  as no folder.
- **Tokens.** `PortalNavigation` accepts `apimatic:plugin` beside
  `apimatic:sdks` and `apimatic:api`, at the content root only, with or
  without a `plugin` block, and the unknown-token message lists all three.
  `INJECTED_PAGES_TOKEN` gives way to the sections' tokens.
- **Navigation hints.** `PortalNavigation.suggestion` answers an entry of
  `sdks` at the content root with "'apimatic:sdks' positions the SDK pages."
  and one of `context-plugin` or `plugin` with "'apimatic:plugin' positions
  the context plugin page.", as it answers `api` with the API token; the
  sentence puts the token first so its verb agrees whatever the section. `plugin` is the guess the token invites, and is answered only
  when no page of that name exists, since `/plugin` is not reserved. The
  entries stay refused; only the hints are new.
- **`PortalPagesService`** (`src/infrastructure/portal-pages-service.ts`):
  reads the templates a `GeneratedPages` needs from `portal-pages/`, each once
  per write, renders it and writes it under a given directory. Each file is
  written only when its contents differ, and replaced whole, written beside
  itself and renamed over, since the dev server watching the directory could
  otherwise read it half-written (the rule #355's review set for the
  appearance files, 2026-09-24). Files and section folders the
  pages no longer call for are deleted (the plugin's folder, when the block
  goes),
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
  removing a language updates the SDK pages and that adding or removing the
  `plugin` block adds or removes the Context Plugin tab, both without a
  restart (section 4).
- **Packaging.** `portal-pages` joins `files` in `package.json`.
- **Prompts and copy.** The `portal generate` and `portal serve` descriptions
  say the portal carries generated SDK and context plugin pages; the README's
  hand-written 2.0 list names the SDKs and Context Plugin tabs among the tabs
  and `apimatic:plugin` among the tokens. `pnpm readme` follows the description
  change (the README is CRLF; convert before running it, see the repository
  memory on `oclif readme`).

Nothing changes in `apimatic.schema.json`, `PortalConfig`, `PortalLanguages`,
`ApimaticConfigDocument` or quickstart.

## 8. Tests

- `PageTemplate`: a key substituted, whitespace inside the braces tolerated, an
  unknown key refused naming it, a section form refused, a template with no
  placeholders rendered unchanged, no escaping of the value.
- `GeneratedPages`: one language gives the SDKs index, one language page and
  the SDKs order file with its title; several keep the block's order; the
  `context-plugin/` folder, its index and its titled `nav.json` appear only
  with a `plugin` block, and nothing about the plugin lands under `sdks/`;
  each language's display name. That every template it names ships in
  `portal-pages/`, and nothing else does, is checked in
  `portal-template.test.ts`; that each renders with the data it is given,
  every language and the plugin included, in the `PortalPagesService` tests.
  That the sections and their tokens are the ones `navigation.ts` exports is
  checked in `test/portal-template/navigation.test.ts`, beside the existing
  cases holding the token vocabulary both halves share.
- `PortalSourceContext`: `generatedPages` carries the block's languages in
  order and the plugin section only with the block; `content/sdks.md`,
  `content/sdks.mdx`, a page under `content/sdks/`, `content/(intro)/sdks.md`,
  `content/context-plugin.md` and a page under `content/context-plugin/` each
  refused naming the file, several at once, with a problem per name;
  `content/context-plugin.md` refused with no `plugin` block too; a `nav.json`
  alone under either directory not refused; an `sdks`, `context-plugin` or
  `plugin` entry in the root `nav.json` refused with its token hint, and a
  `plugin` entry that names a user's `content/plugin.md` accepted.
- `PortalNavigation` (`test/types/portal/portal-navigation.test.ts`):
  `apimatic:plugin` accepted at the content root and refused below it,
  as the other two tokens are; the unknown-token message, asserted in full
  today, lists all three.
- `reportSourceProblem` (`test/prompts/portal/source.test.ts`): the new
  variant's wording for one file and for several, for each section.
- `PortalPagesService`: writes the files; a second write of the same pages
  changes nothing and says so; a language removed deletes its file; the
  `plugin` block removed deletes the plugin's files and its directory, and
  added back writes them; a template directory that is missing is reported,
  not thrown.
- `PortalProjectService`: `portal.config.json` carries `generatedDir` (the
  key-list assertion gains it); the generated directory holds the expected
  files after `prepare`; `applyConfig` with a language added writes its page
  and answers true, with a `plugin` block added writes the plugin's folder,
  with nothing changed answers false; `portal.identity.json`
  still names no path from this machine.
- Template units (`test/portal-template/`). Both files feed a loose
  `sdks.mdx` as the generated source today; those cases move to the two
  generated folders (`sdks/` with an index, two languages and a titled,
  ordered `nav.json`; `context-plugin/` with an index and a titled
  `nav.json`), keeping what they assert, and drop the wording that calls the
  generated source "the case today" or empty. In `navigation.test.ts`:
  `apimatic:sdks` claims the SDKs folder and leaves the plugin folder at the
  anchor; `apimatic:plugin` claims the plugin folder, including ahead
  of SDKs; with neither named both collect at the anchor, SDKs first although
  the path order puts `context-plugin` first; both follow the user's pages
  when the reference is named first and are not swept up by the rest token;
  the SDKs folder keeps its own `nav.json` order; the plugin folder is
  recognised as injected although it holds only its index page; a token whose
  folder does not exist positions nothing. In `tabs.test.ts`: each folder
  becomes a tab named from its `nav.json` whatever its index page is called,
  listing the index first, with `$ref` gone; no `nav.json` gives Home, Guides,
  SDKs, Context Plugin, API Reference; no Context Plugin tab without its
  folder; the fixed-ids case lists `/tab/home` and `/tab/guides` only; and
  exactly one tab active on every page, `/sdks`, `/sdks/typescript` and
  `/context-plugin` among them. In `prerender-pages.test.ts`: the generated
  directory's pages and their `.md` twins are listed, and the config literal
  gains `generatedDir`. In a new `generated-pages-reload.test.ts`, over a fake
  watcher: an `add`, an `unlink` and an `unlinkDir` under `generated/` each
  emit one `change` for `src/lib/source.ts`; the same events elsewhere in the
  project, and a `change` under `generated/`, emit nothing; the plugin applies
  under `serve` only.
- `portal-template.test.ts`: `source.ts` declares the generated collection
  over the relative literal `'generated'`; `vite.config.ts` registers the
  reload plugin; `generated/` and its files among
  what the template does not ship; `portal-pages` listed in `files` and every
  template packed.
- End to end (`test/e2e/portal-build.test.ts`): the default fixture's root
  `nav.json` names `apimatic:sdks` between `index` and `apimatic:api`, so the
  build proves the token; `sdks/index.html`, `sdks/typescript/index.html`,
  `sdks.md` and `sdks/typescript.md` exist; the SDKs tab sits in the header
  where the file puts it; the tree cache lists TypeScript under SDKs; no
  `context-plugin/` and no Context Plugin tab for a fixture with no `plugin`
  block; and the existing assertion that no project path is published still
  holds, which is what the relative literal is for. The branded fixture,
  which has no content directory and so no `nav.json`, gains a `plugin` block
  and asserts `context-plugin/index.html` and `context-plugin.md`, and header
  tabs in the default order Home, SDKs, Context Plugin, API Reference: the
  band order in a real build, where Fumadocs' own order would put Context
  Plugin first. The existing sidebar-order and tab-order assertions gain the
  SDKs entries.

## 9. Verified

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
  `index`, which a folder holding only its index page, as the plugin's does,
  has instead of children.
- Fumadocs orders the root's children by path, folders included, which is
  why the root is always reordered today (the `folder` hook's comment in
  `navigation.ts`: `api` sorts above a user folder named later in the
  alphabet). Left to it, `context-plugin` would sit above `sdks`.

**Ran in step 1** (2026-09-24), on the default fixture prepared by
`PortalProjectService`, with the collection, the loader source, the `$.tsx`
and `llms.server.ts` split, `generatedDir` and its prerender loop made by hand
in the prepared project, and a generated `sdks/` (index, a language page with
an arbitrary Tailwind class, titled `nav.json`) and `context-plugin/` (index,
titled `nav.json`). The transformer was not changed, so both folders sat in
Guides:

- **The build.** It passed in 12 seconds and prerendered `/sdks`,
  `/sdks/typescript` and `/context-plugin` with their `.md` twins. The
  collection's `base` in the browser bundle is `` `generated` `` beside the
  content directory's absolute one; no spelling of the project directory
  (forward slashes, backslashes, escaped backslashes) appears in any published
  file; and `sdks/typescript.md` carries the page's processed Markdown, body
  included.
- **Tailwind.** The class reached the CSS with an `@source` line for
  `generated/`, and again without one, and again without one inside a git
  directory whose `.gitignore` is `*`, where the template's own classes were
  also all present. The line is dropped from the plan (section 4).
- **The tree under `vite dev`.** Both folders reach the tree, named by their
  `nav.json` titles, and the plugin's folder is kept although it holds only
  its index page. An edit to an existing generated page's front matter or to a
  generated `nav.json` reached the tree within half a second, as an edit to
  the content directory's `nav.json` does (run as the baseline). An added page
  never appeared, and a removed one made every request fail with a 500
  (`ERR_LOAD_URL` for the deleted file) until a restart. With the reload
  plugin of section 4 added to the prepared project, a page added, a page
  removed, a whole folder removed and a whole folder added each reached the
  tree within half a second, with no failed request.

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
- **More plugin pages.** Should the plugin need a page per assistant or per
  install route, they go into `context-plugin/` beside the index and its
  `nav.json` gains `pages`; the tab, its token and `/context-plugin` stay as
  they are.
- **The AI section.** Portal-config expects it as another generated tab with
  its own token; it is one more entry in the sections `GeneratedPages` and
  `navigation.ts` list, a folder, and a template.
- **`languages` from quickstart.** Unchanged by this plan; the language-step PR
  of `.ai/plans/portal-config.md` section 12 stands.

## 11. Changes to the other plans

Made in the implementation PR's last step, as dated amendments (done 2026-09-24):

`.ai/plans/portal-navigation.md`:

- Section 2's tokens row and section 3's table of entry forms:
  `apimatic:sdks` positions the SDKs folder rather than "all injected pages
  not named individually", and `apimatic:plugin` joins it for the context
  plugin's folder, both still valid only in the content root's file.
- Section 4, "The injected SDK page": implemented as folders, not a page,
  over a relative literal rather than a second placeholder; the `childNames`
  note is answered by reserving the addresses instead of adding the names.
- Section 6, defaults: the unnamed sections collect before the API
  reference, SDKs then Context Plugin.
- Section 11, the deferred shape question: answered, an SDKs folder with a
  page per language, and the context plugin in a folder and a tab of its own.
  Open question 3, the content directory's published path: unchanged for the
  content directory, and the generated one publishes only `generated`.
- Section 14, "Second change": the collision failure is the reserved-address
  refusal.

`.ai/plans/portal-config.md`:

- Section 1, out of scope: the generated SDK page has landed.
- Section 2: the tokens row gains `apimatic:plugin`, a generated section
  given its own token as the row foresaw for the AI section, which is still
  to come; the tab-labels row gains "Context Plugin" and no longer counts SDKs
  among the tabs no folder backs.
- Section 5: "In this release SDKs is therefore never created" no longer
  holds; each generated section is a folder tab labelled by its `nav.json`,
  the node-to-tab table's "injected page → SDKs" row becomes "generated
  folder → its own tab", `/tab/sdks` leaves the synthetic ids, and the
  defaults read Home, Guides, SDKs, Context Plugin, API.

`.ai/plans/fumadocs-portal.md`: section 3's sidebar paragraph gains the SDKs
and Context Plugin tabs; section 4 gains the second collection.

## 12. Delivery

This document is committed on `saeedjamshaid/portal-config` so that it merges
with #355, which it depends on: `PortalLanguages`, the tabs transformer,
`applyConfig`, the watcher and `GENERATED_SOURCE` all come from that PR.

Decided 2026-09-24, in place of waiting for #355 to merge: implementation runs
on `saeedjamshaid/generated-pages`, cut from `saeedjamshaid/portal-config`, as
a PR stacked on #355. A stacked PR gets no Tests or Build run (repository
memory), so the affected suites and the end-to-end builds are run locally at
each step, and CI runs once the PR is retargeted at `dev` after #355 merges
(closed and reopened if the retarget alone does not trigger it).

One PR, `feat(portal)`, against `saeedjamshaid/portal-config` and then `dev`.
It adds two reserved addresses, a token and a second collection to a portal no
release has shipped, and removes the synthetic SDKs tab no release rendered,
so it carries no `BREAKING CHANGE:` footer. Each step of section 13 is
reviewed, fixed, committed and pushed on its own before the next begins
(agreed 2026-09-24).

## 13. Implementation steps

Ordered so the unknowns are retired first, and so each step stands alone with
build, lint on touched files and the affected tests green.

1. **Retire the unknowns.** *Done 2026-09-24* (sections 9 and 16). A
   throwaway second collection over `'generated'` and a generated folder in a
   prepared project: under `vite dev`, add and remove a page, a `nav.json`
   entry and a whole second folder, and watch the tree; under `vite build`,
   read the `source.ts` chunk for the collection's `base` and grep the output
   for the project directory; write a utility class in a generated page and
   read the CSS. Nothing from this step is kept but the findings.
2. **Types.** *Done 2026-09-24.* `PageTemplate`, `GeneratedPages` with the sections, the display
   names and the `nav.json` titles, `PortalSource.generatedPages`,
   `resolveSettings` answering the pair, the reserved-address refusal and its
   prompt, `apimatic:plugin` in `PortalNavigation`, the navigation
   hints. CLI only; unit and prompt tests. The test holding the sections
   against `navigation.ts` waited for step 4, which exports the template's list.
3. **Templates and the writer.** *Done 2026-09-24.* `portal-pages/` with the three placeholders,
   the shared package-root lookup, `PortalPagesService`,
   `PortalProjectService.prepare` and `applyConfig` writing the generated
   directory, `generatedDir` in `portal.config.json`, `files` in
   `package.json`, the packaging and project-service tests. The template does
   not read the directory yet, so a build at this point is unchanged.
4. **Template.** *Done 2026-09-24; the end-to-end build and the template's
   type-check pass with the pages in it.* The second `defineDocs`, the third loader source, `$.tsx` and
   `llms.server.ts` split by collection, `prerender-pages.ts` and
   `portal-config.ts`, the reload plugin in `vite.config.ts`, the
   transformer's folder support, the sections table and its tokens, the tabs,
   and the synthetic SDKs tab's removal. Template unit tests, the existing ones
   moved onto the folders, and the test from step 2 that holds the two lists
   together. A build now carries the pages.
5. **Serve.** *Done 2026-09-24.* The notice wording of section 7 (no case needs a restart) and
   its prompt test. The watcher already passes the pair, and the serve tests
   cover a language and a `plugin` block added, since step 3: `applyConfig`'s
   new signature needed the caller changed to compile.
6. **Surfacing.** *Done 2026-09-24.* Fixtures (`apimatic:sdks` in the default root `nav.json`, a
   `plugin` block in the branded one, which has no `nav.json` and so shows the
   default tab order), the e2e cases, command descriptions and
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

## 15. The context plugin page moved out of SDKs (2026-09-24)

Decided after the review, the same day: the context plugin page is not to live
under SDKs. The first design put it at `/sdks/context-plugin`, listed last in
the SDKs tab, and had declined a tab of its own. What that changed:

1. **Its own folder and tab.** `generated/context-plugin/`, holding its index
   page and a `nav.json` titled "Context Plugin", served at `/context-plugin`
   and made a tab as the SDKs folder is. This is portal-config section 2's
   rule for generated sections, which it wrote for the AI section.
2. **Its own token.** `apimatic:plugin`, accepted whether or not the
   `plugin` block exists. Each token now claims its own section's folder, where
   `apimatic:sdks` claimed every generated node, and the unnamed sections keep
   a fixed order at the anchor, since Fumadocs' path order would put the
   plugin first.
3. **A second reserved address.** `/context-plugin` is refused to the user's
   content as `/sdks` is, with or without the block.
4. **The synthetic SDKs tab goes.** With the plugin page out of it, nothing the
   CLI writes is a loose page, and a tab that would file one under SDKs is the
   grouping this change undoes. The template tests that fed a loose `sdks.mdx`
   move to folders.
5. **Section 14's finding 4 is now the normal case.** The plugin's folder holds
   only its index page, so the `index` check in `isInjected` is load-bearing
   rather than a guard.
6. **One list of sections.** The reserved addresses, the tokens, the hints and
   the band order are read from one list in the CLI and one in the template,
   held together by a test, so the AI section is an entry rather than a
   second round of these edits.
7. **The names.** The address is `/context-plugin`, after the product and the
   tab's label, because the portal's readers see it. The token is
   `apimatic:plugin`, after the `apimatic.json` block, because the portal's
   author writes it. Both `context-plugin` and `plugin` were tried for both
   the same day; the reasons are with the rejected alternatives in
   section 2.

## 16. What step 1 changed (2026-09-24)

The spike of section 13, step 1, run on this branch before any code was kept;
the observations are in section 9. What they changed in the plan:

1. **Adds and removes under `portal serve` needed a fix, not a notice.**
   Section 14's finding 6 expected the generated directory, being inside the
   Vite root, to reload where the content directory does not. Edits do; an
   added page never appears, and a removed one fails every request until a
   restart, which a notice could not have made acceptable. The reload plugin of
   section 4 fixes both, and the serve notice names no restart.
2. **The `@source` line is dropped.** Tailwind's own scan found the generated
   pages in a plain directory and in one ignored by a `*` rule, as the
   `.apimatic-build/` fallback is, so the template gains no line in `app.css`.
   The end-to-end build on the cross-drive CI runner is where the fallback
   itself is exercised.
3. **The rest held as planned.** The relative `dir` literal publishes only the
   word `generated`, no path of the build machine reaches the output, the
   `.md` twins carry the page bodies through the collection split, a generated
   `nav.json` names its folder, and a folder holding only its index page is
   kept.
