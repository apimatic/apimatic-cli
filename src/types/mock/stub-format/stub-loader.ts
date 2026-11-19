import { err, ok, Result } from 'neverthrow';
import { readHandWrittenJson } from '../json/json-reader.js';
import { JsonValue } from '../json/json-value.js';
import { asciiLowerCase, compareOrdinal } from '../text/ascii.js';
import { isAllDigits } from '../text/characters.js';
import { decodeFileText } from '../text/utf8.js';
import { pathsOf } from './oauth2-settings.js';
import { at, Site } from './site.js';
import { EndpointStub, ErrorStub, OAuth2Stub, Stub, StubSet, stubSetOf } from './stub.js';
import { parseStub } from './stub-parser.js';
import { StubProblem } from './stub-problem.js';
import { StubSchema } from './stub-schema.js';

/** One file of a stubs directory as it was read: its bytes, or why they could not be read. */
export interface StubFile {
  /** Relative to the stubs directory, as every problem and stub names it. */
  readonly name: string;
  readonly content: Result<Uint8Array, string>;
}

/** A loaded stub with its place in its file, so a problem found across files still points into the file. */
interface Located<Kind extends Stub = Stub> {
  readonly stub: Kind;
  readonly site: Site;
}

/** `*.json` in any letter case of the extension, on every OS; a dot file, such as the `._` companion a macOS archive leaves, is none. */
export function isStubFileName(name: string): boolean {
  return !name.startsWith('.') && asciiLowerCase(name).endsWith('.json');
}

/**
 * Reads the files in ordinal name order. Each must be UTF-8, parse strictly, satisfy the schema
 * and pass the rules beyond it; across files, names are unique, no two oauth2 stubs claim a path,
 * no endpoint stub sits on an oauth2 path and no error template comes before another operation's
 * more specific path. Every problem is collected, listed by file, then by the stub's position in
 * it (`/2` before `/10`), then by pointer.
 */
export function loadStubs(files: readonly StubFile[], schema: StubSchema): Result<StubSet, StubProblem[]> {
  const problems: StubProblem[] = [];
  const inOrder = [...files].sort((first, second) => compareOrdinal(first.name, second.name));
  const located = inOrder.flatMap((file) => loadFile(file, schema, problems));
  problems.push(...acrossFiles(located));
  if (problems.length === 0) {
    return ok(stubSetOf(located.map(({ stub }) => stub)));
  }
  return err(
    problems.sort(
      (first, second) =>
        compareOrdinal(first.file, second.file) ||
        stubIndex(first.path) - stubIndex(second.path) ||
        compareOrdinal(first.path, second.path)
    )
  );
}

/**
 * A stub the schema refuses is reported and parsed no further, since the parser relies on the
 * shape; the file's other stubs are parsed and checked across files, so one run lists every problem.
 */
function loadFile(file: StubFile, schema: StubSchema, problems: StubProblem[]): Located[] {
  const root = readFile(file);
  if (root.isErr()) {
    problems.push({ file: file.name, path: '', message: root.error });
    return [];
  }
  const shape = schema.problems(root.value, file.name);
  problems.push(...shape);
  const misshapen = new Set(shape.map((problem) => stubIndex(problem.path)));
  const stubs = root.value.kind === 'array' ? root.value.items : [];
  return stubs.flatMap((stub, index) => {
    const site = at({ stub: '', pointer: '' }, index);
    const report = (where: Site, message: string) =>
      problems.push({ file: file.name, stub: where.stub, path: where.pointer, message });
    return misshapen.has(index) ? [] : [{ stub: parseStub(stub, site, file.name, report), site }];
  });
}

/** An empty file and one holding JSON null are told apart from a broken one, because neither message of the reader says what is missing. */
function readFile(file: StubFile): Result<JsonValue, string> {
  if (file.content.isErr()) {
    return err(`The file could not be read: ${file.content.error}`);
  }
  const text = decodeFileText(file.content.value);
  if (text === undefined) {
    return err('The file is not UTF-8.');
  }
  if (text.trim().length === 0) {
    return err('The file is empty; a stub file holds an array of stubs.');
  }
  return readHandWrittenJson(text)
    .mapErr((fault) => `Not valid JSON: ${fault}`)
    .andThen((root) =>
      root.kind === 'null' ? err('The file holds JSON null; a stub file holds an array of stubs.') : ok(root)
    );
}

/** Each problem is reported on the later stub, at the member that clashes, so it can be fixed without searching. */
function acrossFiles(stubs: readonly Located[]): StubProblem[] {
  const servers = stubs.filter((located): located is Located<OAuth2Stub> => located.stub.kind === 'oauth2');
  const errors = stubs.filter((located): located is Located<ErrorStub> => located.stub.kind === 'error');
  const endpoints = stubs.filter((located): located is Located<EndpointStub> => located.stub.kind !== 'oauth2');
  const claims = servers.flatMap((server) => pathsOf(server.stub.settings).map((path) => ({ server, path })));

  const sameName = stubs.flatMap((later, index) =>
    stubs
      .slice(0, index)
      .filter((earlier) => earlier.stub.name === later.stub.name)
      .slice(0, 1)
      .map((first) =>
        problemAt(
          later,
          at(later.site, 'name'),
          `Another stub named '${later.stub.name}' exists in ${first.stub.file}; names must be unique across all files.`
        )
      )
  );
  const claimedTwice = claims.flatMap((later, index) =>
    claims
      .slice(0, index)
      .filter((earlier) => earlier.path === later.path)
      .slice(0, 1)
      .map((first) =>
        problemAt(
          later.server,
          later.path === later.server.stub.settings.tokenPath
            ? at(later.server.site, 'oauth2', 'tokenPath')
            : at(later.server.site, 'oauth2', 'flows'),
          `Another oauth2 stub, '${first.server.stub.name}' in ${first.server.stub.file}, already serves ${later.path}; ` +
            'the first server to claim a path answers for it, so this one never would.'
        )
      )
  );
  const servedByOAuth2 = endpoints.flatMap((endpoint) =>
    claims
      .filter((claim) => claim.path === endpoint.stub.route.path.toString())
      .slice(0, 1)
      .map(({ server }) =>
        problemAt(
          endpoint,
          at(endpoint.site, 'request', 'path'),
          `The oauth2 stub '${server.stub.name}' in ${server.stub.file} answers every request to ` +
            `${endpoint.stub.route.path}, so this stub never would.`
        )
      )
  );
  return [...sameName, ...claimedTwice, ...servedByOAuth2, ...shadowed(errors)];
}

/**
 * The first matching stub answers, so an error template of one operation that comes first answers
 * the error tests of another operation whose path it also matches: `/v1/users/{user_id}` over
 * `/v1/users/me`. File order has to put the more specific path first, and it always can. Two paths
 * that match each other cannot be ordered apart, and two that merely overlap meet only on a
 * contrived identifier, so neither is refused.
 */
function shadowed(errors: readonly Located<ErrorStub>[]): StubProblem[] {
  return errors.flatMap((later, index) =>
    errors
      .slice(0, index)
      .filter((earlier) => shadows(earlier.stub, later.stub))
      .slice(0, 1)
      .map(({ stub: earlier }) =>
        problemAt(
          later,
          at(later.site, 'request', 'path'),
          `The error stub '${earlier.name}' of ${earlier.operation} in ${earlier.file} comes first and its path ` +
            `${earlier.route.path} also matches ${later.stub.route.method} ${later.stub.route.path} with ` +
            `Prefer: code=${later.stub.response.status}, so it would answer for this one; ` +
            `${later.stub.operation} must come before ${earlier.operation}.`
        )
      )
  );
}

/** A template's own text stands in for every path it matches, since only a parameter accepts a `{name}` segment. */
function shadows(earlier: ErrorStub, later: ErrorStub): boolean {
  return (
    earlier.operation !== later.operation &&
    earlier.route.method === later.route.method &&
    earlier.response.status === later.response.status &&
    earlier.route.path.matches(later.route.path.toString()) &&
    !later.route.path.matches(earlier.route.path.toString())
  );
}

function problemAt(located: Located, site: Site, message: string): StubProblem {
  return { file: located.stub.file, stub: located.stub.name, path: site.pointer, message };
}

/** The position of the stub a pointer points into; -1 for a problem of the whole file. */
function stubIndex(pointer: string): number {
  const index = pointer.split('/')[1] ?? '';
  return isAllDigits(index) ? Number(index) : -1;
}
