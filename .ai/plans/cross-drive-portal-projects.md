# Plan: build every portal project in the temp directory

Status: designed 2026-10-16 on `saeedjamshaid/cross-drive-portal-styles`, cut from `origin/dev` at
`0faa568b`. Fixes apimatic-io#2301. A prototype of every change below was built and measured the
same day (section 4); this plan turns it into the change and its tests. Approved by the user on
2026-10-16, with the title in section 12.

## 1. Goal and scope

A portal built or previewed from an input on any Windows drive is the portal the same input gives
on the temp directory's drive: the same stylesheet, the same images, and nothing written into the
input folder.

- **In scope:** the cross-drive fallback that stages the project in `<input>\.apimatic-build\`, the
  two upstream bugs it was dodging, and the Tailwind `@source` line that only that fallback needed.
- **Out of scope:** sources on a network share (section 10), and any other change to how the
  project is laid out.
- **Invariant:** on macOS, Linux and same-drive Windows, `portal generate` writes the same files as
  today. `portal serve` differs only in the address a page's static image loads from:
  `/images/logo.png` (under the base) instead of `/@fs/<path>`.

## 2. Cause (verified 2026-10-16)

When the input is on another drive than `%TEMP%`, `portalProjectDirectoryBase` stages the project
in `<input>\.apimatic-build\tmp-*` and writes a `.gitignore` of `*` there
(`src/infrastructure/tmp-extensions.ts:35-62`, since #343). Vite runs with the project as its
working directory. Tailwind's scanner (Oxide 4.3.3, `crates/oxide/src/scanner/sources.rs`) then
handles the project root in one of two ways:

- **Outside a git repository** it looks for an ignoring `.gitignore` only up to the directory that
  holds the working directory, so the `*` never promotes the project. Its file walker still applies
  the `*`, and it reads 0 files. The 24 utilities only the template uses are missing, which is the
  report.
- **Inside a repository** it walks up to the repository root, finds the `*`, and promotes the
  project to an "external" source. That scans everything, linked `node_modules` included: 561
  stray utilities, 93 KB → 134 KB. GitHub's Windows runner builds our own e2e portals this way.

`@source '../../content'` scans nothing in the first case either. Explicit globs reach only the
files directly in `src/`: every subfolder still matches the `*` (section 3, D5).

The fallback dates from #343, when fumadocs-mdx imported content pages by a path relative to the
project. Since #375 the content is copied into the project. What remains are two upstream Windows
bugs:

1. **fumadocs-core `remarkImage`** imports a static image by `path.relative(pageDir, file)`. Across
   drives that returns the absolute path, which `getImportPath` still prefixes with `./`
   (`./D:/site/src/static/x.png`). A build only works by accident: Vite reads it as `D:site/...`, a
   path relative to drive D:'s current directory, and the Vite child, whose environment is
   filtered, has none. Not reported upstream; still on fumadocs `main`.
2. **Vite's dev server serves no raw file from another drive.** `/@fs/D:/x.png` drops the drive
   and is served from the working directory's drive (vitejs/vite#12816, closed as not planned in
   favour of #10802, open). Without the fallback, `portal serve` answers the image with its HTML
   page.

## 3. Decisions (2026-10-16)

- **D1. One place for every portal project: the system temp directory.**
  - `prepare-project.ts` stages it with `withDirPath`, as every other temp directory is staged.
  - The fallback goes, with its `*` `.gitignore` and the shared-folder clean-up.
  - On macOS, Linux and same-drive Windows this changes nothing: they already staged there.
- **D2. One template plugin, `static-images.ts`, for a page's static images.**
  - It works around both upstream bugs of section 2, one hook each.
  - *Resolve* (build and serve): the `./D:/…` or `.///server/share/…` specifier is resolved as the
    absolute path it is.
  - *Load* (serve only): a plain asset import from the static directory becomes its public address
    (`withBasePath`). Vite serves its public directory from any drive.
- **D3. The public address on every drive and OS** (the user's choice, 2026-10-16). One behaviour,
  so the macOS and Linux serve tests cover it. Same-drive previews stop using `/@fs/` for static
  images. A query such as `?raw`, or a non-asset import, stays Vite's to answer.
- **D4. `app.css` drops `@source '../../content'`.**
  - The copy is inside the project, so Tailwind's own scan reads it: a page's class survived on
    every build in section 4 without the line.
  - The unit test that held the literal is replaced by an e2e check that a page's class reaches
    the stylesheet. That is the contract the literal stood for.
- **D5. Rejected:**
  - *Explicit sources* (`source(none)` and globs): the `*` still hides every subfolder of `src/`.
    Measured: 24 classes still lost.
  - *Dropping the `.gitignore`*: the folder shows in `git status` for a whole `serve` session, and
    the user's own ignore rules then apply to the staged files. A user who ignores
    `.apimatic-build/` brings the over-scan back.
  - *Running Vite from another working directory*: that promotes the project to an external source,
    which is the over-scan again.
- **D6. Kept:**
  - The static directory stays in `server.fs.allow`. A page's `?import` request for its image still
    goes through `/@fs/`, and Safari can send it before the page (#2287).
  - `COPIED_DEPENDENCIES` stays: it is about the CLI's install drive, which this does not move.

## 4. What was verified (2026-10-16, prototype)

The prototype switched the fallback off and added the plugin; `app.css` was as D4. Every
stylesheet was compared class for class with `dev`'s C: build of the same fixture
(`app-CtmRnplB.css`). The fixture is src (52) from #2301, plus static images (inline and
reference-style), a page-relative image, a page with a utility class, a logo, and nav links.

| Case | `dev` | Prototype |
|---|---|---|
| Build, input on a USB drive (D:), no git | `app-CRXAw9v0.css` (#2301's, byte for byte), 25 classes lost | `app-CtmRnplB.css`, 0 lost, 0 gained |
| Same, input in a git repository | 561 classes gained | `app-CtmRnplB.css`, 0 lost, 0 gained |
| Build from a `subst` drive, with and without git | 24/25 lost; over-scan in git | identical to C: |
| `serve` from D: | template classes lost | image `200 image/png` from `/images/shot.png`; logo; full stylesheet |
| `serve` from D: under `site.url` `/docs/` | — | image from `/docs/images/shot.png` |
| Without the plugin, fallback off, from D: | — | build works by the drive-relative accident; `serve` answers the image with HTML |
| Editing a static image under `serve` | full reload | full reload |
| Portal e2e suite, input on D: | — | 66/67 |
| Portal e2e suite, project on D:, the CLI's dependencies on C: | — | 66/67, #2287's dependency test included |
| Headless Chrome, same layout: `/sdks`, `/images` | — | 0 failed requests, images loaded, `end-1.5` applied |
| CI's Linux job in Docker (`node:24`, as the `node` user), unit + e2e | 1917 passing | 1916 passing |

The one e2e failure asks the dev server for a static image's raw `/@fs/` address, which pages no
longer use (7.2 rewrites it). The one Linux failure is the unit test holding the `@source` literal
(7.1 removes it).

Not run: macOS (CI's job and a Safari check, section 8 step 5) and a source on a network share.

## 5. CLI changes

1. **`src/infrastructure/tmp-extensions.ts`.**
   - Delete `PORTAL_PROJECT_DIRECTORY_NAME`, `portalProjectDirectoryBase`,
     `ensurePortalProjectDirectoryBase`, `withPortalProjectDirectory`,
     `removePortalProjectDirectoryBase`, and the imports only they use.
   - `canonical` and `withDirPath` stay.
2. **`src/actions/portal/prepare-project.ts:101`.**
   - `withPortalProjectDirectory(sourceDirectory, …)` becomes `withDirPath(…)`.
   - No prompt, message, flag or README text changes: none mentions the folder.

## 6. Template changes

1. **`portal-template/static-images.ts`** (new, beside `downloads.ts`), as prototyped:

   ```ts
   export function staticImages(staticDirectory: string | null): Plugin[]
   ```

   - **Resolve plugin:** `enforce: 'pre'` and a `resolveId` filter of `^\.\/(?:[A-Za-z]:\/|\/\/)`.
     It answers `this.resolve(source.slice(2), importer, { ...options, skipSelf: true })`.
   - **Serve plugin** (only when there is a static directory):
     - `apply: 'serve'`, `enforce: 'pre'`.
     - It reads `base` and `assetsInclude` from the resolved config.
     - `load(id)` answers ``export default "<withBasePath(`/${relative}`, base)>"`` for an id under
       the static directory with no query that Vite counts as an asset. It answers `null`
       otherwise.
     - The directory is matched in two spellings, as given and real (`realpathSync.native`). Vite
       keeps a `subst` drive's spelling and gives everything else its real path (macOS `/var` is
       `/private/var`).
   - Comments: one line each, per `.ai/instructions.md`; the two upstream links carry the why.
2. **`portal-template/vite.config.ts`**: `staticImages(paths.staticDir)` after
   `staticFunctionsBase()`.
3. **`portal-template/src/styles/app.css`**: drop the three lines of D4.

## 7. Tests

### 7.1 Unit

- **`test/infrastructure/tmp-extensions.test.ts`**:
  - Delete the `portalProjectDirectoryBase` and `withPortalProjectDirectory` suites, and the "for a
    portal project too" case.
  - Keep "the temp directory a run is given is spelled the way the filesystem spells it".
- **`test/portal-template/static-images.test.ts`** (new):
  - The resolve filter takes `./D:/x.png`, `./d:/x.png` and `.///server/share/x.png`. It leaves
    `./local.png`, `../x.png`, `D:/x.png` and `/images/x.png` alone.
  - The handler resolves the path without its `./`, and skips itself.
  - The serve plugin applies to `serve` only, and there is none without a static directory.
  - An image under the static directory loads as `/images/x.png` at the root and as
    `/docs/images/x.png` under `/docs/`. This holds in its real spelling too, through a directory
    link made in the test.
  - It answers `null` for an id with a query (`?raw`), a non-asset (`.json`), and a file outside
    the directory.
- **`test/portal-template.test.ts:148-152`**: delete "has Tailwind scan the copy of the pages, by
  its relative name"; 7.2 replaces it.

### 7.2 End to end

- **Helpers** (`portal-build.test.ts`, `portal-serve.test.ts`):
  - The root becomes `canonical(fs.mkdtempSync(path.join(os.tmpdir(), …)))`, and `base` leaves
    `BuiltPortal` and the clean-up.
  - `canonical` matters on GitHub's Windows runner, whose `%TEMP%` is the short name
    `C:\Users\RUNNER~1\…`. The CLI resolves it through `withDirPath`, and the tests must too.
- **Build:** "generates the template's utility classes and a page's own".
  - The default fixture's `content/guides/intro.md` gains one element with an arbitrary-value class
    no other file uses.
  - The built `assets/app-*.css` holds that rule, and `end-1.5`'s (`CommandBlock`, template only).
- **Serve:** "serves a page's static image at its public address, asked for before the page"
  replaces the raw-`/@fs/` case.
  - It asks for `/@fs/<static>/images/logo.png?import` first and gets
    `export default "/images/logo.png"`.
  - That address answers `image/png`.

On the Windows runner (workspace on D:, temp on C:) these run across drives for real, which
exercises both hooks of the plugin. On macOS and Linux they run the serve hook.

## 8. Implementation steps

Each step stops for review, and each commit waits to be asked for.

1. **The plugin:** `static-images.ts`, its registration, and its unit tests (6.1, 6.2, 7.1).
   Nothing changes for users yet: the fallback still keeps the static directory on the project's
   drive.
2. **The fallback goes:** 5.1, 5.2, their unit tests, the e2e helpers, and the serve case of 7.2.
   The serve case moved here from step 3 (2026-10-16), because this is the step that makes the old
   raw-`/@fs/` case fail across drives; every step then passes on every layout.
3. **The stylesheet:** 6.3, the packaging test's removal, and the build case of 7.2.
4. **Self-review and verification:**
   - Unit and e2e on Windows: C:, a `subst` drive, and the USB drive when it is attached.
   - CI's job in Docker on `node:24` and `node:26`; lint and type check.
   - The plans that describe the fallback get one dated line pointing here:
     `fumadocs-portal.md` section 5 step 2 and its "Cross-drive builds" risk, and the Tailwind
     paragraphs of `generated-pages.md`.
5. **Pull request into `dev`:**
   - CI's matrix (ubuntu, windows, macos × Node 24, 26) and SonarCloud.
   - Before merge, someone with a Mac opens a `portal serve` page with a static image in Safari.
6. **Follow-ups**, each drafted for approval before it is posted:
   - a reply on apimatic-io#2301 (cause, what the comment's notes got wrong, the fix);
   - a fumadocs issue for `remarkImage`'s cross-drive import path.

## 9. Risks

- **fumadocs changes its import path.**
  - If it emits an absolute path, the resolve hook matches nothing and Vite resolves the path
    itself.
  - The serve hook keys on resolved ids under the static directory, so it holds either way.
- **Safari (#2287).**
  - The image's module still comes through `/@fs/`, which stays allowed (D6).
  - The image itself now comes from the public directory, which the allow list never covered.
    Hence the manual check.
- **The Windows runner's e2e moves across drives.** Locally this passed from a real second drive
  (section 4), and the helpers resolve the short-named temp directory (7.2).
- **A temp directory on removable media.** Vite's watcher can crash with `EBUSY` on freshly copied
  files there (seen with `TEMP` on a USB stick).
  - Today an *input* on a USB stick is staged on the stick and is just as flaky: an image the
    build had just copied was not found.
  - After this change only a temp directory on removable media is exposed.

## 10. Known limitations

- **A source on a network share.**
  - The resolve hook takes fumadocs' UNC form (`.///server/share/…`), and a share is served as the
    public directory like any other path.
  - Not run: there is no share on the machine this was measured on.
- **vitejs/vite#10802 in general.** A raw, non-JavaScript file that a dependency serves from another
  drive than the project would still fail under `serve`.
  - The template has none. Its fonts are copied (`COPIED_DEPENDENCIES`), and the rest goes through
    Vite's transform, which reads any drive.
  - The CLI's dependencies on another drive than `%TEMP%` passed the e2e and browser checks of
    section 4.

## 11. Upstream

- **fumadocs-core `remarkImage`:** `getImportPath` should return an absolute (or `file://`) path
  when `path.relative` does. The resolve hook goes once a fixed version is pinned.
- **vitejs/vite#10802:** the serve hook stays while that is open.

## 12. Delivery

- **Pull request** into `dev` from `saeedjamshaid/cross-drive-portal-styles`. Title (the squash
  commit's header, chosen by the user): `fix(portal): keep the portal's styling when it is built from
  another drive`.
- **Description:** the cause in user terms, what changed, what was verified, and `Fixes
  apimatic-io#2301`. No internal detail, since this repository is public.
- **Worktrees:** `C:\repos\apimatic-cli-cross-drive` (this branch). The prototype worktree,
  `C:\repos\apimatic-cli-proto`, is removed after step 4.

## 13. History

- **2026-10-16:**
  - #2301's comment was checked, and its root cause confirmed.
  - The fix was researched and prototyped (sections 2–4).
  - The user chose the public address on every OS, a CI and Safari check for macOS, and drafts of
    the #2301 reply and the fumadocs issue.
