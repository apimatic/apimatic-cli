# [2.0.0-beta.2](https://github.com/apimatic/apimatic-cli/compare/v2.0.0-beta.1...v2.0.0-beta.2) (2026-09-29)


### Bug Fixes

* **config:** point apimatic.json's $schema at the beta dist-tag ([#406](https://github.com/apimatic/apimatic-cli/issues/406)) ([74ad5d2](https://github.com/apimatic/apimatic-cli/commit/74ad5d2eb30a5f888abbb4209be445c846b50118))
* **quickstart:** shorten the live preview and next steps notes ([#403](https://github.com/apimatic/apimatic-cli/issues/403)) ([45fcca1](https://github.com/apimatic/apimatic-cli/commit/45fcca1ad3c1a93803b67a9a0f9b0e93e3bb7db9))

# [2.0.0-beta.1](https://github.com/apimatic/apimatic-cli/compare/v1.5.0...v2.0.0-beta.1) (2026-09-28)


* build!: move to Node 24 and TypeScript 7 ([#347](https://github.com/apimatic/apimatic-cli/issues/347)) ([2528d6e](https://github.com/apimatic/apimatic-cli/commit/2528d6e643e29ac110919c4e04f92c99a103f500))
* feat(quickstart)!: one funnel, and the language question ([#363](https://github.com/apimatic/apimatic-cli/issues/363)) ([c270135](https://github.com/apimatic/apimatic-cli/commit/c270135df0c743baba3bf5e63f16f95260e1302a)), closes [#361](https://github.com/apimatic/apimatic-cli/issues/361)
* feat(sdk)!: retire v3 generation and let a publish record itself ([#359](https://github.com/apimatic/apimatic-cli/issues/359)) ([c48f91b](https://github.com/apimatic/apimatic-cli/commit/c48f91b548ae4f148449ddf3f010238edaba18a5)), closes [#358](https://github.com/apimatic/apimatic-cli/issues/358) [#358](https://github.com/apimatic/apimatic-cli/issues/358) [apimatic-io#2233](https://github.com/apimatic-io/issues/2233)


### Bug Fixes

* **config:** keep the package configuration a publish did not write ([#392](https://github.com/apimatic/apimatic-cli/issues/392)) ([bc52735](https://github.com/apimatic/apimatic-cli/commit/bc5273588af0b8077fe67113dbc5de126ee2d2b3))
* **config:** nest publishing under the language ([#350](https://github.com/apimatic/apimatic-cli/issues/350)) ([fbacf74](https://github.com/apimatic/apimatic-cli/commit/fbacf74e559fbf175b8853231cd5586197b21973))
* **deps:** take fumadocs 16.15.15, which fixes bold text in a built portal ([#388](https://github.com/apimatic/apimatic-cli/issues/388)) ([fa178ab](https://github.com/apimatic/apimatic-cli/commit/fa178ab61b22a0bf1e051cf92788b3ca2726aea1))
* **plugin:** ask only for the plugin's identity when the languages are recorded ([#389](https://github.com/apimatic/apimatic-cli/issues/389)) ([d721819](https://github.com/apimatic/apimatic-cli/commit/d721819fc02a6722480bf9bb65d52c939b82ef69)), closes [apimatic/apimatic-io#2258](https://github.com/apimatic/apimatic-io/issues/2258)
* **portal:** bundle the Geist fonts instead of loading them from Google Fonts ([#366](https://github.com/apimatic/apimatic-cli/issues/366)) ([95f2f7e](https://github.com/apimatic/apimatic-cli/commit/95f2f7edd48dd3266e4b6622976a6ec6fafa1db5))
* **portal:** drop the TypeScript definitions panel from operation pages ([#353](https://github.com/apimatic/apimatic-cli/issues/353)) ([042eb89](https://github.com/apimatic/apimatic-cli/commit/042eb89519491ee8203151743ad0c5490ec9c6db))
* **portal:** give a run the temp directory the filesystem names, not an alias ([#377](https://github.com/apimatic/apimatic-cli/issues/377)) ([d71d23f](https://github.com/apimatic/apimatic-cli/commit/d71d23f63c7b4c9e700b8e3d08fc6c378c04ff03))
* **portal:** keep the encoding a page slug carries ([#396](https://github.com/apimatic/apimatic-cli/issues/396)) ([0bec5f4](https://github.com/apimatic/apimatic-cli/commit/0bec5f4e88d9749e525405084389676debc064b3)), closes [apimatic/apimatic-io#2270](https://github.com/apimatic/apimatic-io/issues/2270)
* **portal:** keep the header's links on one line ([#398](https://github.com/apimatic/apimatic-cli/issues/398)) ([40dc472](https://github.com/apimatic/apimatic-cli/commit/40dc472479b65bf5ecb2e949f2281d327f6ff354))
* **portal:** keep the portal name on one line in the header ([#395](https://github.com/apimatic/apimatic-cli/issues/395)) ([f3d352c](https://github.com/apimatic/apimatic-cli/commit/f3d352c9446fa599904c5195560978f24cecd90e))
* **portal:** keep the preview starting until its first page answers ([#399](https://github.com/apimatic/apimatic-cli/issues/399)) ([5359442](https://github.com/apimatic/apimatic-cli/commit/5359442013accefc4f3a9ce50d78896fca937fce))
* **portal:** name the operations a shared page comes from, in words a spec's author knows ([#387](https://github.com/apimatic/apimatic-cli/issues/387)) ([01197a7](https://github.com/apimatic/apimatic-cli/commit/01197a7d994ff9a28eb48efc5a6ef4202bea6b6f))
* **portal:** offer the page actions on API reference pages ([#382](https://github.com/apimatic/apimatic-cli/issues/382)) ([22f4873](https://github.com/apimatic/apimatic-cli/commit/22f4873607306ba27e0e2c2eb0e69451d6fac359)), closes [apimatic/apimatic-io#2247](https://github.com/apimatic/apimatic-io/issues/2247) [#383](https://github.com/apimatic/apimatic-cli/issues/383)
* **portal:** refuse tag and operationId names a URL or a Windows folder cannot hold ([#400](https://github.com/apimatic/apimatic-cli/issues/400)) ([0ea01b2](https://github.com/apimatic/apimatic-cli/commit/0ea01b2ce3537e434e95cbe765a59a67d167e16c)), closes [apimatic/apimatic-io#2262](https://github.com/apimatic/apimatic-io/issues/2262) [#396](https://github.com/apimatic/apimatic-cli/issues/396)
* **portal:** render a request body in a media type Fumadocs has no adapter for ([#386](https://github.com/apimatic/apimatic-cli/issues/386)) ([9f89ad3](https://github.com/apimatic/apimatic-cli/commit/9f89ad3d3f6296130d8178aabca62e56c1babf2e))
* **portal:** render an operation whose response example has no value ([#373](https://github.com/apimatic/apimatic-cli/issues/373)) ([1dc84ad](https://github.com/apimatic/apimatic-cli/commit/1dc84ad797384e9d7cc55eb55192092b9b587379))
* **portal:** render split OpenAPI specifications correctly ([#354](https://github.com/apimatic/apimatic-cli/issues/354)) ([d97cda6](https://github.com/apimatic/apimatic-cli/commit/d97cda690e967346fa6493edffb705edfea1fc44))
* **portal:** stop printing an operation's raw description under its title ([#383](https://github.com/apimatic/apimatic-cli/issues/383)) ([25b9f6e](https://github.com/apimatic/apimatic-cli/commit/25b9f6e677e73df15659f6526f5c8fc3623e2b0b)), closes [apimatic/apimatic-io#2242](https://github.com/apimatic/apimatic-io/issues/2242)
* **quickstart:** download the sample spec from its new openapi.json path ([#401](https://github.com/apimatic/apimatic-cli/issues/401)) ([ebc6743](https://github.com/apimatic/apimatic-cli/commit/ebc67436b94d5084f0e0b0c502f3b58161a64334))
* the release test's high and medium findings ([#375](https://github.com/apimatic/apimatic-cli/issues/375)) ([7fe41e1](https://github.com/apimatic/apimatic-cli/commit/7fe41e180230a3d491283fe74f9de9c8f9785939))


### Features

* code samples support ([#352](https://github.com/apimatic/apimatic-cli/issues/352)) ([7b82568](https://github.com/apimatic/apimatic-cli/commit/7b82568b228cd665b9f103a0c636ef77c00d7d92))
* **config:** replace portal.json and plugin-config.json with apimatic.json ([#348](https://github.com/apimatic/apimatic-cli/issues/348)) ([506f67f](https://github.com/apimatic/apimatic-cli/commit/506f67f6e0b9c4ea7b79f356f3db7c5aa4cb96cd))
* local plugin generation ([#358](https://github.com/apimatic/apimatic-cli/issues/358)) ([5ba70de](https://github.com/apimatic/apimatic-cli/commit/5ba70dedc757e4d1cee05eddc69c1f84d9ea8f07)), closes [#351](https://github.com/apimatic/apimatic-cli/issues/351) [#346](https://github.com/apimatic/apimatic-cli/issues/346) [#348](https://github.com/apimatic/apimatic-cli/issues/348) [#318](https://github.com/apimatic/apimatic-cli/issues/318)
* **portal:** build the documentation portal locally with Fumadocs ([#343](https://github.com/apimatic/apimatic-cli/issues/343)) ([073d09a](https://github.com/apimatic/apimatic-cli/commit/073d09aee9b0fe40dc9ee4cdae428bf7dc8cf075))
* **portal:** build the SDK and Context Plugin pages from real templates and the portal artifacts ([#369](https://github.com/apimatic/apimatic-cli/issues/369)) ([0efd7b3](https://github.com/apimatic/apimatic-cli/commit/0efd7b3e4e49d887a621d9888c0944ea420f707f))
* **portal:** fetch the artifacts from /portal-artifacts ([#361](https://github.com/apimatic/apimatic-cli/issues/361)) ([0e823f3](https://github.com/apimatic/apimatic-cli/commit/0e823f3d1f3fdcb464af13f78bf5c26327dcbd57))
* **portal:** generate the SDK and context plugin pages ([#360](https://github.com/apimatic/apimatic-cli/issues/360)) ([338b14a](https://github.com/apimatic/apimatic-cli/commit/338b14a1de49b2887f2e08f42a246b99f99496b6))
* **portal:** give the portal block its v2 shape, with branding and tabs ([#355](https://github.com/apimatic/apimatic-cli/issues/355)) ([d0fb189](https://github.com/apimatic/apimatic-cli/commit/d0fb189da70afcec949bc658287b653a39519306))
* **portal:** lead each SDK card with its install command ([#376](https://github.com/apimatic/apimatic-cli/issues/376)) ([119e9d6](https://github.com/apimatic/apimatic-cli/commit/119e9d644c25f6465ad65224a47b22adb42e8ee8)), closes [#375](https://github.com/apimatic/apimatic-cli/issues/375)
* **portal:** let the root nav.json decide the tabs, and fix the nav.json QA findings ([#371](https://github.com/apimatic/apimatic-cli/issues/371)) ([ecf7666](https://github.com/apimatic/apimatic-cli/commit/ecf76668ec6e265c8afc7f36a3203c8687770d3b))
* **portal:** order the sidebar from nav.json ([#346](https://github.com/apimatic/apimatic-cli/issues/346)) ([306e4f9](https://github.com/apimatic/apimatic-cli/commit/306e4f9a8cfb9fa0be2cd2807abe7f559df644ff))
* **portal:** point to api transform when src/spec has no OpenAPI 3.x document ([#364](https://github.com/apimatic/apimatic-cli/issues/364)) ([eefc917](https://github.com/apimatic/apimatic-cli/commit/eefc9178d76c5863c5af6fb632463364716a7052))
* **portal:** the SDK Overview design, on the SDKs, language and plugin pages ([#391](https://github.com/apimatic/apimatic-cli/issues/391)) ([fd3fe34](https://github.com/apimatic/apimatic-cli/commit/fd3fe3463def3c1650e4df658480982c4dfd2624))
* **quickstart:** suggest validating with an AI agent when a spec fails ([#385](https://github.com/apimatic/apimatic-cli/issues/385)) ([36fd2bb](https://github.com/apimatic/apimatic-cli/commit/36fd2bb258b70cf20212ce64e8bee0cbc55addcd))


### Reverts

* **portal:** offer the page actions on API reference pages ([#382](https://github.com/apimatic/apimatic-cli/issues/382)) ([#397](https://github.com/apimatic/apimatic-cli/issues/397)) ([c087ef9](https://github.com/apimatic/apimatic-cli/commit/c087ef927e5e6919b5626dab24d203ebdd1f2fca)), closes [#388](https://github.com/apimatic/apimatic-cli/issues/388) [apimatic/apimatic-io#2247](https://github.com/apimatic/apimatic-io/issues/2247)


### BREAKING CHANGES

* `apimatic sdk save-changes` is removed, along with
`--codegen-version`, `--stability`, `--track-changes` and `--skip-changes`
on `sdk generate` and `--codegen-version`, `--stability` and
`--update-plugin-config` on `sdk publish`. Java, Ruby, Go and PHP cannot be
generated until they reach v4.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

* fix(sdk): keep --stability, which outlived the version it came with

Retiring v3 took `--stability` with it on the grounds that there was one
answer left. There is one answer *today*: v4 renders every language at beta
and they reach stable one at a time, so the level is a choice that survives
the version being fixed.

The flag is back on both commands, defaulting to stable as before, and the
level a language offers is a table rather than a constant — `stableLevels`
of one is answered without asking, and the interactive flow puts the
question back the moment a language has two. `sdk publish` names the level
in its summary only when the user chose it, read from oclif's parse
metadata, because `--stability stable` and the default are the same string
and the doc's block has no such row.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

* fix(sdk): keep --codegen-version, with one version in it

Retiring v3 removed the flag along with the version, on the grounds that a
choice of one is not a choice. But the flag is how a caller says which
generator they want, and there will be a v5: removing it makes that move a
release that changes what people get, rather than a value they pass.

`CodeGenerationVersion` now holds `V4` alone, and stays an enum so the next
one is a line in it. The flag is back on both commands, accepting `v4`,
defaulting to `v4`, and refusing `v3` by name rather than generating
something else quietly. `sdk publish` names it in its telemetry again.

It is not written down. `codegenVersion` left `apimatic.json` when the
service took over deciding the generator, so the flag says what to generate
with and nothing records what was used.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

* fix(config): drop codegenVersion from the published schema
* `apimatic quickstart` no longer offers a choice between a
portal and an SDK. It always builds a portal, and `apimatic sdk generate`
is the command for an SDK alone.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

* feat(quickstart): ask which languages the portal covers

The one question quickstart asks besides the spec. Every language a plugin
can carry comes up checked, because a first portal covering everything it
can is what a single Enter should give, and the four it cannot are named in
the prompt rather than left out in silence.

The answer is written to `apimatic.json` through `recordLanguages` before
anything is built, because that file is what says which SDKs a portal
documents — every command after this one reads it rather than the answer
that produced it.

`languageLabel` moves to `types/sdk/generate.ts`, where both prompts that
name a language can reach it, and TypeScript is spelled the way its own
project spells it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

* feat(quickstart): name the plugin after the folder, without asking

The `plugin` block is what asks the service for a context plugin, so
quickstart has to write one — and the journey allows it no question about
plugins. The identity comes from the directory the user is standing in.

A folder name is not a plugin id. `Acme Payments` and `acme_payments` are
ordinary names and neither is the kebab-case `pluginId` has to be, so the
id is made from the name while the name itself is kept as typed — the id
goes to `gh repo create`, the name is what a reader sees. A directory whose
name survives none of that falls back, because writing an id the config
would then refuse is worse than not deriving one.

`0.1.0` for the version: every plugin starts somewhere.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

* feat(quickstart): keep generated files out of the repository

Every command that builds a portal writes `src/static/sdk/`,
`src/static/plugin.zip` and an expanded `./plugin` into the project. None
of it belongs in a repository, and `portal serve` writes it too — so
without this a preview leaves a clean checkout dirty.

`/plugin/` is the one that matters. `plugin publish` runs `git init` inside
that directory and pushes it as its own repository; a parent tracking it
would nest one repository inside another.

Quickstart writes the entries because quickstart is what makes the project.
It appends what is missing and rewrites nothing, so a `.gitignore` the user
wrote survives and re-running in an adopted directory stacks no duplicates.

The paths are ignored here before anything on this branch produces them:
the placement lands with the `/portal-artifacts` call, and a user whose
first build dirties their tree has already been failed by then.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

* fix(quickstart): end in the preview again, and say the coming languages under the answer

Two things, both about where a line belongs.

The rebase onto dev quietly took dev's ending for the wizard -- the one that
stops at the scaffold because "the wizard does not ask for the project's SDK
languages yet". It does, three lines above that comment. The handoff to
`portal serve`, and the `onAfterServe` the serve action took for it, had both
gone; nothing failed, because no test described the funnel's own ending. One
does now.

`Next Steps` loses its first two items with them. It told the user to name
their SDK languages and then start a preview; the wizard has just done both.
What is left is what to change now that the portal is on screen.

The coming-soon languages move out of the multiselect's message and under the
answer, in grey. Inside the message they rendered above the languages the user
had picked, in the green a submitted answer is drawn in, reading like a fourth
option rather than a footnote to the three.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

* feat(portal): give quickstart the api transform hint, with the format it needs

Quickstart checks the spec itself before it writes the project, so the
transform hint portal generate and portal serve now give never reached it.
A Postman collection or a RAML file was told only that it was not an
OpenAPI document, with nothing to do about it.

Both now end on one sentence, which names --format=openapi3yaml: the
transform refuses to run without a format, so the command as printed
before would have failed.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>

* fix(quickstart): ignore only what is still generated into the project
* engines.node is now >=24.0.0. Node 22 is no longer supported.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

* fix(sdk): build the validation service once configDir is assigned

`validationService` was initialised from `this.configDir` in a property
initialiser, but `configDir` is a constructor parameter property. The code only
worked because TypeScript's downlevel emit assigns parameter properties before
property initialisers; under the native class-field semantics that a modern
target selects, `this.configDir` is still undefined at that point and the
service would be constructed with no config directory.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

* build: compile with TypeScript 7, keeping TypeScript 6 for linting

TypeScript 7 is the native compiler. On this repo it builds `src` in ~1.3s
against ~4.7s, and type-checks the suite in ~1.0s against ~4.8s. Emitted
output is unchanged apart from sourcemaps, temp-variable naming and
declaration ordering.

typescript-eslint cannot run on it: every published version, canary included,
declares `typescript >=4.8.4 <6.1.0` and throws at module init on TS 7, which
would take out `lint`, `posttest` and the pre-commit hook. So the two sit side
by side in Microsoft's documented arrangement — `tsc` is TypeScript 7 and
builds, bare `typescript` is the TypeScript 6 shim that only the linter loads.
Naming them this way rather than aliasing TypeScript 7 keeps the compiler each
script gets written down, and survives `pnpm update --latest`.

TypeScript 6 stopped sweeping node_modules/@types, so the test project names
the globals the suite needs; the source project resolves its types through
`node:` imports and needs no list.

`target` moves to es2024 now that the engine floor is Node 24, which also
selects native class-field semantics. `ts-node` goes: it drives the classic
compiler API, which TypeScript 7 no longer ships, and the suite runs on tsx.
`@types/mocha` was six years behind mocha and had to be named explicitly.

The `typescript.tsdk` pin is dropped. It is deprecated in favour of
`js/ts.tsdk.path`, inert unless a developer opts in by hand, and would now
point at a TypeScript 6 build within a patch of what VS Code already bundles.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

* ci: test on Node 24 and 26, and release on 24

The engine floor is Node 24, so the 22 legs go. The second leg is 26 rather
than the floor alone: 26 becomes LTS on 2026-10-28, inside this major's life,
so it is what most developers will be running. The job count is unchanged.

Releasing on Node 24 drops the `npm install -g npm@latest` step, whose only
purpose was that Node 22 bundles npm 10.9.8 while OIDC trusted publishing
needs 11.5.1. Node 24 bundles 11.19.0. The constraint moves to a comment on
the matrix, since pinning that job back to 22 would silently break publishing.

`npm-tag-latest.yml` carried a `node: [ '14' ]` matrix that no step consumed;
the job never sets up Node at all.

The standalone pnpm in test.yml is kept rather than reverted to corepack. Its
original reason is gone, but it is a SHA-pinned executable that needs no Node
of its own, where corepack would resolve pnpm from the registry at run time and
need the three-step setup-node dance the other workflows use. The comment now
states the reason that actually holds.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

* chore(vscode): repair the CLI debug configuration

`preLaunchTask` named a task the TypeScript extension provides, and that
provider is not registered when the extension stands down for TypeScript 7, so
the configuration would fail to start. The npm task provider supplies `build`
regardless, and still rebuilds before launching.

`program` pointed at `bin/run`, deleted in the ESM migration; it only launched
because Node appends `.js`. The forty commented-out argument lines carried
another machine's absolute paths.

`.gitignore` re-ignored `.vscode/launch.json` in its custom section, cancelling
the allowlist above it. Inert while the file is tracked, but it would have
refused a re-add.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

* docs: record the two-compiler toolchain and how to remove it

The `typescript` dependency no longer being the compiler is surprising enough
to look like a mistake, so state why it is there, which command gets which
compiler, and the condition for deleting the arrangement.

Also corrects the build commands, which documented `tsc -b` although the
project has no references and the scripts call plain `tsc`.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

* ci: remove unused action

* fix: broken test

* fix: mock fs broken in node 26

* ci: install pnpm standalone in the build and release workflows

Corepack is not distributed with Node 25 and newer, so the Node 26 leg of
check_build could not bootstrap pnpm. Also correct the release floor: npm
11.5.1, which trusted publishing needs, first ships in Node 24.5.0.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>

* fix(hooks): check the running Node against the declared engine range

Read engines.node from the manifest oclif has already parsed and compare
with semver, so package.json is the single source of the floor and a
minor-version floor is honoured. Test the hook's behaviour on both sides
of the range, and hold the CLI's range to the Node floors the portal
template's dependencies declare.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>

* docs: name the e2e test that depends on the two-compiler arrangement

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>

* chore: untrack launch.json and drop leftover config

launch.json goes back to being a personal, ignored file. mocha.opts named
ts-node and has been unused since mocha 8. ESLint now skips Claude Code
worktrees under .claude.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>

* fix(portal): bind the prerender preview server to 127.0.0.1

The prerender pass fetched pages from a preview server on `localhost`.
On macOS it listened on `::1` only; a stalled connect under load fell
back to 127.0.0.1 and was refused, failing the portal build.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>

# [1.5.0](https://github.com/apimatic/apimatic-cli/compare/v1.4.0...v1.5.0) (2026-09-14)


### Features

* add Codex docs link to plugin try-it-locally note ([#338](https://github.com/apimatic/apimatic-cli/issues/338)) ([b834469](https://github.com/apimatic/apimatic-cli/commit/b83446937e0d1b94d08f0c04fef226f925788ef2))
* offer v4 beta codegen for Python and TypeScript ([#341](https://github.com/apimatic/apimatic-cli/issues/341)) ([243ba2d](https://github.com/apimatic/apimatic-cli/commit/243ba2d5662e6b70326950c1a64153e1a787a164))

# [1.4.0](https://github.com/apimatic/apimatic-cli/compare/v1.3.2...v1.4.0) (2026-09-08)


### Features

* add Codex docs link to plugin try-it-locally note ([#338](https://github.com/apimatic/apimatic-cli/issues/338)) ([#339](https://github.com/apimatic/apimatic-cli/issues/339)) ([b0a0074](https://github.com/apimatic/apimatic-cli/commit/b0a0074941d15bc3a396a9afaff7f283b0b039e3))

## [1.3.2](https://github.com/apimatic/apimatic-cli/compare/v1.3.1...v1.3.2) (2026-09-02)


### Bug Fixes

* drop Claude Code references from plugin generate ([#335](https://github.com/apimatic/apimatic-cli/issues/335)) ([561a92a](https://github.com/apimatic/apimatic-cli/commit/561a92aa8ba5717a80b72fb9b12ad164d0495353))

## [1.3.1](https://github.com/apimatic/apimatic-cli/compare/v1.3.0...v1.3.1) (2026-08-31)


### Bug Fixes

* stop requiring APIMATIC-BUILD.json for plugin generate ([#333](https://github.com/apimatic/apimatic-cli/issues/333)) ([61dc199](https://github.com/apimatic/apimatic-cli/commit/61dc1991bab810409ad4a68f7358ef5624747655)), closes [#332](https://github.com/apimatic/apimatic-cli/issues/332)

# [1.3.0](https://github.com/apimatic/apimatic-cli/compare/v1.2.1...v1.3.0) (2026-08-27)


### Bug Fixes

* add docs link to publishing profile messages ([#329](https://github.com/apimatic/apimatic-cli/issues/329)) ([041aac8](https://github.com/apimatic/apimatic-cli/commit/041aac87d2d1dd4ca75a7a7508c4fa73498f331e))
* clarify CLI messages for plugin generation and publishing setup ([#325](https://github.com/apimatic/apimatic-cli/issues/325)) ([711fc39](https://github.com/apimatic/apimatic-cli/commit/711fc39f6aff0b817daf5ec887db928d5eb53122))
* fail when --expand-* flags cannot be honoured without a spec ([c1e826c](https://github.com/apimatic/apimatic-cli/commit/c1e826c9bb2308333b00dfa4d02f80a816f2e345))
* guard the 401 body parse on the transformation error path ([0871f65](https://github.com/apimatic/apimatic-cli/commit/0871f65b599225221634a04b0a265de781b6c169))
* name the build directory correctly in the empty spec error ([d73c5c3](https://github.com/apimatic/apimatic-cli/commit/d73c5c37e9c521d5fe069433de4dcad06152ee92))
* point the auth hint at the command that accepts the key ([2ad98cd](https://github.com/apimatic/apimatic-cli/commit/2ad98cd7be0193455bf31d7a9e3a1f470cf63e46))
* poll for publish completion in interactive sdk publish ([#315](https://github.com/apimatic/apimatic-cli/issues/315)) ([68b5660](https://github.com/apimatic/apimatic-cli/commit/68b566015955d278de9646c341fabaa2701daad9)), closes [#312](https://github.com/apimatic/apimatic-cli/issues/312) [#313](https://github.com/apimatic/apimatic-cli/issues/313)
* report a rejected auth key accurately on login ([8bb35eb](https://github.com/apimatic/apimatic-cli/commit/8bb35eb59b17a0ecf3d9f1bb2a3080c1c03b0099))
* report every validation error and extract shared generation status polling ([#307](https://github.com/apimatic/apimatic-cli/issues/307)) ([e823b4d](https://github.com/apimatic/apimatic-cli/commit/e823b4d25411608080eec0384a197697f4db3775))
* report logged-out state correctly in auth status ([2993889](https://github.com/apimatic/apimatic-cli/commit/2993889c62306eefc14ed539cb3b37dcc580fa2f))
* report the build directory in the toc spec errors ([9a56786](https://github.com/apimatic/apimatic-cli/commit/9a5678677939fd495f550a72b30bef4f0fbf67bd))
* require a spec directory for portal toc new ([8432629](https://github.com/apimatic/apimatic-cli/commit/843262989f389ee090d4c3a4d710a65be8fc13f9))
* surface actionable auth hint on validate, transform and publishing errors ([a1ab840](https://github.com/apimatic/apimatic-cli/commit/a1ab84045a389544fe73866286dd0acc9bd39c16))
* surface TOC extraction failures instead of writing a partial toc.yml ([5332a99](https://github.com/apimatic/apimatic-cli/commit/5332a99740edf011c171b208613e71965a7a13d9))


### Features

* add `apimatic plugin generate`, and share one bounded generation poll ([#314](https://github.com/apimatic/apimatic-cli/issues/314)) ([8f00d76](https://github.com/apimatic/apimatic-cli/commit/8f00d7667b68b0da503c18d56e7222aca3566c00)), closes [apimatic/apimatic-docs#829](https://github.com/apimatic/apimatic-docs/issues/829)
* add apimatic plugin publish ([#321](https://github.com/apimatic/apimatic-cli/issues/321)) ([31a233a](https://github.com/apimatic/apimatic-cli/commit/31a233a942e830bae47898bc13b3b1d1a453167e))
* AI-first messaging and Copilot-aware portal quickstart next steps ([177de58](https://github.com/apimatic/apimatic-cli/commit/177de586e303f5a7e3534f2e9efb4f2d60956c8f))
* create and maintain plugin-config.json from sdk publish and plugin generate ([#318](https://github.com/apimatic/apimatic-cli/issues/318)) ([4d2ecd7](https://github.com/apimatic/apimatic-cli/commit/4d2ecd7d384d972dba558a846b5e8175679798ca))
* lead with Context Plugins in quickstart and portal messaging ([e522c1c](https://github.com/apimatic/apimatic-cli/commit/e522c1ce4c11a251f146852415aa06a0c592d240))
* **quickstart:** prune build file to subscription before generating ([#294](https://github.com/apimatic/apimatic-cli/issues/294)) ([5d50968](https://github.com/apimatic/apimatic-cli/commit/5d509682696513d5fdd1de51b1b507b24dd8cd18))
* sdk publish v4 ([#317](https://github.com/apimatic/apimatic-cli/issues/317)) ([9ce977f](https://github.com/apimatic/apimatic-cli/commit/9ce977f5c1b3bf26aea1b311cee6e2b19ab63aac))
* surface API 401 error message with login suggestion in portal generation ([adaa8ae](https://github.com/apimatic/apimatic-cli/commit/adaa8aebd2a10bea57eec2e62a4409180be23ca4))
* tell the user how to try the generated plugin in Claude Code ([#326](https://github.com/apimatic/apimatic-cli/issues/326)) ([c7bff42](https://github.com/apimatic/apimatic-cli/commit/c7bff4232f32ff9024b3a4c610a41774a3acca68))


### Performance Improvements

* cli cold start ([#328](https://github.com/apimatic/apimatic-cli/issues/328)) ([4c4440f](https://github.com/apimatic/apimatic-cli/commit/4c4440fde666fbf70c37a4ee9ce06f6e9128111e))

## [1.2.1](https://github.com/apimatic/apimatic-cli/compare/v1.2.0...v1.2.1) (2026-08-06)


### Bug Fixes

* surface better errors in auth, toc & portal commands ([#308](https://github.com/apimatic/apimatic-cli/issues/308)) ([743caaf](https://github.com/apimatic/apimatic-cli/commit/743caaf2797e633d92bf21126f226b9f6337c44e)), closes [#302](https://github.com/apimatic/apimatic-cli/issues/302) [#300](https://github.com/apimatic/apimatic-cli/issues/300)

# [1.2.0](https://github.com/apimatic/apimatic-cli/compare/v1.1.0...v1.2.0) (2026-07-14)


### Features

* **quickstart:** prune build file to subscription before generating ([#294](https://github.com/apimatic/apimatic-cli/issues/294)) ([#296](https://github.com/apimatic/apimatic-cli/issues/296)) ([5f90b2a](https://github.com/apimatic/apimatic-cli/commit/5f90b2a57d47f3e2934f62f5994d3e4489fd1ba8))

# [1.1.0](https://github.com/apimatic/apimatic-cli/compare/v1.0.0...v1.1.0) (2026-07-02)


### Features

* graduate APIMatic CLI to first stable release ([#293](https://github.com/apimatic/apimatic-cli/issues/293)) ([7e92410](https://github.com/apimatic/apimatic-cli/commit/7e924107f8cf7ca6da67b9ab5f433be1404a51d3))

# [1.1.0-beta.19](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-beta.18...v1.1.0-beta.19) (2026-06-24)


### Features

* **portal:** prefer port 23513 and auto-configure API Copilot in quickstart ([#290](https://github.com/apimatic/apimatic-cli/issues/290)) ([45cc0e6](https://github.com/apimatic/apimatic-cli/commit/45cc0e69517892ecba33b8f6caf6770032bb42ba)), closes [#291](https://github.com/apimatic/apimatic-cli/issues/291)

# [1.1.0-beta.18](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-beta.17...v1.1.0-beta.18) (2026-06-11)


### Bug Fixes

* prevent portal generate hang on Node 22+ by extracting with adm-zip ([#283](https://github.com/apimatic/apimatic-cli/issues/283)) ([#284](https://github.com/apimatic/apimatic-cli/issues/284)) ([e3bac3e](https://github.com/apimatic/apimatic-cli/commit/e3bac3e6589f6580dd4fc74240c675b7c9550490))

# [1.1.0-beta.17](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-beta.16...v1.1.0-beta.17) (2026-05-15)


### Features

* add support for generation of v4 sdks ([#282](https://github.com/apimatic/apimatic-cli/issues/282)) ([8ad0138](https://github.com/apimatic/apimatic-cli/commit/8ad013806642ec3807dcd740a16d40b2f3b3e418))

# [1.1.0-beta.16](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-beta.15...v1.1.0-beta.16) (2026-05-13)


### Bug Fixes

* resolve sdk publishing for ruby and python ([#279](https://github.com/apimatic/apimatic-cli/issues/279)) ([21ad18a](https://github.com/apimatic/apimatic-cli/commit/21ad18a6cf13431fbb01cafabef2242b5407edae))

# [1.1.0-beta.15](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-beta.14...v1.1.0-beta.15) (2026-05-08)


### Features

* add container and input models in toc using new toc command ([#276](https://github.com/apimatic/apimatic-cli/issues/276)) ([3ae4374](https://github.com/apimatic/apimatic-cli/commit/3ae43743585c2c843bebdec936698e72c44c94a7))

# [1.1.0-beta.14](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-beta.13...v1.1.0-beta.14) (2026-04-28)


### Bug Fixes

* pass package settings directory only when package settings applied ([#274](https://github.com/apimatic/apimatic-cli/issues/274)) ([f178c20](https://github.com/apimatic/apimatic-cli/commit/f178c204bd2f1fbf5913af832549ce45aaaae6ee))

# [1.1.0-beta.13](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-beta.12...v1.1.0-beta.13) (2026-04-27)


### Bug Fixes

* resolve package-publishing api url ([#273](https://github.com/apimatic/apimatic-cli/issues/273)) ([99badc4](https://github.com/apimatic/apimatic-cli/commit/99badc4fb5b68eb118c8ba7c26a612e366e79039))

# [1.1.0-beta.12](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-beta.11...v1.1.0-beta.12) (2026-04-27)


### Features

* add sdk publish and publishing profile list commands ([#271](https://github.com/apimatic/apimatic-cli/issues/271)) ([71d0d75](https://github.com/apimatic/apimatic-cli/commit/71d0d75e16ee071b0dbd064a18cf95a11ad58c1a))

# [1.1.0-beta.11](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-beta.10...v1.1.0-beta.11) (2026-04-15)


### Features

* add sdk save-changes command for applying sdk customizations ([#270](https://github.com/apimatic/apimatic-cli/issues/270)) ([e170f61](https://github.com/apimatic/apimatic-cli/commit/e170f613ea2a1b95bad6c8a6c6d26a238c2cf062))

# [1.1.0-beta.10](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-beta.9...v1.1.0-beta.10) (2026-03-25)


### Bug Fixes

* simplify portal serve caching logic and fix debounce scheduling ([#253](https://github.com/apimatic/apimatic-cli/issues/253)) ([6c28da7](https://github.com/apimatic/apimatic-cli/commit/6c28da782e788b25ada8ad362c42b9cbdf186ba9))

# [1.1.0-beta.9](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-beta.8...v1.1.0-beta.9) (2026-03-11)


### Features

* add api-version flag in sdk generate ([#250](https://github.com/apimatic/apimatic-cli/issues/250)) ([2b007e1](https://github.com/apimatic/apimatic-cli/commit/2b007e17a05fba784b487646dc02bdbded3247a3)), closes [#249](https://github.com/apimatic/apimatic-cli/issues/249)

# [1.1.0-beta.8](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-beta.7...v1.1.0-beta.8) (2026-03-09)


### Bug Fixes

* update sdk quickstart to create minimal build ([#247](https://github.com/apimatic/apimatic-cli/issues/247)) ([9e54611](https://github.com/apimatic/apimatic-cli/commit/9e546110e3db251e0bc5d5a6747b31fa7b0d90b5)), closes [#246](https://github.com/apimatic/apimatic-cli/issues/246)

# [1.1.0-beta.7](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-beta.6...v1.1.0-beta.7) (2026-03-05)


### Features

* update sdk generate to accept build input instead of a spec file ([#243](https://github.com/apimatic/apimatic-cli/issues/243)) ([ea8e088](https://github.com/apimatic/apimatic-cli/commit/ea8e0888f5cbbf71c3a1d7dcb64e7e360546e804))

# [1.1.0-beta.6](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-beta.5...v1.1.0-beta.6) (2026-01-02)


### Features

* update status response handling for portal generation ([#232](https://github.com/apimatic/apimatic-cli/issues/232)) ([703b14d](https://github.com/apimatic/apimatic-cli/commit/703b14d1b32be37075bb780ed9a6a390a276b1a6))

# [1.1.0-beta.5](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-beta.4...v1.1.0-beta.5) (2025-11-25)


### Bug Fixes

* broken quickstart sample flow and empty events in toc ([#227](https://github.com/apimatic/apimatic-cli/issues/227)) ([acd2837](https://github.com/apimatic/apimatic-cli/commit/acd2837548179a4c46fe4b39ef020b345d8c2115))

# [1.1.0-beta.4](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-beta.3...v1.1.0-beta.4) (2025-11-10)


### Bug Fixes

* failing pruning api call ([#224](https://github.com/apimatic/apimatic-cli/issues/224)) ([04110e6](https://github.com/apimatic/apimatic-cli/commit/04110e618fd68b89797e2d8d376c3e918a66dede))

# [1.1.0-beta.3](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-beta.2...v1.1.0-beta.3) (2025-11-07)


### Features

* add support for spec pruning and webhooks callbacks flags in toc command  ([#220](https://github.com/apimatic/apimatic-cli/issues/220)) ([241d4be](https://github.com/apimatic/apimatic-cli/commit/241d4bed12dc705cdc10584cb91b08317b91e583))
* portal quickstart http multiselect ([#214](https://github.com/apimatic/apimatic-cli/issues/214)) ([0ee9f50](https://github.com/apimatic/apimatic-cli/commit/0ee9f5035f97803035fcc319718fe9e6c672d022))

# [1.1.0-beta.2](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-beta.1...v1.1.0-beta.2) (2025-09-19)


### Bug Fixes

* **readme:** remove portal quickstart references ([#212](https://github.com/apimatic/apimatic-cli/issues/212)) ([0840e19](https://github.com/apimatic/apimatic-cli/commit/0840e19c502d2b493c5d14ac0ffb16fc5a65ce28))

# [1.1.0-beta.1](https://github.com/apimatic/apimatic-cli/compare/v1.0.0-beta.1...v1.1.0-beta.1) (2025-09-19)


### Features

* add sdk quickstart flow and other various improvements ([#210](https://github.com/apimatic/apimatic-cli/issues/210)) ([2750491](https://github.com/apimatic/apimatic-cli/commit/2750491d68f53979d8bf7651f6e14568e57d2476))

# 1.0.0-beta.1 (2025-09-08)


### Bug Fixes

* add missing content header to telemetry api call ([#139](https://github.com/apimatic/apimatic-cli/issues/139)) ([f2b0e64](https://github.com/apimatic/apimatic-cli/commit/f2b0e64826d987ca844b285d8862ebf25e0fe286))
* **documentation:** improve messages for each command ([a2c0bfb](https://github.com/apimatic/apimatic-cli/commit/a2c0bfbd5c1867302cf27170dc3b2d3ca5bd64ca))
* **feature:** add force flag and change sdk version and package ([38db116](https://github.com/apimatic/apimatic-cli/commit/38db116b65b94f01a15c7c2d6351401a60ee1393))
* **help inconsistent:** fix help being inconsistent with actual platforms supported in sdk generate ([23b6e6d](https://github.com/apimatic/apimatic-cli/commit/23b6e6da15a073afa71962458c825ba54bcd5f50))
* **package:** change version in package file ([903c619](https://github.com/apimatic/apimatic-cli/commit/903c6196ef5e37fbffd8d6b744d6eedcdd7167f5))
* **path:** resolve paths to absolute ([f68bdde](https://github.com/apimatic/apimatic-cli/commit/f68bdde7e8c927602ea87e07d0e558b699082154))
* **portal:** override authkey not working if user is never logged in ever ([fb5d188](https://github.com/apimatic/apimatic-cli/commit/fb5d1884e7dc12917387903e5292e50367190162))
* quickstart fails for zipped specs ([#107](https://github.com/apimatic/apimatic-cli/issues/107)) ([49b403c](https://github.com/apimatic/apimatic-cli/commit/49b403c2b18fee6f203e9f0193531927fb47ca56))
* **readme & bug fix:** update readme, fix bugs ([141f1a9](https://github.com/apimatic/apimatic-cli/commit/141f1a9ad53b80fdb91d39ca87f61b6cdfc7d700))
* **refactor:** move print validation logic to utils file as common function and pretty the code ([05dbe41](https://github.com/apimatic/apimatic-cli/commit/05dbe41c875c70e4a2e6183e647c6fea1e10ad83))
* **refactor:** refactor code ([d7cb486](https://github.com/apimatic/apimatic-cli/commit/d7cb4863bcfd44f297f0525e0c7eae7ecef12695))
* **release:** add lock file to gitignore restore check_build workflow ([2eb959a](https://github.com/apimatic/apimatic-cli/commit/2eb959afc2a7ee2317959fc8525930acde2989dc))
* remove ignore flag from portal serve ([#140](https://github.com/apimatic/apimatic-cli/issues/140)) ([336f5b7](https://github.com/apimatic/apimatic-cli/commit/336f5b750997dd6d1a8b5a1da4f85137283bb3ad))
* remove simple-git dependency ([#151](https://github.com/apimatic/apimatic-cli/issues/151)) ([04d4669](https://github.com/apimatic/apimatic-cli/commit/04d466994722c116422d7e0d281a308c5c7dc355))
* removed existing spec in quickstart when providing spec explicitly ([#147](https://github.com/apimatic/apimatic-cli/issues/147)) ([126318f](https://github.com/apimatic/apimatic-cli/commit/126318f0c497fc105a51ede3febe07731c09b41f))
* resolve bug in unarchive method ([#144](https://github.com/apimatic/apimatic-cli/issues/144)) ([e70b7d2](https://github.com/apimatic/apimatic-cli/commit/e70b7d2c03069297a1c0fba1cf7529a74eadd2bd))
* resolve multiple visual issues and minor fixes  ([#136](https://github.com/apimatic/apimatic-cli/issues/136)) ([4589a6e](https://github.com/apimatic/apimatic-cli/commit/4589a6e988f0cddfa49fb9e7a995f41912c9451d))
* resolved import for filetype to conform with esm ([#106](https://github.com/apimatic/apimatic-cli/issues/106)) ([234d00f](https://github.com/apimatic/apimatic-cli/commit/234d00f2eeae0b7ff89f2386108d951b7658d1eb))
* **sdk & transform:** Fix bugs related to content and corner cases in transform and sdk generate ([e08ba51](https://github.com/apimatic/apimatic-cli/commit/e08ba51d6fc98e991f06f910702fd6b106868fbc))
* **sdk package:** get sdk package from npm ([4c8e178](https://github.com/apimatic/apimatic-cli/commit/4c8e1787eb21f04d81cab95b5a58e3133a61f7af))
* **types:** Add graphql type in destination format of schema ([019aed3](https://github.com/apimatic/apimatic-cli/commit/019aed39c8a9cb8425f2d46d1b9b58f6b8c69475))
* update user-agent format in api calls ([#135](https://github.com/apimatic/apimatic-cli/issues/135)) ([b16e374](https://github.com/apimatic/apimatic-cli/commit/b16e3747f9f62851c4d4b0cc975bfecdd7076d5d))
* updated dependency version of apimatic/sdk ([#90](https://github.com/apimatic/apimatic-cli/issues/90)) ([8efd8f8](https://github.com/apimatic/apimatic-cli/commit/8efd8f810b9d71914e1ffc762d2ab4b65a9040f9))
* **version:** update sdk and cli versions ([75cc181](https://github.com/apimatic/apimatic-cli/commit/75cc18146f2ec198ca7e82189f2d16281dce80f8))


### Features

* add better error messaging for sdk generation failures ([bac2b62](https://github.com/apimatic/apimatic-cli/commit/bac2b623a2a3efd2a78c711c731cb6c2764913cd))
* add new prompt framework ([#189](https://github.com/apimatic/apimatic-cli/issues/189)) ([1181f9e](https://github.com/apimatic/apimatic-cli/commit/1181f9ec60bacb634b585ce5ff0a482e9654778b))
* add responses for generate-via-file ([#143](https://github.com/apimatic/apimatic-cli/issues/143)) ([386be66](https://github.com/apimatic/apimatic-cli/commit/386be66c7f24df2b0fe9a9456bf23c998f9c00c3))
* add tracking events and improve messaging ([#171](https://github.com/apimatic/apimatic-cli/issues/171)) ([20c45de](https://github.com/apimatic/apimatic-cli/commit/20c45deed7a10cceb5d587290e4e31905e69c552))
* adds user-agent and various other improvements for serve, quickstart and recipe commands ([#110](https://github.com/apimatic/apimatic-cli/issues/110)) ([5eecf75](https://github.com/apimatic/apimatic-cli/commit/5eecf754b366015edf6a20f5ee354f9aec814abd))
* **auth-key in authorization flow:** add authorization in auth flow ([7522c43](https://github.com/apimatic/apimatic-cli/commit/7522c4340043958e4e8b3eb6ff8a45fc249bf524))
* **environment:** now cli will use production environment, make subscription messages more readable ([7868f76](https://github.com/apimatic/apimatic-cli/commit/7868f76f36af65f1bf774711c888d5d365a9094a))
* improve copilot prompts and messages ([#137](https://github.com/apimatic/apimatic-cli/issues/137)) ([a0906a6](https://github.com/apimatic/apimatic-cli/commit/a0906a641f631f7d9f4043eb27935122c16b52af))
* **login command:** implement login command ([47a9fca](https://github.com/apimatic/apimatic-cli/commit/47a9fca890c2ac30030761ca6c419259fff2c743))
* **portal:** adds portal quickstart and serve commands ([#33](https://github.com/apimatic/apimatic-cli/issues/33)) ([ab2da9a](https://github.com/apimatic/apimatic-cli/commit/ab2da9a0bcea520abcb92bba7e0d75b7dce6af60)), closes [#10](https://github.com/apimatic/apimatic-cli/issues/10)
* **portal:** adds portal:new:toc command and other various improvements ([#93](https://github.com/apimatic/apimatic-cli/issues/93)) ([cfae452](https://github.com/apimatic/apimatic-cli/commit/cfae452b26f2ebf393b22afb82740e5b18c78738)), closes [#55](https://github.com/apimatic/apimatic-cli/issues/55) [#56](https://github.com/apimatic/apimatic-cli/issues/56) [#72](https://github.com/apimatic/apimatic-cli/issues/72) [#73](https://github.com/apimatic/apimatic-cli/issues/73)
* **portal:** adds portal:recipe:new command for api recipes and migrates codebase to esm from commonjs ([#103](https://github.com/apimatic/apimatic-cli/issues/103)) ([adb6d0d](https://github.com/apimatic/apimatic-cli/commit/adb6d0dfdf878744fe744f6cee70acbecf8b269d)), closes [#62](https://github.com/apimatic/apimatic-cli/issues/62)
* rename portal:new:toc command to portal:toc:new ([#99](https://github.com/apimatic/apimatic-cli/issues/99)) ([1a6b1c4](https://github.com/apimatic/apimatic-cli/commit/1a6b1c4aa42aa23bf5439f473f8176f2733f41bf))
* restructure working directory usage across all portal commands ([#123](https://github.com/apimatic/apimatic-cli/issues/123)) ([a842d8f](https://github.com/apimatic/apimatic-cli/commit/a842d8ff05d198a35e0630d8dd3971e4f39ebabd))
* update apimatic.io base url with new subdomain base url ([a8796cd](https://github.com/apimatic/apimatic-cli/commit/a8796cd84f4f3b415e094b1af93f3e144272626b))
* update apimatic.io sdk ([1c4c576](https://github.com/apimatic/apimatic-cli/commit/1c4c576ed933e95362f198372f258782e5f4788a))
* update input directory structure for most commands and device login flow ([#134](https://github.com/apimatic/apimatic-cli/issues/134)) ([e172aa8](https://github.com/apimatic/apimatic-cli/commit/e172aa80c7978aa5b20591befceb09f70198f9a6)), closes [#111](https://github.com/apimatic/apimatic-cli/issues/111) [#113](https://github.com/apimatic/apimatic-cli/issues/113) [#116](https://github.com/apimatic/apimatic-cli/issues/116) [#117](https://github.com/apimatic/apimatic-cli/issues/117) [#119](https://github.com/apimatic/apimatic-cli/issues/119) [#124](https://github.com/apimatic/apimatic-cli/issues/124) [#125](https://github.com/apimatic/apimatic-cli/issues/125) [#126](https://github.com/apimatic/apimatic-cli/issues/126) [#130](https://github.com/apimatic/apimatic-cli/issues/130) [#129](https://github.com/apimatic/apimatic-cli/issues/129) [#127](https://github.com/apimatic/apimatic-cli/issues/127)
* update tslib dependency version to match apimatic sdk ([be06f73](https://github.com/apimatic/apimatic-cli/commit/be06f735eafdd93204800efeebc2d85f5c0e8613))
* **usage tracking:** update sdk to send cli user agent for tracking ([768c60b](https://github.com/apimatic/apimatic-cli/commit/768c60b14a7fac3b824d4178697971ecf9d431b2))

# [1.1.0-alpha.22](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-alpha.21...v1.1.0-alpha.22) (2025-09-05)


### Features

* add new prompt framework ([#189](https://github.com/apimatic/apimatic-cli/issues/189)) ([1181f9e](https://github.com/apimatic/apimatic-cli/commit/1181f9ec60bacb634b585ce5ff0a482e9654778b))

# [1.1.0-alpha.21](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-alpha.20...v1.1.0-alpha.21) (2025-08-18)


### Features

* add tracking events and improve messaging ([#171](https://github.com/apimatic/apimatic-cli/issues/171)) ([20c45de](https://github.com/apimatic/apimatic-cli/commit/20c45deed7a10cceb5d587290e4e31905e69c552))

# [1.1.0-alpha.20](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-alpha.19...v1.1.0-alpha.20) (2025-08-11)


### Bug Fixes

* remove simple-git dependency ([#151](https://github.com/apimatic/apimatic-cli/issues/151)) ([04d4669](https://github.com/apimatic/apimatic-cli/commit/04d466994722c116422d7e0d281a308c5c7dc355))

# [1.1.0-alpha.19](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-alpha.18...v1.1.0-alpha.19) (2025-08-06)


### Bug Fixes

* add missing content header to telemetry api call ([#139](https://github.com/apimatic/apimatic-cli/issues/139)) ([f2b0e64](https://github.com/apimatic/apimatic-cli/commit/f2b0e64826d987ca844b285d8862ebf25e0fe286))
* remove ignore flag from portal serve ([#140](https://github.com/apimatic/apimatic-cli/issues/140)) ([336f5b7](https://github.com/apimatic/apimatic-cli/commit/336f5b750997dd6d1a8b5a1da4f85137283bb3ad))
* removed existing spec in quickstart when providing spec explicitly ([#147](https://github.com/apimatic/apimatic-cli/issues/147)) ([126318f](https://github.com/apimatic/apimatic-cli/commit/126318f0c497fc105a51ede3febe07731c09b41f))
* resolve bug in unarchive method ([#144](https://github.com/apimatic/apimatic-cli/issues/144)) ([e70b7d2](https://github.com/apimatic/apimatic-cli/commit/e70b7d2c03069297a1c0fba1cf7529a74eadd2bd))


### Features

* add better error messaging for sdk generation failures ([bac2b62](https://github.com/apimatic/apimatic-cli/commit/bac2b623a2a3efd2a78c711c731cb6c2764913cd))
* add responses for generate-via-file ([#143](https://github.com/apimatic/apimatic-cli/issues/143)) ([386be66](https://github.com/apimatic/apimatic-cli/commit/386be66c7f24df2b0fe9a9456bf23c998f9c00c3))

# [1.1.0-alpha.18](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-alpha.17...v1.1.0-alpha.18) (2025-08-03)


### Features

* improve copilot prompts and messages ([#137](https://github.com/apimatic/apimatic-cli/issues/137)) ([a0906a6](https://github.com/apimatic/apimatic-cli/commit/a0906a641f631f7d9f4043eb27935122c16b52af))

# [1.1.0-alpha.17](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-alpha.16...v1.1.0-alpha.17) (2025-08-01)


### Bug Fixes

* resolve multiple visual issues and minor fixes  ([#136](https://github.com/apimatic/apimatic-cli/issues/136)) ([4589a6e](https://github.com/apimatic/apimatic-cli/commit/4589a6e988f0cddfa49fb9e7a995f41912c9451d))

# [1.1.0-alpha.16](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-alpha.15...v1.1.0-alpha.16) (2025-08-01)


### Bug Fixes

* update user-agent format in api calls ([#135](https://github.com/apimatic/apimatic-cli/issues/135)) ([b16e374](https://github.com/apimatic/apimatic-cli/commit/b16e3747f9f62851c4d4b0cc975bfecdd7076d5d))

# [1.1.0-alpha.15](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-alpha.14...v1.1.0-alpha.15) (2025-08-01)


### Features

* update input directory structure for most commands and device login flow ([#134](https://github.com/apimatic/apimatic-cli/issues/134)) ([e172aa8](https://github.com/apimatic/apimatic-cli/commit/e172aa80c7978aa5b20591befceb09f70198f9a6)), closes [#111](https://github.com/apimatic/apimatic-cli/issues/111) [#113](https://github.com/apimatic/apimatic-cli/issues/113) [#116](https://github.com/apimatic/apimatic-cli/issues/116) [#117](https://github.com/apimatic/apimatic-cli/issues/117) [#119](https://github.com/apimatic/apimatic-cli/issues/119) [#124](https://github.com/apimatic/apimatic-cli/issues/124) [#125](https://github.com/apimatic/apimatic-cli/issues/125) [#126](https://github.com/apimatic/apimatic-cli/issues/126) [#130](https://github.com/apimatic/apimatic-cli/issues/130) [#129](https://github.com/apimatic/apimatic-cli/issues/129) [#127](https://github.com/apimatic/apimatic-cli/issues/127)

# [1.1.0-alpha.14](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-alpha.13...v1.1.0-alpha.14) (2025-07-25)


### Features

* restructure working directory usage across all portal commands ([#123](https://github.com/apimatic/apimatic-cli/issues/123)) ([a842d8f](https://github.com/apimatic/apimatic-cli/commit/a842d8ff05d198a35e0630d8dd3971e4f39ebabd))

# [1.1.0-alpha.13](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-alpha.12...v1.1.0-alpha.13) (2025-07-11)


### Features

* adds user-agent and various other improvements for serve, quickstart and recipe commands ([#110](https://github.com/apimatic/apimatic-cli/issues/110)) ([5eecf75](https://github.com/apimatic/apimatic-cli/commit/5eecf754b366015edf6a20f5ee354f9aec814abd))

# [1.1.0-alpha.12](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-alpha.11...v1.1.0-alpha.12) (2025-07-04)


### Bug Fixes

* quickstart fails for zipped specs ([#107](https://github.com/apimatic/apimatic-cli/issues/107)) ([49b403c](https://github.com/apimatic/apimatic-cli/commit/49b403c2b18fee6f203e9f0193531927fb47ca56))

# [1.1.0-alpha.11](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-alpha.10...v1.1.0-alpha.11) (2025-07-04)


### Bug Fixes

* resolved import for filetype to conform with esm ([#106](https://github.com/apimatic/apimatic-cli/issues/106)) ([234d00f](https://github.com/apimatic/apimatic-cli/commit/234d00f2eeae0b7ff89f2386108d951b7658d1eb))

# [1.1.0-alpha.10](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-alpha.9...v1.1.0-alpha.10) (2025-07-03)


### Features

* **portal:** adds portal:recipe:new command for api recipes and migrates codebase to esm from commonjs ([#103](https://github.com/apimatic/apimatic-cli/issues/103)) ([adb6d0d](https://github.com/apimatic/apimatic-cli/commit/adb6d0dfdf878744fe744f6cee70acbecf8b269d)), closes [#62](https://github.com/apimatic/apimatic-cli/issues/62)

# [1.1.0-alpha.9](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-alpha.8...v1.1.0-alpha.9) (2025-06-26)


### Features

* rename portal:new:toc command to portal:toc:new ([#99](https://github.com/apimatic/apimatic-cli/issues/99)) ([1a6b1c4](https://github.com/apimatic/apimatic-cli/commit/1a6b1c4aa42aa23bf5439f473f8176f2733f41bf))

# [1.1.0-alpha.8](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-alpha.7...v1.1.0-alpha.8) (2025-06-24)


### Features

* **portal:** adds portal:new:toc command and other various improvements ([#93](https://github.com/apimatic/apimatic-cli/issues/93)) ([cfae452](https://github.com/apimatic/apimatic-cli/commit/cfae452b26f2ebf393b22afb82740e5b18c78738)), closes [#55](https://github.com/apimatic/apimatic-cli/issues/55) [#56](https://github.com/apimatic/apimatic-cli/issues/56) [#72](https://github.com/apimatic/apimatic-cli/issues/72) [#73](https://github.com/apimatic/apimatic-cli/issues/73)

# [1.1.0-alpha.7](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-alpha.6...v1.1.0-alpha.7) (2025-06-20)


### Bug Fixes

* updated dependency version of apimatic/sdk ([#90](https://github.com/apimatic/apimatic-cli/issues/90)) ([8efd8f8](https://github.com/apimatic/apimatic-cli/commit/8efd8f810b9d71914e1ffc762d2ab4b65a9040f9))

# [1.1.0-alpha.6](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-alpha.5...v1.1.0-alpha.6) (2025-03-17)


### Features

* **portal:** adds portal quickstart and serve commands ([#33](https://github.com/apimatic/apimatic-cli/issues/33)) ([ab2da9a](https://github.com/apimatic/apimatic-cli/commit/ab2da9a0bcea520abcb92bba7e0d75b7dce6af60)), closes [#10](https://github.com/apimatic/apimatic-cli/issues/10)

# [1.1.0-alpha.5](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-alpha.4...v1.1.0-alpha.5) (2023-09-28)


### Features

* update tslib dependency version to match apimatic sdk ([be06f73](https://github.com/apimatic/apimatic-cli/commit/be06f735eafdd93204800efeebc2d85f5c0e8613))

# [1.1.0-alpha.4](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-alpha.3...v1.1.0-alpha.4) (2023-09-28)


### Features

* update apimatic.io base url with new subdomain base url ([a8796cd](https://github.com/apimatic/apimatic-cli/commit/a8796cd84f4f3b415e094b1af93f3e144272626b))
* update apimatic.io sdk ([1c4c576](https://github.com/apimatic/apimatic-cli/commit/1c4c576ed933e95362f198372f258782e5f4788a))

# [1.1.0-alpha.3](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-alpha.2...v1.1.0-alpha.3) (2022-01-19)


### Features

* **usage tracking:** update sdk to send cli user agent for tracking ([768c60b](https://github.com/apimatic/apimatic-cli/commit/768c60b14a7fac3b824d4178697971ecf9d431b2))

# [1.1.0-alpha.2](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-alpha.1...v1.1.0-alpha.2) (2022-01-06)


### Bug Fixes

* **help inconsistent:** fix help being inconsistent with actual platforms supported in sdk generate ([23b6e6d](https://github.com/apimatic/apimatic-cli/commit/23b6e6da15a073afa71962458c825ba54bcd5f50))

# [1.1.0-alpha.1](https://github.com/apimatic/apimatic-cli/compare/v1.0.2-alpha.2...v1.1.0-alpha.1) (2022-01-05)


### Features

* **environment:** now cli will use production environment, make subscription messages more readable ([7868f76](https://github.com/apimatic/apimatic-cli/commit/7868f76f36af65f1bf774711c888d5d365a9094a))

## [1.0.2-alpha.2](https://github.com/apimatic/apimatic-cli/compare/v1.0.2-alpha.1...v1.0.2-alpha.2) (2021-12-24)


### Bug Fixes

* **portal:** override authkey not working if user is never logged in ever ([fb5d188](https://github.com/apimatic/apimatic-cli/commit/fb5d1884e7dc12917387903e5292e50367190162))

## [1.0.1-alpha.11](https://github.com/apimatic/apimatic-cli/compare/v1.0.1-alpha.10...v1.0.1-alpha.11) (2021-12-24)


### Bug Fixes

* **portal:** bug in when generating portal before logging in ever with authkey ([82043f8](https://github.com/apimatic/apimatic-cli/commit/82043f8fb6658c153bdf168ef1e02801ffccdea2))

# [0.0.0-alpha.4](https://github.com/apimatic/apimatic-cli/compare/v0.0.0-alpha.3...v0.0.0-alpha.4) (2021-12-15)


### Bug Fixes

* **portal:** override auth key not working for first time user ([a30e224](https://github.com/apimatic/apimatic-cli/commit/a30e224bd192e0951ec2716c31749df8c7df0b0b))

# [0.0.0-alpha.3](https://github.com/apimatic/apimatic-cli/compare/v0.0.0-alpha.2...v0.0.0-alpha.3) (2021-12-09)


### Bug Fixes

* **refactor:** move print validation logic to utils file as common function and pretty the code ([05dbe41](https://github.com/apimatic/apimatic-cli/commit/05dbe41c875c70e4a2e6183e647c6fea1e10ad83))

# [0.0.0-alpha.2](https://github.com/apimatic/apimatic-cli/compare/v0.0.0-alpha.1...v0.0.0-alpha.2) (2021-12-08)


### Bug Fixes

* **documentation:** improve messages for each command ([a2c0bfb](https://github.com/apimatic/apimatic-cli/commit/a2c0bfbd5c1867302cf27170dc3b2d3ca5bd64ca))
* **feature:** add force flag and change sdk version and package ([38db116](https://github.com/apimatic/apimatic-cli/commit/38db116b65b94f01a15c7c2d6351401a60ee1393))
* **package:** change version in package file ([903c619](https://github.com/apimatic/apimatic-cli/commit/903c6196ef5e37fbffd8d6b744d6eedcdd7167f5))
* **path:** resolve paths to absolute ([f68bdde](https://github.com/apimatic/apimatic-cli/commit/f68bdde7e8c927602ea87e07d0e558b699082154))
* **readme & bug fix:** update readme, fix bugs ([141f1a9](https://github.com/apimatic/apimatic-cli/commit/141f1a9ad53b80fdb91d39ca87f61b6cdfc7d700))
* **refactor:** refactor code ([d7cb486](https://github.com/apimatic/apimatic-cli/commit/d7cb4863bcfd44f297f0525e0c7eae7ecef12695))
* **sdk & transform:** Fix bugs related to content and corner cases in transform and sdk generate ([e08ba51](https://github.com/apimatic/apimatic-cli/commit/e08ba51d6fc98e991f06f910702fd6b106868fbc))
* **sdk package:** get sdk package from npm ([4c8e178](https://github.com/apimatic/apimatic-cli/commit/4c8e1787eb21f04d81cab95b5a58e3133a61f7af))
* **types:** Add graphql type in destination format of schema ([019aed3](https://github.com/apimatic/apimatic-cli/commit/019aed39c8a9cb8425f2d46d1b9b58f6b8c69475))
* **version:** update sdk and cli versions ([75cc181](https://github.com/apimatic/apimatic-cli/commit/75cc18146f2ec198ca7e82189f2d16281dce80f8))

## [1.0.1-alpha.10](https://github.com/apimatic/apimatic-cli/compare/v1.0.1-alpha.9...v1.0.1-alpha.10) (2021-12-06)


### Bug Fixes

* **types:** Add graphql type in destination format of schema ([019aed3](https://github.com/apimatic/apimatic-cli/commit/019aed39c8a9cb8425f2d46d1b9b58f6b8c69475))

## [1.0.1-alpha.9](https://github.com/apimatic/apimatic-cli/compare/v1.0.1-alpha.8...v1.0.1-alpha.9) (2021-12-06)


### Bug Fixes

* **sdk & transform:** Fix bugs related to content and corner cases in transform and sdk generate ([e08ba51](https://github.com/apimatic/apimatic-cli/commit/e08ba51d6fc98e991f06f910702fd6b106868fbc))

## [1.0.1-alpha.8](https://github.com/apimatic/apimatic-cli/compare/v1.0.1-alpha.7...v1.0.1-alpha.8) (2021-12-06)


### Bug Fixes

* **package:** change version in package file ([903c619](https://github.com/apimatic/apimatic-cli/commit/903c6196ef5e37fbffd8d6b744d6eedcdd7167f5))

## [1.0.1-alpha.7](https://github.com/apimatic/apimatic-cli/compare/v1.0.1-alpha.6...v1.0.1-alpha.7) (2021-12-06)


### Bug Fixes

* **readme & bug fix:** update readme, fix bugs ([141f1a9](https://github.com/apimatic/apimatic-cli/commit/141f1a9ad53b80fdb91d39ca87f61b6cdfc7d700))

## [1.0.1-alpha.6](https://github.com/apimatic/apimatic-cli/compare/v1.0.1-alpha.5...v1.0.1-alpha.6) (2021-12-02)


### Bug Fixes

* **path:** resolve paths to absolute ([f68bdde](https://github.com/apimatic/apimatic-cli/commit/f68bdde7e8c927602ea87e07d0e558b699082154))

## [1.0.1-alpha.5](https://github.com/apimatic/apimatic-cli/compare/v1.0.1-alpha.4...v1.0.1-alpha.5) (2021-12-02)


### Bug Fixes

* **feature:** add force flag and change sdk version and package ([38db116](https://github.com/apimatic/apimatic-cli/commit/38db116b65b94f01a15c7c2d6351401a60ee1393))

## [1.0.1-alpha.4](https://github.com/apimatic/apimatic-cli/compare/v1.0.1-alpha.3...v1.0.1-alpha.4) (2021-12-01)


### Bug Fixes

* **documentation:** improve messages for each command ([a2c0bfb](https://github.com/apimatic/apimatic-cli/commit/a2c0bfbd5c1867302cf27170dc3b2d3ca5bd64ca))

## [1.0.1-alpha.3](https://github.com/apimatic/apimatic-cli/compare/v1.0.1-alpha.2...v1.0.1-alpha.3) (2021-12-01)


### Bug Fixes

* **sdk package:** get sdk package from npm ([4c8e178](https://github.com/apimatic/apimatic-cli/commit/4c8e1787eb21f04d81cab95b5a58e3133a61f7af))

## [1.0.1-alpha.2](https://github.com/apimatic/apimatic-cli/compare/v1.0.1-alpha.1...v1.0.1-alpha.2) (2021-11-30)


### Bug Fixes

* **refactor:** refactor code ([d7cb486](https://github.com/apimatic/apimatic-cli/commit/d7cb4863bcfd44f297f0525e0c7eae7ecef12695))

## [1.0.1-alpha.1](https://github.com/apimatic/apimatic-cli/compare/v1.0.0...v1.0.1-alpha.1) (2021-11-26)


### Bug Fixes

* **release:** add lock file to gitignore restore check_build workflow ([2eb959a](https://github.com/apimatic/apimatic-cli/commit/2eb959afc2a7ee2317959fc8525930acde2989dc))
