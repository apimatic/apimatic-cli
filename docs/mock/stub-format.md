# Stub file format

A stub file describes the exact requests the mock answers and what it answers with. The generator renders one file per operation from the spec; people can also write them by hand. Every file must satisfy [`mock-stubs.schema.json`](../../mock-stubs.schema.json) (JSON Schema 2020-12) and the rules under [Validation](#validation). The loader checks both at startup and refuses to start on any problem, listing all of them.

A file is a JSON **array of stubs**. Comments (`//`, `/* */`) and trailing commas are tolerated in hand-written files; the generator writes strict JSON.

```jsonc
[
  {
    "name": "listTransactions 200 page 1",        // required; unique across all files
    "operation": "listTransactions",              // required for success and error stubs: the spec's operationId
    "kind": "success",                            // success (default) | error | oauth2
    "example": "page1",                           // optional: the spec's example name; selected with Prefer: example=page1
    "description": "cursor paging with filters",  // optional; a miss repeats it in the 418 body
    "request":  { … },                            // success and error stubs
    "response": { … },                            // success and error stubs
    "oauth2":   { … }                             // oauth2 stubs only
  }
]
```

## Kinds

| kind | Served when | Has |
|---|---|---|
| `success` | the request matches `request` exactly and its `Prefer` header, if any, asks for no other status (`code=<response.status>` is tolerated) and no other example | `request`, `response` |
| `error` | the request matches the route and credentials and carries `Prefer: code=<response.status>` | `request` (method, path, headers, cookies, auth only), `response` with status ≥ 400 |
| `oauth2` | always; registers the token endpoint and the authorize endpoint of each redirecting flow | `oauth2` |

Error stubs are how a test asks for a declared error response (the Prism and Scalar convention). They never look at the query string or the body, so an error stub must not declare `query`, `queryMode` or `body`. An `oauth2` stub describes one authorization server; a stubs directory may hold several, each on its own paths.

The `Prefer` header carries two preferences, each at most once (the first token of its kind counts; other tokens such as `respond-async` are ignored). Tokens are separated by `,` or `;` and read as RFC 7240 spells them, so whitespace around `=` and a quoted value are allowed (`code = 404`, `code="404"`, `example="page 2"`):

- `code=<status>` asks for the error stub of that status. A success stub also accepts its own status, so a generated test can always send the status it expects.
- `example=<name>` asks for the stub whose `example` is that name, when an operation's spec carries several named examples and the stubs differ only in what they respond. Without it, the first matching stub in file order answers, whether or not it has an `example`; with it, only the stub of that name does (a stub without an `example` reports `no example= preference (this stub has no example)`). An `oauth2` stub has no `example`. A name holds no `,`, `;` or `"`: the header is split at the first two before a quoted value is read, and a quoted value has no escape for the third, so no request could ask for such a name, and it is a load problem.

## `request`

```jsonc
"request": {
  "method": "GET",                                  // GET | POST | PUT | PATCH | DELETE | HEAD | OPTIONS
  "path": "/v1/accounts/7a1b…/transactions",        // includes the base path; see Paths
  "query": { "limit": "2", "tags": ["rent", "shared"], "cursor": null, "page_token": { "startsWith": "pt_" } },
  "queryMode": "closed",                            // closed (default) | open
  "headers": { "Idempotency-Key": "9b2f…", "Content-Type": { "startsWith": "application/json" }, "Prefer": { "absent": true } },
  "cookies": { "ledger_session": "sess_7f3a" },
  "auth": { "anyOf": [ … ] },
  "body": { "json": { … } }
}
```

The method is matched as sent, letter case included (RFC 9110 §9.1 makes it case-sensitive): fetch upper-cases only DELETE, GET, HEAD, OPTIONS, POST and PUT, so an SDK that writes `patch` sends `patch`. The mock's HTTP parser accepts a method in upper case only and answers any other with a 400 that says so (`Invalid method encountered`), before a stub sees the request; a method in upper case that no stub expects gets a 418 naming the method.

### Paths

A path is the full path on the mock's origin, base path included (`/v1/accounts`, or `/health` for an operation that overrides `servers`). A segment written as `{name}` matches any one segment; names use letters, digits, `_`, `-` and `.`. Braces cannot be mixed with literal text in one segment, and a path carries no `?query` or `#fragment`. Literal segments are written decoded, the way the value reads (`/v1/users/jo@example.com`, not `jo%40example.com`): the mock decodes the request path once before matching, so a segment holding `%` is a problem (write the value it stands for), and `+` is refused with it, as the format has refused both from the start. So is a dot segment (`.` or `..`, as in `/a/../b`): a client resolves dot segments before it sends the path, so such a stub could never match. Matching is case-sensitive and whole-path: `/v1/accounts` does not match `/v1/accounts/`. Only the last segment may be empty, so `/` (the root) and a trailing `/` are paths, but `//` anywhere is a problem: it is what joining a base path that ends in `/` (`/v1/`) to an operation path (`/accounts`) leaves, and no SDK sends it. Paths under `/__admin`, in any letter case, belong to the mock's admin API, which answers before any stub, so a stub there (an `oauth2` path included) is a problem.

Success stubs normally use literal paths with the example's identifiers; error stubs use templates, because a declared error looks the same for every identifier. A request with another identifier and no `Prefer: code=` therefore matches no stub, and the report names the success stub's path rather than asking for one.

### Values

Query parameters, headers, cookies and credentials share one way of saying what a value must be:

| Written as | Meaning |
|---|---|
| `"text"` | exactly this value (ordinal comparison, whole value) |
| `["a", "b"]` | **query keys and form fields**: the name is sent more than once, with these values in this order; each item is a string or one of the rules below |
| `null` or `{ "absent": true }` | the name must not be sent |
| `{ "startsWith": "application/json" }` | the value must start with this text |
| `{ "endsWith": ".pdf" }` | the value must end with this text |
| `{ "contains": "code=" }` | the value must contain this text |
| `{ "dateTime": "2025-12-09T14:30:00Z" }` | the value is this instant, in any spelling: RFC 3339 with `Z` or a `±hh:mm` offset and any number of fraction digits (at least one after the dot), RFC 1123 (`Tue, 09 Dec 2025 14:30:00 GMT`) or Unix seconds (`1765290600`, negative before 1970). The basic offset `+0100` and a one-digit offset hour `+1:00` are not RFC 3339 and do not match |

All comparisons are ordinal (an `Authorization` credential's scheme is the one exception, see [`auth`](#auth)), and every rule but the array and `absent` expects the name to be sent exactly once: a header, query key or cookie sent twice is a mismatch unless the stub lists it as an array (query keys and form fields). There are no regular expressions: the three text rules cover the values that legitimately vary (a media type with parameters, an opaque cursor, a token the mock mints), `dateTime` covers the one value every language's serializer spells differently, and a generator never has to escape anything. A bare date (`2026-01-15`) is not a `dateTime`; every language writes it the same way, so an exact value serves it. Header names are matched case-insensitively; query and cookie names exactly. Query keys that contain brackets, such as `filter[min_amount]`, are written literally; the mock decodes `%5B`/`%5D` before matching. A header or cookie rule, and a credential sent in a header or cookie, has a name that is an RFC 9110 token and only printable ASCII in its values, because not every client can send anything else: .NET's HttpClient refuses to, and Python, Node and curl send it as Latin-1 where Go and Ruby send UTF-8, so one value arrives as different bytes. A query value may hold any character, since it is percent-encoded.

### `queryMode`

`closed` (the default) means every query key the request sends must be named in `query`; an unknown key is a mismatch. That is what catches a renamed or an extra parameter. A key a credential travels in (an API key `"in": "query"`) is not unexpected when it carries that credential's value, nor while no credential set is satisfied, since the `auth` difference names it then; an empty or wrong one beside another credential that authenticates (a Basic header plus `api_key=old`) is a mismatch. `open` ignores unknown keys. Keys named `null`/absent are checked in both modes.

### `auth`

```jsonc
"auth": {
  "anyOf": [
    { "bearerAuth":   { "in": "header", "name": "Authorization", "value": "Bearer test-bearer-token" } },
    { "apiKeyHeader": { "in": "header", "name": "X-API-Key", "value": "test-api-key" },
      "basicAuth":    { "in": "header", "name": "Authorization", "value": "Basic dGVzdC11c2VyOnRlc3QtcGFzc3dvcmQ=" } },
    { "oauth2AuthCode": { "in": "header", "name": "Authorization", "startsWith": "Bearer ac-access-token-" } }
  ]
}
```

`anyOf` lists the alternatives; **any one** set satisfies the request, and **every** credential in a set must be present. This is the OR-of-ANDs shape of an OpenAPI security requirement. Keys inside a set are the spec's security scheme names, which mismatch reports show. `in` is `header`, `query` or `cookie`; exactly one of `value`, `startsWith`, `endsWith`, `contains` or `dateTime` is given. Omit `auth` for an operation that needs no credentials.

The scheme that opens an `Authorization` header credential (`Bearer`, `Basic` or any other, the text before the first space of a `value` or `startsWith`) is compared ignoring case, as RFC 9110 §11.1 makes it case-insensitive: `bearer test-bearer-token` matches `Bearer test-bearer-token`. The credentials after the scheme, and every other credential, compare exactly, and a mismatch shows the value as sent (`bearer wrong-token`).

### `body`

| Written as | Meaning |
|---|---|
| omitted or `null` | the request must carry no body |
| `{ "json": … }` | JSON compared structurally: same keys, same values, same types, any key order. `"250.00"` and `250.00` are different. Numbers compare by exact value however they are written: `1.0` equals `1` and `1e30` equals `1.0E30`, while `1e-30` is not `0` and every digit counts. A request body that is not strict JSON (a key twice in one object, a lone surrogate escape, bytes that are not UTF-8) is a mismatch of the whole body (the empty name), under `$any` too. |
| `{ "text": "…" }` | read as UTF-8, whatever charset the request declares, and compared ordinally; bytes that are not UTF-8 are a mismatch (`expected UTF-8 text, got bytes that are not UTF-8`), so text in another charset needs a `bytes` stub |
| `{ "bytes": "<base64>" }` | compared byte for byte, as sent |
| `{ "form": { … } }` | `application/x-www-form-urlencoded`, checked field by field with the rules of [Values](#values); the set of fields is closed. The body is read as sent, not as a URL's query string, so a leading `?` is part of the first field's name (`?note=…` sends `?note`), as a strict server reads it |
| `{ "any": true }` | not checked |
| `{ "multipart": { "parts": { … } } }` | `multipart/form-data` with a boundary of 1 to 70 characters (RFC 2046 §5.1.1), checked part by part; any other media type is a mismatch, however the body is framed |

Every body is compared exactly as it arrives on the wire: no `Content-Encoding` is decoded, so a gzip upload is compared in its compressed form and a plain body labelled `gzip` as the plain bytes it is. An API that declares compressed request bodies needs a `bytes` stub of the compressed form.

A form body is decoded the way a browser encodes it (`+` is a space, `%2B` a plus) and its keys are written literally, brackets included (`dates[0]`). Every field the request sends must be named, as in a closed query string; a field named `null` must not be sent. A request without a body is an empty form, so `{ "form": {} }` accepts it:

```jsonc
"body": { "form": { "note": "Month end", "tags": ["rent", "shared"], "settled_at": { "dateTime": "2026-02-28T17:00:00Z" }, "dry_run": null } }
```

Multipart parts are keyed by field name; the set of parts is closed (an extra part is a mismatch). Every section must carry `Content-Disposition: form-data` (RFC 7578); a section without one, or with another disposition, makes the body unreadable rather than being skipped. Each part has exactly one of `json`, `text` or `bytes`, plus optional `filename` (exact and not empty, because a part sent with `filename=""` reads as one without a filename) and `contentType` (exact, or a text rule such as `{ "startsWith": … }`):

```jsonc
"body": { "multipart": { "parts": {
  "file":        { "filename": "statement-2026-02.pdf", "contentType": "application/pdf", "bytes": "JVBERi0xLjcK" },
  "metadata":    { "contentType": { "startsWith": "application/json" }, "json": { "title": "February statement" } },
  "description": { "text": "Monthly statement for February 2026" }
} } }
```

#### Rules inside JSON bodies

A value inside `json` may be a rule instead of a literal: a one-property object whose name starts with `$`, at any depth, inside arrays or at the root. The five rules are the ones of [Values](#values) plus `$any`:

| Written as | Meaning |
|---|---|
| `{ "$startsWith": "idem_" }` | a JSON string starting with this text |
| `{ "$endsWith": ".pdf" }` | a JSON string ending with this text |
| `{ "$contains": "@" }` | a JSON string containing this text |
| `{ "$dateTime": "2026-03-01T09:00:00Z" }` | this instant, as a string in any accepted spelling or as a number of Unix seconds, read for its value (`1772355600.0` and `1.7723556e9` are `1772355600`; a fraction of a second is no instant) |
| `{ "$any": true }` | not checked; the key must still be present |

A number is never the string a text rule asks for (`250.00` fails `{ "$startsWith": "25" }`). Rules live on the expected side only: a request body is compared as sent, so a `$`-named object inside it is an ordinary object. The loader refuses any other one-property `$` object (`$startswith`, `$literal`) and any rule with the wrong operand, so a misspelt rule is a start-up error rather than a silent exact comparison; a literal one-property `$` object therefore cannot be written. A report names the rule in words: `/idempotency_key: expected a string starting with 'idem_', got "8c1f"`.

```jsonc
"body": { "json": { "amount": "250.00", "idempotency_key": { "$startsWith": "idem_" }, "posted_at": { "$dateTime": "2026-03-01T09:00:00Z" }, "memo": { "$any": true } } }
```

A field the form sends more than once (several files under one name) is written as an array of parts in wire order. The parts pair up by position and a report names them `files[0]`, `files[1]`; a different number of parts is one difference (`expected 2 part(s), got 1 part(s)`):

```jsonc
"body": { "multipart": { "parts": {
  "files": [
    { "filename": "statement-2026-01.pdf", "contentType": "application/pdf", "bytes": "JVBERi0xLjcK" },
    { "filename": "statement-2026-02.pdf", "contentType": "application/pdf", "bytes": "JVBERi0xLjcK" }
  ],
  "note": { "text": "January and February" }
} } }
```

## `response`

```jsonc
"response": {
  "status": 200,                                     // 200–599 (a 1xx is interim); error stubs ≥ 400
  "headers": { "Content-Type": "application/json", "X-Request-Id": "req_1" },
  "body": { "json": { … } },
  "chunkDelayMs": 20                                 // sse and ndjson only: the pause between chunks; default 20
}
```

A header value may contain `{{origin}}`, the one substitution the format offers: it becomes the scheme, host and port the request arrived on (for example `http://localhost:51234`), so `Location` and `Link` headers can be absolute. Nothing else is templated, and bodies are served exactly as written. A URL inside a body therefore keeps the spec's origin (TesterPoc's `getOrdersLinked` hands out `http://localhost:8080/orders/links?page=2&size=20`). Generated tests read only the first page of a paginated operation ([generator handoff](generator-handoff.md#paginated-operations-the-first-page-only)), so nothing follows such a link. A hand-written walk over a body link writes the link relative (`/orders/links?page=2&size=20`) and compares with the stub's body rather than the spec's example: codegen-v2's link paginators use only the link's query string, but a client that requests the whole link (the v4 C# SDK, which refuses another origin) would leave the mock.

| `body` written as | Served as | Default Content-Type |
|---|---|---|
| omitted | no body; the only choice for 204, 205 and 304 | none |
| `{ "json": … }` | the JSON as written: an int64 beyond 2^53 and a decimal string reach the client unchanged | `application/json` |
| `{ "text": "…" }` | the text | `text/plain; charset=utf-8` |
| `{ "bytes": "<base64>" }` | the bytes | `application/octet-stream` |
| `{ "sse": [ … ] }` | server-sent events, one flush per event | `text/event-stream` |
| `{ "ndjson": [ … ] }` | one compact JSON document per line, one flush per line | `application/x-ndjson` |
| `{ "multipart": { "parts": { … } } }` | `multipart/form-data`, one part per name in the order written | `multipart/form-data; boundary=mockserver-boundary` |

A `Content-Type` in `headers` always wins over the default. A client finds a `multipart` body's parts by the boundary its `Content-Type` names, so on such a body a stated one must be a `multipart/` type naming the body's own boundary (quoted or not, compared exactly); simplest is to leave it out. A `json` or `text` body, and such a part, is always sent as UTF-8, so its stated `Content-Type` names `charset=utf-8` or no charset; text in another charset is a `bytes` body of its encoded form. Every body but a stream goes out with a `Content-Length` of its bytes (a `HEAD` answer states the length of the body it leaves out, RFC 9110 §9.3.2), so a client reads the size of a download; a stream, whose length is not known when it starts, goes out chunked.

An `sse` or `ndjson` body is sent with the stub's `status` like any other body (a declared `503` with an event stream included) and flushed one event or line at a time, with `chunkDelayMs` between them and no pause before the first or after the last. A stream stops as soon as its client disconnects, and stopping the mock ends every open stream at once with a clean end of the body, so neither waits out the remaining pauses.

An SSE event is `{ "id": "1", "event": "transaction.posted", "retry": 1500, "data": … }`; only `data` is required. String data is sent as written (`{ "data": "[DONE]" }` gives `data: [DONE]`); any other JSON value is serialized compactly, escaped as a `json` body is, and so is each `ndjson` line, so `é`, `'`, `+`, `<` and `&` stay as written. String data is split at every line ending SSE knows (CRLF, a lone CR and LF) into one `data:` line per line, as the SSE specification requires. SSE has no escape for a line break in `id` or `event`, so neither may hold a CR or LF: the client would read what follows as another field.

A `multipart` response is `{ "multipart": { "boundary": "…", "parts": { "metadata": { "json": { … } }, "file": { "filename": "statement.pdf", "contentType": "application/pdf", "bytes": "<base64>" } } } }`. A part holds `json`, `text` or `bytes` exactly like a body; its `contentType` defaults to that kind's Content-Type above, and a `filename` makes it a file part. Each part is written as RFC 7578 spells it: `Content-Disposition: form-data; name="…"` (with `; filename="…"` for a file part), `Content-Type`, a blank line, the bytes, so names and filenames are printable ASCII without a double quote, and a stated `contentType` is printable ASCII, as any header value is (a line break would start another header inside the part). The `boundary` defaults to `mockserver-boundary`, so the bytes are the same on every run; a stated one is 1 to 70 letters, digits or `'+_-.`, the characters of RFC 2046's set that the `Content-Type` parameter carries without quotes (a strict parser, such as .NET's typed header, reads no media type from `boundary=a=b`), and the loader refuses a part whose bytes contain `--<boundary>`, because a reader would end the part there.

## `oauth2`

```jsonc
{
  "name": "oauth2 authorization server",
  "kind": "oauth2",
  "oauth2": {
    "tokenPath": "/oauth2/token",                    // required: the path part of the scheme's tokenUrl
    "flows": {                                       // required, at least one member; each is optional
      "clientCredentials": { "accessToken": "cc-access-token" },
      "authorizationCode": { "authorizePath": "/oauth2/authorize", "accessTokenPrefix": "ac-access-token-", "refreshTokenPrefix": "ac-refresh-token-" },
      "password":          { "username": "test-user", "password": "test-password", "accessToken": "pw-access-token" },
      "implicit":          { "authorizePath": "/oauth2/authorize", "accessToken": "im-access-token" }
    },
    "clientId": "test-client-id",                    // required
    "clientSecret": "test-client-secret",            // required
    "scopes": ["ledger:read", "ledger:write"],       // default: none
    "expiresIn": 3600                                // default shown; the CLI's --token-ttl overrides it
  }
}
```

Every flow member is optional and `{}` takes the defaults shown; only `authorizePath` has none. Each scope is an RFC 6749 §3.3 scope-token: printable ASCII without a space, `"` or `\`, because a space separates the scopes of a `scope` parameter, so a scope holding one could never be asked for. The paths are literal and served on the mock's origin, so an SDK must let the token server's base URL be overridden. The generator fills the stub from the spec's security scheme: one member per flow of the scheme, `tokenPath` and `authorizePath` from the path part of `tokenUrl` and `authorizationUrl`, `scopes` as the union. A scheme whose only flow is implicit has no `tokenUrl`, yet `tokenPath` is required, so its stub takes the authorize path with `/token` appended; the token endpoint there refuses every grant, since the implicit flow never uses it. Schemes that name different token URLs get one `oauth2` stub per token path, and the mock runs one server per stub; no two stubs may claim the same token or authorize path, because the first server to claim a path would answer for it. The behaviour is fixed in the mock and the stub only parameterises it:

- **Token endpoint** (`POST tokenPath`, body `application/x-www-form-urlencoded`, read as sent: `?grant_type=…` names a field `?grant_type` and sends no grant type). The client authenticates with `client_secret_basic` (a Basic `Authorization` header whose id and secret are form-encoded before base64, as RFC 6749 §2.3.1 says, so `+` is a space there too) or `client_secret_post` (form fields), never both in one request (RFC 6749 §2.3), and at most one `Authorization` header: two are shown as sent, as the client id, and refused; either is checked against `clientId` and `clientSecret`. Beside a Basic header the form may name the header's own `client_id` once (RFC 6749 §3.2.1); a form `client_secret`, even the right one, or another `client_id` is refused with every value in the report (`got test-client-secret & …`). A Basic header that is not base64 of `id:secret` is shown as sent, `Basic` and all (`Basic test-client-id`), so it never passes for the client id and every grant refuses it. The grant goes to the flow that offers it, in the order the members are written; any other `grant_type` is refused naming every offered one (`client_credentials, authorization_code, refresh_token or password`).
  - `grant_type=client_credentials` (`clientCredentials`) issues `accessToken`; the secret is required.
  - `grant_type=password` (`password`) checks `username` and `password` against the flow's and issues its `accessToken`; the secret is required (RFC 6749 §4.3.2).
  - `grant_type=authorization_code` (`authorizationCode`) needs the `code` from the authorize endpoint, a `code_verifier` of 43 to 128 characters of `A-Z a-z 0-9 - . _ ~` (RFC 7636 §4.1) whose S256 hash is the challenge the code was issued for (a verifier of another shape is refused before it is hashed), and the `redirect_uri` the code was issued for. A secret is checked only if sent (a public client proves itself with PKCE); an empty one is none, whether the form sends it or a Basic header does (`id:`, RFC 6749 §2.3.1). A code whose scope the stub does not declare was not issued here and is refused as unknown. It issues `accessTokenPrefix` + `1` and `refreshTokenPrefix` + `1`.
  - `grant_type=refresh_token` (`authorizationCode`) takes refresh token *n*, a decimal number below 2147483647, and issues access and refresh token *n + 1*. The server keeps no state, so a replayed old refresh token is not detected, nor a replayed authorization code (see the authorize endpoint below).
  - `scope` on the `client_credentials`, `password` and `refresh_token` grants is sent at most once (RFC 6749 §3.2; a repeat is refused, never read as absent) and names declared scopes only, one space between two (RFC 6749 §3.3 has no empty scope, so a leading, trailing or doubled space names the empty one and is refused); when it is absent every declared scope is granted. The `authorization_code` grant grants the scope the code carries and ignores a `scope` field (RFC 6749 §4.1.3 defines none). The granted scope is echoed in the token (left out on refresh and when empty).
  - The token is `{ "access_token", "token_type": "Bearer", "expires_in", ["refresh_token"], ["scope"] }` with `Cache-Control: no-store` and `Pragma: no-cache`.
- **Authorize endpoint** (`GET authorizePath` of each redirecting flow; the two may share one path) checks `client_id`, a `redirect_uri` that is an absolute URI in printable ASCII without a fragment (RFC 6749 §3.1.2 forbids one; the URI is echoed into `Location` as sent, a `{{origin}}` in it too, since the placeholder is a stub's, so a space, a non-ASCII character and a file path (`/callback`, `C:\callback`) are refused too, while a private-use scheme such as `com.example.app:/callback` passes), a non-empty `state` and declared scopes in at most one `scope` (RFC 6749 §3.1), spaced as at the token endpoint, then consents on the user's behalf. `response_type` picks the flow; one the path does not offer is refused naming the offered ones (`code or token`).
  - `response_type=code` (`authorizationCode`) also needs `code_challenge_method=S256` and a 43-character base64url `code_challenge` (an S256 hash, so a hex or padded one is refused here), and answers `302` to `redirect_uri` with `code` and `state` in the query. The code carries the challenge, the scope and the redirect URI, so no session is kept. For the same reason a code is not single-use: a replayed code is exchanged again, where RFC 6749 §4.1.2 has a real server refuse it, and a test cannot rely on the mock to catch a client that exchanges its code twice.
  - `response_type=token` (`implicit`) answers `302` to `redirect_uri` with `access_token`, `token_type`, `expires_in`, `scope` and `state` in the fragment (RFC 6749 §4.2.2), so the token never passes through the token endpoint.
- **Empty parameters**: a query or form parameter sent without a value counts as omitted (RFC 6749 §3.1, §3.2), so an empty `scope` grants every declared scope, an empty `state` or `code_verifier` is reported `absent`, and an empty `client_id` or `client_secret` beside a Basic header is no second credential. A Basic header's empty secret (`id:`) is none too, so the code and refresh grants take it and client credentials, which always need a secret, refuse it.
- **Rejections** are the same `418 application/problem+json` report the stubs use, never an RFC 6749 error body: the `title` is `OAuth2 token request rejected` or `OAuth2 authorization request rejected`, and each difference says `where` (`form`, `query`, `auth`, `header` or `method`), `name`, `expected` and `actual`; another method (`GET` on the token path) is refused as `method`, as on a stub. A generated test therefore fails with the reason spelled out instead of a bare `invalid_client`.
- `--token-ttl <seconds>` on the command line replaces `expiresIn` of every server for the run; like `expiresIn` it is a whole number of 1 or more, and any other value is a usage error.

## Validation

Loading a stubs directory reads every `*.json` file at its top level, in any letter case of the extension (`a.JSON` too, on every OS), in ordinal file-name order, and reports **all** problems at once, each as `file [stub] /json/pointer: message`, listed by file, then by the stub's position in it, then by pointer. A problem found across files (a name used twice, a path two `oauth2` stubs claim) is reported on the later stub, at the member that clashes (`/11/name`). A stub the schema refuses is checked no further, but the other stubs of its file still are, so one run lists every problem. A stubs directory the mock may not read is reported as such (`The stubs directory could not be read: …`). Subfolders are not read, and files whose name starts with `.` (such as the `._*.json` companions a macOS archive leaves) are skipped; a file hidden only by its Windows attribute is read. A key holding `/` or `~` is escaped in the pointer as RFC 6901 says (a part named `a/b` is `…/parts/a~1b`), so the pointer agrees with the schema's.

1. The file must be UTF-8 (a byte-order mark is allowed, and a UTF-16 file that starts with one is read too); a byte that is not UTF-8, as in a file saved in a legacy code page, is reported (`The file is not UTF-8.`) rather than read as U+FFFD, which no request would carry. An empty or whitespace-only file and one that holds JSON `null` are each reported as such. The file must parse as strict JSON. Comments and trailing commas are allowed, but no key may appear twice in one object and no string may hold a lone surrogate escape (`"\ud83d"` without its pair).
2. The file must satisfy `mock-stubs.schema.json` (shape: required fields, enums, exactly one body kind, no unknown fields, no empty request part `filename` or `oauth2` scope, …). An integer may carry a zero fraction (`200.0` and `2e2` are 200, as JSON Schema 2020-12 counts them), and `chunkDelayMs`, an event's `retry` and `expiresIn` are at most 2147483647, so a larger value is reported rather than replaced by the default.
3. Rules the loader checks beyond the schema:
   - stub `name`s are unique across all files;
   - an `error` stub has `response.status` ≥ 400 and no `query`, `queryMode` or `body`;
   - an `oauth2` stub's paths are literal, no authorize path is its token path, and no two `oauth2` stubs claim one path;
   - every `oauth2` scope is an RFC 6749 scope-token (printable ASCII without a space, `"` or `\`);
   - no endpoint stub's `path` is an `oauth2` stub's token or authorize path, because the server answers that path first, whatever the method (a template such as `/oauth2/{x}` still loads and serves the other values);
   - no `error` stub comes after an `error` stub of another operation with the same method and status whose path matches all of its path and more (`GET /v1/users/{user_id}` 404 in `01-getUser.json`, then `GET /v1/users/me` 404 in `02-getMe.json`; or `/repos/{repo}/releases/{release_id}` before `/repos/{repo}/releases/latest`), because the first would answer every request meant for the second; the more specific path comes first. Headers, cookies, credentials and example names are not compared, and paths that match each other or only overlap are not checked;
   - every `bytes` value is valid base64;
   - every `dateTime` is an instant in one of the accepted spellings (a bare date is not);
   - every one-property `$` object inside a `json` request body (multipart parts included) is one of `$any`, `$contains`, `$dateTime`, `$endsWith` and `$startsWith` with its operand (`true`, a non-empty string, an instant);
   - an `oauth2` stub has no `example`, and no `example` holds `,`, `;` or `"`, which no `Prefer` header could carry;
   - every `path` is a valid template with no empty segment (`//`) and no dot segment (`.`, `..`) (see Paths), and every fault of one path is reported, not only the first;
   - no `path`, token path or authorize path is under `/__admin`, in any letter case, because the mock's admin API answers there before any stub;
   - `chunkDelayMs` appears only with an `sse` or `ndjson` body;
   - an SSE event's `id` and `event` hold no CR or LF, because SSE has no escape for a line break and the client would read what follows as another field;
   - a response with a `status` of 204, 205 or 304 has no `body`, of any kind, because HTTP ends such a response at its headers (RFC 9110 §15.3.5, §15.3.6, §15.4.5), and on a stream the client would wait for an answer that never comes (the schema already refuses a status below 200, because a 1xx is an interim response and the client would wait for a final one);
   - a `multipart` response body has a boundary of 1 to 70 letters, digits or `'+_-.`, no part whose bytes contain `--<boundary>`, part names and filenames that are printable ASCII without a double quote, part `contentType`s that are printable ASCII, and no stated `Content-Type` other than a `multipart/` type naming that boundary;
   - a `json` or `text` response body, whole or as a part, has no stated `Content-Type` naming a charset other than UTF-8, because it is sent as UTF-8;
   - a header name is not given twice with different casing (query and cookie names are compared exactly);
   - a request header or cookie rule, and a credential sent in a header or cookie, has a name that is an RFC 9110 token and only printable ASCII in its values, because not every client can send anything else (see Values);
   - a response header name is an RFC 9110 token (one or more letters, digits or ``!#$%&'*+-.^_`|~``, so no space, `:` or parenthesis) and its value printable ASCII, because HTTP carries nothing else, and not empty: a header without a value is left out;
   - no response header is one a stub cannot state: the server writes `Date`, `Connection` and `Transfer-Encoding` itself, and the rest are request headers, `Accept`, `Expect`, `Host`, `If-Modified-Since`, `Proxy-Connection`, `Range`, `Referer` and `User-Agent`; and `Content-Length`, which the server sets from the body, is stated only on a `HEAD` or `304` response without a body (RFC 9110 §8.6), never on a `204` or `205`, as digits. Each would otherwise load and then mislead the client: a header that never arrives, or a length that promises bytes that never come.

`apimatic mock serve` exits with code 1 and lists every problem, by file, when any rule fails or the stubs directory cannot be read.

## Conventions the mock applies

- Query keys and values are decoded the way form encoders write them (Python's `urlencode`, `URLSearchParams`, Go's `url.Values`, .NET's `FormUrlEncodedContent`): `+` is a space and percent-escapes are decoded once, so `filter%5Bstatus%5D` is `filter[status]` and `%2B` is a plus. A `+` in a stub value therefore matches only `%2B` on the wire, which is also how a `dateTime` offset (`%2B01:00`) arrives. A key sent twice is one key with two values. The path is percent-decoded once, and a `+` in it is a plus.
- The first stub in file order that matches answers. `Prefer: code=<status>` selects an error stub (a success stub tolerates its own status and refuses any other); `Prefer: example=<name>` selects the stub of that `example` among the stubs of one request, and without it file order decides. Across operations the more specific path therefore comes first (`/v1/users/me` before `/v1/users/{user_id}`), or the template's error stubs answer for it (see [Validation](#validation)).
- A request that matches no stub gets **418** `application/problem+json` with an `X-Mock-Mismatch` header (a one-line summary) and the differences against the closest stub in the body. Each difference has `where`, `name`, `expected` and `actual`. Inside a JSON body the name is a JSON pointer (RFC 6901) into the stub's body, empty for the root; inside a multipart part it is the part and then the pointer (`metadata /owner/id`), and the part alone for its root. The closest stub is the one whose differences weigh least, added up: of single differences a wrong path weighs most, a wrong method next (so a body of many renamed keys can outweigh a wrong method), and a query key the stub does not take (left out of a closed set, or `null`) weighs twice a changed value, so a wrong `offset` is reported against the stub that takes `offset`; of stubs that weigh the same, the one with fewer differences comes first, then a success stub before an error stub, then file order. Reports echo what the request sent, credentials included, so a mock-mode test must never run with real credentials. Each `name`, `expected` and `actual` is quoted up to 10,000 characters and then cut, with the full length after it (`aaa… (29000008 characters)`), so a miss on a body of many MB answers with a report of a few KB. The request log (`/__admin/requests`, see [The request log](#the-request-log)) records every request that reaches the stubs, with its status; an admin request is not logged, nor one the mock answers itself before that (see [Requests the mock answers itself](#requests-the-mock-answers-itself)).
- Test credentials used across Spec S stubs: `Bearer test-bearer-token`, `X-API-Key: test-api-key`, `test-user`/`test-password`, client `test-client-id`/`test-client-secret`, client-credentials token `cc-access-token`, authorization-code tokens `ac-access-token-<n>`.

## The request log

The mock keeps no state, so a test that needs to know what was sent (a retry test counting its attempts) reads the request log. `GET /__admin/requests` returns the newest 10,000 requests that reached the stubs, oldest first, as a JSON array; `DELETE /__admin/requests` clears it and answers 204. Nothing else exists under `/__admin`: another method on the log answers 405 with `Allow: GET, DELETE`, and any other path there, in any letter case, answers 404.

```json
[
  {
    "request": {
      "method": "POST",
      "path": "/v1/accounts",
      "query": { "limit": ["2"] },
      "headers": { "content-type": ["application/json"], "prefer": ["code=500, test-run=7f3a"] },
      "body": "{\"name\":\"Travel card\"}"
    },
    "response": { "status": 500, "stub": "createAccount 500" }
  }
]
```

| Member | Holds |
|---|---|
| `request.method` | the method as sent |
| `request.path` | the path, percent-decoded once, without the query string |
| `request.query` | each key, decoded, with every value sent under it, in the order sent |
| `request.headers` | each header with every value sent under it; the names are in lower case, whatever the client's spelling |
| `request.body` | the body as text when its bytes are UTF-8; left out for a request without a body |
| `request.bodyBase64` | the body in base64, in place of `body`, when its bytes are not UTF-8 |
| `response.status` | the status the mock answered with |
| `response.stub` | the name of the stub that answered; absent for a miss and for an answer the OAuth2 server composed (a token, a redirect) |
| `response.mismatch` | the one-line summary of the 418 report; present only for a miss, which is what tells it from a 418 a stub declares |

The log is unauthenticated and echoes what each request sent, credentials included, so it is one more reason never to run a mock-mode test with real credentials. An entry keeps its request's body once, so a long-lived mock that receives large bodies is cleared between suites.

## Requests the mock answers itself

These never reach a stub and are not logged. Each body is plain text that says what happened.

| Status | When |
|---|---|
| 400 | the HTTP parser rejects the request: a method that is not in upper case or that it does not know, a malformed request line, a byte outside ASCII in the request target (431 for headers past its limit) |
| 400 | the `Host` header is missing, sent twice, or names no host and port the mock can read its URL from (`{{origin}}` is read from it) |
| 413 | the body is longer than 30,000,000 bytes, declared or not; the upload is received and dropped first, so the client reads the answer |
| 404, 405 | a path under `/__admin` other than the request log, or another method on the log |
| 500 | the mock failed to write an answer; the body names the failure |
