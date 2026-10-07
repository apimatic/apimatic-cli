import { err, ok, Result } from 'neverthrow';
import { parse as parseYaml, YAMLParseError } from 'yaml';
import { DirectoryPath } from '../file/directoryPath.js';
import { FileName } from '../file/fileName.js';
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

/** A path item kept in another file, where `pointer` locates it; empty for the whole file. */
export interface PathItemReference {
  path: string;
  file: FilePath;
  pointer: string;
}

const DESCRIPTION_LIMIT = 300;

const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);

const URL_SCHEME = /^[a-z][a-z\d+.-]+:/i;

// The options @scalar/json-magic bundles with, so a spec reads here as it does in the portal.
const YAML_OPTIONS = { merge: true, maxAliasCount: 10000 };

// The keys @scalar/json-magic writes what it has embedded under, which it does not read again.
const BUNDLER_KEYS = new Set(['x-ext', 'x-ext-urls']);

/** A specification as written to disk, read the one way the wizard and the build agree on. */
export class OpenApiDocument {
  private constructor(private readonly document: JsonObject) {}

  /**
   * Fails with what the parser said when it does not accept the text. A document that parses to
   * something other than an object is kept, and reports itself as no specification at all.
   */
  public static parse(fileName: FileName, contents: string): Result<OpenApiDocument, string> {
    try {
      // JSON is valid YAML, but the YAML parser is far slower and specs run to megabytes,
      // so each extension gets the parser built for it.
      const text = stripByteOrderMark(contents);
      const document: unknown = fileName.hasExtension('.json') ? JSON.parse(text) : parseYaml(text, YAML_OPTIONS);
      return ok(new OpenApiDocument(isJsonObject(document) ? document : {}));
    } catch (error) {
      // A YAML error goes on to quote the lines around it, and V8 quotes the JSON it stopped at across line breaks.
      const message = errorMessage(error);
      const reason = error instanceof YAMLParseError ? message.split('\n')[0].replace(/:$/, '') : message;
      return err(reason.replace(/\s+/g, ' ').trim());
    }
  }

  /** The local files this document's `$ref`s name, as the portal's bundler finds them, except by `$id`. */
  public referencedFiles(directory: DirectoryPath): FilePath[] {
    const ids = idsIn(this.document, new WeakSet(), new Set());
    const references = referencesIn(this.document, new WeakSet(), new Set());
    const names = new Set([...references].map((reference) => reference.split('#')[0]));
    return [...names].filter((name) => !ids.has(name)).flatMap((name) => localFile(directory, name) ?? []);
  }

  /** Every operation declared inline or behind a `$ref` into this document; see `pathItemReferences` for the rest. */
  public endpoints(): Endpoint[] {
    return Object.entries(this.paths()).flatMap(([path, pathItem]) => this.endpointsOf(path, pathItem));
  }

  /** The path items kept in other local files, resolved against the `directory` this document sits in. */
  public pathItemReferences(directory: DirectoryPath): PathItemReference[] {
    return Object.entries(this.paths()).flatMap(([path, pathItem]) => {
      const reference = isJsonObject(pathItem) && typeof pathItem.$ref === 'string' ? pathItem.$ref : '';
      const [name, pointer = ''] = reference.split('#');
      const file = localFile(directory, name);
      return file === undefined ? [] : [{ path, file, pointer }];
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

/** The file a `$ref` names before its `#`, resolved as the bundler resolves it; undefined for none, or a URL. */
function localFile(directory: DirectoryPath, name: string): FilePath | undefined {
  return name === '' || URL_SCHEME.test(name) ? undefined : FilePath.resolve(directory, name.replaceAll('\\', '/'));
}

// Both walks add to `found` rather than return arrays to merge, as a specification runs to megabytes.
function referencesIn(node: unknown, seen: WeakSet<object>, found: Set<string>): Set<string> {
  if (typeof node !== 'object' || node === null || seen.has(node)) {
    return found;
  }
  seen.add(node);
  if (isJsonObject(node) && typeof node.$id === 'string') {
    return found;
  }
  if (isJsonObject(node) && typeof node.$ref === 'string') {
    return found.add(node.$ref);
  }
  for (const [key, value] of Object.entries(node)) {
    if (!BUNDLER_KEYS.has(key)) {
      referencesIn(value, seen, found);
    }
  }
  return found;
}

function idsIn(node: unknown, seen: WeakSet<object>, found: Set<string>): Set<string> {
  if (typeof node !== 'object' || node === null || seen.has(node)) {
    return found;
  }
  seen.add(node);
  if (isJsonObject(node) && typeof node.$id === 'string') {
    found.add(node.$id);
  }
  for (const value of Object.values(node)) {
    idsIn(value, seen, found);
  }
  return found;
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
