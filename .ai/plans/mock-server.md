# The v4 mock server, ported from C#

Status: in progress on `feat/mock-server`, cut from `dev` at `4b748d5d` on 2026-11-10.
Phases 0 to 5a are done and committed on the branch.

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
| 5b | Streams, multipart and binary answers, the request log | `PacedBody`, `PerRequestQueue`, `AdminApi` | `StreamingTests`, `PacedBodyTests`, `AdminApiTests`, the remaining Spec S suites | All 132 Spec S cases pass; the reference's own Spec S suite passes against this host, differences listed |
| 6 | Command, action, prompts | `Program.cs` | `CommandLineTests`, `ExitCodeTests` (as a gated e2e test) | The command runs hidden |
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

## 7. Risks

- Every SDK's CI needs Node and this CLI to run the mock, including SDKs in other languages. The
  core imports nothing from the CLI so that a package or binary of its own stays possible.
- The 4010 default follows what generated SDK settings assume; `--port 0` is the hermetic choice.
- SIGTERM cannot be delivered on Windows, so a harness that kills the process there gets no exit code.

## 8. Not planned here

Rendering stubs in the generator, `apimatic mock validate`, a standalone package or binary, a
Docker image.
