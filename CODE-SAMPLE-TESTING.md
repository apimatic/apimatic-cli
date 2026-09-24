# Testing code samples in a built portal

How to build a portal from a code-sample catalog, written by hand or by codegen-v2, serve it on a port, and
check its request-sample tabs in a real browser. Everything needed lives in
[`examples/code-samples-testing/`](examples/code-samples-testing). The design being tested
is [SDK-ARTIFACTS-DESIGN.md](SDK-ARTIFACTS-DESIGN.md) §4.5 and §7.3.

The tabs are rendered in the browser, so the prerendered HTML cannot show them working:
grepping a built page proves only that the samples reached its data. Check them in a
browser.

## 1. What is here

| Path | What it is |
|---|---|
| `cases/<case>/src/` | A portal project (`apimatic.json`, `content/`, `spec/`), the directory `--input` would point at the parent of |
| `cases/<case>/catalogs.json` | The catalogs to merge: `[[language, catalog], …]`, each catalog shaped as the `code-samples/<language>.json` of §4.5, written by hand or by `codegen-catalogs.sh`. Tab order is this array's order |
| `codegen-catalogs.sh` | Zips `cases/<case>/src`, sends it to a codegen-v2 Functions host's `POST /api/portal-artifacts`, polls it, and writes the returned `code-samples/*.json` over `cases/<case>/catalogs.json` (see [§5](#5-other-cases)) |
| `build.mts` | Builds `cases/<case>` into an output directory through the CLI's own code path: `CodeSampleCatalog.fromJson` → `PortalSourceContext.resolve` → `PortalProjectService.addCodeSamples` → `prepare` → `PortalBuildService.build` → `PortalContext.save` |
| `static-server.mjs` | Serves a built portal on a port, answering unknown paths with `404.html` as a static host would |
| `browser/lib.mjs` | Playwright helpers the checks share: open a page, read the tabs, pick an example, read a tab's code |
| `browser/case-<case>.mjs` | The checks for one case, run against a served portal |

`portal generate` and `portal serve` always take their samples from the fixed catalog in
`src/infrastructure/services/mock-code-samples.ts`, which only fits
`test/resources/portal-inputs/code-samples`. `build.mts` exists so a case can bring its
own catalog, including one codegen-v2 produced for that case's spec. It skips the account
check, so it needs no login.

## 2. Start a portal instance

Run from the repository root, in Git Bash. `$SCRATCH` is any directory outside the
repository; use forward slashes in the paths you pass (see [§6](#6-gotchas)).

```bash
pnpm install
pnpm exec tsx examples/code-samples-testing/build.mts examples/code-samples-testing/cases/matrix "$SCRATCH/matrix-out"
node examples/code-samples-testing/static-server.mjs "$SCRATCH/matrix-out" 4203   # keep running; background it
curl -s -o /dev/null -w '%{http_code}\n' --retry 30 --retry-connrefused --retry-delay 1 http://127.0.0.1:4203/
```

The build takes about 40 seconds and prints the specs it found, the catalog entries no
document has (`unplaced`), the specs left without samples because a `$ref` leaves `spec/`
(`unsampled`) and the page count. For the matrix:

```
specs: [ 'inventory.yaml', 'outside.yaml', 'store.json' ]
unplaced: [ 'GET /pets', 'GET /ghost' ]
unsampled: [ 'outside.yaml' ]
pages: 14, written to …/matrix-out
```

Operation pages are at `http://127.0.0.1:<port>/api/<spec>/<tag>/<operationId>/`, for
example `http://127.0.0.1:4203/api/store/orders/CreateOrder/`. Pick any free port; check
with `netstat -ano | grep LISTEN | grep :<port>`.

## 3. Run the checks

`playwright-core` is not a dependency of the CLI. Install it next to a copy of `browser/`
and drive the Chrome already on the machine (pass `msedge` as a second argument for Edge):

```bash
mkdir -p "$SCRATCH/browser" && cp examples/code-samples-testing/browser/*.mjs "$SCRATCH/browser/"
cd "$SCRATCH/browser" && echo '{"private":true,"type":"module"}' > package.json && pnpm add playwright-core
node case-matrix.mjs http://127.0.0.1:4203
```

Each check prints `PASS` or `FAIL` with the expected and actual values, and the run ends
with `N passed, M failed` and a non-zero exit on any failure. Every page also fails if it
threw or any request answered 4xx/5xx. The matrix is 60 checks.

## 4. The matrix case

Three specs and three catalogs (TypeScript, C#, Python), each operation built to exercise
one rule. Snippets are marker strings such as `TS-CREATE-FULL`, so a wrong one is obvious.

| Page (`api/…`) | What the spec and catalog set up | What it must show |
|---|---|---|
| `store/orders/CreateOrder` | Three body examples `minimal`, `full`, `bulk`. TypeScript has `minimal` and `full`; C# has all three; Python has only `Example` | Tabs `cURL, TypeScript, C#, Python`; each tab follows the selector; TypeScript on `bulk` and Python on every example show `No <Language> sample for this example.`; curl follows the body |
| `store/orders/TagOrder` | Examples `first` and `second` with identical bodies; C# has only `first` | `second` shows `TS-TAG-SECOND`, not the first example's code; C# on `second` shows the note |
| `store/orders/ListOrders` | No request body, so one example, `_default`. TypeScript has `Example`; C# has `Example` and `other`; Python has `a` and `b` | No selector; TypeScript shows its only snippet whatever the key; C# and Python have two snippets for one example and show the note, since `Example` beside another key is an ordinary id |
| `store/orders/ReplaceOrder` | One named example `replace` | No selector; the `replace` snippet |
| `store/orders/DeleteOrder` | Hand-written `x-codeSamples` only, no catalog entry | Only `cURL`; the hand-written text appears nowhere |
| `store/orders/PatchOrder` | Hand-written `x-codeSamples` and a catalog entry | `cURL, TypeScript` with the catalog snippet |
| `store/refunds/CreateRefund` | TypeScript snippet for `blank` is `""` | An empty code block, not the note |
| `store/imports/CreateImport` | Two media types; the JSON one's examples are `$ref`s to `components/examples` | Selector lists the JSON examples; each shows its snippet |
| `store/legacy/GetLegacy` | Hand-written `x-apimatic-codeSamples`: a valid Ruby entry, one using the old `sourceByExample` key, one with no label | Only `cURL, Ruby`; the malformed entries are skipped, not fatal |
| `store/health/StoreHealth`, `inventory/health/InventoryHealth` | The same `GET /health` in two specs | The sample on both pages |
| `inventory/items/CreateItem` | OpenAPI 3.1 YAML with a `$ref` to `spec/schemas/item.yaml` | Samples placed; the selector switches them |
| `outside/things/CreateThing` | A `$ref` to `../shared/thing.yaml`, outside `spec/` | Only `cURL`: the spec keeps its original file and loses its samples |
| — | `/pets` is a path item `$ref`; `GET /ghost` exists in no spec | Both reported `unplaced`; `/pets` gets no page (see [§5](#5-other-cases)) |

The last check picks C# on one page and opens another: the chosen language must stay
selected.

## 5. Other cases

| Case | Build and serve | Checks | What it covers |
|---|---|---|---|
| `pathref` | as §2 | `case-pathref.mjs`, 14 | Path items and operations written as `$ref`s, in the same file and another. Records a fumadocs-openapi bug (still in 12.0.2): its page listing reads a `$ref`'d path item without resolving it, so such operations get **no page**, and an operation `$ref` gets a page under `unknown/…/get` with none of its details. The checks marked `KNOWN FUMADOCS BUG` will fail once that is fixed; update them then |
| `edge` | as §2 | `case-edge.mjs`, 25 | All seven languages in catalog order and an empty catalog adding nothing; curl resolving server variables; example ids with a space, a slash and non-ASCII; `<script>` in a snippet shown as text and never run; a 400-line snippet, highlighted; an untagged operation; a webhook page with no SDK tabs |
| `combine` | as §2 | `case-combine.mjs`, 108 | Body and parameter `examples` with overlapping and disjoint ids, against the real codegen-v2 catalog (`GA-dev-branch` 7b8e0e30). The selector lists the body's ids, or, when the body names none (no `examples`, a singular `example`, a lone `Example` key), the first query, header or path parameter's; cURL and the TypeScript tab bind each parameter's value for the selected id. What still differs: `Example` beside a named body id shows the note, since codegen never emits it; values fumadocs samples (`"string"`) and codegen invents (`"some example string"`, or an optional body left out); and a two-media-type body, where codegen's one snippet sends no body |
| payments | the real CLI, below | `case-payments.mjs`, 28 | The shipped commands end to end, with the mock catalog |

The payments case runs the commands a user runs, so it needs `pnpm build` and a login
(`pnpm apimatic auth status`). `--input` is the directory **containing** `src/`:

```bash
mkdir -p "$SCRATCH/payments" && cp -r test/resources/portal-inputs/code-samples "$SCRATCH/payments/src"
pnpm apimatic portal generate --input "$SCRATCH/payments" --destination "$SCRATCH/payments-out"
node examples/code-samples-testing/static-server.mjs "$SCRATCH/payments-out" 4202
# or, with live reload instead of a build:
pnpm apimatic portal serve --input "$SCRATCH/payments" --port 4201
```

`case-payments.mjs` runs against either port.

To add a scenario, copy a case directory, edit its `src/spec/`, write `catalogs.json` by
hand or fetch it from codegen-v2, and write a `browser/case-<name>.mjs` from the helpers in
`lib.mjs`. A catalog the CLI rejects stops `build.mts` with `catalogs.json holds a catalog
the CLI rejects`.

To fetch it, run codegen-v2's Functions host from a checkout of the branch under test. Its
`local.settings.json` points Durable storage at HTTPS Azurite; `func` skips a setting the
environment already defines, so plain-HTTP Azurite needs no certificate. Start `func` from
the build output: started from the project directory it finds no functions.

```bash
azurite --silent --location "$SCRATCH/azurite"                                  # keep running
cd <codegen-v2>/src/CodegenV2.Func && dotnet build && cd bin/Debug/net10.0
AzureWebJobsStorage=UseDevelopmentStorage=true func start --port 7071            # keep running
bash examples/code-samples-testing/codegen-catalogs.sh examples/code-samples-testing/cases/combine "$SCRATCH/codegen"
```

The script sends the `X-APIMatic-SubscriptionFeatures` header that allows portal artifacts
and C#, TypeScript and Python, and fails unless the run ends `Completed`. The case's
`apimatic.json` must declare each language under `languages` with a `publishing` block
carrying `source.repositoryUrl` and a `package` with its name and `version`, or the run
ends `ValidationError`. Every declared language returns an SDK, but only TypeScript returns
a catalog today, so `catalogs.json` holds TypeScript alone. The catalog is deterministic: a
rerun writes the same file.

## 6. Gotchas

- **Windows paths.** Pass `cygpath -m` (forward-slash) paths. A backslash path breaks in
  `read` without `-r`, and `"$DIR\\$name"` escapes the `$` and writes every build to one
  literal directory.
- **Selectors.** Response tabs are also `role=tab`, so scope to the tab list holding the
  `-trigger-curl` tab. A spec with two media types also has a media-type combobox, so the
  example selector is the combobox beside that tab list. `lib.mjs` does both.
- **The selector popup** renders after its trigger is clicked; wait for `[role=option]`
  before reading it, and for it to close before the next click.
- **Code in `page.evaluate`** runs in the browser but is linted as Node; pass it as a
  string (`page.evaluate('window.__xss')`).
- **Servers keep running** after the checks, and a port another session's server holds
  makes a new one exit with `EADDRINUSE` while the checks run against the other build.
  Check the owner before trusting a run, and stop your own with
  `Get-NetTCPConnection -LocalPort <ports> -State Listen | % { Stop-Process -Id $_.OwningProcess }`
  in PowerShell.
- **Rebuilding into a served directory** is fine: the static server reads from disk on
  every request, so reload the page.
