# APIMatic CLI

The command-line client that validates API specifications, generates SDKs, and builds documentation portals from a user's `src/` directory.

## Language

### Portal build

**Build directory**:
The user's `src/` directory — `apimatic.json`, `spec/`, `content/`, `static/` — taken as the input to every portal and SDK run, and never written to.
_Avoid_: Project, workspace, source folder

**Spec**:
One OpenAPI document in `spec/`, which becomes one section of reference pages in the portal.
_Avoid_: Specification file, API definition

**Endpoint**:
An operation addressed by its HTTP method and path template, exactly as the spec writes them.
_Avoid_: Operation ID, route

### Code samples

**Portal artifacts**:
Everything the APIMatic platform generates for one portal build — SDKs and code-sample catalogs — delivered together as one zip.
_Avoid_: Generation output, SDK bundle

**Code-sample catalog**:
One language's code samples for every endpoint of the build directory, keyed by endpoint then by example id.
_Avoid_: Snippet file, samples JSON

**Code sample**:
One language's snippets for one endpoint, each tied to an example id, shown as one tab on the operation page.
_Avoid_: Snippet, usage, request sample

**Example id**:
The key of an OpenAPI `examples:` entry — the request body's, else the first parameter's that names any — which pairs a snippet with the example the portal's selector shows.
_Avoid_: Example name, variant

**Unplaced sample**:
A code sample whose endpoint no spec in the build directory declares.
_Avoid_: Orphan sample, missing operation
