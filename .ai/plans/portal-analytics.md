# Portal analytics, built in reviewable steps

Status: planned 2026-11-11 from the locked plan. Steps 1.1 to 1.3 are on PR #473 (draft, stacked
on #472). On 2026-11-12 the remaining steps were reordered top-down, from each entry point
inward, after the first three produced a module nothing called yet; steps 1.6 and 1.7 were swapped
the same day, so the parser lands before the flag it reads. On 2026-11-12 PR 3, the other
seven events, was moved ahead of PR 2 and into PR #473, so GA4 and GTM can be tested with every
event before anything merges. Every decision is final; a
change from here is a new row in the Decisions table of apimatic/apimatic-io#2347.

What the feature does, and why each decision was made, is written down in the issues, which
are the source of truth. This file says only in what order it is built and how each step is
reviewed. Where this file and an issue disagree, the issue wins and this file is corrected.

| Source | Holds | Read it when |
|---|---|---|
| apimatic/apimatic-io#2347 | the plan: the eight events, the loader, the Decisions table (locked), the risks | starting, and whenever a "why" comes up |
| apimatic/apimatic-io#2348 | the build checklist for the three PRs, "Schema, validation and reports" (every rule and every message, verbatim), "Done when" | every step |
| apimatic/apimatic-io#2349 | PR 1 in detail, top-down, with code sketches for every file | every PR 1 step; PR 2 and PR 3 build on its `analyticsFor()` |
| Plan doc https://claude.ai/artifact/A6rr4cGkbEL3bRCnPGqWzy | the same plan as a document, with the diagram | only to settle a reading of the issues |
| Explainer https://claude.ai/artifact/RVbt9jerbNzTFyzGh4eE8t | the plain-language version | never needed for the build |

Read an issue with `gh issue view <number> --repo apimatic/apimatic-io` (they live in
apimatic-io, not in this repository). Shipped beside this plan: PR #472 in this repository
(fumadocs-openapi 12.6, PKCE, the `no-referrer` meta on `/oauth/callback`), and
fuma-nama/fumadocs#3809 and #3810.

## 1. How a step works

- Each step delivers one behaviour that runs, with the tests that prove it, and is small enough
  to review in one sitting. A step creates only the code its behaviour needs: a class appears
  the first time a step has something to hold, a method the first time a step calls it, a
  message the first time it is said.
- Top-down, from a caller that exists. A step starts at an entry point that is already in the
  tree (a command, a route, an effect, a component, the module the bundle evaluates) and adds
  inward only what that caller needs. Nothing is written before the code that calls it, and a
  pure helper is split out in the step whose caller needs it, with its tests, not before. Steps
  1.1 to 1.3 were built the other way round, before this rule; from 1.4 on every step follows it.
- Before writing, the agent says in a few lines what the step adds, which files it touches, and
  asks the questions section 5 lists for it. Then it waits for a go.
- A step starts from the working tree as the reviewer left it. The agent never runs
  `git commit` or `git push` on its own (`.ai/instructions.md`); the reviewer reads the diff,
  tailors or refactors the code, and the next step builds on that.
- A step ends with these checks, run by the agent and reported with their output:

  ```bash
  pnpm build                                    # tsc on src
  pnpm exec tsc -p test/tsconfig.json           # the tests and the template modules they import
  pnpm lint
  pnpm prettier                                 # or pnpm format, then show what it changed
  pnpm exec tsx node_modules/mocha/bin/_mocha "test/<the step's files>" --timeout 99999
  pnpm test                                     # the whole suite, at the end of each PR; sooner when a step touches shared code
  ```

- The agent's report after a step: the files touched, the tests added by name, the output of
  the checks, anything it could not verify, anything it found along the way but did not change,
  and every place it departed from #2348 or #2349, with the reason. Nothing else.
- Three words from the reviewer drive the loop. `LGTM`: the step is accepted as it stands.
  `commit`: the agent commits the step with the header its section names (Conventional Commits;
  commitlint and lint-staged run on commit). `next`: the agent starts the next step with its
  questions. Anything else is a change request on the current step.
- A step never widens. A problem found outside it goes in the report's "found" list; the
  reviewer decides whether it becomes a step.
- A "check first" item (section 5) is answered with evidence from `node_modules` on the branch
  before any code that depends on it is written, and the answer goes in the report.
- The manual checks (GTM Preview, GA4 DebugView, a playground sign-in) are the reviewer's, on a
  test portal. The agent says which ones a step makes possible and leaves them to the reviewer.

## 2. Rules for the code

The conventions in `.ai/instructions.md` and `.ai/skills/` apply unchanged. These are the ones
this feature leans on most, plus its own.

- **Functional core, imperative shell.** `pageLocation()`, the search and referrer helpers
  (PR 3) are plain functions, tested without a DOM. The loader, `report()` and the React
  effect are the shell.
- **The sketches in #2349 are the design, not the code.** Every name in them stands unless the
  reviewer renames it. The agent may tighten a sketch to the repository's rules (no private
  instance methods, no middlemen, `Promise<Result>` with early returns) and says where it did.
- **Messages verbatim.** Every parser report comes from the table in #2348, "Parser rules and
  reports", word for word; the test asserts the whole sentence. The GA4 warning is the text in
  #2348, "The GA4 warning". Since 2026-11-12 the parser checks presence and type only: a
  vendor's ID, an environment value, the verification token and a kept name are any non-empty
  string, with no pattern and no refused name, since a wrong value fails at the vendor, not in
  the CLI; the schema (1.8) carries no patterns either. This replaces the locked "OAuth names
  refused in `keepQueryParams`" and is the reviewer's to record in #2347's Decisions table.
- **Names are a contract.** An event name or key, once shipped, never changes. Names are
  `docs_` plus lowercase snake_case, checked by a test. The three settled names are
  `window.apimatic`, `window.apimatic.consent.update` (a later phase) and
  `portal.seo.googleSiteVerification`.
- **`head()` lists no script**, in any PR. Everything loads through the loader, after the
  bundle. (The wait for an address free of the nine OAuth answer names was removed on
  2026-11-12; see step 1.3.)
- **`analytics.ts` never imports `portal.ts`**, which loads the generated identity file; only
  `portal-analytics.ts` does. Unit tests import `analytics.ts` with a fake `window`.
- **Every event sets all of its keys**, the compiler enforces it through `PortalEvents`, and
  `report()` pushes `{ docs: null }` before `{ event, docs }`. The GA4 adapter and `subscribe`
  keep flat params.
- **`docs_api_request` never carries** the request URL, body or headers.
- **Comments only for a why**, one line. The sketches carry some comments; keep only the ones
  that explain a non-obvious decision (the `Arguments` object, the merge in GTM, the Suspense
  order).
- **A helper only when a second caller or its own tests need it.** Logic used once stays inline
  where it runs, written to read on its own. Nothing is written ahead of its caller: a function,
  field or type with no use yet waits for the step that uses it. A stateful unit is a class with
  flat public methods, not a closure over inner functions.

## 3. Branches

Start from `origin/dev` once PR #472 is merged; if it is still open, cut PR 1's branch from
`chore/fumadocs-openapi-12-6` and rebase onto `dev` after the merge, since the template work
depends on fumadocs-openapi 12.6. Confirm the base with `git log --oneline -1`.

| PR | Branch | Cut from | Title (the squash commit) |
|---|---|---|---|
| 1 and 3 | `sohail/portal-analytics`, PR #473 | `chore/fumadocs-openapi-12-6` (#472 still open), rebased onto `dev` after the merge | `feat(portal): load Google Tag Manager and GA4 from portal.analytics and report the portal events` |
| 2 | `sohail/portal-scripts` | `sohail/portal-analytics`, once #473 merges | `feat(portal): load custom scripts from portal.scripts` |

PR 3 was folded into #473 on 2026-11-12 (its steps follow PR 1's there, and the gate below applies
to both). PR 2 is independent of it and opens against `dev` once #473 is merged, with a PR body
that links #2348 and the issue's section it implements. Push only when the reviewer
says so.

## 4. The steps

| Step | A developer can | Size |
|---|---|---|
| 1.1 | clean an address and tell an OAuth answer from a campaign tag (done, `d703e0bd`, `bef3d350`) | small |
| 1.2 | start the vendors, report an event, and see one clean `docs_page_view` per page in the data layer (done, `62265fa3`) | medium |
| 1.3 | sign in through the playground and have the tags wait for a clean address (built as `1c616d56`, removed 2026-11-12; fuma-nama/fumadocs#3809 is the PR's merge prerequisite instead) | small |
| 1.4 | run a built portal against a hand-written identity file and see page views in GTM Preview | medium |
| 1.5 | see the verification meta on every page and the playground blank in a session replay (done, `7012bed8`) | small |
| 1.6 | write `portal.analytics` and `portal.seo` in `apimatic.json`, have them reach the browser, and be warned about GA4's own page views (done, `1538d831`) | medium |
| 1.7 | build or serve with `--no-analytics` and have the flag reach the identity file (done, `af636656`) | small |
| 1.8 | get editor help for the new settings, with the schema agreeing with the parser (done, `f654d592`) | small |
| 1.9 | prove it end to end on a built portal (done, `b698f389`) | small |
| 1.10 | read the README and the docs page draft (done, `c498fada`) | small |
| 2.1 | list a script in `portal.scripts` and have the CLI check it | medium |
| 2.2 | see listed scripts load in order, after the bundle, never beside an OAuth answer | small |
| 2.3 | subscribe to our events from a listed script | small |
| 2.4 | get editor help, the e2e proof and the docs draft for scripts | small |
| 3.1 | see `docs_markdown_copy`, `docs_plugin_install` and `docs_sdk_download` (done, `28817f70`) | small |
| 3.2 | see `docs_code_copy` with the block's language (done, `735533c8`) | small |
| 3.3 | see `docs_search` with the term, the pick and the count (done, `e81f86ae`) | small |
| 3.4 | see `docs_not_found` with a clean referrer (done, `1b19aef2`) | small |
| 3.5 | see `docs_api_request` with endpoint, status and duration, and nothing private (done, `5fae2090`) | medium |
| 3.6 | read the docs for all eight events (done, `cd8de5ea`) | small |

### PR 1: the setting, the loader and page views

Steps 1.1 to 1.3 are done and were built bottom-up. From 1.4 on, the order is top-down: first
the browser entry point, which gives the module its caller; then the CLI, from the command flag
inward to the parser; then the schema, the proof and the docs.

#### Step 1.1: the pure functions (done)

Delivers, in `portal-template/src/lib/analytics.ts` (new): the constants (`OAUTH_ANSWER`,
`KEPT_PREFIXES`, `KEPT_NAMES`), `pageLocation(href, keep, base?)`, `holdsOAuthAnswer(href)`,
the `PortalEvents` map with `docs_page_view` only, `PortalEventName`, `PortalEvent`,
`DataLayerEntry`. Nothing touches `window` yet.

Tests, `test/portal-template/analytics.test.ts` (new): the `pageLocation()` cases (query and
`#` dropped; `utm_*`, `hsa_*`, each kept name and `keepQueryParams` kept; `gclidx` not; the
callback at the root, under `/docs/` and with a trailing slash gives `null`; otherwise the
address unchanged), the `holdsOAuthAnswer()` cases (each of the nine names alone, in the query
and after the `#`; `utm_source` and `campaign_id` false), and the event-name test
(`^docs_[a-z0-9_]+$`, at most 40 characters, at most 25 keys).

Commit: `feat(portal): clean the reported page address`.

#### Step 1.2: adapters, start, report and page views (done)

Delivers: the `Adapter` interface and the `adapters` registry keyed by every vendor (GTM:
`gtm.start` entry, `gtm.js?id=…` with the `environment` suffix, `send` a no-op; GA4:
`window.gtag ??=` pushing `Arguments`, `js`, `config` with `send_page_view: false` and
`debug_mode` in a preview, `gtag/js?id=…`, `send` with the `docs_` prefix dropped);
`analyticsFor(settings)` with `startAnalytics()` (once; `window.dataLayer ??= []`; each
adapter's `setup()`; then `insert()` straight away when the address is clean, nothing when it
is not), `report()` (the cleaned `page_location`, nothing when it is `null`, the reset push, the
`{ event, docs }` push, each adapter's `send()`, the frozen event appended to `events`), and
`reportPageViews(router)` (the first page view at once, one per `onRendered`, none for the same
cleaned address, the unsubscribe). The 5-second wait is step 1.3.

Tests: neither vendor; GTM only, with and without `environment`; GA4 only, including the
`[object Arguments]` check and `debugMode`; both, with every setup entry before the first event;
an existing `window.gtag` kept; a second start adds nothing; the shared adapter suite over the
registry (its setup turns off the vendor's page view; nothing it receives for a report made at
`…?code=x&state=y#access_token=z` holds `code=`, `token=` or `#`; no recording or input capture;
`send('docs_page_view')` maps to the vendor's page view; every script `https`, none inline);
the reset push (right before every event entry; the entry holds `event` and `docs` only; with a
helper that merges entries the way GTM does, a key from the previous event is gone after the
next); the replay list; `reportPageViews()` (first at once, one per `onRendered`, none for a `#`
or query change, A-B-A sends three, the returned function stops it); the callback sends no page
view but the setup entries are pushed. Fake `window` and `document` on `globalThis` as
`base-path.test.ts` does; a fresh instance per case.

Commit: `feat(portal): report page views to the data layer and GA4`.

#### Step 1.3: the loader waits out an OAuth answer (built, then removed)

Built as `1c616d56` and removed on 2026-11-12: the wait made the loader hard to read for a
problem Fumadocs is fixing at the root. The PR now carries fuma-nama/fumadocs#3809 as a merge
prerequisite under "Before merging"; if Fumadocs does not ship it in time, the wait comes back
from that commit. This replaces the locked option A and is the reviewer's to record in #2347's
Decisions table.

Delivers: `insertWhenClean()` as sketched: while the address holds an answer, a check every
100 ms for up to 50 checks, inserting once it is gone, the timer cleared after the last check,
and a later call on a clean address inserting; a call while it waits starts no second timer.
`startAnalytics()` calls it instead of `insert()`.

Tests, with `sinon.useFakeTimers()` as `test/infrastructure/generation-status-poller.test.ts`
uses it: the setup entries at once; no script while the answer stays; a report meanwhile pushed
at once with a clean `page_location`; the insert at the next check once the answer is gone; the
timer cleared after 5 seconds and a later call inserting; no second timer.

Commit: `feat(portal): hold vendor tags back while the address holds an OAuth answer`.

#### Step 1.4: the bundle starts analytics and reports page views

The browser entry point, which gives steps 1.1 to 1.3 their caller. It is the riskiest step,
because it is the browser timing, so it is checked in a browser before the CLI side is built.

Delivers, from the entry point inward:

- `portal-template/src/routes/__root.tsx`: the effect in `RootComponent` (subscribe
  `insertWhenClean` to `onRendered`, then `reportPageViews(router)`, both undone on cleanup).
  `head()` still lists no script.
- `portal-template/src/lib/portal-analytics.ts` (new): the one instance from
  `portal.analytics`, `startAnalytics()` at module evaluation when `window` exists, exporting
  `insertWhenClean`, `report` and `reportPageViews`.
- `portal-template/src/lib/portal-types.ts`: `analytics: PortalAnalytics` on `Portal`.
- `src/types/portal/portal-config.ts`: `analytics` on `PortalIdentity`, and `identity()`
  filling it with the default (`null`, `null`, `[]`), so `Equal<Portal, PortalIdentity>` in
  `test/portal-template.test.ts` still holds. The parser is step 1.6.

Tests: the existing suite stays green (`test/portal-template.test.ts`, the route tests); the
two `identity()` deep-equal cases gain `analytics`. The new behaviour is browser timing, which
the repository has no runner for, so the step's proof is manual: the reviewer edits
`portal.identity.json` in a prepared project (the file `appearanceFiles()` in
`src/infrastructure/portal-project-service.ts` writes) to hold a GTM container and a GA4
stream, builds, and runs the manual list in #2349 ("Manual, on a test portal"): first-load
order, one `docs_page_view` per page change, the `#` link sending none, the OAuth wait with
both flows, DebugView with the stream setting on and off. The agent's report says how to
produce that build.

Commit: `feat(portal): start analytics from the portal bundle`.

#### Step 1.5: the verification meta and the playground out of replays (done)

Delivers, from the two pages inward:

- `portal-template/src/routes/__root.tsx`: `head()` gains the `google-site-verification` meta
  when `seo.googleSiteVerification` is set.
- `portal-template/src/components/api-page.tsx`: the playground wrapped in the do-not-record
  element, after the "check first" answers in section 5.
- `seo: PortalSeo` on `Portal` and on `PortalIdentity`, with `identity()` filling the default
  (`null`).

Tests: the existing suite; the two `identity()` cases gain `seo`. Manual: the meta in a built
page's `<head>`; the playground blank in a Hotjar or Clarity replay loaded through a GTM tag.

Commit: `feat(portal): add the site verification meta and keep the playground out of replays`.

#### Step 1.6: the settings reach the browser, and the GA4 warning (done)

Built before the flag (the two were swapped on 2026-11-12): until the parser exists,
`identity()` writes constants, so a flag passed to it would be a parameter nothing reads,
which the lint rule rejects and section 2 forbids.

Delivers, from `apimatic.json` inward:

- `src/types/portal/portal-config.ts`: `'analytics'` and `'seo'` in `NAMESPACES`, the two
  fields after `ai`, the defaults in `scaffolded()`, the parsers in `fromBlock()`, `identity()`
  filled from the config, `usesGoogleAnalytics()`, `toJSON()` writing both only when set,
  `PortalBlock` gaining both as optional.
- `src/types/portal/config/analytics-config.ts` (new): `AnalyticsConfig` built like `AiConfig`,
  with `defaults`, `parse()`, `usesGoogleAnalytics()`, `identity()`, `toJSON()`; every rule and
  message from #2348's table, less the format rules (section 2). Both vendors are written whatever the command, until step 1.7 adds the flag.
- `src/types/portal/config/seo-config.ts` (new): `SeoConfig` the same way.
- `src/actions/portal/generate.ts`: once the project is prepared, before the build, when
  `usesGoogleAnalytics()`, `this.prompts.googleAnalyticsCountsPageChanges()`;
  `src/prompts/portal/generate.ts` prints the warning from #2348 with `log.warn`, in the style
  of `src/prompts/portal/source.ts`'s config warnings.

Tests: `test/types/portal/portal-config.test.ts`, `describe('analytics')` and
`describe('seo')` after `ai`, every case #2349 lists (absent, accepted with trimmed IDs,
`environment`, `keepQueryParams`, each message verbatim, several faults at once with unknown
keys first, `usesGoogleAnalytics()`, `toJSON()` round trip, `scaffolded()` writing neither);
`test/actions/portal/generate.test.ts` prints the warning only with `googleAnalytics` set, and
before the build; `test/prompts/portal/generate.test.ts` holds the warning's text.

Commit: `feat(portal): read portal.analytics and portal.seo from apimatic.json`.

#### Step 1.7: `--no-analytics` reaches the identity file (done)

The CLI entry point. The flag exists and flows to the one place that reads it. `portal serve`
is a hosted portal in every way: the same tags, GA4 in its normal mode (decided 2026-11-12,
replacing the lock's debug-mode preview; the reviewer's to record in #2347).

Delivers, from the commands inward, after the "check first" answer in section 5:

- `src/commands/portal/generate.ts` and `src/commands/portal/serve.ts`: the `no-analytics`
  boolean flag, description "leave out Google Tag Manager, Google Analytics and every analytics
  or marketing script, for staging."; each passes `enableAnalytics: !flags['no-analytics']` to
  its action; quickstart's preview passes `true`.
- `PreparePortalProjectAction`, `PortalProjectService.prepare()`, `applyConfig()` and
  `appearanceFiles()` take `enableAnalytics: boolean` as a parameter, never a field;
  `PortalConfig.identity(enableAnalytics)` hands it to `AnalyticsConfig.identity()`, which
  leaves both vendors out when it is false; `src/actions/portal/serve.ts` hands the same value
  to the rewrite when the block changes. The sketch's `PortalDelivery` class is not built: with
  no preview mode it would wrap this one boolean.

Tests: both commands accept the flag (`test/commands/flag-parser.ts` is the helper the command
tests use); `identity(false)` leaves both vendors out and keeps `keepQueryParams`;
`test/actions/portal/prepare-project.test.ts` and the stubs follow the new signature; the
generate, prepare and serve actions hand `--no-analytics` on, the serve action to the rewrite
too; the identity file written under `--no-analytics` has both vendors `null`.

Commit: `feat(portal): add --no-analytics and leave the vendors out of the identity file`.

#### Step 1.8: the schema (done)

Delivers: `analytics` and `seo` in `apimatic.schema.json` from #2348's "Schema additions",
between `ai` and `pluginUrl`, less every `pattern` and the OAuth-name `not`, since the parser
checks presence and type only (section 2): each ID and value is `nonBlank`. The "every setting
at once" case gains both; the analytics and seo cases from #2348's "Cases for
`schema.test.ts`" go in `valid` and `invalid`, with the ones #2348 refused on format alone
moved to `valid`, so the parser and the schema agree on each.

Tests: `test/types/apimatic-config/schema.test.ts`.

Commit: `feat(portal): describe portal.analytics and portal.seo in the schema`.

#### Step 1.9: the end-to-end proof (done)

Delivers: in `test/e2e/portal-build.test.ts`, the default build reads a copy of its fixture
whose `portal` block gains `analytics` with `GTM-E2ETEST` and `G-E2ETEST` and `seo` with a
verification value (the fixture itself stays as it is: four other suites read it, and the
generate action's "does not warn" case needs it without GA4); the cases check a browser script
holds both IDs, no prerendered page names `googletagmanager.com`, every prerendered page
carries the meta tag, and the operation page holds the playground's prerendered header inside the
do-not-record element. The
`--no-analytics` identity file is proved by the project service test; a second Vite build for
the same two nulls is not worth a minute of the CI-only run.

Commit: `test(portal): prove analytics and the verification tag in a built portal`.

#### Step 1.10: README and the docs draft (done)

Delivers: `pnpm readme` after `pnpm build` (colour on, `COLUMNS` unset) for the two flags; a
draft of the docs page, written to `.ai/plans/portal-analytics-docs.md`, covering every PR 1
bullet in #2348's "Docs" list and #2349's additions, for the apimatic-docs repository
(`v4/src/content/apimatic-cli/cli-reference.mdx` gets the flag's row, same words as the
description). The draft is not a docs PR; the reviewer takes it there.

Commit: `docs(portal): document portal.analytics` (the README part; the draft travels with it).

**PR 1 gate** (since 2026-11-12 the #473 gate, applied once step 3.6 is done, with PR 3's manual
check, each event once in GTM Preview with all of its keys, on the list)**:** `pnpm test` green; the manual list in #2349 all checked by the reviewer; the
"Done when" lines in #2348 for loading, counting, nothing private and verification hold; the
fuma-nama/fumadocs#3809 item under "Before merging" in the PR body addressed (Fumadocs ships
the `sessionStorage` hand-over and the branch picks it up, else the wait of step 1.3 comes back
from `1c616d56`). Then the reviewer says to push and open the PR.

### PR 2: `portal.scripts` and the subscribe helper

#### Step 2.1: the setting

Delivers: `src/types/portal/config/portal-script.ts` (new), one entry parsed as
`NavigationConfig.parseLinks()` parses links: `namespace()`, `unknownKeys()` against `src`,
`category`, `attributes`; `src` through `httpsAddress()` when it starts with `http:` or
`https:`, else `StaticAsset.parse()` with a scripts example; `category` through `oneOf()` with
`analytics` as the fallback; `attributes` keys matching `^data-[a-z0-9-]+$` with string values;
every error collected. `httpsAddress(value, path, example)` moved into `fields.ts` from
`portal-config.ts`'s `secureAddress()`, with `pluginUrl` on it. `PortalConfig`: `scripts` among
the known keys, parsed in `fromBlock()`, `staticFiles()` returning the listed static files
beside the brand files, `identity(enableAnalytics)` keeping the `necessary` and `functional` entries always and the rest only when the flag
allows, `toJSON()` writing `scripts` only when set with `category` and `attributes` only when
given. No class for it: the category rule is a function beside the parser. `scripts: PortalScript[]` on `PortalIdentity` and on
the template's `Portal` (`ScriptCategory`, `PortalScript` in `portal-types.ts`).

Tests: `portal-config.test.ts` `describe('scripts')` with every message from #2348's table,
several entries' errors at once, the `analytics` fallback, the round trip, `identity()` under
`--no-analytics`, the `pluginUrl` cases still passing; `portal-source-context.test.ts` reports
a missing listed file as `portal.scripts[0]` like a missing logo; the category rule for
each category under both flags.

Commit: `feat(portal): read portal.scripts from apimatic.json`.

#### Step 2.2: the loader inserts listed scripts

Delivers: `analyticsFor(settings, scripts)`; `insert()` adds each listed script after the
vendor tags, in order, `async = false`, static files through `withBasePath()`, each attribute
set on the element; a failed one doesn't stop the rest; vendor tags and listed scripts don't
wait for each other.

Tests: order, `async`, base path, attributes; nothing listed while an answer stays; a failure
doesn't stop the next.

Commit: `feat(portal): load listed scripts through the loader`.

#### Step 2.3: `window.apimatic.analytics.subscribe()`

Delivers: set up by `startAnalytics()` before any script is inserted; replays the events so far,
then each new one; returns an unsubscribe; each callback in `try`/`catch` with the error
rethrown through `setTimeout`; one `window.apimatic` object.

Tests: a subscriber added after two reports gets both then each new one; the event is frozen;
a throwing subscriber doesn't stop the next and its error is rethrown later; the returned
function stops delivery.

Commit: `feat(portal): let listed scripts subscribe to portal events`.

#### Step 2.4: schema, e2e and the docs draft

Delivers: `scripts` and the `httpsAddress` definition in the schema, `pluginUrl` moved onto it,
the scripts cases in `schema.test.ts` and `scripts` in "every setting at once"; the e2e fixture
gains `scripts`, `scriptsOf()` holds each address and attribute, no prerendered page names
them, a `--no-analytics` build keeps only `necessary` and `functional`; the `portal.scripts`
section appended to `.ai/plans/portal-analytics-docs.md` from #2348's PR 2 "Docs" list.

Commit: `feat(portal): describe portal.scripts in the schema and prove it in a build`.

**PR 2 gate:** `pnpm test` green; the PR 2 manual list in #2348 (Segment's debugger shows one
`page` per change, a never-answering host blocks nothing, a `functional` widget runs under
`serve`, an `analytics` script doesn't under `--no-analytics`); the "Scripts" line of "Done
when".

### PR 3: the other portal events

Before step 3.1, the agent rechecks the component references in #2348's event table against
the versions on the branch (fumadocs-ui 16.18.4, fumadocs-openapi 12.6.0) and checks each name
after the `docs_` prefix against GA4's recommended event names, and reports both. Each step
adds its entries to `PortalEvents` and reports through `portal-analytics.ts`'s `report()`.
Every event's keys are the ones in #2348's table; `report()` adds `page_location`.

#### Step 3.1: the three click reporters (done)

Delivers: `docs_markdown_copy` from `markdown-copy-button.tsx` when the copy succeeds;
`docs_plugin_install` from `plugin-install.tsx` through an `Actions` wrapper's
`onClickCapture`; `docs_sdk_download` with `language` from `sdk-actions.tsx`'s `DownloadLink`,
with `language="{{language}}"` added to `portal-pages/sdk.mdx`.

Tests: each event's keys. The reporters firing once per action is on the manual list: the
template's component tests render to static markup through Vite and cannot click.

Commit: `feat(portal): report Markdown copies, plugin installs and SDK downloads`.

#### Step 3.2: `docs_code_copy` (done)

Delivers: one document click listener for Fumadocs' copy button in a code block's `<figure>`;
`language` from the `<figcaption>` (`lib/code-titles.ts`) or the active tab's name; a plain
function that reads the language from the clicked element.

Tests: the language from a titled block and from a tabbed one; a click elsewhere reports
nothing.

Commit: `feat(portal): report code copies with the block's language`.

#### Step 3.3: `docs_search` (done)

Delivers: in `search.tsx`, one report per search when the dialog closes after the reader typed
something; the report waits a tick to see whether a result was picked; `result` the picked
address or empty, `result_count` the results shown; a plain function from the dialog's state to
the keys.

Tests: one report with the pick; one with an empty `result` when the dialog closes without one;
none when nothing was typed.

Commit: `feat(portal): report searches with the term, the pick and the count`.

#### Step 3.4: `docs_not_found` (done)

Delivers: in `not-found.tsx`, `page_referrer` as the previous portal page after an in-portal
link, or `document.referrer` without its query on a first load; a plain function for the
referrer rule. The page's `docs_page_view` still fires.

Tests: the referrer from the previous portal page, and from another site without its query.

Commit: `feat(portal): report the not-found page with a clean referrer`.

#### Step 3.5: `docs_api_request` (done)

Delivers: in `api-page.tsx`, `playground.fetchOptions.onRequestInit` recording the start time
and returning `requestInit` unchanged; a `ResultDisplay` wrapping Fumadocs' default and
reporting once per result with `endpoint` (method and path as the spec writes them), `status`
(the HTTP status or `client_error`) and `duration_ms`; never `data.url`, the body or the
headers; a plain function from a result to the keys.

Tests: the keys from a `response` result and from a `client_error` result, never carrying the
request URL; the duration from the recorded start.

Commit: `feat(portal): report playground requests without their contents`.

#### Step 3.6: the docs draft (done)

Delivers: the events section of `.ai/plans/portal-analytics-docs.md`: all eight events, keys,
when each fires; the five custom dimensions and two custom metrics to register in GA4.

Commit: `docs(portal): document the eight portal events`.

**PR 3 gate:** `pnpm test` green; each event once in GTM Preview with all of its keys, checked
by the reviewer; `docs_api_request` never carrying the request URL; the "Events" line of "Done
when".

**Review of 2026-11-12** (three reviewers, fixed on the branch, uncommitted until the reviewer
says): the playground's dialog is marked for session replay as it opens, since Fumadocs portals it
outside the marked wrapper; `docs_search` carries the page searched from, captured when the
dialog opens, and a pick counts as a search; `docs_api_request` reports a result once however
often the display mounts, and a request failing before it was sent has no duration; the
code-copy listener ignores dropdowns and the playground's dialog, and prefers a block's caption
over its tab; `docs_not_found` reports once per missing page and again for the next, keyed on
the path; vendor values are escaped in the tag addresses; the GA4 warning stays quiet under
`--no-analytics`; the empty events take no keys at `report()`; the docs draft's consent, CSP,
replay, search and GA4 lines are corrected. `portal serve` runs under React's StrictMode, which is
why the once-per-result and once-per-page rules exist. The dialog marking is a workaround for fuma-nama/fumadocs#3824 (filed 2026-11-12), which asks for a prop that reaches the dialog; a follow-up to remove the observer once it ships, not a merge prerequisite. Rebased onto the base tip `d1e22066` on 2026-11-12, cleanly, with the fixes stashed and restored: the base holds fumadocs-openapi 12.6.0, having stepped back from 12.6.1 for the seven-day release-age rule. fuma-nama/fumadocs#3809 shipped in 12.6.2 on 2026-11-12 (12.6.1 answers #3810 only), which clears the rule on 2026-11-19, so the prerequisite stands until the base takes 12.6.2.

## 5. Questions each step will raise

Answered already, so the agent does not ask them:

- Names: every name in #2349's sketches stands but one: the sketch's `PortalDelivery` is not
  built. Since 2026-11-12 there is no preview mode, so what it carried is one boolean,
  `enableAnalytics`, passed as a plain parameter. The config classes are `AnalyticsConfig` and
  `SeoConfig` under `src/types/portal/config/`.
- `identity()` takes `enableAnalytics: boolean`; there is no second method for previews, and no
  preview mode: `portal serve` loads the same tags a hosted portal does, GA4 in its normal mode.
- `--no-analytics` is a plain boolean flag with the description in step 1.7; there is no
  `--with-analytics`.
- The parser's messages and the warning's text are the ones in #2348, less the format rules
  dropped on 2026-11-12 (section 2); the schema has no patterns.
- `window.gtag` is defined only when GA4 is set. GTM gets no `send()`.
- The wait (100 ms × 50) was removed on 2026-11-12; if it comes back, it is not configurable.
- Unit tests fake `window` and `document` on `globalThis`; no browser runner is added.

To check first, with evidence from `node_modules` on the branch, before the step's code:

- **1.2 (answered 2026-11-11):** `@tanstack/router-core` 1.171.28 exposes `subscribe`;
  `@tanstack/react-router` 1.170.33 queues `onRendered` at `Transitioner.js:45` and fires it
  from the layout effect at `Matches.js:37`, after the commit in which `HeadContent` renders
  the new title from the same matches store.
- **1.5:** which component fumadocs-openapi 12.6 renders for the playground ("Try in
  Playground") and what `playground.render` receives; that the extra element leaves the layout
  unchanged; whether the code samples beside the playground show what readers type (if so,
  they are marked too); that `playground` client options still apply beside a custom renderer,
  since 3.5 adds `fetchOptions` and `ResultDisplay`.
- **1.7:** how `PortalProjectService.prepare()` and the serve rewrite reach `identity()` today,
  so the flag is passed once and not stored in two places.
- **1.9 (answered 2026-11-12):** the prerender resolves the lazy playground client, so the
  operation page's HTML holds its header (method, route, the dialog trigger) inside the
  do-not-record element; the forms arrive with the chunk in the browser.
- **3.1:** the current `Actions` prop of fumadocs-ui's `CodeBlock`, and the `DownloadLink`
  props in `sdk-actions.tsx`.
- **3.2:** the copy button's position in fumadocs-ui 16.18.4's code block markup.
- **3.3:** whether fumadocs-ui 16.18.4's search dialog still calls `onOpenChange(false)` before
  `onSelect`, and whether a result count is reachable from `search.tsx`.
- **3.5:** whether `useOperationContext().route` is available inside `ResultDisplay`, and where
  the method comes from; which result shapes the display receives.

For anything else unclear, the agent asks with options and their trade-offs, then waits.

## 6. Out of scope

APIMatic's own dashboard (a separate product decision), the ready-made GTM container (good to
have, after the release), Segment and PostHog adapters, script hardening (integrity checks,
build-time reachability), the consent setting (`window.apimatic.consent.update`), and the
docs PR itself in apimatic-docs.

## 7. Starting a chat

Paste this as the first message of a new Claude Code session in this repository:

> Read `.ai/plans/portal-analytics.md` and the three issues it names (`gh issue view 2347`,
> `2348`, `2349` in `apimatic/apimatic-io`). Follow section 1 exactly: one step at a time,
> propose the step with its section 5 questions, wait for my go, build it, run the checks, and
> report. Do not commit or push unless I say `commit` or tell you to push. Start by confirming
> the base branch in section 3, then propose step 1.1.
