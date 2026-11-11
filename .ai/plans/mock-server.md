# The v4 mock server, ported from C#

Status: in progress on `feat/mock-server`, cut from `dev` at `4b748d5d` on 2026-11-10.
Phases 0 to 6 are done, committed and pushed as `feat/mock-server`. Phase 7 is done but for the CLI Reference rows in apimatic-docs, which wait for the release; its changes are not committed yet.

The mock that v4 SDK test suites run against exists as a C#/.NET proof of concept in
`apimatic/mock-server-poc-v4` (reference commit `0d5a84f`: about 4,800 lines of source and 1,220
test cases). This plan ports it into the CLI as `apimatic mock serve`. The C# server is the
behavioural reference until the port passes everything, and is frozen afterwards.

Binding on the port: the stub format (`docs/stub-format.md` in the reference, and
`mock-stubs.schema.json` here) and the wire contract SDK tests already use: status 418 with the
`X-Mock-Mismatch` header and the problem+json fields, `Prefer: code=` and `Prefer: example=`, the
OAuth2 endpoints, and the fixed test credentials. Everything else is written as this codebase
writes TypeScript.

## 1. How a phase works

- A phase ports one layer with the tests that pin it. Every behaviour a C# test pins gets a test
  here, written as a table where the C# used a long theory file.
- A phase ends with `pnpm build`, `pnpm test` and `pnpm lint` green, then stops for review. The
  agent commits nothing; the reviewer reads and changes the code, and the next phase builds on it.
- A test has one act, held in a local, between an arrange and an assert block separated by blank
  lines. Titles are prose sentences.

## 2. Decisions

| Topic | Decision |
|---|---|
| Command | `apimatic mock serve`, a new `mock` topic beside `portal serve` |
| Defaults | `--port 4010`; a busy port fails and is never swapped for another. `--port 0` picks a free loopback port. `--stubs` defaults to `./stubs` in the working directory |
| Stub checking | `ajv` (draft 2020-12) against `mock-stubs.schema.json`, then the typed parser. Problem wording is the mock's own |
| Admin API | A bounded request log of its own: `GET` and `DELETE /__admin/requests`. No WireMock shape |
| HTTP | `node:http` directly; no framework |
| Regular expressions | None in the mock's source or tests; ESLint refuses them |
| Layering | `src/types/mock` is pure and imports nothing from the rest of the CLI; `src/infrastructure/mock` is the only I/O. ESLint enforces both |

## 3. Layout

```
mock-stubs.schema.json            the stub schema, byte-identical to the reference's; published with the package
src/types/mock/
  json/                           strict JSON reader and writer, number canonical form, RFC 6901 pointers
  text/                           ASCII case folding, percent coding, strict base64, digit parsing, text distance
  stub-format/                    stub model, schema problems, parser, loader over (name, bytes) pairs
  matching/                       request model, matchers, JSON diff, closest stub, verdict, the 418 report
  auth/                           the OAuth2 authorization server
  routing/                        the router, a request and a response as they cross the wire, the body limit
src/infrastructure/mock/          stub directory reader; the node:http host, its adapters, streams, request log
src/actions/mock/serve.ts         MockServeAction
src/prompts/mock/serve.ts         MockServePrompts
src/commands/mock/serve.ts        the command
test/resources/mock/              the reference's stub sets: sample (20 stubs), spec-s (84), tester-poc (113)
```

The folders under `src/types/mock` stay one level deep: the ESLint rule that keeps the core apart
from the CLI refuses any import that starts with `../../`.

How the C# shapes carry over: a sealed record hierarchy is a `kind:` union read with an
exhaustive `switch`; `StubLoadResult` and `StartResult` are `Result`s or `kind` unions; an
abstract member on a hierarchy is a function over the union; a sorted dictionary is a sorted
array with its comparer stated.

## 4. Where the port differs from the reference on purpose

1. **JSON is read and written by the mock's own strict reader**, never `JSON.parse`. Numbers are
   compared and served by their written text (`9007199254740993`, `250.00`, `1e30` equal to
   `1.0E30`), members keep their order, and a duplicate key, a lone surrogate and bytes that are
   not UTF-8 are refused. Stub files also allow comments and trailing commas.
2. **A path is percent-decoded once**, leniently. The reference decoded it twice and read `+` as a
   space, both effects of its engine. The loader still refuses `%` and `+` in a stub path.
3. **A request Node's HTTP parser rejects never reaches the router** and is answered 400 with the
   parser's reason (431 for headers past its limit): a method in lower case or one the parser does
   not know, a malformed request line, a byte outside ASCII in the target. The reference answered
   418 for a lower-case method. Confirmed in phase 5a: `get /x HTTP/1.1` is refused with
   `Parse Error: Invalid method encountered`.
4. **`localhost` is two listeners**, 127.0.0.1 and ::1 on one port; a machine without an IPv6
   loopback serves IPv4 alone. Any other host is bound as written: `127.0.0.1` is that address
   alone (the reference bound both loopbacks for it), and a name is bound as it resolves (the
   reference bound every interface). A free port is the system's choice at the first bind, with no
   moment between choosing and binding. Before a fixed port is bound, a connect probe asks whether
   something already answers there, which finds a holder on every interface: Node has no table of
   listeners, and a wildcard bind would raise a firewall prompt.
5. **A chunked body past 30,000,000 bytes answers 413**, as a declared length over the limit does.
   A refused body is still received, and dropped as it arrives, before the 413 goes out: a server
   that answers and closes in the middle of an upload resets the connection, and the client then
   never reads the answer.
6. **The 418 body uses LF on every platform.**
7. **Exit codes are the CLI's**: 130 when stopped, 1 for stub problems or a port that cannot be
   opened, 2 for a bad flag. A line holding `MOCKSERVER_URL=<origin>` is printed on stdout for a
   harness to find; the `--verbose` request log goes to stderr.
8. **Schema problems are worded here**, from ajv's keyword, params and pointer. Pointers match the
   reference's; the library's wording does not.
9. **A JSON string is written as `JSON.stringify` writes it.** The reference escaped characters
   beyond the basic plane (an emoji as two escapes) and wrote escapes in upper case. A client
   decodes both to the same text, but the bytes and `Content-Length` of such a body differ.
10. **A JSON fault is worded here and says where it is**: `Duplicate property 'name' at line 2,
    column 2.` The reference passed on its JSON library's message.
11. **A file hidden by its Windows attribute is loaded**, since Node cannot read that attribute. A
    dot file is skipped on every OS, as before.
12. **Messages that described the reference's engine say what is true here.** The rules are
    unchanged: a dot segment, `%` or `+` in a path, the eleven response headers a stub may not state,
    an empty response header value, and a request header or cookie rule outside printable ASCII.

## 5. Phases

| Phase | Ports | Reference source | Reference tests | Done when |
|---|---|---|---|---|
| 0 | Worktree, lint rules, fixtures, `ajv` as a dependency | n/a | n/a | Done |
| 1 | `json/`, `text/`, the date-time grammar | `JsonDiff` (numbers), `SentJson`, `TextDistance`, `Difference`, `DateTimeText` | `SentJsonTests`, number rows of `JsonDiffTests`, `DateTimeTextTests`, `DifferenceTests` | Done |
| 2 | Stub model, schema problems, parser, loader, stub directory reader | `StubFormat/` | `StubLoaderTests`, `StubSchemaTests`, `PathTemplateTests`, `JsonRuleTests`, `StubResponseTests`, `MultipartResponseTests`, `SseEventTests`, `StubProblemTests` | Done |
| 3 | Request model, matchers, JSON diff, closest stub, verdict, the 418 report | `Matching/` | its 14 test files | Done |
| 4 | The OAuth2 authorization server | `Auth/` | `OAuth2ServerTests` | Done |
| 5a | The host on `node:http`: listening, adapters, router | `Engine/` except streams and admin | `MockHostTests`, `ListenTests`, `RoutingTests`, `ResponseAdapterTests`, `BodyLimitTests`, `OAuth2FlowTests`, `TokenLifetimeTests`, the Spec S suites without a stream | Done |
| 5b | Streams, multipart and binary answers, the request log | `PacedBody`, `PerRequestQueue`, `AdminApi` | `StreamingTests`, `PacedBodyTests`, `AdminApiTests`, the remaining Spec S suites | Done |
| 6 | Command, action, prompts | `Program.cs` | `CommandLineTests`, `ExitCodeTests` (as a gated e2e test) | Done |
| 7 | Acceptance: the C# SDK's contract suite on :4010; docs; the command shown | n/a | n/a | 103 contract tests pass |

## 6. Findings

Phase 0:

- `ajv` compiles the schema in strict mode with `strictRequired` alone turned off: the kind rule
  names `request` and `oauth2` under a `not`, where no `properties` describes them.
  `test/types/mock/stub-format/stub-schema-file.test.ts` pins this and that the schema accepts
  every file of the three stub sets.
- `ajv` reports a flat list whose `schemaPath` is relative to the `$ref` it resolved
  (`#/$defs/textRule/oneOf/0/required`), not an evaluation path from the root. The reference chose
  the closest branch of a failed `oneOf` from a hierarchical result, so phase 2 has to tell the
  branches apart another way, by the `$ref` each branch names.

Phase 1:

- `test/tsconfig.json` type-checks the source it imports against the ES2022 library, so the mock's
  source cannot call an ES2023 or ES2024 library method (`isWellFormed`, `toSorted`) even though
  the build would accept it.
- The date-time grammar is written by hand and was checked against .NET 10 for the cases the
  reference leaves to its parser: the weekday of an RFC 1123 date must be the one the date falls
  on, an offset is at most 14:00, and an instant whose UTC form leaves the years 0001 to 9999 is none.
- A base64url value is read only in the unpadded form the mock writes. .NET's validator also takes
  padding and whitespace; phase 4 widens this if an authorization-code row needs it.
- Reading a JSON number such as `200.0` or `2e2` as a whole number is left to phase 2, where its
  first callers and their rows are.

Phase 2:

- ajv decides whether a stub file is valid; `StubSchema` reads what is wrong and where off the same
  schema, in about 250 lines. ajv's flat list cannot say which branch of a `oneOf` an error belongs
  to, which the closest-branch rule needs. `StubSchema.read` refuses a schema that uses a keyword it
  has no message for, so the two cannot drift apart unseen. Should ajv be wanted out of the runtime
  dependencies, it is now only the cross-check: one call in `StubSchema.problems`.
- A choice among single required properties is reported as the choice it is: `Give only one of
  'startsWith', 'endsWith' and 'contains'; this has 'startsWith' and 'endsWith'.` The reference
  passed on its library's `Expected 1 matching subschema but found 2`.
- The schema reaches the pure loader as data: `StubDirectoryService` reads `mock-stubs.schema.json`
  from the package root, so `src` needs no JSON import and `tsconfig.json` is unchanged.
- The loader is `loadStubs(files, schema)` over names and bytes; listing and reading the directory
  is `StubDirectoryService`. The three reference stub sets load with no problems through both.
- Rules kept from the reference although the Node host would not need them, for the owner to
  decide: `%` and `+` refused in a stub path (the path is now decoded once, so both could be
  matched), the eleven unstatable response headers (Node would send them), and an empty response
  header value (Node would send it).

Phase 3:

- The matcher reproduces the reference where its tests pin bytes: the three 418 report documents,
  the header summary with its escapes and its cut at 1,000 characters, the ranking weights, and the
  `N bytes, sha256 …` description of a body, hash for hash.
- `multipart/form-data` is read by a reader of its own (`matching/multipart-form.ts`, about 100
  lines) where the reference used its web framework's. A body it cannot read is described in its
  own words: `a body without its --abc delimiter`, `a body that ends before its closing --abc--
  delimiter`, `a part whose headers never end in a blank line`. `a section that is not form-data
  (Content-Disposition: …)` is the reference's.
- `text/media-type.ts` reads `value; name=value` headers for both Content-Type and
  Content-Disposition, quoted values included.
- The seven wire mutations pass without a server (`wire-mutations.test.ts`). m2 with a lower-case
  method is named by the matcher; whether such a request reaches it over HTTP is phase 5a's question.

Phase 4:

- The OAuth2 server is `auth/oauth2-server.ts` with `Fields`, PKCE, the issued code and client
  authentication beside it. `OAuth2Server.answer` returns a verdict, or nothing for a path that is
  not its own. Every row of `OAuth2ServerTests` passes, the exact token documents and redirect
  locations included.
- A redirect URI is checked by its own rule where the reference asked its URI parser: a scheme of
  two or more characters that is not `file`, printable ASCII without a space, no fragment. A
  one-letter scheme is a Windows drive (`C:callback`) and is refused, as the reference refuses it.

Phase 5a:

- The host is `infrastructure/mock/mock-host.ts`: `MockHost.start` returns `running`,
  `stubProblems` or `notListening`, and `stop` ends streams, waits up to 5 seconds for the
  requests being answered and then closes what is left. It reads and writes; every decision is in
  `types/mock/routing`, which is pure and tested without a socket: `StubRouter` (the OAuth2 servers
  first, then the stubs), `requestModelOf`, `requestOrigin`, `wireResponseOf`, `wireMismatch` and
  the body limit.
- All 113 stream-free Spec S cases and the reference's routing, OAuth2 flow, response and body
  limit cases pass over HTTP, on `node:http` with no framework.
- A request without a readable Host is answered 400 in the reference's words, including an
  HTTP/1.1 request without the header, which Node would otherwise answer with an empty 400
  (`requireHostHeader` is off). `{{origin}}` is read from the Host header by a rule of its own:
  the host in lower case, port 80 dropped, an IPv6 literal kept in its brackets.
- Node hands a header value over as Latin-1; one that is valid UTF-8 is read as UTF-8, so a report
  quotes what the client wrote. A header sent twice reaches the matcher as two values.
- A response without a body states `Content-Length: 0`, a 204 or 304 states none, and a HEAD
  answer states the length of the body it leaves out. Node adds `Date`, `Connection` and
  `Keep-Alive`; no `Server` header is sent.
- Streams are already served here, chunk by chunk with the stub's pause, and end when the client
  leaves or the host stops, because the routing cases need them. Their own tests (pacing, a client
  that leaves, a stop mid-stream) are phase 5b's, with the request log and the admin API.
- Reference cases without a counterpart: the listener-table rows of `WildcardReason` (the connect
  probe is tested instead), `/__admin/mappings` and `/__admin/settings` (no WireMock admin API),
  and `Misses`, which becomes the request log in phase 5b. Until then a request under `/__admin`
  gets the 418 report like any other.
- The host answers 500 with its reason when it cannot write what a stub states. No stub the loader
  accepts gets there; the test hands the host a stub set the loader would refuse.

Phase 5b:

- The request log and the admin API are pure, in `types/mock/routing` (`request-log.ts`,
  `admin-api.ts`, `respond.ts`): `respond` lets the admin API answer first, then asks the router
  and logs the request with what came of it. The host only calls it.
- `GET /__admin/requests` serves the newest 10,000 requests that reached the router, oldest first,
  and `DELETE` clears them with a 204. Any other method there is a 405 with `Allow: GET, DELETE`,
  and any other path under `/__admin`, in any letter case, is a 404. A request to the admin API is
  not logged, nor one the host refused before the router (400, 413). One entry:

  ```json
  {
    "request": {
      "method": "POST",
      "path": "/v1/accounts",
      "query": { "limit": ["2"] },
      "headers": { "prefer": ["code=500, test-run=7f3a"] },
      "body": "{\"name\":\"Travel card\"}"
    },
    "response": { "status": 500, "stub": "createAccount 500" }
  }
  ```

  The path and query are as decoded for matching. Header names are in lower case, so a harness in
  any language finds `headers.prefer` whatever the client's spelling. `body` is the text of a UTF-8
  body, `bodyBase64` takes its place for any other bytes, and neither is there for an empty one.
  `response.stub` names the stub that answered; `response.mismatch` holds the summary of a 418
  report and is what tells a miss from a 418 a stub declares; an answer the OAuth2 server composed
  has neither. A body is kept once, as bytes.
- The paced body is `infrastructure/mock/paced-body.ts`, tested on a plain stream without a
  server and over HTTP: the stub's status, the pause between chunks and none after the last, a
  stream ended where it stands when the host stops or the client leaves. The reference's
  `PerRequestQueue` and its 31-second explicit test guarded its engine's read loop and have no
  counterpart: a pause here is a timer between two writes.
- All 132 Spec S cases pass (130 over HTTP, two over the stub files in phase 2).
- **The reference's own tests were run against this host**, from a scratch copy of the reference
  whose fixtures take the mock's URL from the environment, so its .NET `HttpClient` talks to the
  TypeScript server. Spec S: 130 of 132 pass. The two that fail are differences taken on purpose:
  `GetAccount_M2LowercaseMethod` (400 from the HTTP parser, section 4 item 3) and
  `AdminApi_Requests_CountsRetryAttemptsByMarker` (it reads WireMock's log shape). The sample-set
  `RoutingTests` and `OAuth2FlowTests`: 48 of 50 pass; the two that fail are the path decoded once
  (section 4 item 2) and `Misses`, which reads the in-process host.

Phase 6:

- `apimatic mock serve` is `commands/mock/serve.ts`, `actions/mock/serve.ts` and
  `prompts/mock/serve.ts`, hidden (the command and its topic) until phase 7. Flags: `--port`
  (`-p`, default 4010, 0 for a free port), `--host` (default localhost), `--stubs` (`-s`, default
  `./stubs`), `--token-ttl` and `--verbose`.
- `--host` takes localhost in any letter case or an IP address, kept in its canonical spelling
  (`[::1]` and `0:0:0:0:0:0:0:1` are `::1`). A name is refused, as in the reference, although the
  host could bind one: where a name resolves is not something a command line should leave open.
  An IP address with port 0 is refused too, since a free port is found on localhost alone. Both
  are exit 2, with oclif's own flag errors.
- Output goes through the prompts class to stdout as every command's does, the stub problems and
  a refused port included; the reference wrote those to stderr. The marker line is
  `MOCKSERVER_URL=<origin>` with nothing after the origin, inside clack's gutter, so a harness
  searches for the marker and reads to the end of the line. Only the `--verbose` request lines go
  to stderr: `GET /v1/x?q=1 -> 418 closest 'the stub': …`.
- The stop signals are taken over before the marker line is printed, because a harness may stop
  the mock the moment it reads it. Exit codes: 130 once stopped, 1 for stub problems and for a
  port that cannot be opened (the reference used 1 and 3), 2 for a bad flag.
- The host gained `onRequest`, which hears of every logged request; the action passes the
  prompt that prints the verbose line.
- `test/e2e/mock-serve.test.ts` runs the built CLI as a harness would, behind `APIMATIC_E2E=1`:
  the marker and the origin, `--verbose` on stderr alone, `--token-ttl`, and exits 1 and 2. Its two
  signal cases (exit 130 on SIGINT and SIGTERM) are skipped on Windows, which cannot deliver a
  POSIX signal, so they have not run yet: this branch has only been built on Windows.
- Not carried over from `CommandLineTests`: `--help` after an unknown flag as a usage error (oclif
  prints the help), and the reference's own wording of each usage error (oclif's names the flag).

Phase 7:

- `docs/mock/stub-format.md` is the reference's stub format document with what differs here
  written in (the path decoded once, a lower-case method refused by the HTTP parser, the wording
  of the response header rules) and two sections added: the request log's shape, and the requests
  the mock answers itself (400, 413, 404, 405, 500).
- `docs/mock/generator-handoff.md` is the handoff for the new model: the mock ships in the CLI and
  an SDK holds stub files only; how a test starts `apimatic mock serve` and finds the origin; and a
  table of what changed from the proof of concept. Its sections on rendering stubs are the
  reference's, since the format did not change.
- `CONTEXT.md` has the mock's terms: stub, stub file, stubs directory, miss, mismatch report,
  request log, origin.
- **The C# SDK's contract suite passes against the command** (2026-11-11): `tests/TesterPoc.ContractTests`
  of csharp-sdk-poc-v4 at `c266b88a` (branch `Shield-Jaguar/mock-server-v4`), against
  `apimatic mock serve --stubs test/resources/mock/tester-poc --port 4010`: 103 of 103 on net10.0
  and on net8.0. Each run logged 107 requests (103 answered 200, one 302, two 400 and one 403 from
  the OAuth2 server) and no 418. Built with the .NET SDK 11.0.100; its restore did not fetch the
  .NET 8 app host pack until given `-p:AppHostRuntimeIdentifier=win-x64 -p:EnableAppHostPackDownload=true`.
- The command and its topic are shown, and the README has its section (`pnpm readme`).
- **Not done: the CLI Reference rows in apimatic-docs.** That repository documents released
  commands only and asks for placement to be agreed before a page is changed, so the rows wait for
  the release. The proposal is a `## Mock commands` section after "Plugin commands" in
  `v4/src/content/apimatic-cli/cli-reference.mdx`, with one line in "Commands overview":

  ```md
  - [Mock commands](#mock-commands): Serve a mock of your API for SDK tests to run against.

  ## Mock commands

  ### `mock serve`

  Serves a mock of your API from stub files, for SDK tests to run against. A request that no stub describes gets a 418 response that names the difference from the closest stub.

  | Flag | What it does |
  | --- | --- |
  | `-p, --port` | Port to serve the mock on. Defaults to `4010`. `0` picks a free port on localhost. |
  | `--host` | `localhost` or an IP address to listen on. An IP address needs a port other than `0`. Use `0.0.0.0` in a container. Defaults to `localhost`. |
  | `-s, --stubs` | Path to the directory containing the stub files. Defaults to `./stubs`. |
  | `--token-ttl` | Seconds the OAuth2 tokens live for, sent as `expires_in`. Defaults to an `oauth2` stub's own `expiresIn`. |
  | `--verbose` | Log every request to stderr. |
  ```
- Not run anywhere yet: exit 130 on a real SIGINT or SIGTERM (the gated end-to-end cases skip on
  Windows, the only platform tried so far; the CI matrix runs them).
- Two things a harness author should know, both in the handoff: the marker line is not the first
  line of stdout, and on Windows stopping the `apimatic.cmd` shim does not stop the Node process
  behind it.

## 7. Risks

- Every SDK's CI needs Node and this CLI to run the mock, including SDKs in other languages. The
  core imports nothing from the CLI so that a package or binary of its own stays possible.
- The 4010 default follows what generated SDK settings assume; `--port 0` is the hermetic choice.
- SIGTERM cannot be delivered on Windows, so a harness that kills the process there gets no exit code.

## 8. Not planned here

Rendering stubs in the generator, `apimatic mock validate`, a standalone package or binary, a
Docker image.
