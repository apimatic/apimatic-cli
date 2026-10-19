# Plan: build every portal project in the temp directory

Status: designed 2026-10-16 on `saeedjamshaid/cross-drive-portal-styles`, cut from `origin/dev` at
`0faa568b`. Fixes apimatic-io#2301. A prototype of every change below was built and measured the
same day (section 4); this plan turns it into the change and its tests. Approved by the user on
2026-10-16, with the title in section 12.

Implemented the same day in steps 1–4 (`c1c04efe`, `341d2f30`, `b198b89c`, `494ffaa5`) and opened
as apimatic/apimatic-cli#440 (step 5). Its review on 2026-10-19 revised D2 and D4 and added D7: a
source on a network share is refused, and `app.css` names Tailwind's sources. Section 13 records
what the branch passed.

## 1. Goal and scope

A portal built or previewed from an input on any Windows drive is the portal the same input gives
on the temp directory's drive: the same stylesheet, the same images, and nothing written into the
input folder.

- **In scope:** the cross-drive fallback that stages the project in `<input>\.apimatic-build\`, the
  two upstream bugs it was dodging, and which files Tailwind scans.
- **Out of scope:** building from a network share, which is refused up front (D7), and any other
  change to how the project is laid out.
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
   filtered, has none. Reported as fuma-nama/fumadocs#3723 (2026-10-19); still on fumadocs `main`.
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
  - *Resolve* (build and serve): the `./D:/…` specifier is resolved as the absolute path it is.
    Until the review it took fumadocs' `.///server/share/…` too, which Vite then resolved as a
    protocol-relative URL (D7).
  - *Load* (serve only): a plain asset import from the static directory becomes its public address
    (`withBasePath`). Vite serves its public directory from any drive.
- **D3. The public address on every drive and OS** (the user's choice, 2026-10-16). One behaviour,
  so the macOS and Linux serve tests cover it. Same-drive previews stop using `/@fs/` for static
  images. A query such as `?raw`, or a non-asset import, stays Vite's to answer.
- **D4. `app.css` names Tailwind's sources** (revised 2026-10-19, after review).
  - `@import 'tailwindcss' source(none)`, then `@source` for `src/`, the copy of the pages, the
    generated pages and the SDK docs they include: every folder detection read, less the template's
    root files, which hold build code. `@source not '../../dist'` goes, since nothing named holds
    `dist/`. A packaging test pins the three names to the CLI's constants.
  - As first implemented, D4 dropped `@source '../../content'` and let detection find the copy.
    Detection still depends on where the temp directory sits: when it is inside a git repository
    that ignores it, the project root is promoted and `node_modules` is scanned. Measured on the
    default fixture: 562 classes gained, 134 KB.
  - Named sources gave the same stylesheet (736 classes, 93 KB) with the temp directory in its usual
    place and inside an ignored folder of a repository. The one class they lose, `collapse`, came
    from a comment in the template's `prerender-pages.ts`.
  - The unit test that held the `@source` literal is replaced by an e2e check of what the stylesheet
    holds (7.2).
- **D5. Rejected:**
  - *Explicit sources* (`source(none)` and globs), while the `*` `.gitignore` existed: it hid every
    subfolder of `src/`. Measured: 24 classes still lost. Adopted in D4 once that file was gone.
  - *Dropping the `.gitignore`*: the folder shows in `git status` for a whole `serve` session, and
    the user's own ignore rules then apply to the staged files. A user who ignores
    `.apimatic-build/` brings the over-scan back.
  - *Running Vite from another working directory*: that promotes the project to an external source,
    which is the over-scan again.
- **D6. Kept:**
  - The static directory stays in `server.fs.allow`. A page's `?import` request for its image still
    goes through `/@fs/`, and Safari can send it before the page (#2287).
  - `COPIED_DEPENDENCIES` stays: it is about the CLI's install drive, which this does not move.
- **D7. A source on a network share is refused up front** (the user's choice, 2026-10-19, after
  review).
  - `portal generate` and `portal serve` stop before signing in, and say to copy the folder to a
    local drive or map the share to a drive letter. `DirectoryPath.isOnNetworkShare` decides it.
  - Vite's `normalizePath` turns `\\server\share` into `/server/share`. Its `publicDir` then names
    no folder, and the static directory is left out of the build without a word.
  - Fumadocs' `.///server/share/…` import, with the `./` taken off, is a protocol-relative URL to
    Vite. The SSR bundle kept it as an import that Node cannot load, so prerendering failed.
  - A share mapped to a drive letter builds like any other drive, static directory included
    (checked with `net use Z: \\localhost\C$`).
  - `dev` fails on a share too, earlier (EPERM creating a link in `.apimatic-build`), so the refusal
    takes nothing away.

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

   - **Resolve plugin:** `enforce: 'pre'` and a `resolveId` filter of `^\.\/[A-Za-z]:\/` (until
     2026-10-19 it also took `//`; see D7). It answers
     `this.resolve(source.slice(2), importer, { ...options, skipSelf: true })`.
   - **Serve plugin** (only when there is a static directory):
     - `apply: 'serve'`, `enforce: 'pre'`.
     - It reads `base` and `assetsInclude` from the resolved config.
     - `load(id)` answers ``export default "<withBasePath(`/${relative}`, base)>"`` for an id under
       the static directory with no query that Vite counts as an asset. It answers `null`
       otherwise.
     - The directory is matched in two spellings, as given and real (`realpathSync.native`). Vite
       keeps a `subst` drive's spelling and gives everything else its real path (macOS `/var` is
       `/private/var`). On Windows both sides are lower-cased first (2026-10-19, after review).
   - Comments: one line each, per `.ai/instructions.md`; the two upstream links carry the why.
2. **`portal-template/vite.config.ts`**: `staticImages(paths.staticDir)` after
   `staticFunctionsBase()`.
3. **`portal-template/src/styles/app.css`**: the named sources of D4.

## 7. Tests

### 7.1 Unit

- **`test/infrastructure/tmp-extensions.test.ts`**:
  - Delete the `portalProjectDirectoryBase` and `withPortalProjectDirectory` suites, and the "for a
    portal project too" case.
  - Keep "the temp directory a run is given is spelled the way the filesystem spells it".
- **`test/portal-template/static-images.test.ts`** (new):
  - The resolve filter takes `./D:/x.png` and `./d:/x.png`. It leaves `./local.png`,
    `.//local.png`, `../x.png`, `D:/x.png`, `/images/x.png` and `.///server/share/x.png` alone.
  - The handler resolves the path without its `./`, and skips itself.
  - The serve plugin applies to `serve` only, and there is none without a static directory.
  - An image under the static directory loads as `/images/x.png` at the root and as
    `/docs/images/x.png` under `/docs/`. This holds in its real spelling too, through a directory
    link made in the test.
  - On Windows, it knows the directory spelled in another case.
  - It answers `null` for an id with a query (`?raw`), a non-asset (`.json`), and a file outside
    the directory.
- **Network shares (D7):** `DirectoryPath.isOnNetworkShare` holds `\\server\share\…` and
  `//server/share/…`, and not `C:\…` or `\\?\C:\…`. `portal generate` and `portal serve` stop on a
  share before signing in. These run on Windows only.
- **`test/portal-template.test.ts:148-152`**: delete "has Tailwind scan the copy of the pages, by
  its relative name"; 7.2 replaces it. Since D4's revision, "has Tailwind scan the directories the
  CLI writes pages into" checks each named folder against the CLI's constant.

### 7.2 End to end

- **Helpers** (`portal-build.test.ts`, `portal-serve.test.ts`):
  - The root becomes `canonical(fs.mkdtempSync(path.join(os.tmpdir(), …)))`, and `base` leaves
    `BuiltPortal` and the clean-up.
  - `canonical` matters on GitHub's Windows runner, whose `%TEMP%` is the short name
    `C:\Users\RUNNER~1\…`. The CLI resolves it through `withDirPath`, and the tests must too.
- **Build:** "builds the stylesheet from the template and the pages alone" (first "generates the
  utility classes a page uses"; widened 2026-10-19, after review).
  - The default fixture's `content/authentication.md` becomes `authentication.mdx`, with one
    element carrying an arbitrary-value class no other file uses (`tracking-[0.3125em]`). Content
    pages have no `rehype-raw`, so only MDX renders an author's class. No test names that page,
    whereas `guides/` is rewritten by the serve unit tests.
  - The page carries the class and the built stylesheet holds its rule.
  - So does `@2xl:grid-cols-2`, the SDK cards' grid, which only the template uses and #2301 lost.
    It replaces the branded build's `dark:block` check.
  - The stylesheet stays under 100 KB (93 KB today). CI's Windows runner builds the fixture inside
    its git checkout, where `dev` over-scans rather than drops classes (134 KB), so this ceiling is
    what catches the regression there.
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
   - a fumadocs issue for `remarkImage`'s cross-drive import path: fuma-nama/fumadocs#3723,
     filed 2026-10-19.

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

- **A source on a network share** is refused (D7). Measured on `\\localhost\C$` (2026-10-19):
  - with the `//` branch, prerendering a page with a static image failed
    (`ERR_INVALID_FILE_URL_PATH`);
  - with the image resolved directly, the build passed, but without the static directory;
  - through a mapped drive letter, the build was complete.
- **A `?url` import of a static image under `serve`, across drives.** Vite answers
  `export default "/@fs/D:/…"`, and that address returns the HTML page (a 403 from a `subst`
  drive). Under the fallback the project shared the drive, so it worked. Pages import images
  through fumadocs, without a query, so none does this today.
- **`serve` and `generate` give a static image different addresses**: `/images/x.png` in the
  preview, `/assets/x-<hash>.png` in the build. Both load; only the preview's is new.
- **`.apimatic-build/` folders that earlier versions left beside `src/`** are not removed. Git
  ignores them (their own `.gitignore` is `*`), so a line in the release notes saying they can be
  deleted is enough.
- **vitejs/vite#10802 in general.** A raw, non-JavaScript file that a dependency serves from another
  drive than the project would still fail under `serve`.
  - The template has none. Its fonts are copied (`COPIED_DEPENDENCIES`), and the rest goes through
    Vite's transform, which reads any drive.
  - The CLI's dependencies on another drive than `%TEMP%` passed the e2e and browser checks of
    section 4.

## 11. Upstream

- **fumadocs-core `remarkImage`** (fuma-nama/fumadocs#3723, filed 2026-10-19): `getImportPath`
  should return an absolute path when `path.relative` does. The resolve hook goes once a fixed
  version is pinned.
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
  - Steps 1–4 implemented. The branch passed:
    - CI's job on Windows: 1919 passing, lint clean;
    - the e2e suites from a `subst` drive and from a USB drive: 68/68 each;
    - CI's job in Docker on `node:24` and `node:26`: 1918 passing each, lint clean.
  - The final review found nothing to change, and two things to watch:
    - CI's macOS job: the e2e roots now carry their real path (`/private/var/...`). The check that
      no build-machine path reaches the output now searches for the spelling Vite embeds there, so
      it is stricter on macOS than before.
    - PR #437 bumps fumadocs-core to 16.17.1, whose `getImportPath` is unchanged, so the resolve
      hook still applies.
- **2026-10-16:** opened as #440. CI passed in full: ubuntu, windows and macOS on Node 24 and 26,
  SonarCloud.
- **2026-10-19:** mehnoorsiddiqui's review.
  - The user chose to:
    - refuse network shares (D7);
    - name Tailwind's sources (D4);
    - merge `dev` in rather than rebase;
    - file fuma-nama/fumadocs#3723.
  - Also from the review:
    - the e2e ceiling and template class (7.2);
    - the case-insensitive match (6.1);
    - the `?url` limitation (section 10);
    - SonarCloud's nested template literal.
  - The branch passed:
    - CI's job on Windows, with `dev` merged in: 1924 passing, lint clean;
    - the e2e suites from a `subst` drive: 69/69;
    - `portal serve` through a mapped drive (`Z:` → `\\localhost\C$`): images from `/images/`, the
      logo and the full stylesheet;
    - both commands on `\\localhost\C$\…`: refused before signing in, with nothing written.
