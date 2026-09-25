import { basename, dirname } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { DirectoryPath } from '../file/directoryPath.js';
import { FileName } from '../file/fileName.js';
import { FilePath } from '../file/filePath.js';
import { isJsonObject, JsonObject } from '../../utils/json-utils.js';
import { stripByteOrderMark } from '../../utils/string-utils.js';
import { PLACEHOLDER_SITE, SuggestedSite } from './config/site-config.js';
import { Endpoint } from './endpoint.js';
import { SpecDescription } from './spec-description.js';

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

/** A specification as written to disk, read the one way the wizard and the build agree on. */
export class OpenApiDocument {
  private constructor(private readonly document: JsonObject) {}

  /**
   * Undefined when neither parser accepts the text. A document that parses to something other
   * than an object is kept, and reports itself as no specification at all.
   */
  public static parse(fileName: FileName, contents: string): OpenApiDocument | undefined {
    try {
      // JSON is valid YAML, but the YAML parser is far slower and specs run to megabytes,
      // so each extension gets the parser built for it.
      const text = stripByteOrderMark(contents);
      const document: unknown = fileName.hasExtension('.json') ? JSON.parse(text) : parseYaml(text, YAML_OPTIONS);
      return new OpenApiDocument(isJsonObject(document) ? document : {});
    } catch {
      return undefined;
    }
  }

  /** Every operation declared inline or behind a `$ref` into this document; see `pathItemReferences` for the rest. */
  public endpoints(): Endpoint[] {
    return Object.entries(this.paths()).flatMap(([path, pathItem]) => this.endpointsOf(path, pathItem));
  }

  /** The path items kept in other local files, resolved against the `directory` this document sits in. */
  public pathItemReferences(directory: DirectoryPath): PathItemReference[] {
    return Object.entries(this.paths()).flatMap(([path, pathItem]) => {
      const reference = isJsonObject(pathItem) && typeof pathItem.$ref === 'string' ? pathItem.$ref : '';
      const [file, pointer = ''] = reference.split('#');
      if (file === '' || URL_SCHEME.test(file)) {
        return [];
      }
      return [{ path, file: new FilePath(directory.resolve(dirname(file)), new FileName(basename(file))), pointer }];
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

  /** The whole of `info.description`, which the SDKs page shows; null when it has none. */
  public description(): SpecDescription | null {
    const info = this.document.info;
    return SpecDescription.create(isJsonObject(info) ? info.description : undefined);
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
