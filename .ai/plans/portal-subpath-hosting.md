# Plan: hosting the portal under a sub-path

Status: designed 2026-09-29 on `saeedjamshaid/portal-subpath-hosting` (worktree
`C:\repos\apimatic-cli-subpath-hosting`), cut from `origin/dev` at `74ad5d2e`. Tracks
apimatic-io#2275, whose design this follows except where section 14 says otherwise. Reviewed
four times on 2026-09-29; section 15 records what each round changed.

Not implemented.

## 1. Goal and scope

`portal.site.url` may carry a path, such as `https://acme.github.io/docs` for a GitHub Pages
project site or a docs prefix behind a reverse proxy. When it does, the portal works when it is
served at that path: its pages, assets, client navigation, search, downloads, SEO files and
`portal serve`.

- **In scope:** the path comes from `site.url`, and only from there.
- **Out of scope** (decided 2026-09-29; section 12 says why):
  - a path given without `site.url`, as a setting or a flag;
  - one build that works at whatever path it is deployed to.
- **Invariant:** a portal whose `site.url` has no path, or that has no `site.url`, emits the same
  pages, files and addresses as today. The content hashes in chunk names are the only difference.

**Terms:**
- A **portal-relative path** is a page's path from the portal's own root (`/guides/intro`).
- The **base path** is where the portal is mounted (`/docs`, or `''` at a host's root).
- The **site address** is the origin plus the base path (`https://acme.github.io/docs`).
- The **served path** is the base path plus the portal-relative path.

The comments that say "site-relative" today (`portal-config.ts:29,31`, `portal-types.ts`) are
changed to "portal-relative". `StaticAsset.siteUrl()`, which returns a portal-relative path, is
renamed `portalPath()` (4.3).

## 2. Decisions (2026-09-29)

1. **Where the path comes from.** It is the path of `site.url`. Without `site.url` the portal is
   at the root of its host, as today.
2. **Vite's `base` is the one switch.** TanStack Start derives the rest from it:
   - the router basepath (`deriveRouterBasepath`, start-plugin-core `planning.js:14`);
   - every page's asset URLs (the Start manifest is built from `publicBase`);
   - the prerender, which fetches `withBase(page)` and writes `withoutBase(file)` (`prerender.js:78,92`).

   Fumadocs' links are TanStack Router links (`fumadocs-core/dist/framework/tanstack.js`), which
   already carry the basepath. So `docsRoute` stays `/`; a Fumadocs `baseUrl` would double every
   link (`/docs/docs/guides`). TanStack's maintainer puts the split the same way on #4888: Vite
   `base` owns assets, and the router basepath owns routes.
3. **One source in the template: `siteUrl`.**
   - `siteUrl` in `portal.identity.json` becomes the site address.
   - `vite.config.ts` works out `base` from it once, through one function in
     `portal-template/portal-config.ts`.
   - Nothing else carries the path: no `basePath` field in either file.
4. **Portal-relative strings are prefixed in the template.** The strings the router never sees
   go through one helper, `withBasePath()`, which reads `import.meta.env.BASE_URL`.
   - The template is the layer that already adds the base to the router's URLs. Prefixing in the
     CLI would give the same rule a second home.
   - `BASE_URL` is the value Vite actually applied. Under `portal serve`, an edit that moves the
     path rewrites `siteUrl` while Vite keeps its startup base (decision 9), so reading `siteUrl`
     there would disagree with the assets.
   - The code that runs in Node passes the base explicitly: the prerender list, the dev
     downloads middleware and the cache plugin. So the prefix rule has one home.
5. **`siteUrl` carries the whole site address.** `seo.ts` and `sitemap.server.ts` concatenate
   `siteUrl + pageUrl`, so these follow with no code change: canonical, `og:url`, the sitemap, and
   the plugin's Markdown install command.
6. **A base path that collides with page paths works; nothing is refused.** A collision is a
   page whose portal-relative path starts with the base, such as `/api` against the API reference,
   or `/docs` against a `docs/` folder. Two things break on one today, and each gets a fix in the
   template:
   - **The prerender.** ufo's `withBase` leaves a path that already starts with the base unchanged
     (ufo 1.6.4), so `/docs/intro` under `/docs` is fetched as `/intro` and 404s. Fixed by giving
     TanStack the served paths (5.7): `withBase` then leaves every one alone, and `withoutBase`
     strips the base exactly once for the filename.
   - **Search results.** They navigate through `router.navigate({ href })`, whose input rewrite
     strips a leading base, case-insensitively (`router-core router.js:261-265`, `rewrite.js`).
     Fixed by handing the dialog served URLs (5.2), so the rewrite strips exactly once. The dialog
     is the only place in Fumadocs that navigates by `href`.

   Router links (`to`) and direct loads already strip once, correctly. All of this was measured
   under base `/api`, in the worst case (section 3).
7. **No `robots.txt` under a path.** Crawlers read it only from the root of a host. The Next
   Steps note says where the sitemap is instead.
8. **The static server-function cache URL is rewritten in the client build** by a Vite plugin in
   the template, until TanStack/router#6152 ships. The rejected alternatives:
   - a pnpm patch, which never reaches users who install the CLI with npm;
   - a copy of the middleware, which needs `@tanstack/start-client-core` and `seroval` as direct
     dependencies pinned to Start's versions;
   - a wrapper round the global `fetch`, which changes a browser global for every caller.

   TanStack offers no option for this URL (`staticFunctionMiddleware.ts:50` on `main`), and the
   latest release is 1.167.38.
9. **`portal serve` runs under the base**, as the build does. The 2026-09-29 dev probe found
   routing, the `/docs/_serverFn/` page data, HMR and live edits all working there, and it surfaced
   the same missing prefixes a build shows.
   - It reports and waits on the address with its trailing slash.
   - An edit that moves the path is applied, so canonical links follow, but the preview keeps
     serving the old path until it restarts. The restart list in the Live preview note names it.
     There is no notice of its own: the path is set once, and a notice would mean reworking the
     static-directory one into a keyed prompt, which is not worth it for so rare an edit.
10. **Links in the Markdown copies.**
    - **In scope:** the links we write into the SDK pages' Markdown copies get the base (5.2).
    - **Deferred to a follow-up** (decided 2026-09-29): the links authors write keep their
      spelling in the copies. The reasons:
      - It is the one part whose mechanism is still open (section 9).
      - It affects only the copies handed to AI assistants; the HTML already follows the base.
      - No portal is hosted under a path yet.
      - It would couple us to another Fumadocs internal.
11. **The quickstart note stays as #403 left it.** The change is carried by:
    - the schema description;
    - the validation messages;
    - the Next Steps note of `portal generate`;
    - the README.

## 3. What was verified (2026-09-29)

This covers the installed versions: Vite 8.2.2, @tanstack/react-start 1.168.50, start-plugin-core
1.171.40, router-core 1.171.28, start-static-server-functions 1.167.33, fumadocs-core/ui 16.15.15,
fumadocs-mdx 15.4.0. **Measured** means it was built or run; **read** means it was read in the
installed source.

**Measured: the `default` fixture built with Vite `base: '/docs/'`, served at `/docs`, and driven
in headless Chrome.** In the fixes column, the `/__tsr/` fix was a hand-written fetch wrapper; the
planned plugin was verified afterwards (see the next list).

| | `base` only | `base` + search, `/__tsr/` and logo fixes |
|---|---|---|
| First page load | works | works |
| Client navigation | the 404 page: `/__tsr/staticServerFnCache/*.json` 404s | works |
| Search | no results: `/api/search.json` 404s | works |
| Logo, favicon | 404 | work |
| Failed requests | 5 | 0 |

**Measured, with the planned plugin (5.6) in place of the fetch wrapper:**
- Picking a search result navigates to `/docs/api/…/Calculate`, and its cache fetch answers 200.
- An unknown deep link served through `404.html` shows the not-found page, with `/docs/` links.
- Cache files are written to `dist/client/__tsr/`.

**Measured: a colliding base.**
- `base: '/api/'` as things stand fails the build (`Failed to fetch /api/search.json: Not Found`).
- With served paths handed to the prerender and served URLs handed to the search dialog, it
  builds, and the output layout is unchanged: `api/search.json` and
  `api/<spec>/…/Calculate/index.html` are at the output's root.
- In the browser, all of these work:
  - a direct load of `/api/api/…/Calculate`;
  - a sidebar click to it and back;
  - clicking a search result;
  - a deep link through `404.html`.

**Measured with step 3 in place (2026-09-30):** the `subpath` fixture built and served at
`/api`, with `404.html` for missing paths, and driven in headless Chrome. All of these work:
- first load, with the logo, the Markdown image and the favicon;
- a click to a content page and to a colliding `/api/api/…` reference page, and back. Their
  cached data comes from `/api/__tsr/…`, with status 200;
- the popover's "View as Markdown" (`http://…/api/authentication.md`, 200), the prompt's page
  address, and the copy button's fetch;
- search, and a click on a result landing on the colliding page;
- the SDK download (200), the plugin page's install command with `/api`, a direct load of a
  reference page, and a missing page shown as the not-found page with `/api/` links.

The only console output was also there on the root-hosted `default` build, driven the same way:
- headless Chrome refusing the clipboard to an unfocused document;
- the not-found page's own failed data lookup.

**Measured with step 4 in place (2026-09-30):** `portal serve` on the `subpath` fixture, run as
the action runs with only the account check and the artifacts stubbed, and driven in headless
Chrome. It printed `http://127.0.0.1:<port>/api/`, and the restart list named the path. All of
these work, with no failed request and no console output:
- the printed link, with the logo, the Markdown image and the favicon;
- a click to a content page and to a colliding `/api/api/…` reference page, and back, their data
  from `/api/_serverFn/…`;
- search, and a click on a result landing on the colliding page;
- the SDK download and the plugin's (200, both under `/api/__downloads/`), and the install
  command's address;
- a missing page, shown as the not-found page.

Moving the path to `/v2` in the running preview applied the edit (canonical links then carry
`/v2`), while `/api/` went on being served and `/v2/` answered 404, as the restart list says.
Stopping it the way CTRL+C does left no project directory behind.

**Measured, other builds and runs:**
- `base: './'` writes script URLs as `/./assets/…` (the host's root), CSS links relative to the
  page, and a router basepath of `.`.
- Vite dev with `base: '/docs/'`:
  - `/docs/` answers 200, `/docs` answers 404 and `/` answers 302 to `/docs/`;
  - routing, `/docs/_serverFn/…` page data, the HMR websocket (`ws://…/docs/`) and a live content
    edit all work;
  - `/docs/__downloads/plugin.zip` comes back as the SPA's HTML, while a bare `/__downloads/…`
    answers with the zip, because our middleware runs ahead of Vite's base check.
- In the `/docs/` build:
  - pages are written to `dist/client/guides/intro/index.html`, and the host serves that
    directory at `/docs`;
  - router links, `<script>` and `<link>` tags, and images in user Markdown (turned into imports
    by `remarkImage`) all carry `/docs/`;
  - canonical keeps `https://docs.test/guides/intro` until `siteUrl` carries the path;
  - `import.meta.env.BASE_URL` is `/docs/` in the SSR and `.server` chunks too.
- Still root-relative, in the build and in dev:
  - the logo and favicon;
  - SDK downloads;
  - the popover's "View as Markdown" link;
  - the AI prompts' page URL;
  - `llms.txt` links, and the SDK pages' Markdown copies;
  - an author's `[auth](/authentication)` in a page's `.md` copy and in `llms-full.txt`. Its HTML
    link is `/docs/authentication`.

**Read in source:**
- `llms()` writes `node.url` and has no base option. It takes a loader and reads only
  `getPageTree`, `getNodePage`, `getNodeMeta` and `_i18n`; `getNodePage` goes by `$ref`
  (`dynamic-CSrl9w26.js:756`).
- `MarkdownCopyButton` prefixes its URL (`page-actions.js:17`). `ViewOptionsPopover` renders plain
  `<a>` tags and stopped prefixing in ui 16.15.13 (fuma-nama/fumadocs PR #3572), still so in the
  16.15.15 we install. Fixed in 16.15.17 (fuma-nama/fumadocs#3620, commit `6791d6f`) with the same
  `withBasePath`, which leaves an address with a scheme as it is (`/^\w+:/`).
- The search clients default to `join(BASE_PATH, '/api/search')` (core 16.10.6), but our explicit
  `from` overrides that.
- The search dialog's results are buttons that call `router.push(item.url)`
  (`fumadocs-ui/dist/components/dialog/search.js:110`).
- The static cache writer uses `path.join(TSS_CLIENT_OUTPUT_DIR, url)`. The client reads the cache
  only when `NODE_ENV === 'production'`.
- Fumadocs' `Link` renders any `scheme:` or `//` href as a plain `<a target="_blank">`
  (`fumadocs-core/dist/link.js:5`). No router listens for clicks on plain `<a>` tags.

## 4. CLI changes

### 4.1 `SiteAddress`: `src/types/portal/config/site-address.ts` (new)

- **`SiteAddress`**
  - Holds the origin and the path.
  - `static parse(value: unknown, path: string): Parsed<SiteAddress>`, as `Link` and
    `StaticAsset` do.
  - `toString()` is the site address with no trailing slash.
  - `path()` is where the portal is served, in the form Vite's `base` takes: `'/'` at the root,
    `'/docs/'` under a path. The contract test of section 6 holds `viteBase` to it.
  - `hasPath()` says whether it is under a path.
  - `addressOf(portalPath)` is a portal-relative path's address on the host, so no caller
    appends to `toString()` itself.
- **No `BasePath` class.** It was planned for comparing a moved path under `portal serve`. With
  that notice cut (4.5), Next Steps is the only user, and `SiteAddress` covers it.
- **What `parse` checks, on the raw text before `new URL` normalises it:**
  - it starts with `http://` or `https://`, in any case. `new URL` would take `https:x.test` as
    `https://x.test/`, and the refused list in `portal-config.test.ts` holds that out;
  - no `?`, `#` or `\`;
  - each path segment is one or more of `[A-Za-z0-9._~-]`, and is not `.` or `..`;
  - no empty segment, except one trailing slash.

  That keeps the same spelling in Vite's `base`, the router's prefix match, a host's folder name
  and the canonical address, with nothing percent-encoded to disagree on. GitHub repository names
  use only `[A-Za-z0-9._-]`, so every project site passes.
- **The refusals.** Each one names what it found. `<path>` is the field's path, as in the other
  `portal` messages.
  - Not an `http(s)` address: "'<path>' must be the address the portal is hosted at, for example
    'https://docs.example.com' or 'https://example.com/docs'."
  - A `?`, `#` or `\`: "'<path>' cannot contain '?'. Give the address the portal is hosted at,
    for example 'https://example.com/docs'." The message names the character that was found.
  - A segment outside the rule: "'<path>' has 'my docs' in its path. Each part between '/'s can
    use only letters, digits, '.', '_', '~' and '-', and cannot be '.' or '..'."
  - An empty segment: "'<path>' has an empty part ('//') in its path."

### 4.2 `SiteConfig` (`src/types/portal/config/site-config.ts`)

- It holds `SiteAddress | null`. `validUrl` and `parseOrigin` go, replaced by
  `SiteAddress.parse`.
- `origin()` becomes `siteAddress(): SiteAddress | null`, beside `siteName()` and
  `siteDescription()`, and `toJSON()` writes the address.
- The comment above the old check goes. `SiteAddress` owns the rule.

### 4.3 `PortalConfig` (`src/types/portal/portal-config.ts`)

- `identity().siteUrl` is `site.siteAddress()?.toString() ?? null`.
- New `siteAddress(): SiteAddress | null`, for Next Steps (4.6). `generate.ts` reaches it through
  the `source` that `onPrepared` already receives (`PortalSource.config`).
- The comment on `PortalIdentity.siteUrl`, and on the template's `Portal.siteUrl`, becomes "The
  site address, with no trailing slash."
- `StaticAsset.siteUrl()` (`static-asset.ts:55`) is renamed `portalPath()`, so `siteUrl` means
  only the site address. It is called at `portal-config.ts:118-119` and in `portal-config.test.ts`.

### 4.4 `apimatic.schema.json`

- The `site.url` pattern becomes
  `^\s*[hH][tT][tT][pP][sS]?://[^\s/?#\\]+(/(?!\.{1,2}(/|$))[A-Za-z0-9._~-]+)*/?\s*$`.
- The description: "The address the portal is hosted at, for example 'https://docs.example.com'
  or 'https://example.com/docs'."
- `test/types/apimatic-config/schema.test.ts` runs the pattern and `SiteAddress.parse` over one
  table. The table includes `docs?`, `docs#`, `docs\guides`, `docs/.`, `docs/..`, `docs//x`, `//docs`,
  `%20`, a trailing slash and upper case.

### 4.5 `portal serve`

- **The address keeps its slash.**
  - `LOCAL_URL_PATTERN` (`portal-dev-server-service.ts:24`) keeps the trailing slash when the
    address has a path. `http://127.0.0.1:5173/docs/` is then what is printed and what
    `networkService.answers` waits on; the root case stays `http://127.0.0.1:5173`.
  - Without this, `answers`, which counts any response, gets Vite's immediate 404 for `/docs`.
    The #399 wait then ends before the first page compiles, and the printed link opens Vite's
    "did you mean /docs/" page.
- **The restart list.** `portalServed`'s list (`prompts/portal/serve.ts:57`) adds "changing the
  path in `portal.site.url`". That is the whole of the path-edit handling:
  - `PreviewConfig` and the static-directory notice are unchanged.
  - A notice of its own for a moved path was planned and cut on 2026-09-29. Doing it without a
    sibling prompt meant folding `staticDirectoryNotServed` into one keyed prompt, about 100
    lines for an edit made once. It can come later as its own cleanup.

### 4.6 `portal generate` Next Steps (`src/prompts/portal/generate.ts:90`)

`nextSteps` takes the site address (4.3). When `hasPath()`, the note reads as below, with the
zipped line in place of the first one when zipped. The sitemap address is
`addressOf('/sitemap.xml')`, which is how `seo.ts` builds it too.

> Upload the contents of `<dir>` so they are served at `https://acme.github.io/docs/`.
>
> (zipped) Unpack `portal.zip` in `<dir>` so its contents are served at
> `https://acme.github.io/docs/`.
>
> Serve `404.html` for missing pages under `/docs/`, so deep links resolve.
>
> Crawlers read `robots.txt` only at the root of a host, so none is generated. If you control
> the root, add `Sitemap: https://acme.github.io/docs/sitemap.xml` to its `robots.txt`.

At the root, and without an address, the note is unchanged. The note matters most when someone
previews the output from the root of a local server. The page then loads without its styles and
scripts, which are requested under the path, and the terminal is where they look next.

### 4.7 README

The "Upgrading from 1.x" bullet that lists the `portal` block (`README.md:29`) describes `site`
as "its name, address and description". It gains: the address may carry a path, such as
`https://acme.github.io/docs`, and the portal is then built to be served there. The README has
no other place that describes `site`.

## 5. Template changes

### 5.1 `portal-config.ts` and `vite.config.ts`

- `portal-config.ts` exports `viteBase(identity: BuildIdentity): string`, which returns `'/'`, or
  the path of `siteUrl` plus `/`. The contract test of section 6 holds it to the CLI's
  `SiteAddress.path()`.
- `vite.config.ts` sets `base: viteBase(identity)`, and passes `identity` to `prerenderPages`,
  which needs it for the served paths and the robots rule (5.7).
- `vite.config.ts` also sets `useImport: true` in `remarkImageOptions` (step 2). It is
  Fumadocs' default today, and it is what gives a Markdown image the base: the image is
  bundled, not linked. Written out, a changed default in an upgrade cannot quietly drop the base
  from every Markdown image.

### 5.2 `withBasePath`: `src/lib/base-path.ts` (new)

- `withBasePath(path: string, base = BASE)` prefixes a portal-relative path with the base less its
  trailing slash.
  - Every caller passes a portal-relative path. The SDK downloads are always
    `sdkDownloadAddress`'s `/__downloads/…`, and a hosted plugin's absolute address never
    reaches it (5.3).
  - So there is no pass-through for absolute URLs. An earlier draft had one, for the plugin.
- `BASE` is `import.meta.env.BASE_URL`, guarded the way Fumadocs guards it, since tsx leaves it
  undefined.
- `/// <reference types="vite/client" />` in the file keeps `pretest`'s `tsc`, which lists only
  node, mocha, chai and sinon types, from rejecting `import.meta.env`.
- **Users:**
  - `components/search.tsx`:
    - `from: withBasePath('/api/search.json')`;
    - the results given to `SearchDialogList` carry `url: withBasePath(item.url)`, so the dialog's
      `router.push` strips the base exactly once, whatever the page's path (decision 6). They are
      memoised on `query.data`: the list moves its highlight to the top whenever it gets a new
      array.
  - `routes/__root.tsx`: the favicon `href`.
  - `lib/layout.shared.tsx`: the light and dark logos, in its three `<img src>`s (lines 33, 37,
    38).
  - `components/sdk-actions.tsx`:
    - `DownloadLink`'s `href`, which covers the SDK page and cards;
    - the Markdown branch's `[Download SDK](…)` (line 25).
  - `components/sdk-cards.tsx`: the Markdown branch's `[${name}](${page})` (line 43). The HTML
    branch is a router `Link` and is left alone.
  - `routes/$.tsx`: in the browser, `pageUrl` and the `markdownUrl` both page actions get are full
    addresses, from `fullAddress(path)` beside `withBasePath` in `base-path.ts`:
    `new URL(withBasePath(path), window.location.origin)`. On the server they stay paths, as
    `pageUrl` is today; neither component renders them until it is used.
    - `pageUrl` (line 138) needs the base because the router's pathname has it stripped.
    - `markdownUrl` goes to both components as a full address because Fumadocs' own
      `withBasePath` leaves a full address alone (`page-actions.js:197`). So it is right whether
      Fumadocs adds the base or not:
      - `ViewOptionsPopover` stopped adding it in ui 16.15.13 and adds it again from 16.15.17
        (fuma-nama/fumadocs#3620), which would have doubled a prefixed path;
      - `MarkdownCopyButton` still adds it, and would lose it if it went the popover's way.
    - An earlier draft prefixed the popover's URL and passed the copy button the bare one. That
      was right only for today's Fumadocs, and an upgrade that fixed the popover would have
      doubled the path with nothing to catch it.
  - `lib/llms.server.ts`: the page headings' `(${page.url})`, and the index (5.4).
  - `components/plugin-install.tsx`: `fullAddress('/')` in the browser's snapshot (5.3).
- **Users in Node, which pass the base:**
  - `prerender-pages.ts`, with `viteBase(identity)` (5.7). It already imports from `src/lib/`.
  - `downloads.ts`'s dev keys, with `server.config.base` (5.8).
  - `static-functions-base.ts`'s literal, with the resolved `config.base` (5.6).

  With `'/'` as the base, the path comes back unchanged, which keeps the root case as it is.
- **Never through it:**
  - the page tree the pages render, and every Fumadocs or router link. The `llms.txt` index
    renders from a prefixed copy (5.4);
  - canonical, `og:url` and the sitemap (through `siteUrl`);
  - header links, which are portal-relative router links.

### 5.3 The plugin install command (`components/plugin-install.tsx`)

- **The shape today:** one call, `installCommand(path, origin)`. The `origin` comes from
  `useSyncExternalStore`: `portal.siteUrl` in the server snapshot, `window.location.origin` in
  the browser's. The Markdown branch calls `installCommand(path, portal.siteUrl)`.
- **The change:** the browser's snapshot becomes `fullAddress('/')`, the address the browser
  sees the portal at, built as the page actions' is (5.2). Nothing else changes:
  - `path` is not prefixed. The call is shared with the server snapshot, whose `siteUrl` already
    carries the path, so prefixing it would print `/docs/docs/__downloads/…` in the
    prerendered page.
  - The server snapshot and the Markdown branch are right as they are, because `siteUrl` now
    carries the path.
  - `install-command.ts` is unchanged. It trims the trailing slash from what it is given.
- The component's comment changes from "its own origin" to "its own address".

### 5.4 `llms.txt` (`lib/llms.server.ts`)

- The index is rendered by giving `llms()` a loader whose `getPageTree` returns a copy of the tree
  with prefixed page URLs.
- `getNodePage` goes by `$ref`, so titles and descriptions survive.

### 5.5 Links authors write, in the Markdown copies: deferred

Not in this PR (decision 10). Section 9 records the limitation and the approach found for the
follow-up.

### 5.6 The static server-function cache: `static-functions-base.ts` (new, beside `downloads.ts`)

- **What it does:** a Vite plugin with `apply: 'build'`, active in the `client` environment only.
  In `@tanstack/start-static-server-functions`, it rewrites the literal
  `` `/__tsr/staticServerFnCache/ `` into
  `withBasePath('/__tsr/staticServerFnCache/', config.base)`. `config.base` is the resolved base,
  read in `configResolved`.
  - As built in step 3, it runs `enforce: 'pre'` and uses a transform hook filter (by package id
    and by the literal). TanStack builds with `sharedPlugins: true`, so `applyToEnvironment`
    is what keeps it out of the server build.
  - The literal is in `dist/esm/staticFunctionMiddleware.js` today. The unit guard scans the
    package's `dist` for it rather than naming that file.
- **Why the `ssr` environment is left alone:** its writer joins the same URL onto the client
  output directory, and a prefixed URL would write `dist/client/docs/__tsr/…`.
- **Why build-only:** dev never reads the cache.
- **What makes it fail:** `buildEnd` in the client environment fails the build when no module
  held the literal. That also covers an upgrade that moves it to another package. The check
  counts matches, not changes: at the root, the replacement is the literal itself.
- **The guard:** a unit test reads the installed module and asserts the literal is there, so the
  guard does not rest on fake input alone.
- It is applied at the root too, so there is one path through the code. It goes when
  TanStack/router#6152 ships (section 10).

### 5.7 `prerender-pages.ts`

- **Served paths.** `prerenderPages(config, identity)` takes the identity in place of today's
  `siteUrl` argument. It returns every path as `withBasePath(url, viteBase(identity))`
  (`/docs/guides/intro`). TanStack's `withBase` then leaves each one alone, and `withoutBase`
  strips the base once for the filename, which keeps the output layout as it is at the root.
  - The SPA shell is not in the list: TanStack adds it itself and prefixes it.
  - That is what makes a colliding base build (decision 6).
- **`robots.txt`** is listed only when `siteUrl` is set and `viteBase(identity)` is `'/'`.

### 5.8 `downloads.ts`

- The dev middleware answers only under the base.
  - `filesByAddress` builds its keys with `withBasePath(…, server.config.base)`
    (`downloads.ts:39`), giving `/docs/__downloads/…`. The lookup itself is unchanged. The
    middleware sees the full URL, because it runs ahead of Vite's base handling (measured).
  - A request without the base finds no key and goes on to Vite, so a link missing its prefix
    fails in dev as it would once built.
- The build still copies the downloads to `dist/client/__downloads/`.

### 5.9 Unchanged, and why

| File | Why |
|---|---|
| `seo.ts`, `sitemap.server.ts` | String concatenation onto `siteUrl` |
| `routes/spa-shell.tsx`, `404.html` | The shell's assets carry the base; the router reads the served path (measured) |
| `usage-tabs.tsx` | Resolves the API's server URLs, not the portal's |
| Content links and Markdown images in the HTML | Router links and bundled imports |

## 6. Tests

**CLI unit tests:**
- `test/types/portal/config/site-address.test.ts` (new):
  - accepted: the root, one or several segments, a trailing slash, with `path()` and
    `hasPath()` for each;
  - refused: the table of 4.4, each with its message from 4.1.
- `test/types/portal/portal-config.test.ts`:
  - `identity().siteUrl` is the site address;
  - `siteAddress()` is null without a `url`;
  - the renamed `portalPath()`.
- `test/types/apimatic-config/schema.test.ts`: the shared table.
- **Existing tests that refuse a path, changed in step 1:**
  - `schema.test.ts:125`, "an address with a path", moves to the accepted cases.
  - `portal-config.test.ts:92` uses `https://x.test/docs` as its invalid address, to reach five
    errors. It takes `https://x.test/?a=1` instead.
  - `portal-config.test.ts:141`, "keeps only the origin of the address", becomes "keeps the
    path, dropping a trailing slash and keeping a port".
  - `portal-config.test.ts:149-160` drops `https://x.test/docs` from its refused list.
    `https:x.test` stays there (4.1).
- `test/infrastructure/portal-dev-server-service.test.ts`: a `/docs/` banner keeps its slash, and
  the root banner is unchanged.
- `test/prompts/portal/serve.test.ts`: the restart list names the path.
- `test/actions/portal/generate.test.ts`, which stubs `nextSteps` today: it receives the site
  address.
- `test/prompts/portal/generate.test.ts` (new; the wording has no test today): both branches, at
  the root and under a path.

**The CLI/template contract (`test/portal-template.test.ts`)**, beside the `Equal<>` checks
already there: for a list of accepted addresses of its own (the root with and without a slash, a
path, a deep path in mixed case, a segment of dots), `viteBase` given `identity().siteUrl` equals
`SiteAddress.parse(url).path()`. The CLI and the template each derive
the path from the address, so this holds them to one answer. It parses the address itself because
`PortalConfig.siteAddress()`, like `hasPath()`, arrives in step 4 with Next Steps, its one caller.

**Template unit tests (`test/portal-template/`):**
- `base-path.test.ts` (new): the root, a base, an explicit base; `fullAddress` with a window and
  without one.
- `prerender-pages.test.ts`:
  - served paths under a base, including one that collides with it;
  - portal-relative paths at the root;
  - no `robots.txt` under a base.
- `downloads.test.ts`:
  - the dev middleware answers under the base;
  - it passes a bare `/__downloads/…` on.
- `static-functions-base.test.ts` (new):
  - it rewrites in the client environment only;
  - it leaves other modules alone;
  - it fails when nothing matched;
  - the installed module still holds the literal.
- `search-navigation.test.ts` (new, step 2). Search results under a colliding base rely on how
  Fumadocs and TanStack navigate, which only a browser would otherwise show. So an upgrade that
  changes any of it fails here, naming the mapping in `search.tsx` to revisit:
  - Fumadocs' search dialog navigates with `router.push(item.url)`, read from the installed
    `fumadocs-ui`;
  - Fumadocs' TanStack adapter pushes with `router.navigate({ href })`, read from the installed
    `fumadocs-core`;
  - the router, created in Node with a memory history and basepath `/api`, takes
    `href: '/api/api/x'` to the route `/api/x`. It runs in Node (tried 2026-09-29).

**End to end:** `test/e2e/portal-build.test.ts` gets a `subpath` fixture with
`site.url: 'https://docs.test/api'`. It is a colliding base on purpose: it guards the reliance on
TanStack's `withBase` (decision 6), and would fail if that ever prefixed an already-prefixed path.
The fixture lives at `test/resources/portal-inputs/subpath/src`, beside `default` and `branded`.
It holds:
- a spec, so the API reference's `/api/…` pages really collide with the base;
- a content page linking `/authentication`, and that page;
- a logo in `static/`;
- a Markdown image in the content page (step 2), which guards `useImport` (5.1). It is over
  Vite's 4 KiB inline limit, since an inlined `data:` URI would carry no base to check; the logo
  is 3.9 KB, so the image is a generated 12 KB `diagram.png`.

It is built with `{ plugin: true }` for the bundled plugin. It is the third real build in the
file, after `default` and `branded`, and `test.yml` runs the e2e suite on
every platform in the matrix. The three builds took about a minute together locally (step 1,
2026-09-29), so this adds some 20 s to each job, more on slower runners. It stays on every platform,
because the cache writer's `path.join` is where Windows would differ. It lands in step 1, and
each step extends its assertions:
- **Step 1:**
  - the pages are at the output's root, `api/search.json` and the operation pages included, and
    no page is written twice;
  - asset `src`/`href`, sidebar links and the content page's `/authentication` link start at
    `/api/`;
  - canonical, `og:url` and the sitemap `<loc>`s carry `/api`.
- **Step 2:**
  - logo, favicon and SDK download links start at `/api/`;
  - `llms.txt` links start at `/api/`, and there is no `robots.txt`;
  - the plugin page's Markdown command carries `/api`;
  - `sdks.md` links carry `/api`;
  - the Markdown image's `src` starts at `/api/`.
- **Step 3:**
  - a client chunk contains `` `/api/__tsr/staticServerFnCache/ ``, and none contains
    `` `/__tsr/staticServerFnCache/ `` (the literal with its opening backtick);
  - the cache files sit at `__tsr/staticServerFnCache/` under the output's root.

**By hand, in a browser** (the 2026-09-29 headless Chrome probes). Each runs with the step that
completes what it checks, so a bug is fixed in the commit that made it: the build probe with
step 3, the `portal serve` probe with step 4. Both use the `subpath` fixture. `portal serve`
under a colliding base was only read (Start's dev middleware takes `req.originalUrl`, so it
strips the base once) until step 4 ran it (section 3). Some fixes are checked only here, because they exist only in the
browser and no automated test reaches them:
- the search results' served URLs, which make a colliding base navigate. What they rely on is
  guarded by `search-navigation.test.ts`;
- the page actions' full addresses;
- `pageUrl`;
- the plugin install command's browser snapshot (5.3).

The probes:
- **Build, served at the base:**
  - first load, client navigation, search, and clicking a search result, each onto a colliding
    page as well;
  - logo, SDK download, the plugin page, a deep link through `404.html`;
  - the popover's "View as Markdown" link and the copy button, which only exist in the browser.
- **`portal serve` under the base:**
  - the printed link, client navigation, search, each onto a colliding page as well;
  - the plugin download;
  - an edit that moves the path: it is applied, and the old path is served until a restart.

## 7. Implementation steps

Each step is a commit of its own and stops for review. The tree builds and the suite is green
after each one. In all, roughly 400 lines of source and 500 of tests.

1. **CLI accepts the path, and Vite follows it.**
   - Changes:
     - `SiteAddress`, `SiteConfig`, identity `siteUrl`, the schema and its table;
     - the `portalPath()` rename;
     - `viteBase`, `vite.config.ts`;
     - `withBasePath` (5.2), because the served paths of 5.7 use it.
   - Tests:
     - the new unit tests, and the existing ones that refused a path (section 6);
     - `base-path.test.ts` and the contract test;
     - the `subpath` e2e fixture with step 1's assertions.
2. **The template's portal-relative strings.** Every other user in 5.2 and 5.3 (search results
   included), `llms.txt`, the robots rule, and the dev downloads middleware. Also `useImport`
   (5.1). With unit and e2e assertions, and `search-navigation.test.ts`.
3. **The static-cache plugin (5.6).** With its tests and e2e assertions, and the build probe:
   client navigation first works under a path in this step.
4. **`portal serve`, `portal generate` and the README (4.5–4.7).** With their tests, and the
   `portal serve` probe.
5. **Follow-up.**
   - a comment on apimatic-io#2275 saying what shipped and how it departs from the issue;
   - a ticket for the deferred Markdown copy links (section 9);
   - a ticket for the warning about files in `static/` that replace generated ones. It is wrong
     both ways:
     - It says `static/404.html` replaces the generated one, but the CLI copies the shell over
       the user's.
     - It names `robots.txt` (and `sitemap.xml`) even where none is generated: without
       `site.url`, and now under a path. `GENERATED_ROOT_FILES` lists them unconditionally.
     - Pre-existing, so not fixed here.
   - the TanStack comment of section 10, once the user has read it. The Fumadocs issue was filed
     by the user as fuma-nama/fumadocs#3620 and fixed in fumadocs-ui 16.15.17 (section 10).

## 8. Risks

- **TanStack's prerender stops treating an already-prefixed path as prefixed.** Every page would
  then be fetched with the base twice and 404, failing the build. The colliding `subpath` fixture
  would catch that on the upgrade that brings it.
- **Dependency upgrades.** Nothing here pins, patches or copies a Fumadocs or TanStack module.
  Every behaviour the path relies on either cannot break on an upgrade or fails CI when it does:

  | Relied on | On an upgrade that changes it |
  |---|---|
  | The page actions' Markdown URL | Cannot break: a full address is right whether Fumadocs adds the base or not (5.2) |
  | Markdown images are bundled | Cannot break: `useImport` is written out (5.1); the e2e image checks it |
  | Fumadocs links are router links | The e2e fails (step 1's link assertions) |
  | `llms()` reads the loader methods we wrap | The e2e fails (`llms.txt` links) |
  | Search navigates by `href`, stripped once | `search-navigation.test.ts` fails |
  | TanStack prefixes only an unprefixed listed path | The colliding e2e fixture fails |
  | TanStack's cache literal | The build fails, and the unit guard (5.6) |

  A failure is a stop on that upgrade, not a broken portal, and it names what to change.
- **A base of `/spa-shell` exactly.** TanStack's own prefixing of the shell path would leave it
  alone, and the shell would be prerendered from the home page. Deep links would briefly show the
  home page before hydrating. Not refused, since no one names a docs path after an internal route.
- **Hosts differ on `/docs` versus `/docs/`.** Canonical and the sitemap give the home page as
  `…/docs/`, the form that works everywhere.
- **Header links are portal-relative.** A user who writes `/docs/guides` for a portal at `/docs`
  gets `/docs/docs/guides`. No schema change is needed: the `link.url` description already reads
  "A page of the portal starting with '/'". The hosting guide says so as well.

## 9. Known limitations

**Links authors write stay unprefixed in the Markdown copies** (deferred, decision 10).
- A portal-relative link such as `[auth](/authentication)` is `/docs/authentication` in the page's
  HTML. It stays `/authentication` in the page's `.md` copy and in `llms-full.txt`, so an assistant
  reading the copy resolves it against the host's root.
- **The workaround:** write the full site address (`https://acme.github.io/docs/authentication`).
  It is right in both, at a cost. Fumadocs renders it as a plain `<a target="_blank">`, so in the
  HTML the link:
  - opens in a new tab and loads the whole page from scratch, with no client navigation or
    prefetch;
  - leads to the production site from `portal serve` or a staging host;
  - breaks if the portal moves.
- **Also not prefixed:** raw HTML and JSX URLs in MDX (an `<img src>` or `<a href>`), which are
  neither routed nor rewritten, in the HTML or in the copy. The docs say to use Markdown links and
  images.
- **For the follow-up**, two approaches were found:
  - **Preferred: an MDX `a` override.** A link whose href starts with `portal.siteUrl` has that
    prefix stripped and is handed to the router as a portal-relative path.
    - Authors write the full site address, which is right in the copies as it stands.
    - In the HTML it becomes a same-tab client navigation, under `portal serve` too.
    - It is one component compared at runtime, with no compile-time base and no Fumadocs
      Markdown internals.
    - The cost is that content hard-codes the portal's address.
  - **Alternative: rewrite the copies' links.**
    - Fumadocs' `remarkLLMs` takes mdast-to-markdown `handlers` through a collection's
      `includeProcessedMarkdown` options. Handlers for `link`, `image` and `definition` would
      prefix root-relative URLs in the copy alone.
    - Open: how the handlers learn the base, given that `source.ts` goes through
      `fumadocs-mdx/macro`, and which image nodes remain after `remarkImage`.

**API reference pages' Markdown copies keep the spec's own text:** its description and the YAML.
A root-relative link inside a spec description is prefixed in the page's HTML, which renders it
with the MDX components, but not in its copy.

## 10. Upstream

| Item | State (2026-09-29) | What it means for us |
|---|---|---|
| TanStack/router#6152, PR #5970 | Both open. A maintainer (2026-07-17): the cache URL "should follow Start's public asset base"; the PR builds the URL with `path.join` and needs an e2e served from a sub-path. | When it ships, delete 5.6. |
| fuma-nama/fumadocs#3620, from PR #3572 (ui 16.15.13) | Fixed 2026-09-29 in fumadocs-ui 16.15.17 (commit `6791d6f`): the popover prefixes `markdownUrl` with `withBasePath` again, in both `radix-ui` and `base-ui` | Nothing to undo. The full address we pass goes through that `withBasePath` unchanged, so it is right on 16.15.15 and on 16.15.17 (5.2). An upgrade needs no change here |
| TanStack/router#4888, docs PR #7882 | Docs only | None |

**The fixes:**
- **Fumadocs:** filed by the user as fuma-nama/fumadocs#3620, from the draft at
  `C:\repos\fumadocs-issue-view-as-markdown-base-path.md`, and fixed as it proposed.
- **TanStack** (drafted, not posted): first a comment on #6152, with our repro and a fix that prefixes only the client
  fetch in `fetchItem`: `fetch(import.meta.env.BASE_URL.replace(/\/$/, '') + url)`.
  - `getStaticCacheUrl` is left alone, since the writer joins it onto the client output directory.
  - It uses the Vite base rather than the router basepath, as the maintainer asked.
  - A PR, with the e2e case served from a sub-path that the maintainer asked for, follows only if
    a maintainer answers. That e2e case lives in their monorepo and costs more than the fix, and
    5.6 already covers us until then.

## 11. Hosting notes, for the docs

These are for the portal's hosting documentation, not the CLI. The CLI emits nothing
host-specific. A host's own files are the user's to put in `static/`, whose files are copied to
the output's root, dotfiles included (measured with `.nojekyll`, 2026-09-29).

| Host | Note |
|---|---|
| GitHub Pages | **Publishing from a branch runs Jekyll.** Jekyll drops every file and folder starting with `_`: `__tsr/` (every client navigation then shows the 404 page), `__downloads/` and `_shell.html`. Its optional-front-matter plugin, which cannot be disabled, renders the `.md` copies as HTML. Add an empty `static/.nojekyll`, beside the `static/CNAME` a custom domain needs, or deploy through GitHub Actions, which skips Jekyll. A project site serves its own `404.html` at any depth, with status 404, and redirects `/docs` to `/docs/`. |
| nginx | `location /docs/ { alias …; }` plus `location = /docs { return 301 /docs/; }` and `error_page 404 /docs/404.html`. Add `text/markdown md;` to `mime.types`, or the `.md` copies download. |
| Netlify | Nest the output under `docs/` in the publish directory or proxy it. `_redirects` is read only at the publish root. |
| Cloudflare Pages | 25 MiB per file (SDK zips, `llms-full.txt`). With no top-level `404.html` it assumes an SPA. |
| Vercel, S3 + CloudFront, Azure SWA | Nest the output under the path. Their error documents are set for the whole site, not per path. |

**Out of scope, pre-existing:** canonical links use the form without a trailing slash, which
GitHub Pages answers with a 301 to the slashed one.

## 12. Not done, and why

**A path without `site.url`.** This was decided against on 2026-09-29, to keep one source for
the path.

**One build for any path.** Neither framework supports it, and neither plans to:
- TanStack Start turns `base: './'` into `/./assets/…` and a basepath of `.`, and `''` into the
  root.
  - TanStack/router#5966 has no maintainer reply.
  - PR #7572 would still break nested pages.
  - Discussion #8496 (2026-09-25) has no replies.
- Fumadocs' `BASE_PATH` is a compile-time `import.meta.env.BASE_URL`, and its maintainer declined
  deriving `baseUrl` from it (fumadocs#2545).

A home-grown version would need all of these, and prerendered links would still point at the
host's root until JavaScript runs:
- per-page relative asset URLs through Start's experimental `transformAssets`, which breaks
  preloads after client navigation;
- a router `rewrite` computed at runtime (Start overwrites a `basepath` set in `getRouter`);
- a runtime value in place of every `BASE_URL`, Fumadocs' included.

## 13. Delivery

- **This plan:** one PR to `dev` from this branch, after step 5. The README line (4.7) goes in it.
- **The hosting guide (section 11):** a docs item, outside this repository.
  - It needs an owner on the docs side, named before the PR merges, so that the release notes can
    point at it.
  - Section 11 is written so the guide can reuse it. The guide also says to use Markdown links
    and images rather than raw HTML (section 9), and that header links are portal-relative
    (section 8).
  - Its GitHub Pages section matters for today's root-hosted portals too, since Jekyll breaks
    them just the same.
  - **Why the CLI doesn't write `.nojekyll`:** a CLI change that wrote it into every portal was
    drafted and dropped on 2026-09-29, to keep the CLI free of host-specific files. Nitro and
    Sphinx write it only when opted in (a `github-pages` preset, a `githubpages` extension), and
    Docusaurus tells users to add it to `static/`.

## 14. Where this departs from #2275

- **The base path is not a field.** It is not in `PortalIdentity` or `BuildPaths`; the template
  derives Vite's `base` from `siteUrl` (decision 3).
- **`portal serve` needs changes after all:** the address's slash and the restart list. The
  issue said none (4.5).
- **`prerenderPages` does not stay portal-relative.** The issue said it could. It hands TanStack
  served paths, so a colliding base builds (decision 6).
- **The quickstart note is unchanged** (decision 11).
- **Not in the issue:**
  - the static server-function cache (5.6);
  - colliding base paths (decision 6);
  - `llms.txt` links (5.4);
  - the SDK pages' Markdown copy links (5.2);
  - the page actions' full addresses and `pageUrl` (5.2);
  - search results (5.2);
  - `robots.txt` and the sitemap note (decision 7, 4.6);
  - the README line (4.7);
  - the address's character rule (4.1);
  - the dev middleware answering only under the base (5.8).

## 15. History

All on 2026-09-29. Where a later round reversed an earlier one, the later note says so.

**After an adversarial review:**
- The base path reaches the template through `siteUrl` alone.
- A path edit under `portal serve` is applied with a notice. (Replaced by the restart list after
  the cost review.)
- `SiteAddress` composes the origin and `BasePath`. (`BasePath` was folded into it after the
  review against the code.)
- The static-cache plugin is build-only.

**Deferring author links:** rewriting the links authors write in the Markdown copies is
deferred to a follow-up (decision 10, section 9).

**After a second round of research:**
- A base path that collides with page paths is made to work instead of refused. The CLI
  collision check is gone (decision 6, measured with base `/api`).
- The dev downloads middleware answers only under the base.
- Hosting notes are added (section 11).
- The upstream fixes are drafted (section 10).
- GitHub Pages' Jekyll problem is recorded (section 11).

**`.nojekyll`:** the CLI does not write it. A PR that wrote it into every portal was drafted and
dropped. Adding it is the user's, through `static/`, the way Docusaurus documents it, so the
CLI stays host-neutral (section 11).

**After reviewing the plan and its cost:**
- The prerender's served paths, the dev downloads keys and the cache literal go through
  `withBasePath` too, so the prefix rule has one home. The helper moves into step 1.
- `StaticAsset.siteUrl()` becomes `portalPath()`, so `siteUrl` names only the site address.
- The refusal messages are specified (4.1).
- A path edit under `portal serve` gets no notice of its own. The restart list names it, and the
  static-directory notice is left as it is (decision 9, 4.5).
- The README says `site.url` may carry a path (4.7).
- TanStack gets a comment on #6152 first, not a PR (section 10).
- The size and the CI cost are recorded (sections 6 and 7), and so is the fact that some fixes
  are checked only in a browser.

**After a full review against the code:**
- `BasePath` is folded into `SiteAddress` (4.1): with no notice to compare paths, Next Steps
  was its only user.
- The plugin install command changes only the browser's address (5.3). The earlier wording
  would have doubled the path in the prerendered page.
- `withBasePath` has no pass-through for absolute URLs, since no caller passes one (5.2).
- A test holds the template's Vite base to the CLI's path (section 6).
- The existing tests that refuse a path are listed (section 6).
- The browser checks move to steps 3 and 4 (section 7), and the dev one uses the colliding
  fixture.
- Also specified: the Next Steps wording (4.6), the cache plugin's failure check (5.6), the
  fixture's location (section 6) and the `://` check (4.1).

**After checking the dependency upgrade path** (before step 2): three Fumadocs behaviours the
path relied on would have broken silently on an upgrade, and a fourth was untested.
- The page actions get a full address, right whether Fumadocs adds the base or not (5.2). This
  replaces the popover prefix and the bare URL for the copy button.
- `search-navigation.test.ts` guards how search navigates (section 6).
- `useImport` is written out, and the fixture gains a Markdown image (5.1, section 6).
- Section 8 lists every behaviour relied on, and what happens on an upgrade that changes it.

**After reviewing steps 1 and 2** (before step 2's commit):
- The search results are memoised (5.2). A new array each render moved the highlight to the
  top, on root portals too.
- `fullAddress` moves into `base-path.ts`, and the plugin install command's snapshot uses it
  (5.2, 5.3), so the browser's address of a path is built in one place.
- The e2e check that nothing points outside the path also covers a content page and an API
  reference page (it passed).
- The contract test's wording says it has its own list of addresses (section 6).

**Step 3** (2026-09-30): the plugin as built runs `enforce: 'pre'` with a transform hook filter,
and its unit guard scans the package's `dist` for the literal (5.6). The build probe passed under
`/api` and at the root (section 3).

**Step 4** (2026-09-30): as specified in 4.5–4.7. The `portal serve` probe passed under `/api`,
path edit included (section 3).

**After reviewing all four steps** (2026-09-30), against #374's principles and the reviewer's bar:
- `SiteAddress.addressOf()` builds the addresses Next Steps names (4.1, 4.6).
- `SiteConfig`'s getter is `siteAddress()` (4.2).
- The Next Steps note at the root says its 404 sentence once.
- The plugin's comment is one line, and `llms.server.ts` has no single-use helper.
