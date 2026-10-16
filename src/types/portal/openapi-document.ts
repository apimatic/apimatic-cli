import { err, ok, Result } from 'neverthrow';
import { parse as parseYaml, YAMLParseError } from 'yaml';
import { DirectoryPath } from '../file/directoryPath.js';
import { FilePath } from '../file/filePath.js';
import { errorMessage } from '../../utils/error-utils.js';
import { isJsonObject, JsonObject } from '../../utils/json-utils.js';
import { stripByteOrderMark } from '../../utils/string-utils.js';
import { PLACEHOLDER_SITE, SuggestedSite } from './config/site-config.js';
import { Endpoint } from './endpoint.js';

/**
 * Whether a parsed document is one a portal can be built from. `format` names what it is
 * instead when that can be told from the document, and is null when nothing identifies it --
 * a Postman collection, or any other JSON that carries no version key at all.
 */
export type SpecFormat = { supported: true } | { supported: false; format: string | null };

/** Why the portal's bundler would fail on a text, or read nothing from it; `invalid` carries what the parser said. */
export type ParseFailure =
  | { kind: 'empty' }
  | { kind: 'noValue' }
  | { kind: 'noKey' }
  | { kind: 'invalid'; message: string };

/** A path item kept in another file, where `pointer` locates it; empty for the whole file. */
export interface PathItemReference {
  path: string;
  file: FilePath;
  pointer: string;
}

const DESCRIPTION_LIMIT = 300;

const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);

const URL_SCHEME = /^[a-z][a-z\d+.-]+:/i;

// How @scalar/json-magic reads each file it bundles: as JSON, else as YAML with these options when it holds a key.
const YAML_OPTIONS = { merge: true, maxAliasCount: 10000 };
const YAML_KEY = /^[^:]+:/;
// A text that opens as JSON does within this many characters is taken for JSON, and never read as YAML.
const JSON_OPENING = /^\s*[[{]/;
const JSON_OPENING_WITHIN = 50;

// The keys @scalar/json-magic writes what it has embedded under, which it does not read again.
const BUNDLER_KEYS = new Set(['x-ext', 'x-ext-urls']);

/** A specification's document, or a file its `$ref`s name, read the one way the wizard and the build agree on. */
export class OpenApiDocument {
  private readonly document: JsonObject;

  private constructor(private readonly value: unknown) {
    this.document = isJsonObject(value) ? value : {};
  }

  /** Fails where the portal's bundler fails or reads nothing; a value other than an object is no specification. */
  public static parse(contents: string): Result<OpenApiDocument, ParseFailure> {
    const text = stripByteOrderMark(contents);
    if (text.trim() === '') {
      return err({ kind: 'empty' });
    }
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch (error) {
      if (JSON_OPENING.test(text.slice(0, JSON_OPENING_WITHIN))) {
        return err(invalid(error));
      }
      if (!YAML_KEY.test(text)) {
        return err({ kind: 'noKey' });
      }
      try {
        value = parseYaml(text, YAML_OPTIONS);
      } catch (yamlError) {
        return err(invalid(yamlError));
      }
    }
    return value === null ? err({ kind: 'noValue' }) : ok(new OpenApiDocument(value));
  }

  /** The `$id`s this document declares, which a `$ref` in any file bundled into it names a schema by. */
  public schemaIds(): Set<string> {
    const ids = new Set<string>();
    walk(this.value, (node) => {
      if (typeof node.$id === 'string') {
        ids.add(node.$id);
      }
      return true;
    });
    return ids;
  }

  /** The local files this document's `$ref`s name, as the portal's bundler finds them, given the root's `$id`s. */
  public referencedFiles(directory: DirectoryPath, rootIds: ReadonlySet<string>): FilePath[] {
    const names = new Set<string>();
    walk(this.value, (node) => {
      // The bundler resolves what is below an `$id` against the `$id`, not the file.
      if (typeof node.$id === 'string') {
        return false;
      }
      const target = reference(node);
      if (target === undefined) {
        return true;
      }
      names.add(target.name);
      return false;
    });
    return [...names].filter((name) => !rootIds.has(name)).flatMap((name) => localFile(directory, name) ?? []);
  }

  /** Every operation declared inline or behind a `$ref` into this document; see `pathItemReferences` for the rest. */
  public endpoints(): Endpoint[] {
    return Object.entries(this.paths()).flatMap(([path, pathItem]) => this.endpointsOf(path, pathItem));
  }

  /** The path items kept in other local files, resolved against the `directory` this document sits in. */
  public pathItemReferences(directory: DirectoryPath): PathItemReference[] {
    return Object.entries(this.paths()).flatMap(([path, pathItem]) => {
      const target = reference(pathItem);
      const file = target && localFile(directory, target.name);
      return target && file ? [{ path, file, pointer: target.pointer }] : [];
    });
  }

  /** The operations of the path item `pointer` locates in this document, as they are mounted at `path`. */
  public endpointsAt(path: string, pointer: string): Endpoint[] {
    return this.endpointsOf(path, valueAt(this.document, pointer));
  }

  public format(): SpecFormat {
    const openapi = this.document.openapi;
    if (typeof openapi === 'string') {
      return openapi.startsWith('3.') ? { supported: true } : { supported: false, format: `OpenAPI ${openapi}` };
    }
    if (this.document.swagger !== undefined) {
      return { supported: false, format: `Swagger ${versionLabel(this.document.swagger)}` };
    }
    if (this.document.asyncapi !== undefined) {
      return { supported: false, format: `AsyncAPI ${versionLabel(this.document.asyncapi)}` };
    }
    return { supported: false, format: null };
  }

  /** Whether it carries a version key, which is what the platform takes a file of a merged folder for its definition by. */
  public namesApiFormat(): boolean {
    const format = this.format();
    return format.supported || format.format !== null;
  }

  /** Whether it declares paths, webhooks or channels, as an API does and a file of its shared parts does not. */
  public declaresOperations(): boolean {
    return ['paths', 'webhooks', 'channels'].some((key) => {
      const operations = this.document[key];
      return isJsonObject(operations) && Object.keys(operations).length > 0;
    });
  }

  /**
   * Both fields are written into generated files, so each is collapsed to one line. The
   * description stops at its first blank line: past it a specification's description is
   * usually a guide to the API, not a summary of it.
   */
  public suggestedSite(): SuggestedSite {
    const info = this.document.info;
    const fields = isJsonObject(info) ? info : {};
    const name = oneLine(fields.title) ?? PLACEHOLDER_SITE.name;
    const description = oneLine(firstParagraph(fields.description));
    return { name, description: description === null ? null : cap(description, DESCRIPTION_LIMIT) };
  }

  private paths(): JsonObject {
    return isJsonObject(this.document.paths) ? this.document.paths : {};
  }

  private endpointsOf(path: string, pathItem: unknown): Endpoint[] {
    return Object.entries(this.followLocal(pathItem, new Set()))
      .filter(([key, value]) => HTTP_METHODS.has(key.toLowerCase()) && isJsonObject(value))
      .map(([method]) => new Endpoint(method, path));
  }

  // Siblings of a `$ref` override what it points to, as the portal bundles a path item.
  private followLocal(pathItem: unknown, seen: Set<string>): JsonObject {
    if (!isJsonObject(pathItem)) {
      return {};
    }
    const { $ref, ...siblings } = pathItem;
    if (typeof $ref !== 'string' || !$ref.startsWith('#') || seen.has($ref)) {
      return siblings;
    }
    seen.add($ref);
    return { ...this.followLocal(valueAt(this.document, $ref.slice(1)), seen), ...siblings };
  }
}

/** A node's `$ref`, split as the bundler splits it: the file it names, empty for its own, and the pointer into it. */
function reference(node: unknown): { name: string; pointer: string } | undefined {
  if (!isJsonObject(node) || typeof node.$ref !== 'string') {
    return undefined;
  }
  const [name, pointer = ''] = node.$ref.split('#');
  return { name, pointer };
}

/** The file a `$ref` names, resolved as the bundler resolves it; undefined for none, or a URL. */
function localFile(directory: DirectoryPath, name: string): FilePath | undefined {
  return name === '' || URL_SCHEME.test(name) ? undefined : FilePath.resolve(directory, name.replaceAll('\\', '/'));
}

// A YAML error goes on to quote the lines around it, and V8 quotes the JSON it stopped at across line breaks.
function invalid(error: unknown): ParseFailure {
  const message = errorMessage(error);
  const firstLine = error instanceof YAMLParseError ? message.split('\n')[0].replace(/:$/, '') : message;
  return { kind: 'invalid', message: firstLine.replace(/\s+/g, ' ').trim() };
}

/** Each object and list once; into an object only when `visit` says so, and never into the keys the bundler writes. */
function walk(node: unknown, visit: (node: JsonObject) => boolean, seen = new WeakSet<object>()): void {
  if (typeof node !== 'object' || node === null || seen.has(node)) {
    return;
  }
  seen.add(node);
  if (isJsonObject(node) && !visit(node)) {
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (!BUNDLER_KEYS.has(key)) {
      walk(value, visit, seen);
    }
  }
}

function valueAt(document: JsonObject, pointer: string): unknown {
  try {
    const segments = pointer
      .split('/')
      .slice(1)
      .map((segment) => decodeURIComponent(segment));
    return segments.reduce<unknown>(
      (node, segment) => (isJsonObject(node) ? node[segment.replace(/~1/g, '/').replace(/~0/g, '~')] : undefined),
      document
    );
  } catch {
    return undefined;
  }
}

function firstParagraph(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().split(/\n\s*\n/)[0] : value;
}

// Version keys are strings in well-formed documents; anything else is named rather than
// stringified into `[object Object]`.
function versionLabel(version: unknown): string {
  return typeof version === 'string' || typeof version === 'number' ? `${version}` : '(unknown version)';
}

function oneLine(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const collapsed = value.replace(/\s+/g, ' ').trim();
  return collapsed.length > 0 ? collapsed : null;
}

// Cuts on a word boundary when one is near enough the limit, so the site description does
// not end mid-word.
function cap(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }
  const cut = value.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > limit - 40 ? cut.slice(0, lastSpace) : cut).trimEnd();
}
