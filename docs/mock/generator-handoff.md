# Generator handoff

What codegen-v2 has to do so that every generated SDK's tests run against the mock: render stub files from the spec, and have the generated tests start `apimatic mock serve` and talk to it. Nothing of the mock is copied into an SDK.

## 1. The mock ships in the CLI

`apimatic mock serve` is the mock. It is part of `@apimatic/cli` (Node 22.14 or later). An SDK repository holds only its stub files, by convention in `mock/stubs/` beside the tests, and whatever runs its tests has the CLI installed. A fix to the mock therefore reaches every SDK with the next CLI release, with nothing to regenerate. The price is that an SDK in any language needs Node and the CLI to run its mock-mode tests.

```
apimatic mock serve [--port 4010] [--host localhost] [--stubs ./stubs] [--token-ttl <seconds>] [--verbose]
```

| Flag | Meaning |
|---|---|
| `--port`, `-p` | the port to listen on, 4010 unless given. `0` picks a free port on localhost, which is what a test run wants. A busy port is an error; the mock never moves to another one |
| `--host` | `localhost` (the default: 127.0.0.1 and ::1) or an IP address, which needs a port other than 0. `0.0.0.0` in a container |
| `--stubs`, `-s` | the directory of stub files, `./stubs` in the working directory unless given |
| `--token-ttl` | `expires_in` for the tokens every OAuth2 server issues, 1 or more; each `oauth2` stub's own `expiresIn` unless given. Set it low to exercise refresh |
| `--verbose` | one line per request on stderr: the request, the status, and the stub that answered or the summary of the miss |

The stub format is the contract between the generator and the mock: [stub-format.md](stub-format.md), enforced by [`mock-stubs.schema.json`](../../mock-stubs.schema.json) and the loader's rules.

## 2. One stub file per operation

The format is specified in [stub-format.md](stub-format.md) and enforced by `mock-stubs.schema.json` plus the loader's semantic rules; the worked examples are the TesterPoc files in `test/resources/mock/tester-poc/` (113 stubs for 97 operations of five specs, the set the C# SDK's contract suite runs against) and the Spec S files in `test/resources/mock/spec-s/` (84 stubs for 22 operations). The generator writes `NN-<operationId>.json`, an array of stubs in UTF-8 (the loader reports a byte that is not), in the operation order of the spec so the file names sort like the documentation. The loader sorts names ordinally, so the number is zero-padded to the width of the largest (`001-` once a spec has 100 operations; unpadded, `100-` would sort before `11-`). In the name, every character of the operationId other than an ASCII letter, a digit, `-`, `_` or `.` becomes `-` (`repos/get` gives `01-repos-get.json`; a `/` would put the file in a subfolder, which the loader does not read), while the stub's `operation` keeps the operationId as written. The order has one exception: an operation comes before every operation of the same method whose path template also matches its path and more (`GET /v1/users/me` before `GET /v1/users/{user_id}`, `GET /repos/{repo}/releases/latest` before `GET /repos/{repo}/releases/{release_id}`), the more specific path first, as routers match it. The first matching stub answers, so otherwise the broader operation's error stubs would answer the other's `Prefer: code=` requests with their own body and headers; the loader refuses that order whenever the two share an error status, as they do whenever both serve a `default` as 500. Number in spec order and move an operation up only as far as it must go (a stable topological sort); such an order always exists, because the more specific path has fewer parameters, so no two operations can each need to come first. Within a file, success stubs come first; the first matching stub wins.

### Success stubs: one per request example

For every request example of an operation (named examples, or the single `example`), emit a `success` stub:

| Stub field | From the spec |
|---|---|
| `name` | `<operationId> <status> <example name>`, followed by the response media type when the operation has several (the stubs of one example would otherwise share a name); must be unique across all files |
| `operation` | `operationId` |
| `example` | the example's name when the operation's response carries several named examples, so a test selects the stub with `Prefer: example=<name>`; omit it when there is one example. Sibling stubs of one request differ only in `response`. `Prefer` splits at `,` and `;` and has no escape for `"`, so a name holding one is a load problem: replace each such character with `-` in the stub's `example` and in the test's `Prefer`. |
| `request.method`, `request.path` | the operation, with the server URL's path (`/v1`) prepended and joined with one `/` (a server URL that ends in `/` must not leave `//`, which is a load problem). The server URL is the first entry of the nearest `servers`: the operation's, else its path item's, else the document's (`getHealth` serves from `/health`), with every server variable replaced by its `default`; a `{version}` left in would accept any version, and `/api-{version}` is a load problem. Each literal segment is written decoded, as the example's value reads (`jo@example.com`, not `jo%40example.com`). A segment whose value holds `%` or `+` (which the loader refuses in a stub path), `?` or `#` (which would end the path), or is a `date-time` (which each language spells its own way) is written as its `{name}` template instead, so it accepts any value, and the stub's `description` says so |
| `request.query` | every query parameter the example sets, serialized the way the spec says: `form` + `explode=false` as one comma-joined value, `explode=true` as an array (repeated key; an empty array is sent as no key at all, so it is written `null`), `deepObject` as `name[key]` keys; a `date-time` value as `{ "dateTime": "<example>" }`, so the SDK's own spelling of the instant matches. Leave `queryMode` closed. |
| `request.headers` | header parameters the example sets (exact), and for a body `"Content-Type": { "startsWith": "<media type>" }`. Not every client can send a header name that is no RFC 9110 token or a value outside printable ASCII (a person's name with an accent, a locale's word): .NET's HttpClient refuses to, and others send Latin-1 where Go and Ruby send UTF-8, so the loader refuses such a rule. Give the stub and the test the same ASCII stand-in, each other character replaced by `_`, and say so in the stub's `description`. |
| `request.cookies` | cookie parameters the example sets, under the same rule as headers |
| `request.auth` | the operation's effective security requirement (see below); omit when the requirement list is empty (`security: []`) or holds the empty requirement `{}`, which makes credentials optional (an empty credential set is a load problem) |
| `request.body` | the example body: `{ "json": … }` with a `date-time` property as `{ "$dateTime": "<example>" }` and a property the SDK generates (an idempotency key, a client timestamp) as `{ "$startsWith": … }` or `{ "$any": true }`; `{ "text": … }`; `{ "bytes": "<base64>" }`; `{ "form": … }` for `application/x-www-form-urlencoded` (one field per property, an array property as an array, a `date-time` property as `{ "dateTime": … }`); or a `multipart` with one part per encoded property (an array of files as an array of parts); omit when the operation has no body |
| `response.status`, `response.headers`, `response.body` | the response example that pairs with the request example (same example name), including declared response headers (a name must be an RFC 9110 token, which the loader checks), except the ones the loader refuses: `Date`, `Connection` and `Transfer-Encoding`, which the server writes itself, the request headers `Accept`, `Expect`, `Host`, `If-Modified-Since`, `Proxy-Connection`, `Range`, `Referer` and `User-Agent`, `Content-Length` unless the response is a `HEAD` or `304` without a body (and never on a 204 or 205), and a header whose example value is empty; a self URL (`Location`, `Link`) is written with `{{origin}}` in place of the server origin |

Response bodies by media type, with the media type also written as the response's `Content-Type` (a `bytes` body otherwise goes out as `application/octet-stream`), except for `multipart`, whose default `Content-Type` carries the boundary (the loader refuses a stated one that does not name the body's boundary, so leave it out): `application/json` and every `+json` type (`application/problem+json`) → `json`; `text/event-stream` → `sse` with one event per example chunk (string data as written, object data serialized compactly); `application/x-ndjson` → `ndjson` (one object per line); `multipart/form-data` → `multipart` with one part per property of the response schema (a `format: binary` or `contentMediaType` property → `bytes` with the property name as `filename` and the media type as `contentType`, an object → `json`, a string → `text`; an array property cannot be split into parts, so such an operation gets a `bytes` stub of the whole body, its `Content-Type` naming the boundary the bytes use); any other `text/*` that is UTF-8 or names no charset → `text` (a `text` or `json` body is always sent as UTF-8, so the loader refuses one whose `Content-Type` names another charset); anything else → `bytes`.

Operations with several response media types get one stub per media type with the `Accept` header as the selector. The stubs of the other media types come first, each with the `Accept` the SDK sends for it, and the stub of the spec's first media type comes last with no `Accept` rule, so it answers `*/*`, a missing `Accept` and anything else, as a real server answers with its default. (Spec S's hand-written `downloadDocumentContent` names an exact `Accept` on both stubs, so its tests always send one.)

### Operations without examples: one synthesized success stub

Most specs carry examples on few operations (Spec S: 3 of 22; its other 19 success stubs were written by hand). An operation without a request example still gets one `success` stub (one per response media type), synthesized from its schemas, so every operation has a happy-path test:

- Values come from the parameter and body schemas the way the APIMatic model already renders documentation examples: the schema's `example` or `default` when present, otherwise the first `enum` member, otherwise a value typical of the `format` (`uuid`, `date-time` in UTC with `Z`, an `int64` beyond 2^53, a decimal string for Money). The rendering is deterministic, so two generations of the same spec produce byte-identical stubs and the SDK test does not drift.
- The response is synthesized from the first 2xx response's schema (or from `default`'s, served as 200, when the operation declares no 2xx) with every property present, required or not, so the decoding of each field is exercised; declared response headers get a value the same way.
- A request example without a paired response example (or the reverse) gets the missing side synthesized.
- The stub is named `<operationId> <status> synthesized` and its `description` says `Synthesized from the schema; the spec has no example.`; the 418 body repeats the description, so a reader of a miss knows the values are invented.
- A synthesized stub proves that the SDK sends what the schema describes and decodes what it describes; it says nothing about the API's real behaviour. The generated test compares the decoded result with it like any other stub.

### Paginated operations: the first page only

A pagination example is one page and the mock keeps no state, so the generator emits one stub per example page, as for any other operation, and never invents the page after it. The generated test of a paginated operation reads the first page only (`AsPages().FirstAsync()` in C#), as the C# SDK's contract suite does. Most of TesterPoc's `getProducts*` and `getOrders*` operations serve a first page that says there is more (`hasMore: true`, a `totalItems` beyond the page, `nextCursor`, `links.next`) and no page after it, so a walk past it fails: with a 418, or for `getOrdersLinked`, whose `links.next` names the spec's `http://localhost:8080`, with the v4 C# SDK's cross-origin error. A synthesized page is a last page (see [What the first SDK suite taught](#what-the-first-sdk-suite-taught)), so a walk over it ends.

For a walk (hand-written today: Spec S walks `listAccounts`, `listTransactions`, `searchTransactions`, `listStatements` and `listAuditEvents`), every page the walk reaches needs a stub, and a follow-up page's stub is the request the paginator sends, not an example request as written:

- `method`, `path`, `headers` and `auth` are the first page's; `query` is the first page's with the paginator's parameter added or replaced: the offset plus the items the previous page returned (`listAccounts`: `offset=1`), the next page number (`listStatements`), or the cursor from the previous page's response (in the body when the cursor travels there, as in `searchTransactions`).
- A next link names the operation's own path and carries every query parameter of the first request plus the page token (`/v1/audit-events?in=svc-ledger,avery&limit=2&page_token=pt_2`). In a `Link` header it is written with `{{origin}}`; in a JSON body, which is served as written, it is written relative. A client that requests the whole link (the v4 C# SDK, which refuses a link to another origin) and one that sets the link's query over the first request (codegen-v2's `LinkPagination`) then send the same request, and one stub answers both. An operation whose first request repeats a query key (an `explode=true` array) cannot be walked by codegen-v2's link paginator, which reads the link's query into a dictionary; write no follow-up page for it.
- Cookie parameters are left undeclared on a follow-up stub: a client that sends the first request again re-sends a cookie only when it travels as a header the request keeps, and a whole-link client may send none (Spec S's `listAuditEvents 200 page 2`).
- The last page ends the walk the way the paginator looks for it: `has_more` false, a `null` or absent cursor, no `rel="next"`, or no items.

### Error stubs: one per declared error status

For every response with a status of 400 or more, emit an `error` stub with the same `operation` and `auth`, the path as a template (`/v1/accounts/{account_id}`), no query and no body, and the response example as its body. A declared status keeps its code. A range such as `4XX` and `default` never take a status another error stub of the operation serves, since every SDK decodes a declared status as that status's response, so the test of the range or `default` would get the wrong one: a range takes the status its example names when that is free (TesterPoc's `processMultipleError`: 423), otherwise the first free status of the range (400, or 401 beside a declared 400); `default`, placed last, takes the first free 5xx (500, or 501 beside a declared 500). The stub's `description` says which response it serves. An operation that declares no 2xx has its `default` as its success response instead: a success stub served as 200, and no error stub for it. A generated test reaches these with `Prefer: code=<status>`. A success stub tolerates `Prefer: code=<its own status>`, so a test may always send the status it expects; for that reason a success stub must never carry a `"Prefer": { "absent": true }` header rule.

### Credentials: the effective security requirement

The operation's `security` (or the document's when the operation has none) is an OR of ANDs. Each requirement becomes one entry of `auth.anyOf`, with one credential per scheme in it:

| Scheme type | Credential |
|---|---|
| `http` / `bearer` | `{ "in": "header", "name": "Authorization", "value": "Bearer test-bearer-token" }` |
| `http` / `basic` | `{ "in": "header", "name": "Authorization", "value": "Basic dGVzdC11c2VyOnRlc3QtcGFzc3dvcmQ=" }` (`test-user:test-password`) |
| `apiKey` in `header` | `{ "in": "header", "name": "<name>", "value": "test-api-key" }` |
| `apiKey` in `query` | `{ "in": "query", "name": "<name>", "value": "test-api-key" }` (never an unexpected query key) |
| `apiKey` in `cookie` | `{ "in": "cookie", "name": "<name>", "value": "test-api-key" }` |
| `oauth2`, client credentials flow | `{ "in": "header", "name": "Authorization", "value": "Bearer cc-access-token" }` |
| `oauth2`, authorization code flow | `{ "in": "header", "name": "Authorization", "startsWith": "Bearer ac-access-token-" }` |
| `oauth2`, password flow | `{ "in": "header", "name": "Authorization", "value": "Bearer pw-access-token" }` |
| `oauth2`, implicit flow | `{ "in": "header", "name": "Authorization", "value": "Bearer im-access-token" }` |
| `openIdConnect` | `{ "in": "header", "name": "Authorization", "value": "Bearer test-bearer-token" }`; nothing is served for it, because discovery, keys and signed ID tokens belong to a provider the mock cannot be |

The key of each credential is the scheme's name in the spec, which is what the 418 report prints. An `oauth2` scheme with several flows becomes one `anyOf` entry per flow, each keyed by the scheme's name, so a client configured for any of them matches. A requirement that ANDs two schemes sent in the same header (`bearer` and `basic`, both on `Authorization`) can never be met, so it is left out of `anyOf`; an operation left with no requirement is stubbed without `auth`, so the rest of its request is still checked, and the stub's `description` says its credentials are not.

### The `oauth2` stub

When any `oauth2` scheme exists, emit one `oauth2` stub per distinct `tokenUrl` path, each in a file of its own: `oauth2.json` when there is one, otherwise `oauth2-1.json`, `oauth2-2.json`, … in the order the schemes are declared, padded like the operation files (an `oauth2.json` beside `oauth2-2.json` would load second, since `-` sorts before `.`). Each stub has:

- `tokenPath`: the path part of the `tokenUrl`. A spec whose oauth2 flows are all implicit has no `tokenUrl`, so its stub takes the `authorizationUrl`'s path with `/token` appended (`/oauth/authorize/token`), a path the token endpoint answers only to refuse every grant (`expected none (only the implicit flow is offered)`);
- `flows`: one member per flow of every scheme that names this token URL, merged by kind in the order `clientCredentials`, `authorizationCode`, `password`, `implicit` (an implicit flow, which has no token URL, joins the stub whose `authorizationUrl` it shares, or else the first stub); `authorizePath` is the path part of the flow's `authorizationUrl`; every other member is left to its default;
- `clientId`/`clientSecret` as `test-client-id`/`test-client-secret`;
- `scopes`: the union of the merged flows' scopes. Each must be an RFC 6749 scope-token (printable ASCII without a space, `"` or `\`), which the loader checks: a client could never request a scope that holds a space.

No two stubs may claim one token or authorize path, and an operation whose path is one of them gets no endpoint stub: the oauth2 stub serves that path, so such a stub is a load problem. The behaviour (both client-authentication styles, PKCE S256 with auto-consent, the password grant, the implicit redirect, numbered refresh rotation) is fixed in the mock, and it is strict where the RFCs are: a client authenticates one way per request (RFC 6749 §2.3), a PKCE verifier is 43 to 128 unreserved characters (RFC 7636 §4.1), and `scope` is sent at most once with one space between two scopes (RFC 6749 §3.1, §3.2, §3.3). Beyond the RFC, every consent request must carry a non-empty `state` and an absolute `redirect_uri` (RFC 6749 §4.1.1 makes the first recommended and the second optional), because the mock has no client registration to fall back on ([stub-format.md](stub-format.md#oauth2)), so an SDK that relies on PKCE alone against CSRF gets a 418 naming `state`.

One shape cannot be rendered today: two schemes whose token URLs differ but whose `authorizationUrl` is the same. Each needs a stub of its own, and the loader refuses two stubs on one authorize path; joining the second flow to the first stub does not help, because its SDK exchanges the code at its own token URL. The generator reports such a spec instead of emitting a set that does not load. Serving it needs the mock to let one authorize endpoint issue codes for several token paths, which no spec has called for yet.

### What the first SDK suite taught

The TesterPoc set was rendered by hand from five specs and run against the C# SDK's 103 contract tests. Where the SDK sends what the spec does not declare, the stub follows the SDK and its `description` says so; these are the rules a generator has to know:

- **Defaults and constants are always sent.** A query parameter with a `default` and a body property with a `const` appear in the request whether or not the test sets them (`processDefaultsAndConstants`).
- **An unset optional JSON body is sent as `null`** (`{ "json": null }`, `bodySendModel`); **an unset optional form body is sent empty**, which a stub without `body` accepts (`formSendModelWithExtras`). An unset optional query or header parameter is simply absent; write the header as `null`, which asserts absence.
- **Header arrays and header dictionaries are written the way the target SDK sends them.** The C# SDK joins an array with `, ` and writes a dictionary as compact JSON (`"datetime": "784111777, 784111777"`, `"dates": "{\"key1\":784111777,\"key2\":784111777}"`), for `headerSendUnixDatetimeArray`, whose spec declares no header at all, so OpenAPI's `simple` style (a bare `,`) never applied; another language's SDK may join differently. Those headers stay exact text; a `dateTime` rule fits a single value only, and a header sent on two lines stays a mismatch ([stub-format.md](stub-format.md#values)).
- **Dictionary-valued query and form parameters use bracketed keys**: `dates[key1]`, `dates[0][key1]`, and an array under a key repeats it.
- **A date-time value is never literal.** Query, header, cookie and form values become `{ "dateTime": "<example>" }` (array items too), JSON body strings `{ "$dateTime": "<example>" }` and a path segment its `{name}` template, so each language's serializer may spell the instant its own way. A multipart field is the known exception: a part's `text` takes no rule, so a date-time part is compared exactly and its stub must spell the instant the way the target SDK does. A `format: date` stays literal; every language writes it one way.
- **Property-level examples stand in when the media type has none.** The body of `error400` is assembled from its schema's property examples.
- **A `4XX` range is served as the status its example names** (`processMultipleError`: 423), when the operation declares no response of its own at that status (see [Error stubs](#error-stubs-one-per-declared-error-status)); a key that is not a valid range, such as `40X`, gets no stub. A 200 declared with no content is a stub with no response `body`, and a 204, 205 or 304 never gets one, even when the spec declares content for it: the loader refuses a body on those statuses (RFC 9110 §15.3.5, §15.3.6, §15.4.5). A declared 1xx gets no stub at all, because the loader refuses a status below 200: an interim response would leave the client waiting for a final one.
- **Several response media types get one stub each**, selected by what the SDK sends: `get1123DateTime` serves its `text/plain` example by `Accept` and its `application/json` example by the `?array=true` the SDK adds.
- **An operation without an `operationId` is named after the SDK method** that calls it (`getOAuth2AuthorizationCode`), so the stub's `operation` matches the test's name.
- **A paginated test reads one page.** The suite takes `AsPages().FirstAsync()`; an example page that says there is more (`getProductsOffset`, `getOrdersCursor`, `getOrdersLinked`, whose `links.next` names the spec's `localhost:8080`) is served as written with no second stub, and a synthesized page is a last page: `has_more` false, the `next` cursor absent, or a Link header without `rel="next"` (`getProductsOffsetHasMoreHeader`, `getOrdersHeaderLinked`), so a walk ends on the stub without a second one.
- **Several named response examples become one stub each with `example`**, in the spec's order, so the first answers a request without `Prefer: example=` (`getProductsOffsetOptionalItems`: `page1`, `noItems`).
- **A success stub answers its own status in `Prefer: code=`**, so a test may always send the status it expects (`processMultipleError`'s SDK test sends `Prefer: code=200` with every call); therefore never emit `"Prefer": { "absent": true }`.
- **Sibling stubs that differ only in optional headers list the other stubs' headers as `null`** (`headerSend`: three stubs, each asserting the two headers it does not send are absent), so they stay distinguishable and a 418 names the header.

## 3. What a generated test does

1. **Start the mock** on a free port, `apimatic mock serve --port 0 --stubs mock/stubs`, and read stdout until a line holds `MOCKSERVER_URL=`; the origin is the rest of that line. The line is not the first one and does not start with the marker: the CLI prints its own heading before it and its gutter in front of it, so search for the marker rather than taking a line by position. A few lines of description follow it on stdout. The `--verbose` request log goes to stderr, which the harness inherits or keeps reading, because a pipe nobody reads fills up and stalls the mock.
   - Exit code 1 means a stub file is wrong, the stubs directory cannot be read (every problem is listed, by file) or the port could not be opened (the origin and the reason are named). 2 means a bad flag, named on stderr. 130 means the mock was stopped by SIGINT or SIGTERM.
   - The free port is on the loopback (127.0.0.1 and ::1): nothing outside the machine, and no firewall prompt, sees it.
   - Stop the mock when the run ends, from an exit hook, so that a run that throws stops it too (`terminate()` in Python, `kill()` in Node). A harness that leaves it running leaves it listening, and the next run starts another on a new port without noticing.
   - On Windows a process cannot be sent SIGTERM: stopping the mock there ends it at once, with no exit code of 130. A harness that starts the CLI through its `apimatic.cmd` shim stops the shim, not the Node process behind it, unless it stops the whole process tree; starting Node on the CLI's entry point avoids that.
2. **Configure the SDK** with that origin as the base URL for every server group (the mock serves all of them on one origin), the same origin as the OAuth2 token and authorization server base URL, and the fixed test credentials. One origin cannot tell two groups apart when they serve the same method and path (`GET /status` in two merged specs): the first group's stubs answer both, and nothing reports it at load. For such an SDK, run one mock per group, each on `--port 0` with its group's stubs in its own directory, and give each group its own mock's origin. A harness that starts the mock itself may use a fixed port instead of reading the origin; the default, 4010, is what the C# contract suite points every group at.
   For the authorization-code flow the SDK asks the test for a code; the test consents on the user's behalf by sending `GET` to the authorization URL with redirects disabled and reading `code` from the `Location` header, as the C# fixture does:

   ```csharp
   // The SDK's PromptForAuthorizationCode callback; _consent is an HttpClient with AllowAutoRedirect = false.
   private async Task<string> Consent(string authorizationUrl, CancellationToken cancellationToken)
   {
       using var response = await _consent.GetAsync(authorizationUrl, cancellationToken);
       var location = response.Headers.Location ?? throw new InvalidOperationException("The mock did not redirect.");
       return HttpUtility.ParseQueryString(location.Query)["code"] ?? throw new InvalidOperationException("No code.");
   }
   ```
3. **For each success stub**, call the SDK operation with the example's inputs and compare the decoded result with the example (structurally, keeping int64 digits and decimal strings as written). The mock answers 418 whenever the SDK sent something else; the body says what, so the test fails with the reason. For a paginated operation the decoded result is the first page (see [Paginated operations](#paginated-operations-the-first-page-only)).
4. **For each error stub**, send the request with `Prefer: code=<status>` through the SDK's custom-header mechanism and expect the typed error for that status. For a declared 418, the one status a miss also has, check too that the answer carries no `X-Mock-Mismatch` header, which only the mismatch report sends.
5. **Retries** cannot be observed as "429 then 200" because the mock is stateless; count attempts instead: send each attempt with a marker of the test's own (`Prefer: code=429, test-run=<guid>`), then read `GET {origin}/__admin/requests` and count the entries whose `request.headers.prefer` holds it ([the request log](stub-format.md#the-request-log)). `DELETE {origin}/__admin/requests` clears the log; nothing else under `/__admin` exists.
6. **Live mode** is a client-side switch: a real base URL and credentials from the environment, no mock, no `Prefer`, no forced-error tests, status and decoding checked instead of exact bodies.

A harness in any language spawns the process and reads up to the marker:

```ts
// TypeScript
const mock = spawn('apimatic', ['mock', 'serve', '--port', '0', '--stubs', 'mock/stubs'], {
  stdio: ['ignore', 'pipe', 'inherit'] // stderr inherited, never an unread pipe
});
process.on('exit', () => mock.kill()); // stopped however the run ends
const origin = await textAfter(mock.stdout, 'MOCKSERVER_URL='); // up to the end of that line: http://localhost:51234
process.env.API_BASE_URL = origin;
```

```py
# Python
mock = subprocess.Popen(['apimatic', 'mock', 'serve', '--port', '0', '--stubs', 'mock/stubs'],
                        stdout=subprocess.PIPE, text=True)  # stderr inherited, never an unread pipe
atexit.register(mock.terminate)  # import atexit; stopped however the run ends
for line in mock.stdout:
    if 'MOCKSERVER_URL=' in line:
        origin = line.split('MOCKSERVER_URL=', 1)[1].strip()
        break
```

## 4. What the mock does not do

- It keeps no state: a create is not visible to a later get, a replayed old refresh token is not detected, and an authorization code is not single-use: a replayed code is exchanged again (RFC 6749 §4.1.2 has a real server refuse it), so a test cannot rely on the mock to catch a client that exchanges its code twice.
- It compares a request body as sent on the wire and decodes no `Content-Encoding`: an operation that declares compressed uploads needs a `bytes` stub of the compressed form, and an SDK that compresses a body the stub has plain gets a 418 naming the body.
- It reads request text (a `text` body or part) as UTF-8 and honours no declared charset: an operation whose spec declares text in another charset (`text/plain; charset=iso-8859-1`) needs a `bytes` stub of the encoded form, and text that is not UTF-8 gets a 418 naming the body.
- Scopes are not encoded in tokens; a 403 for a missing scope is reachable only with `Prefer`.
- It compares values as written. A field that legitimately varies (a timestamp the SDK generates, an opaque cursor) needs a `startsWith`, `endsWith` or `contains` rule in the stub (`$startsWith`, `$endsWith`, `$contains` or `$any` inside a JSON body), which the generator can emit when the parameter's example is marked as varying; a date-time needs a `dateTime` rule (`$dateTime` in a JSON body), which the generator always emits for `format: date-time`.
- It does not validate examples against the schema; that is a spec-linting job (Prism, Spectral) upstream of generation.
- It does not deliver webhooks.

## 5. What changed from the C# proof of concept

For anything built against `mock-server-poc-v4`. The stub format, the 418 report, `Prefer`, the OAuth2 endpoints and the test credentials are unchanged; the stub files of the proof of concept load as they are.

| | Proof of concept | Here |
|---|---|---|
| Start | `mockserver`, a binary copied into the SDK; in process for C# | `apimatic mock serve`; no in-process host |
| Default port | 0, a free one | 4010; `--port 0` for a free one |
| Default stubs directory | `stubs/` beside the binary | `./stubs` in the working directory |
| The origin on stdout | the first line, `MOCKSERVER_URL=<origin>` | a line holding `MOCKSERVER_URL=<origin>`, after the CLI's heading |
| Stub problems, a refused port | on stderr | on stdout, with the rest of the CLI's output |
| Exit codes | 0 stopped, 1 stub problems, 2 bad arguments, 3 port | 130 stopped, 1 stub problems or port, 2 bad flag |
| `--host 127.0.0.1` | binds both loopbacks | binds 127.0.0.1 alone; `localhost` binds both |
| A method in lower case | 418 naming the method | 400 from the HTTP parser |
| The request path | percent-decoded twice, `+` read as a space | percent-decoded once, `+` kept |
| A chunked body over 30,000,000 bytes | 500 | 413 |
| `GET /__admin/requests` | WireMock's log entries | the mock's own shape ([the request log](stub-format.md#the-request-log)) |
| `DELETE /__admin/requests` | 200 | 204 |
| Other paths under `/__admin` | WireMock's read-only admin API (`mappings`, `settings`) | 404 |
| A JSON fault in a report | the .NET library's wording | `Duplicate property 'name' at line 1, column 8.` |
| A schema problem at load | the schema library's wording | the mock's own; the JSON pointers are the same |
| A served JSON body | characters beyond the basic plane escaped (`\uD83D\uDE00`) | written as they are, so the bytes and `Content-Length` of such a body differ |
| The 418 body's line ends | the platform's | LF |
