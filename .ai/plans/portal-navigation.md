# Plan: Portal Navigation Control (`nav.json`)

Status: design agreed 2026-09-18, revised twice the same day: once after an
adversarial review of the first draft, once after the open questions were
settled. Follows on from `.ai/plans/fumadocs-portal.md`, which merged as #343
and whose section 3 this plan amends. Section 11 lists what is still open.

Implementation started 2026-09-21 on `saeedjamshaid/portal-navigation`, cut
from `dev` once #343 merged, and **finished 2026-09-22**: all six steps of
section 17 are done. Step 1 retired both unknowns (section 15 records what the
spike found), step 2 turned out to be already fixed by #343 (section 9), and
steps 3 to 6 were each committed on their own.

Two revisions worth knowing about when reading older notes:

- **The mechanism changed.** The first draft resolved `nav.json` in the CLI and
  injected generated metadata as an extra virtual source. That is now a
  page-tree transformer (section 5), which restores hot reload, makes page loss
  structurally impossible, and removes most of the first draft's machinery.
- **The injected content changed.** The first draft assumed two static
  generated pages. There is one, it is SDK-related, and its content is derived
  from a new `languages` property in `portal.json`. It also no longer lands in
  this change (section 1).

## 1. Goal and scope

Give the user control over sidebar order, and make room for Markdown pages the
CLI generates and injects rather than pages the user wrote.

One APIMatic-generated MDX page is injected at the content root. It does not
exist in the user's `src/`, its content is derived from the `languages`
property in `portal.json`, and the user may position it but not remove it.

A second generated page is already planned, and more may follow. It is
deliberately not specified here: the SDK page goes in end to end first, and the
second is added the same way once that path is proven. This is why the token in
section 3 is a group rather than a name, and why section 6 gives an unnamed
generated page a home instead of leaving it to sort alphabetically. Adding the
second page should touch the generator and nothing in the navigation code.

**This plan ships navigation only.** The SDK page, the `languages` property and
its subscription check land as a second change, because navigation ordering and
the API restructure are useful on their own and raise no entitlement
questions. The group token is reserved from the start and resolves to nothing
until the page exists, so the follow-up adds a page without touching the
navigation code.

In scope here: ordering the user's own content pages, reserving the position of
the injected pages, and positioning the API reference as one unit.

Out of scope: ordering individual API operations, and ordering tag groups
within a spec. Both stay as Fumadocs produces them (section 10). Deliberately
deferred, not blocked; the transformer never touches the per-tag metadata, so
either can be added later without rework.

## 2. Decisions (locked)

| Topic | Decision |
|---|---|
| Format owner | APIMatic. The CLI validates; the template applies. Fumadocs never interprets the file. |
| File name | `nav.json`, one per content directory. Not `meta.json`, and not `toc.json` (that name was just retired with `toc.yml`). |
| Shape | A `pages` array of strings. |
| Tokens | `apimatic:pages` for the injected pages, `apimatic:api` for the API reference. |
| Where the order is applied | A page-tree transformer in the template. Nothing is written into the user's `src/`, and nothing is generated into the build project. |
| Metadata collection | Restricted to `**/nav.json`, so no other JSON in the content directory is loaded (section 5). |
| Scope of control | Content pages, the injected pages, the API reference as one unit. No operation-level ordering. |
| Removal | Injected pages and the API reference cannot be removed, only positioned. Section 6 makes this structural. |
| Default when unnamed | Never hidden. Anything not named lands at the rest position, or at the anchor when there is no rest token. |
| API structure | Keep the `api` wrapper folder, title it "API Reference" in the transformer, and inline the spec level when there is exactly one spec. |
| Spec section labels | Derived from the spec filename, as today. Not from `info.title`. |
| Name collisions | Fail the build, naming both files. |
| Leftover `meta.json` | Ignore, silently. Ignoring is real, not nominal, because of the collection restriction above. (Revised 2026-09-22: the warning that named the file and asked for it to be renamed was removed, along with every other message that pointed from `toc.yml` or `meta.json` at `nav.json`. The CLI carries no migration messaging for navigation. A `nav.json` in the wrong case is still reported, because that is the new file itself.) |
| Config split | Client-safe fields stay in `portal.config.json`; absolute paths move to a server-only file (section 9). |
| Sequencing | Navigation first. The SDK page and a **required** `languages` property follow as a second change. |

Rejected, with reasons, so they are not revisited:

- **Exposing Fumadocs' `meta.json` directly.** The identifiers a user would
  have to write are derived internals: the slugified tag folder, and either the
  `operationId` or the slugified route plus method when a spec has no
  `operationId`. The injected page has no path in the user's `src/` at all.
  Unknown entries are also dropped in silence (section 10), so a typo or a
  renamed operation yields a quietly wrong sidebar and no error.
- **Keeping the name `meta.json` for our own format.** A shared name advertises
  semantics we do not implement, and the first token added already diverges.
  Customers have not been told about `meta.json`, so renaming costs nothing
  now and is a migration later.
- **Writing a generated `meta.json` into `src/content/`.** The user's `src/` is
  never copied (`PortalProjectService.prepare`), so this would put a generated
  file in a directory they keep in git.
- **Resolving the order in the CLI and injecting it as an extra virtual
  source.** This was the first draft's mechanism. Nothing in the Vite module
  graph would depend on `nav.json`, so editing it during `portal serve` would
  change nothing until the user restarted. Fumadocs watches metadata files
  natively, so this traded away the dev loop on the one file users iterate on
  most.
- **Alphabetical placement of the injected pages via the rest token.** The set
  grows. A second generated page would land in the middle of the user's own
  pages on a CLI upgrade, reordering a published sidebar nobody touched.
- **Flattening the `api` wrapper instead of the spec level.** The wrapper has a
  meaningful label available; the spec folder's title only restates the portal
  title. Collapsing the wrapper also made the API token a variable-length band
  instead of one node.
- **Relabelling spec sections from `info.title`.** The fixture shows why: its
  title is "Swagger Petstore - OpenAPI 3.0" against a portal title of "Swagger
  Petstore", while the filename already yields "Petstore". Filenames are
  shorter, predictable, and renaming the spec file is the escape hatch. This
  also removes the `update()` call the first draft needed.
- **Letting either side win a name collision.** Whichever way it goes,
  somebody's content is silently discarded, and reporting that after the fact
  is worse than refusing to build.

## 3. `nav.json`

One per content directory, all fields optional. The `pages` array drives order:

```json
{
  "pages": ["index", "apimatic:pages", "authentication", "apimatic:api"]
}
```

Entry forms:

| Entry | Meaning |
|---|---|
| `"apimatic:pages"` | all injected pages not named individually, in the CLI's own order |
| `"apimatic:api"` | the API reference, as one node |
| `"..."` | everything in this directory not named above, in its default order |
| `"authentication"` | that page or subfolder of this directory |
| anything else | reported as an error naming the file and the entry |

Both `apimatic:` tokens are only valid in the content root's `nav.json`, since
both resolve to nodes that live there. Naming either one in a nested directory
is an error. Until the SDK page ships (section 1), `apimatic:pages` is accepted
and resolves to nothing.

Errors are collected and reported together, in the style of
`PortalConfig.parse`, through the existing `invalidConfig` problem kind. The
CLI validates in `PortalSourceContext.resolve()`, which runs before
`PortalProjectService.prepare()`, so a bad file is always reported by us and
never by Fumadocs.

`pages` stays an array of strings. Fumadocs validates the file against
`metaSchema`, a plain Zod object that strips unknown keys and requires `pages`
entries to be strings. If a future extension ever needs a non-string entry,
the escape hatch is to override the collection's `schema` alongside its
`files` option, which costs a schema dependency in the template. Not worth it
for this scope.

## 4. The injected SDK page (second change, specified here for continuity)

The generated MDX has to be compiled by `fumadocs-mdx`, so it needs a real
directory, and it must not be the user's content directory.

The CLI writes the page into `<projectDirectory>/generated/` and substitutes a
second absolute-path placeholder into the template, exactly as
`CONTENT_DIRECTORY_PLACEHOLDER` already works for the user's content
directory. Reusing the placeholder mechanism rather than a relative literal
removes any question about what a relative `dir` resolves against.

**It must also add the generated page's name to the root's `childNames`.** Found
while implementing step 4. Section 6 says a `nav.json` may name an injected page
individually, and the transformer already does that. The CLI would refuse it:
`PortalSourceContext.navigation` builds `childNames` by walking `src/content/`
alone, so the generated page is not a name it knows and the entry is reported as
"not a page or folder in this directory". Latent while no generated page exists;
the moment one does, the two halves disagree and the build fails before the
transformer runs.

`languages` in `portal.json` becomes **required**, so the page always has
content and an empty collection never arises. That is a breaking change to the
`portal.json` schema. It is free if it lands before the next major releases,
and a second breaking change if it lands after, which is the main argument for
not letting this follow-up drift.

Both collections are passed to `loader()` with no `baseDir`, so the generated
page lands at the virtual root beside the user's content and is genuinely a
top-level page.

If the generated page and a user page resolve to the same virtual path, the
build fails, naming both files.

One thing still to verify before this is locked: that two `defineDocs` calls
coexist in one template. It is a short check against the existing template, not
a spike.

## 5. How the order is applied

A single page-tree transformer, registered through the loader's
`pageTree.transformers` option in `source.server.ts`.

Its `folder` hook fires for every directory, including the root at the empty
path, and fires after that directory's children are built. So the transformer
never resolves anything. It receives a child list that Fumadocs has already
ordered correctly and permutes it.

- Read the directory's file with
  `this.storage.read(this.builder.resolveFlattenPath(joinPath(folderPath, 'nav'), 'meta'))`.
  The builder registers every stored file under its path and format, so this
  resolves `nav` to `nav.json` without hard-coding the extension.
- Match an entry to a child through the same helper: a page entry resolves to
  a virtual path compared against the child's `$ref`, a folder entry against
  its `$ref.folder`. This depends on `noRef` staying at its default of false,
  which the template does not override.
- Emit named children in the order given, and splice everything else in at the
  rest token's position, or at the anchor from section 6 when there is no rest
  token.

Because `nav.json` is a member of the watched metadata collection, editing it
during `portal serve` invalidates the source module and the tree rebuilds. That
is the expected behaviour of the same machinery that reloads metadata files
today, and it is the reason for this mechanism; confirm it in the dev server
during implementation.

**Restrict the collection to our file.** Pass `files: ['**/nav.json']` to the
metadata collection in `defineDocs`. Without it, Fumadocs loads every JSON file
in the content directory, and a leftover `meta.json` would be honoured as a
folder's metadata before the transformer ever ran. Since a metadata file
without a rest token hides unlisted pages, the transformer could not recover
them, so "ignore the leftover file" would be nominal rather than real. With the
restriction, the file is never loaded, the CLI's warning is accurate, and
unrelated JSON in the content directory stops being validated against a schema
that has nothing to do with it.

The CLI says nothing about a `meta.json` found under `src/content/`: it is one
more file the build does not read (section 2 records why the warning first
planned here was dropped). The quickstart scaffold writes `nav.json`
(`PortalQuickstartAction.scaffold`).

## 6. Defaults

Nothing can disappear, and this is a property of the mechanism rather than a
validation rule. The transformer permutes an existing child list, so a page
absent from `pages` has nowhere to vanish to. It lands at the rest position, or
at the anchor when there is no rest token.

- No `nav.json` anywhere: Fumadocs' own order, which is the user's pages
  alphabetically with `index` first, then the injected pages, then the API
  reference.
- A `nav.json` that omits `apimatic:pages`: the injected pages appear at the
  anchor, after the user's content and before the API reference.
- A `nav.json` that omits `apimatic:api`: the API reference appears last.
- A `nav.json` that names an injected page individually: it goes where it is
  named, and anything else collects at the anchor. So a page added in a later
  release always has a home, and never splits the band.
- A `nav.json` that omits `index`: the home page still appears. Worth stating
  because the fallback home page described in the portal plan's section 3 was
  never implemented, so `/` depends on the user's own `index` page surviving.
- A `nav.json` below the content root that names `index`: refused, because a
  folder's index page is the folder's own link rather than one of its children
  and no position among them would be applied (section 10). At the content
  root `index` is an ordinary child and is ordered like any other page.
- Before the SDK page ships: `apimatic:pages` resolves to nothing and is not an
  error, so a `nav.json` written today keeps working when the page arrives.

## 7. API reference structure

Handled in the same transformer's `folder` hook, which fires for `api` after
its children are built. No metadata file is emitted anywhere.

- Name the folder "API Reference". Fumadocs derives an untitled folder's name
  by uppercasing the first character only, so `api` would render as "Api",
  which reads as a typo.
- When there is exactly one spec, replace the folder's children with that one
  child's children, so the spec level and its redundant title never show.
- With two or more specs, leave the spec folders in place. They keep their
  filename-derived labels, and alphabetical path order equals slug order equals
  filename order, which matches what the portal plan's section 3 already
  describes.

Adding a second spec then inserts a level rather than renaming anything:

```
API Reference                       API Reference
  Pet                  becomes        Petstore
  Store                                 Pet
  User                                Billing api
                                        Invoices
```

The second label there is what the filename `billing-api.json` yields. It is
not beautiful, and it is the trade accepted in section 2: predictable, free,
and fixed by renaming the file.

## 8. Worked example

`src/spec/petstore.json` (the `test-source` fixture), `src/content/index.md`,
`src/content/authentication.md`, and the injected SDK page once the follow-up
change lands. Its title below is a stand-in.

`src/content/nav.json`:

```json
{
  "pages": ["index", "apimatic:pages", "authentication", "apimatic:api"]
}
```

```
Welcome                                       content/index.md
SDKs                                          generated, from portal.json languages
Authentication                                content/authentication.md
API Reference                                 api/
  Pet
    Add a new pet to the store.
    Update an existing pet.
    Finds Pets by status.
    Finds Pets by tags.
    Find pet by ID.
    Updates a pet in the store with form data.
    Deletes a pet.
    Uploads an image.
  Store
    Returns pet inventories by status.
    Place an order for a pet.
    Find purchase order by ID.
    Delete purchase order by identifier.
  User
    Create user.
    Creates list of users with given input array.
    Logs user into the system.
    Logs out current logged in user session.
    Get user by user name.
    Delete user resource.
    Update user resource.
```

Shipping navigation alone, the same file yields the same tree without the SDKs
row.

URLs are unaffected by any of this, because they come from page slugs rather
than tree position. An operation still resolves at `/api/petstore/pet/addPet`.

## 9. Config split, and an absolute-path leak that already exists

**Superseded 2026-09-21: #343 fixed this before this plan reached it**, by a
different route than the one below. Rather than splitting the file in two, it
substitutes a `__APIMATIC_PORTAL_IDENTITY__` literal into `portal.ts` the same
way `source.ts` already took the content directory, and moved `specs` behind a
new `portal.server.ts`. `vite.config.ts` and `prerender-pages.ts` read the JSON
through `node:fs`, and `vite.config.ts` refuses a client import of any
`*.server.*` module outright. So no client module imports `portal.config.json`
any more and the outcome this section wanted is achieved.

What is left of this section is the regression test alone: assert that no
absolute build path appears in `dist/client` (section 14). The rest of the
section is kept as the record of why the fix was needed.

The original finding follows.

`portal.config.json` today holds `specs`, `contentDir` and `staticDir`, all
absolute paths on the author's machine. `portal-template/src/lib/portal.ts`
imports that file as a default import, and both `routes/__root.tsx` and
`routes/$.tsx` import `portal.ts`, so it is client code.

A default-imported JSON object cannot be tree-shaken per property. Verified
2026-09-18 against the pinned Vite 8.2.2, with a module that reads one field of
a four-field file:

```js
var portal = { title: {
	title: "Swagger Petstore",
	specs: { "petstore": "C:/repos/secret-local-path/src/spec/petstore.json" },
	contentDir: "C:/repos/secret-local-path/src/content",
	staticDir: "C:/repos/secret-local-path/src/static"
}.title };
```

So published portals very likely ship the author's local filesystem paths. This
predates this plan and should be fixed here rather than worked around, because
this plan would otherwise add more server-only data to the same file.

- `portal.config.json` keeps only what the browser needs: `title`,
  `description`, `logoUrl`, `siteUrl`. Client routes use only the first two;
  `logoUrl` is read by `lib/layout.shared.tsx` and `siteUrl` by `lib/seo.ts`.
- A second file carries the server-only fields: `specs`, `contentDir`,
  `staticDir`. Read it the way `portal-config.ts` already reads its own file,
  from `node:fs`, and only from `.server` modules, `vite.config.ts` and
  `prerender-pages.ts`. `specs` has exactly one consumer today,
  `lib/openapi.server.ts`.
- Confirm the fix by grepping the built client output for the build directory,
  and keep that assertion (section 14).

## 10. Verified Fumadocs and Vite behaviour

Read from the pinned `fumadocs-core@16.15.8`, `fumadocs-mdx@15.4.0`,
`fumadocs-openapi@11.4.1` and `vite@8.2.2` on 2026-09-18. Recorded so none of
it is rediscovered, and so an upgrade knows what to re-check.

Everything below down to the Vite entry was read from the source. The entries
marked **(ran it)** were additionally observed in a running dev server on
2026-09-21, against the `test-source` fixture prepared through
`PortalProjectService.prepare`, with a spike transformer and a route dumping
`source.pageTree`. Same pinned versions.

- **All sources share one flat virtual filesystem.**
  `createContentStorageBuilder` scans every source into a single map, prefixing
  each file with that source's `baseDir`. Content lands at the virtual root;
  API pages land under `api/<slug>/`.
- **Later writes win.** `FileSystem.write` sets the entry unconditionally, and
  sources are scanned in the order their keys appear in the object passed to
  `loader()`. The portal plan records the same behaviour from the other
  direction at its section 4, where sharing one API server across base
  directories clobbered the root metadata.
- **Transformers expose `file`, `folder`, `separator` and `root` hooks**, each
  with `this.storage`, `this.builder` and `this.options`. `folder` fires after
  a directory's children are built, and the root folder is one of them. This is
  the whole basis of section 5. **(ran it)**
- **The root `folder` hook fires twice, and the second time is a trap.**
  **(ran it)** `generateFallback` defaults to true, which registers
  `transformerFallback`. It records every file that became a node through its
  own `file` hook, then builds a second tree from whatever is left over. A
  metadata file never becomes a node, so `nav.json` is *always* left over and
  the fallback pass therefore *always* runs. Our `folder` hook is called again
  for the root, with an empty child list and a storage holding `nav.json`
  alone, and every entry in `pages` fails to match. Harmless as long as the
  transformer permutes what it is given, but it must not treat an unmatched
  entry as an error at transform time, and it should skip the pass outright:
  the context carries `custom._fallback === true`, which is how the fallback
  transformer itself detects re-entry.
- **`resolveFlattenPath(joinPath(folderPath, 'nav'), 'meta')` behaves as
  section 5 needs.** **(ran it)** At the content root it resolves to
  `nav.json`; for a directory with no nav file it returns the path unchanged,
  so `storage.read` returns `undefined` and the hook falls through. The
  extension is never hard-coded.
- **`$ref` survives on tree nodes.** **(ran it)** `Item.$ref` is the page's
  virtual path (`index.md`), `Folder.$ref.folder` is the folder's
  (`api/petstore`). Both are what section 5 matches entries against.
- **Editing `nav.json` reloads the tree during `portal serve`.** **(ran it)**
  Changing the array to `["authentication", "...", "index"]` moved the sidebar
  from `Welcome | Authentication | SDKs | Api` to
  `Authentication | SDKs | Api | Welcome` with no restart: named entries in
  order, the remainder spliced in at the rest token, `index` last. This is the
  behaviour section 5 was designed around.
- **Two `defineDocs` collections coexist in one template.** **(ran it)** A
  second collection over a separate directory, passed to `loader()` with no
  `baseDir`, put its page at the virtual root beside the user's content and
  served it at `/sdks`. Section 4 depends on this.
- **`files: ['**/nav.json']` is a real restriction, not a nominal one.**
  **(ran it)** With it, a `meta.json` sitting beside `nav.json` changes nothing
  about the tree. Without it, that same `meta.json` is honoured and collapses
  the sidebar to `index` alone, because a metadata file with no rest token
  hides everything it does not name. `meta.json` wins over `nav.json` because a
  folder's metadata is only ever read as `meta.meta`. This is the negative
  control behind section 5's "ignoring is real, not nominal".
- **The API wrapper renders as "Api".** **(ran it)** Confirms the rename in
  section 7 is needed rather than cosmetic.
- **A folder's `index` page is not one of its children.** **(ran it)** Below
  the content root, `buildFolder` puts `index.md` in the folder node's `index`
  property, and the folder then takes that page's title as its own name. It
  never appears in `children`, so a transformer that permutes `children` can
  neither find it nor lose it. Observed with `content/guides/`: a `nav.json`
  of `["intro", "index", "advanced"]` ordered the two real children and left
  `index` unmatched. The content root is exempt, because a root folder gets no
  index node and lists `index` as an ordinary child.

  Two consequences. The CLI refuses `index` in a `nav.json` below the content
  root, since no position there could be honoured (section 6). And if the
  ordering is ever wanted, the mechanism is Fumadocs' own: an explicitly named
  entry claims a node at priority 2, which outranks the priority 0 of the
  index slot and moves the page into `children` -- at the cost of the folder
  no longer linking to it. Deliberately not done.
- **Stored files are indexed by path and format.** The builder walks the
  storage once and maps `<path without extension>.<format>` to the full path,
  which is what `resolveFlattenPath` looks up. A folder's metadata is only ever
  read as `meta.meta`, so a file named `nav.json` is loaded but never
  interpreted as folder metadata.
- **A collection's `files` option is a picomatch glob list**, matched against
  the path relative to the collection directory, and it replaces the default
  rather than adding to it. The default for metadata is every `.json` and
  `.yaml` file. This is what makes the restriction in section 5 possible.
- **Metadata is validated by `metaSchema`**, a plain Zod object: unknown keys
  are stripped and `pages` entries must be strings. Overridable per collection
  through `schema`.
- **A reference can relocate a node.** An entry named explicitly in a `pages`
  array claims its node at priority 2, which outranks the priority 0 of default
  parenting. So a metadata file can pull a node out of a nested folder.
- **Naming a nested path leaves the parent behind.** Naming `api/petstore`
  while keeping `...` produces an empty `api` folder, because the rest
  expansion still finds `api` but its only child is already claimed. Recorded
  because it rules out the obvious alternative to section 7.
- **Fumadocs' own token vocabulary**, should a pass-through ever be wanted:
  `...` for the rest, `z...a` for the rest reversed, `...folder` to inline a
  folder's children, `!name` to exclude, `---Label---` for a separator,
  `[Label](/url)` for an arbitrary link, and a leading `[icon]` on any of them.
- **Unknown entries are dropped in silence.** `resolveFolderItem` returns
  without a word when a name resolves to nothing. One of the two reasons the
  CLI owns validation.
- **`defineDocs` reads metadata only through the plural runtime.** The macro's
  `docs`/`docsAsync` variants pass their metadata entries through; the
  single-collection `doc`/`docAsync` variants pass an empty array. The
  template's `defineDocs` with `docs: { async: true }` compiles to `docsAsync`,
  so metadata is picked up today.
- **Default ordering without a metadata file** is `localeCompare` on the file
  path, with `index` forced first and folders sorted after pages. It is not by
  frontmatter title.
- **The global root is treated as a root folder**, so it gets no automatic
  index node; `index` is an ordinary child there.
- **Operation labels are the spec's summaries verbatim**, falling back to the
  path item summary, then a prettified `operationId`, then the route. Every
  label in section 8 ends in a period because the fixture's summaries do.
- **Method order is Fumadocs', not the document's.** It walks get, post, patch,
  delete, head, put. So "Add a new pet" precedes "Update an existing pet" even
  though the fixture lists `put` on `/pet` first.
- **Tag group order is first appearance while walking `paths`**, not the order
  of the document's `tags` array. That array only supplies display titles,
  descriptions, nesting through `parent`, and the `kind` filter. Reordering it
  does not reorder the sidebar.
- **Tag folder titles** come from `x-displayName`, then `summary`, then the tag
  name prettified.
- **Spec folder titles are undefined in the metadata the API source emits**,
  because there is no parent group at that level, so they fall back to the
  slugified filename. Section 7 keeps that fallback deliberately.
- **Vite inlines a whole JSON module for a default import** and cannot shake
  unused properties out of it. Verified as shown in section 9.

## 11. Open questions

1. **The SDK page's slug and title.** Needed for the collision message, the
   scaffold comment and the tests. Belongs to the second change, but the
   navigation tests need a stand-in until then.
2. **When the second change lands relative to the next major release.**
   Required `languages` is free before it and a second breaking change after
   (section 4).
3. **The content directory's absolute path is published.** Found in step 6, by
   the very assertion section 14 asked for. `defineDocs({ dir })` compiles the
   directory into the client bundle as its `base`, so a built portal carries a
   string like `C:/Users/<name>/<project>/src/content` in `assets/dist-*.js`.
   The specification paths do not leak — `portal.server.ts` holds those and the
   assertion proves it — so this is the one thing #343's split did not cover,
   and section 9 assumed it had. `src/lib/source.ts` cannot move behind
   `.server`, because the browser imports it to lazy load page bodies, and a
   relative `dir` is not a drop-in: `PortalProjectService` substitutes the same
   literal into the stylesheet, where it resolves against a different
   directory. The e2e test records it as pending rather than asserting it.
   Decide whether a published portal may name the build machine at all.

Deferred, to be decided when the SDK page is built rather than now:

- **Whether the SDK page stays one page as the language count grows**, or
   becomes a folder with a page per language. This is a real decision and it
   will have to be made, but it belongs to the second change and nothing in the
   navigation work depends on the answer. The token is a group, so it expands
   to one page or to a folder's worth without either the format or the
   transformer changing. Decide it against how a portal with several languages
   actually reads, which is easier to judge once the single-language page
   exists.

Deliberately not open: what the second generated page is. It is answered when
the SDK page is working end to end, and nothing in this plan depends on the
answer.

## 12. Changes to `.ai/plans/fumadocs-portal.md`

Amend once this is implemented, not before:

- Section 3's input layout comment, which describes `content/` as holding an
  "optional meta.json per folder (Fumadocs format)".
- Section 3's closing paragraph on sidebar order, which says content pages come
  first in `meta.json` order, then one section per spec file. Both the file and
  the structure change.
- Section 3's note that folders without `meta.json` are ordered alphabetically,
  which stays true but for `nav.json`.
- Section 3's promise of a generated fallback home page, which was never
  implemented; either build it or drop the claim.
- Section 3's note that a `languages` section "will be added later and checked
  against the subscription", which becomes a required property in the second
  change (section 4 here).

## 13. Code to touch

Navigation change:

- `src/types/portal-source-context.ts`: discover and read `nav.json` through
  the content tree; warn on a leftover `meta.json`.
- New value object for a validated navigation, per `.ai/skills/value-object.md`,
  parsing in the style of `PortalConfig.parse` and reporting every bad entry.
- ~~The four config-split entries that were here~~ are done: #343 covered them
  (section 9). The `dist/client` assertion it was to carry landed in step 6.
- `portal-template/src/lib/source.server.ts`: the transformer registered
  through `pageTree.transformers`, and `files: ['**/nav.json']` on the metadata
  collection in `source.ts`.
- New template module for the transformer itself.
- `src/actions/portal/quickstart.ts`, `scaffold`: write `nav.json`, not
  `meta.json`.
- ~~`src/commands/portal/toc/new.ts`: its removal message must name
  `nav.json`.~~ **Stale, found in step 6.** #343 removed `portal toc new`,
  `portal recipe new` and `portal copilot` outright rather than leaving hidden
  stubs, so there is no file and no message. The same mistake is corrected in
  section 16.
- `src/commands/portal/serve.ts` and `src/prompts/portal/serve.ts`: both tell
  the user that editing the order file needs the preview restarted, which is
  the opposite of what the transformer buys (section 15). It reloads; adding
  or removing a page and editing `portal.json` still do not.

Second change, additionally:

- `src/types/portal/portal-config.ts`: `languages`, required.
- `src/infrastructure/portal-project-service.ts`: write the generated page into
  `<projectDirectory>/generated/` and substitute its path placeholder.
- `portal-template/src/lib/source.ts`: the second `defineDocs`.

## 14. Tests

- Value object: every invalid entry form reported, tokens rejected in a nested
  directory, both tokens absent still placing their nodes, `apimatic:pages`
  accepted while it resolves to nothing.
- Transformer: defaults with no `nav.json`, a partial `nav.json`, a page absent
  from `pages` still appearing, and the rest token honoured where it sits.
- API structure: one spec inlined under the "API Reference" wrapper, two specs
  keeping their filename-derived folders.
- Collection restriction: a `meta.json` beside a `nav.json` changes nothing
  about the built tree, and the CLI warns about it.
- Fixtures: rename `test-source/src/content/meta.json` and
  `test/resources/portal-inputs/default/content/meta.json` to `nav.json`, and
  add a fixture that still has a `meta.json` so the warning path is covered
  rather than assumed.
- End-to-end, extending `test/e2e/portal-build.test.ts`: assert the built
  sidebar order for the `test-source` fixture, that operation URLs are
  unchanged by the restructure, and that no absolute build path appears
  anywhere in `dist/client` (section 9). **The last of these does not hold**:
  the specification paths and the project directory stay out, and that much is
  asserted, but the content directory is published. Section 11, question 3.
- Second change: collision between the generated page and a user page fails the
  build naming both files.

## 15. Risks

- ~~**The hot reload this design is built on is unconfirmed.**~~ **Retired
  2026-09-21 (step 1).** Editing `nav.json` reorders the sidebar with no
  restart, so the transformer keeps the advantage it was chosen for. See
  section 10.
- ~~**Two `defineDocs` collections in one template is unconfirmed.**~~
  **Retired 2026-09-21 (step 1).** They coexist, and the second collection's
  page lands at the virtual root as section 4 assumes. See section 10.
- **The transformer leans on three things Fumadocs does not document as public
  API**: `$ref` surviving on tree nodes, which depends on `noRef` staying at
  its default, `builder.resolveFlattenPath` remaining reachable from a
  transformer context, and `custom._fallback` remaining the way to detect the
  fallback pass. All three were observed working on 2026-09-21, and a Fumadocs
  upgrade could take any of them away. The end-to-end sidebar assertion in
  section 14 is what would catch the first two; a fallback pass that stopped
  being skipped would not fail a test, which is why the transformer must also
  be harmless when it runs.
- **Restricting the metadata collection to our file alone** means any future
  Fumadocs feature that expects to read other metadata files stops working
  silently. Accepted, because without the restriction a stale `meta.json` is
  applied before the transformer runs (section 5), but it is worth re-reading
  on each upgrade.
- **Required `languages` is a breaking change** to `portal.json`, free only
  while the next major is unreleased (section 4).
- ~~**The config split touches files the open PR already rewrites.**~~ Moot:
  #343 merged, and it did the config work itself (section 9).

## 16. Delivery

**Decided 2026-09-18: wait for PR #343, then branch from `dev`.** This plan is
committed on `saeedjamshaid/fumadocs-portal` so it travels with the work it
follows on from, but no implementation happens there. Once #343 merges, the
execution branch is cut from `dev`.

**Done 2026-09-21.** #343 was squash-merged to `dev` as `073d09a`, and
`saeedjamshaid/portal-navigation` is cut from that commit. Waiting turned out
to be worth more than the wall-clock argument below: #343 also did the
section 9 config work, which this plan would otherwise have duplicated and
then had to reconcile.

As of 2026-09-18 that branch is 37 commits ahead of `origin/dev` and #343 has
not merged. Every file the navigation work touches is already rewritten on it,
which is what settled the decision:

```
portal-template/portal-config.ts
portal-template/src/lib/source.server.ts
src/actions/portal/quickstart.ts
src/commands/portal/toc/new.ts
src/infrastructure/portal-project-service.ts
```

Stacking would have made an already-large PR larger and mixed a reviewed
feature with an unreviewed one, for no gain in wall-clock time given #343 is
already open.

**The branch is not mergeable before step 6.** Found while implementing step 3
and not anticipated above; **resolved 2026-09-22** when step 6 landed. The steps in section 17 are each reviewable on their
own, but they are not each shippable: until the transformer and the scaffold
change land, `meta.json` is still what orders the sidebar and `nav.json` is
read by nothing, so the CLI's warning tells the user to rename the one file
that currently works. Adding `files: ['**/nav.json']` early does not fix it
either, since `nav.json` only means anything once the transformer exists. Merge
the whole change or none of it.

**Breaking change footer.** Replacing `meta.json` with `nav.json` needs no
footer of its own as long as it lands before the next major ships, since the
old name was never released. It becomes a breaking change if it lands after.
The same timing argument governs required `languages` (section 4), which is the
stronger reason not to let either drift.

**README.** `portal generate` and `portal serve` have generated sections in the
README. If either description gains a mention of `nav.json`, run `pnpm readme`
in the same change. ~~`portal toc new` is hidden, so its corrected message
never reaches the README.~~ **Wrong, found in step 6:** that command does not
exist at all. What the README does carry by hand is the 2.0 change list, which
named `meta.json`; step 6 corrects it alongside the generated section.

## 17. Implementation steps

Ordered so that the riskiest unknowns are retired before anything is built on
them, and so each step stands alone.

1. ~~**Retire the two unknowns.**~~ **Done 2026-09-21.** Both hold; section 10
   records them, along with three things the spike found that this plan had
   not anticipated.
2. ~~**Config split and the leak fix.**~~ **Done by #343** (section 9). The
   `dist/client` assertion it was to carry moves to step 6 with the other
   tests, since nothing can regress until the template changes.
3. ~~**The format and its validation.**~~ **Done 2026-09-21.** The `nav.json`
   value object, discovery through the content tree, and the `meta.json`
   warning. CLI only, no template changes, so it is testable without a build.
4. ~~**The transformer.**~~ **Done 2026-09-22.** Ordering, both tokens, and
   `files: ['**/nav.json']` on the metadata collection.
5. ~~**API structure.**~~ **Done 2026-09-22.** The "API Reference" title and
   single-spec inlining, in the same transformer.
6. ~~**Surfacing.**~~ **Done 2026-09-22.** Fixture renames, the `dist/client`
   assertion from step 2 — which failed and became section 11's third open
   question — the serve copy, the `APIMATIC-BUILD.json` migration
   note, the README by hand and through `pnpm readme`, and section 12's
   amendments to `.ai/plans/fumadocs-portal.md`. The quickstart scaffold was
   already covered by step 3, and `portal toc new` turned out not to exist
   (section 13).

The second change then follows on its own: `languages` as a required property,
the generated SDK page, and the collision failure.
