# Plan: the real SDK and context plugin pages

Status: designed 2026-09-25 on `saeedjamshaid/sdk-plugin-pages` (worktree
`C:\repos\apimatic-cli-sdk-plugin-pages`), fast-forwarded to `origin/dev` at
`0e823f3d` once PR #361 ("fetch the artifacts from /portal-artifacts") was
squash-merged the same day, so it builds directly on #361's
`PortalArtifactsService` and `/__downloads/`. Section 2 records the decisions
of that day. Step 1 (section 9) is done; section 10 records what it found and
the two questions it raised.

Follows on from `.ai/plans/generated-pages.md` (PR #360), which shipped the flow
(three templates in `portal-pages/`, a second Fumadocs collection over
`generated/`, the SDKs and Context Plugin tabs) with **placeholder** templates,
and left section 10's "real templates" and "backend data" to later PRs. This is
both: the pages, the components they need, and the data that fills them.

Terms follow `CONTEXT.md`: **build directory**, **spec**, **portal artifacts**,
**SDK docs**.

## 1. Goal and scope

Replace the three placeholder templates with real pages, written by us rather
than the design team (decided 2026-09-25):

- **SDKs** (`/sdks`, `portal-pages/sdks.mdx`): the spec description's first
  paragraph as the intro, a card per configured language, then the rest of the
  description. Each card shows the language's logo, its name linking to its
  page, the package name and version when a release is recorded, and up to three
  buttons: **Download SDK**, **View source**, **View package**.
- **One language** (`/sdks/<language>`, `portal-pages/sdk.mdx`): titled
  "<Language> SDK", the same three buttons under the title, then the language's
  SDK docs (getting started: headings, paragraphs, code blocks).
- **Context plugin** (`/context-plugin`, `portal-pages/context-plugin.mdx`): the
  install command `npx context-plugins install <url>`, general copy about the
  context plugin, the supported languages and the supported platforms.

In scope besides the templates: the React components they use; the data the CLI
fills them with; reading the SDK docs out of the portal artifacts; a new
optional `portal.pluginUrl`; and restricting the portal's `languages` to the
three SDK languages available today.

Out of scope: placing the SDK zips and the plugin zip in the built portal, which
PR #361 does (`/__downloads/sdk/<language>.zip`, `/__downloads/plugin.zip`);
the pages only link to those addresses. The addresses, tabs, tokens, reserved
paths and `nav.json` handling of #360 are unchanged. So is the schema's language
list, which is left to PR #359's owner (section 5).

Not reused: `origin/portal-pages` (mehnoorsiddiqui, 2026-09-24), a component kit
for these pages. Decided 2026-09-25 to ignore it and design from Fumadocs UI
primitives.

## 2. Decisions (2026-09-25)

| Topic | Decision |
|---|---|
| Languages | Only `csharp`, `python` and `typescript` are supported today; the other four come later. `PortalLanguages` refuses them with a "not available yet" message, and every page, logo and registry table covers the three. The schema's enum is left alone (section 5). |
| Data source | `apimatic.json` for everything it records (languages, their `publishing` records, the `plugin` block, `portal.pluginUrl`), the single spec for the SDKs page's description, and the portal artifacts for the SDK docs. |
| SDK docs | Read from `docs/<language>.json` in the portal artifacts zip, shape `{ "gettingStarted": "<Markdown>" }` (simplified from the first sample's `{ title, description, sections[] }`, 2026-09-25). One Markdown string, rendered as written. |
| SDK docs headings | Rendered as written. The backend emits H2 as its top level (`## Installation`), since the page's H1 is its title; nothing shifts them. |
| Who reads `docs/` | This PR, in #361's `PortalArtifactsService`, which unpacks the zip and today reads `sdk/`, `code-samples/` and `plugin.zip` but not `docs/`. |
| Missing SDK docs | A delivered SDK with no `docs/<language>.json`, or with one that cannot be read, fails the run, as #361 fails an unreadable code-sample catalog. |
| Download SDK | Links to `/__downloads/sdk/<language>.zip`, #361's address (not the `/__downloads/<language>.zip` first given). Always shown: a portal artifacts run delivers everything or nothing (#361), so every configured language has its zip. |
| View source | Shown when `languages.<language>.publishing.source.repositoryUrl` is recorded; links to it. |
| View package | Shown when a release is recorded (`publishing.package.version`) and the configuration names the package. Always the public registry: npm, PyPI, NuGet (section 5). |
| Card contents | Language logo, name linking to `/sdks/<language>`, `package · vVersion` when released, the buttons. No install one-liner on the card; the SDK docs carry it. |
| Logos | Brand logos as inline SVG, for the three languages and the three platforms, vendored from an MIT or CC0 icon set into small components, with no new dependency. Attribution goes in `portal-template/NOTICE`. |
| SDKs page text | The spec's full `info.description`, when the build directory has exactly one spec and it has one; otherwise a fixed sentence that names no portal. This matches the rule `suggestedSite` already follows ("with several specifications … no one of them speaks for the portal"). Its first paragraph goes above the cards and the rest below them. |
| SDKs page headings | Shifted so the description's top heading is H2, since spec authors write `# Authentication` and no backend controls it. Done by a remark step in the template, scoped by a `<ShiftHeadings>` wrapper in `sdks.mdx` (section 4). |
| Raw HTML in fragments | Rendered, through `rehype-raw` on the generated collection (section 4). Without it, any HTML in an included fragment fails the build (step 1). |
| Template data | Components take plain string attributes, which print cleanly in the `.md` twin and `llms-full.txt`. Lists (the SDK cards, the plugin's languages) are mustache sections, so `PageTemplate` moves onto `mustache` with escaping off (section 4). Decided after step 1 showed JSON props printing as entity-escaped blobs. |
| Fragments | Written once, when the project is prepared, from the spec description and the artifacts' SDK docs; `applyConfig` leaves them alone. They could only change on a restart anyway: the specs and the artifacts are read once, and a language added under `portal serve` is refused. The fallback intro names no portal, so no edit to the site name leaves it stale (decided after step 2). |
| A language added under `portal serve` | Refused like any edit a build would refuse, with a message to restart `portal serve`, since the artifacts (its SDK docs and zip) are fetched once when the preview starts. The preview keeps what it last accepted. Removing a language still applies live. |
| Language page | Title "<Language> SDK" (so its sidebar row reads the same), the buttons right under the title, then the SDK docs. |
| `pluginUrl` | `portal.pluginUrl`, exactly as asked: the first top-level key of `portal` outside its four namespaces (`site`, `brand`, `navigation`, `ai`). Optional, absolute, `https://` only. |
| Plugin page condition | A `plugin` block **or** `portal.pluginUrl`. Either one creates the page (today only the block does). |
| Plugin install address | `pluginUrl` when set; otherwise the fixed relative `/__downloads/plugin.zip`, where #361 places the bundled plugin. The backend skips generating and bundling the plugin when `pluginUrl` is set. |
| Relative address | Resolved in the browser against `window.location.origin`, so it is right on any host (staging, previews, `portal serve`). The prerendered HTML and the `.md` twin use `siteUrl` when configured, else the relative path. |
| Install command | `npx` only, one copyable code block. |
| Supported languages | The project's `languages`, in the block's order. They are all plugin languages now. |
| Supported platforms | Claude Code, Cursor, GitHub Copilot, with their logos. Fixed in the template. |
| Local testing | The backend does not return `docs/` in the new shape yet, so `portal serve` runs against a scratchpad stand-in for `/portal-artifacts` (section 8). Automated tests build `PortalArtifacts` directly, as the e2e test does today. |
| Base | `dev` after #361 (first decided as "wait for #361"; it merged the same day). |

Rejected, with reasons:

- **Pasting the Markdown into the `.mdx` page.** A `{` or `<` in prose (a spec
  description's `{id}`, an SDK doc's `<path-to-sdk>` outside a code span) is
  a JSX expression or tag to MDX, and fails the build far from its cause.
  Escaping it would mean a Markdown parser in the CLI. The included fragment of
  section 4 has neither problem.
- **Rendering the Markdown at runtime in a component.** The page would lose its
  table of contents, search entries and `.md` twin.
- **Shifting the SDK docs' heading levels.** The backend owns them and emits H2.
  The spec description is different: its author is the user, and nothing
  upstream normalises it.
- **Shifting headings in the CLI.** This needs a fence-aware Markdown scan
  (Python code is full of `# ...` lines), which is a parser the CLI does not
  have. The template already runs remark over the page.
- **JSON-valued placeholders** (`<SdkCards sdks={ {{sdks}} } />`). This was
  the first design, and it works with the renderer as it stands (step 1). But
  the `.md` twin prints the prop as an entity-escaped blob, and the template
  hides the shape of its data.
- **Refetching the artifacts when a language is added under `portal serve`.**
  Seamless, but slow against the real backend, and a larger change to the
  serve flow than a refusal.
- **A page without docs for a language added under `portal serve`.** Its
  Download would 404, and a build refuses the same state.
- **`portal.ai.pluginUrl`.** Proposed to keep every `portal` setting in a
  namespace. Declined in favour of the name as asked.
- **Warning on missing SDK docs and rendering the buttons alone.** Declined: a
  missing file is a broken delivery, and is reported as one.
- **Skipping View package for private registries**, or waiting for the backend
  to supply the address. The public registry is right for most portals.
- **The whole description above the cards**, or all of it below them. A long
  guide would bury the cards, and below them the page would open with no intro.
- **Narrowing the schema's language enum here.** PR #359 edits the same block.
- **The `origin/portal-pages` components.** See section 1.
- **A conditional Download button.** Not needed while a run delivers everything
  or nothing.

## 3. What is generated

For `languages: { typescript: {…published…}, python: {} }`, one spec with a
description, SDK docs for both, and a `plugin` block:

```
<projectDirectory>/
  generated/                          the collection #360 compiles; pages only
    sdks/
      index.mdx                       sdks.mdx     { sdks: [card…] }
      typescript.mdx                  sdk.mdx      { …card }
      python.mdx                      sdk.mdx      { …card }
      nav.json                        unchanged
    context-plugin/
      index.mdx                       context-plugin.mdx { installPath, languages }
      nav.json                        unchanged
  generated-includes/                 Markdown fragments the pages include; not a collection
    sdks-intro.md                     the description's first paragraph, or the fallback sentence
    sdks-about.md                     the rest of the description; empty when there is none
    sdk-docs/typescript.md            docs/typescript.json → gettingStarted
    sdk-docs/python.md
```

The fragments sit outside `generated/` on purpose: `prerender-pages.ts` treats
every `.md` and `.mdx` under the generated directory as a page, and so does the
collection unless it is given a `files` filter. Outside it, nothing but the
`<include>` reads them.

The description is split at its first blank line, as `firstParagraph` already
does for the suggested site. When the first block is not a plain paragraph (a
heading, a list, a code fence), nothing is split: the fallback sentence is the
intro and the whole description goes below the cards.

## 4. Mechanism

### Template data: string attributes and mustache sections

Components take plain string attributes, and a list is a mustache section in
the template:

```mdx
<SdkCards>
{{#sdks}}
<SdkCard language="{{language}}" page="{{page}}" download="{{download}}" source="{{source}}" packageName="{{packageName}}" packageUrl="{{packageUrl}}" registry="{{registry}}" version="{{version}}" />
{{/sdks}}
</SdkCards>
```

An absent value is an empty string, which the component treats as absent, so
the attribute list stays fixed and the template shows every field. The `.md`
twin prints these elements as written.

`PageTemplate` moves onto `mustache` (stable for years, so clear of
`minimumReleaseAge`), rendered with escaping turned off. It keeps today's
guarantees by walking `Mustache.parse`'s tokens before rendering:

- A name the data does not carry is refused, naming the template and the key,
  including inside a section, where the key is looked up on the section's
  items.
- Partials and the unescaped forms (`{{{x}}}`, `{{&x}}`, redundant with
  escaping off) are refused.
- A JSX object written `{{ … }}` still reads as a placeholder to mustache and
  is refused with today's hint.

The values are the CLI's, from `LANGUAGE_NAMES`, fixed addresses and
`apimatic.json`. A `"` would end a JSX string attribute early, so values are
written with `"` as `&quot;` (step 5 confirms MDX decodes it). Front matter
takes no value from the user's config.

### Markdown through `<include>`: fragments compiled as Markdown

fumadocs-mdx's `remark-include` parses an included file by its extension, `md`
for `.md` (`remark-include-*.js`: `_getProcessor(ext === ".mdx" ? "mdx" : "md")`),
and runs first among the remark plugins. So:

```mdx
<include>../../generated-includes/sdk-docs/{{language}}.md</include>
```

inlines the SDK docs parsed as CommonMark, where `{` is text, into the page's
tree before headings, the TOC, structured search data and processed Markdown
are computed. The spike (section 9, step 1) confirms each of those, that a path
outside the collection is accepted, and what raw HTML in a fragment becomes.

### The generated collection's MDX options

A collection that sets `mdxOptions` loses Fumadocs' defaults. So the generated
collection passes `applyMdxPreset(...)` from `fumadocs-mdx/config`, with
function-form plugin lists that keep the defaults and add two plugins. The
`defineDocs` macro accepts the imported functions, and strips them from the
browser bundle (step 1).

```ts
mdxOptions: applyMdxPreset({
  remarkPlugins: (defaults) => [remarkShiftHeadings, ...defaults],
  rehypePlugins: (defaults) => [[rehypeRaw, { passThrough: MDX_NODE_TYPES }], ...defaults]
})
```

### Shifting the SDKs page's headings

`remarkShiftHeadings` runs after `remark-include` and before the heading and
TOC plugins. It finds each `<ShiftHeadings>` element, shifts the headings
inside it by the same amount so that the shallowest becomes H2 (H2-first
content is left alone), and replaces the element with its children, so no
React component exists for it. Code blocks are separate nodes by then, so a
`# comment` in a fence is never a heading. Only `sdks.mdx` uses the wrapper,
around the description below the cards. The SDK docs and the plugin page are
never shifted. A front matter flag was tried first and does not work: the
collection's front matter schema strips unknown keys before remark runs.

### Raw HTML in fragments

MDX compiles a standalone `.md` file with its raw HTML dropped. HTML that
reaches an `.mdx` page through `<include>` is kept as `raw` nodes, which the
compiler cannot handle: `Cannot handle unknown node 'raw'` fails the build.
`rehype-raw`, with the MDX node types passed through, turns them into real
elements: `<br>` and `<details>` render. A pseudo-tag in prose such as
`<path-to-sdk>` becomes an unknown, invisible element, as it would in any
Markdown renderer. `rehype-raw@7.0.0` is already in the lockfile as a
dependency of `fumadocs-ui`, whose search dialog bundles it, so it adds no
browser weight. It becomes a direct dependency of the CLI and joins
`TEMPLATE_DEPENDENCIES`.

### The relative install address

`<PluginInstall path="{{installPath}}" />`. If the path is absolute it is shown
as written. If it is relative, the component reads `window.location.origin`
through `useSyncExternalStore`, whose server snapshot is `portal.siteUrl ?? null`.
So the prerendered HTML carries the `siteUrl` form (or the bare path), and the
browser swaps in its own origin after hydration with no mismatch warning. The
join is one pure function, `installAddress(path, origin)`, unit-tested in the
template tests. The copy button copies what is displayed.

## 5. Data

### Languages

`PortalLanguages.fromBlock` accepts `csharp`, `python` and `typescript`. It
refuses the other four `Language` values separately from unknown keys:
"'languages.java' is not available yet; the portal supports 'csharp', 'python'
and 'typescript' today." The list is `PLUGIN_LANGUAGES` from
`src/types/sdk/generate.ts`. PR #359 (open) renames it `AVAILABLE_LANGUAGES`
and adds `UPCOMING_LANGUAGES`; whichever of the two PRs merges second adopts
the other's names. `apimatic.schema.json` keeps its seven-language enum, which
is #359's to narrow.

`PortalLanguages` also keeps each language's `publishing` record beside its key
(today it keeps the keys alone).

### Per language (CLI, pure)

| Field | Source |
|---|---|
| `language`, `name` | the key, `LANGUAGE_NAMES` |
| `page` | `/sdks/<language>` |
| `download` | `/__downloads/sdk/<language>.zip`, always |
| `source` | `publishing.source.repositoryUrl`, when recorded |
| `version` | `publishing.package.version`, when recorded |
| `package` | `{ name, registry, url }`, when a version is recorded and the configuration names the package |

| Language | Registry | Address | From |
|---|---|---|---|
| typescript | npm | `https://www.npmjs.com/package/<name>` | `name` (scoped names included) |
| python | PyPI | `https://pypi.org/project/<name>/` | `name` |
| csharp | NuGet | `https://www.nuget.org/packages/<packageId>` | `packageId` |

A package name is URL-encoded per path segment. A configuration missing its
name field gives no package link, and the backend's validation owns reporting
that.

### Per page

Every value is a string, and an absent field is `''`.

| Template | Data |
|---|---|
| `sdks.mdx` | `sdks`: a list of cards, each `{ language, name, page, download, source, packageName, packageUrl, registry, version }`, in the block's order |
| `sdk.mdx` | the one language's card fields at the top level |
| `context-plugin.mdx` | `installPath`; `languages`: a list of `{ language, name }` |

### `portal.pluginUrl`

`PortalConfig.fromBlock` accepts `pluginUrl` beside the four namespaces
(`unknownKeys(block, [...NAMESPACES, 'pluginUrl'], BLOCK)`), and `PortalConfig`
carries it as `string | null`. It is validated with the existing `isWebAddress`
plus an `https://` requirement: "'portal.pluginUrl' must be an address starting
with 'https://', for example 'https://example.com/acme-plugin.zip'." It is not
part of `PortalIdentity`, because only the plugin page's data needs it. It goes
into `apimatic.schema.json`, which #360 left untouched, and is not written by
quickstart's scaffold (`toJSON` leaves it out when null).

### SDK docs

`PortalArtifactsService.unpack` reads `docs/<language>.json` for each delivered
SDK: a JSON object whose `gettingStarted` is a string. A missing file, invalid
JSON, or a `gettingStarted` that is missing or not a string fails the run with
`ServiceError.InvalidResponse`, exactly as `readCodeSampleCatalogs` treats an
unreadable catalog. `PortalArtifacts` gains
`sdkDocs: ReadonlyMap<string, string>`, keyed like `sdks` by the delivered name.

### The SDKs page description

`OpenApiDocument` gains the full `info.description` beside `suggestedSite`.
`PortalSourceContext` carries it only when there is exactly one spec, as it
does `suggested`, and the CLI splits it into the two fragments (section 3).

## 6. Components (`portal-template/src/components/`)

Built on Fumadocs UI (`Cards`/`Card`, `CodeBlock`/`Pre`, `buttonVariants`) and
the theme's `fd-*` tokens, so a portal's brand colour reaches them unchanged:

- `logos.tsx`: an inline SVG per language and per platform, with `aria-hidden`
  and the name rendered beside it.
- `sdk-actions.tsx`: the button row. Download is a plain `<a download>`, not a
  router link, since the zip is not a route. Source and package open in a new
  tab (`rel="noopener"`), labelled with the registry ("View on npm").
- `sdk-cards.tsx`: `SdkCards` (one card per row) and `SdkCard` (logo, name → page,
  `package · vVersion`, `SdkActions`).
- `plugin-install.tsx`: the resolved command in a copyable code block
  (section 4).
- `plugin-support.tsx`: `PluginLanguages` and `PluginPlatforms`, logo chips.

All registered in `useMDXComponents`. The heading shift (section 4) lives in
`src/lib/` and is registered in `source.ts` on the generated collection. The
one new dependency is `rehype-raw` (section 4).

## 7. Templates (`portal-pages/`)

Sketches; the final copy is reviewed in step 5.

`sdks.mdx`:

```mdx
---
title: "SDKs"
description: "Client libraries for this API."
---

<include>../../generated-includes/sdks-intro.md</include>

<SdkCards>
{{#sdks}}
<SdkCard language="{{language}}" name="{{name}}" page="{{page}}" download="{{download}}" source="{{source}}" packageName="{{packageName}}" packageUrl="{{packageUrl}}" registry="{{registry}}" version="{{version}}" />
{{/sdks}}
</SdkCards>

<ShiftHeadings>
<include>../../generated-includes/sdks-about.md</include>
</ShiftHeadings>
```

`sdk.mdx`:

```mdx
---
title: "{{name}} SDK"
description: "Install and start using the {{name}} SDK."
---

<SdkActions download="{{download}}" source="{{source}}" packageUrl="{{packageUrl}}" registry="{{registry}}" />

<include>../../generated-includes/sdk-docs/{{language}}.md</include>
```

`context-plugin.mdx`:

```mdx
---
title: "Context Plugin"
description: "Give your AI coding assistant working knowledge of this API's SDKs."
---

## Install

<PluginInstall path="{{installPath}}" />

## What it does
(general copy: what the plugin teaches the assistant, when to use it)

## Supported languages
<PluginLanguages>
{{#languages}}
<PluginLanguage language="{{language}}" name="{{name}}" />
{{/languages}}
</PluginLanguages>

## Supported platforms
<PluginPlatforms />
```

## 8. Running it locally

The backend does not return `docs/<language>.json` in the new shape yet
(2026-09-25). A stand-in for `/portal-artifacts` runs from the scratchpad and is
never committed. It answers the initiate, status and download calls as #361's
service expects: a 302 to the download finishes the poll. Every other
request, including the portal authorization check (`GET /account/profile`), is
passed through to `https://api.apimatic.io` with the caller's own login. It
serves the example zip (`C:\Users\Saeed\Downloads\portal-artifacts.zip`)
rewritten to the new `docs/` shape (description and sections joined into one
string, headings at H2), with a dummy `plugin.zip` and without the code
samples, whose endpoints no test spec declares.

Built in step 1, in the session scratchpad under `stub/`:

```
node stub/make-artifacts.mjs                      # lays out stub/artifacts/ from the example
Compress-Archive stub/artifacts/* stub/portal-artifacts.zip
node stub/artifacts-stub.mjs 4010                 # the stand-in
$env:APIMATIC_BASE_URL = "http://127.0.0.1:4010"
pnpm apimatic portal generate -i <dir containing src/> --force
```

On `dev` as it stands (before this PR reads `docs/`), `portal generate` against
it fetched the artifacts, built 9 pages and wrote `__downloads/plugin.zip` and
`__downloads/sdk/{csharp,python,typescript}.zip`.

## 9. Implementation steps

Each step ends with build, lint on the touched files, and the affected tests
green; review; and an explicit go-ahead before the next step. Nothing is
committed without asking.

1. **Spike, and the local stand-in.** *Done 2026-09-25; section 10.* In a
   prepared project: an `<include>` of
   a `.md` fragment outside `generated/`. Check that `{` and `<path>` in prose
   survive, the TOC lists its headings, search indexes it, the `.md` twin and
   `llms-full.txt` carry its text, prerender ignores it, and under
   `portal serve` an edited fragment reloads (or needs a restart, which is
   acceptable since artifacts are fetched once per run). Also check:
   - the heading-shift plugin's ordering and opt-in on the included content;
   - a JSON-valued placeholder reaching a component prop;
   - `useSyncExternalStore` swapping the origin with no hydration warning;
   - `buttonVariants` importable from `fumadocs-ui`.

   Build the stand-in of section 8. Only the findings and the stand-in (in the
   scratchpad) are kept.
2. **CLI data.** *Done 2026-09-25.* `portal.pluginUrl` parsing, schema and tests; `PortalLanguages`
   restricted to the three and keeping publishing records; the registry
   address table; `PageTemplate` on mustache with its key checks;
   `GeneratedPages` building the per-page data, including the plugin page
   condition (block or `pluginUrl`); the spec's full description through
   `PortalSourceContext` and its split. Built as `PortalSdk` (one language and
   its record), `publishedPackage` (the registry table), `PluginSource` (bundled
   or hosted), `SpecDescription` (`lead()` and `rest()`), and
   `portal-downloads.ts`, the addresses and layout names shared by the pages
   and #361's download layout. A template test holds the address to
   `portal-template/downloads.ts`. The schema test gains a documented
   exception: the schema still lists all seven languages until #359 narrows
   it.
3. **Artifacts and writer.** *Done 2026-09-25.* One rule serves both commands:
   `GeneratedPages.missingFrom(artifacts)` names each language whose SDK zip or
   SDK docs were not delivered, and a bundled plugin with no `plugin.zip`. At
   startup, `PreparePortalProjectAction` fails on it before preparing. Under
   `portal serve`, an edit that trips it is refused with a restart message, which
   covers a language added, a `plugin` block added, and `pluginUrl` removed while
   the block stays (decided the same day). A hosted plugin added applies live.
   The fragments come from `pageFragments(description, sdkDocs)`. Run end to end
   against the stand-in: it succeeds, and with Python's docs left out of the zip
   it fails before building, naming them.
   `docs/<language>.json` in `PortalArtifactsService`
   and `PortalArtifacts.sdkDocs`; `generated-includes/` written once at prepare
   (section 2, Fragments);
   `PortalProjectService.prepare` and `applyConfig`; `portal serve` refusing a
   language added after the preview started.
4. **Components.** *Done 2026-09-25.* Section 6, with the logos and their NOTICE entry, the heading
   shift and `rehype-raw`; template unit tests for `installAddress` and the
   shift. What the build and headless Chrome showed, in light and dark and at
   1280 and 520 px:
   - The cards became one full-width row each (logo and name on the left,
     buttons on the right, stacked below `sm`). Two to a row left no room for
     three buttons, which wrapped.
   - The install command is a plain Fumadocs `CodeBlock`, since an MDX page has
     no highlighter to hand, as the API pages do. Its text sits in a `.line`
     span, which is what the block pads.
   - The logos are vendored from Devicon 2.17.0 (MIT) for the languages, and
     from Simple Icons 16.32.0 (CC0, drawn in `currentColor`) for the platforms,
     with the paths checked verbatim against the downloads. Python's drop
     shadow is left out, and its gradient ids come from `useId`.
   - No console errors. The browser swaps in its own origin for the plugin
     address, and nothing of the collection's MDX options reaches the browser
     bundle.
   - The template type-checks as the e2e test checks it.
5. **Templates.** *Done 2026-09-25.* The three `.mdx` files and their copy; `PortalPagesService`
   tests rendering each with every language and both plugin forms. Run end to
   end against the stand-in: `portal generate` built the three pages from the
   templates, with the SDK docs, the shifted description, the resolved install
   command, and no console errors. A version holding a `"` renders as written,
   so MDX decodes the `&quot;` the CLI writes for it. The `.md` twin prints the
   cards as JSX with plain attributes, leaving out the empty ones. A long
   package line truncates, with the whole of it in a tooltip, so the buttons
   keep their row. The serve test that took a publishing record for an edit no
   page shows now finds it applied, since the cards show it.
6. **Surfacing.** e2e: cards and buttons on `/sdks`; a language page carrying a
   fixture's SDK docs with its headings in the TOC; the SDKs page's
   description split around the cards with its H1 shifted; the plugin page
   with a relative and an absolute address; no project path published. Also:
   the serve notice if `pluginUrl` changes what it says; README and schema
   docs; amendments to `.ai/plans/generated-pages.md` (sections 2, 3 and 10);
   this plan's status.

## 10. What step 1 found (2026-09-25)

Run on the `default` fixture with three languages, a `plugin` block and a spec
description holding `{braces}`, a `<placeholder>`, an H1 and a fenced
`# comment`, prepared by `PortalProjectService` and then edited by hand: the
fragments, the pages, a probe component and the collection's MDX options. It
was built with `vite build` and loaded in headless Chrome.

Held:

- **Included fragments.** A `.md` file outside `generated/` is included. Its
  prose `{id: 1}` and `{braces}` render as text. Its headings reach the page
  and the TOC. Its text reaches the `.md` twin, `llms-full.txt` and the search
  index. Prerender lists only the pages, not the fragments, and a `# comment`
  in a fence stays code.
- **Heading shift**, with the `<ShiftHeadings>` wrapper: `/sdks` gets H2
  "Authentication" and H3 "Rate limits", in the page, the TOC and the twin. The
  SDK docs page keeps H2, H2, H3.
- **JSON-valued placeholder.** An object and an array reach the component
  intact, including a `"` and a `</script>` inside a value.
- **The origin swap.** The prerendered HTML carries
  `https://docs.test/__downloads/plugin.zip` (from `siteUrl`). After hydration
  the browser shows its own origin (`http://127.0.0.1:<port>/…`), and an
  absolute address is left alone. No console error or hydration warning; a
  planted `console.error` confirmed the capture works.
- **`buttonVariants`** imports from `fumadocs-ui/components/ui/button`.
- **The browser bundle.** None of `applyMdxPreset`, the shift plugin or
  `remarkGfm` reaches it. `hast-util-raw` is there, but in the chunk
  `fumadocs-ui`'s search dialog imports, which carries it already.

Changed the plan:

- **Raw HTML failed the build** (section 4): `rehype-raw` added, and a new
  dependency with it.
- **The front matter opt-in does not work** (section 4): replaced by the
  wrapper.
- Unrelated and left alone: the user's own `.md` content already drops raw
  HTML silently (`Line one<br>line two` renders "Line oneline two"). This is
  MDX's `md` format, and a candidate for its own change.

Questions it raised, answered the same day (section 2):

1. **The `.md` twin of a page with JSON props is noisy.** The twin and
   `llms-full.txt` print the component with its JSON entity-escaped:
   `<SdkCards sdks=" [{&#x22;language&#x22;:…}] " />`. Plain string attributes
   print cleanly. Answer: string attributes everywhere, with mustache sections
   for lists.
2. **A language added while `portal serve` runs** has no SDK docs and no zip:
   the artifacts are fetched once, when the preview starts, and an
   `apimatic.json` edit only regenerates pages. Answer: refuse the edit and ask
   for a restart.
