import { basename, dirname } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { DirectoryPath } from '../file/directoryPath.js';
import { FileName } from '../file/fileName.js';
import { FilePath } from '../file/filePath.js';
import { stripByteOrderMark } from '../../utils/string-utils.js';
import { CodeSample, CodeSamples } from './code-samples.js';
import { Endpoint } from './endpoint.js';
import { PortalConfig } from './portal-config.js';

/**
 * Whether a parsed document is one a portal can be built from. `format` names what it is
 * instead when that can be told from the document, and is null when nothing identifies it --
 * a Postman collection, or any other JSON that carries no version key at all.
 */
export type SpecFormat = { supported: true } | { supported: false; format: string | null };

const DESCRIPTION_LIMIT = 300;

const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);

const URL_SCHEME = /^[a-z][a-z\d+.-]+:/i;

// Not `x-codeSamples`: fumadocs makes each of those a fixed tab that the example selector cannot switch.
const CODE_SAMPLES_EXTENSION = 'x-apimatic-codeSamples';

// The options @scalar/json-magic bundles with, so a spec reads here as it does in the portal.
const YAML_OPTIONS = { merge: true, maxAliasCount: 10000 };

type JsonObject = Record<string, unknown>;

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
      return new OpenApiDocument(
        typeof document === 'object' && document !== null && !Array.isArray(document) ? (document as JsonObject) : {}
      );
    } catch {
      return undefined;
    }
  }

  public serialize(fileName: FileName): string {
    return fileName.hasExtension('.json') ? JSON.stringify(this.document, null, 2) : stringifyYaml(this.document);
  }

  public endpoints(): Endpoint[] {
    return Object.entries(this.paths()).flatMap(([path, pathItem]) =>
      isInlinePathItem(pathItem)
        ? Object.entries(pathItem)
            .filter(([key, value]) => isOperation(key, value))
            .map(([method]) => new Endpoint(method, path))
        : []
    );
  }

  public withCodeSamples(codeSamples: CodeSamples): OpenApiDocument {
    if (!isObject(this.document.paths)) {
      return this;
    }
    const paths = Object.fromEntries(
      Object.entries(this.paths()).map(([path, pathItem]) => [
        path,
        isInlinePathItem(pathItem) ? pathItemWithSamples(path, pathItem, codeSamples) : pathItem
      ])
    );
    return new OpenApiDocument({ ...this.document, paths });
  }

  /** The local files this document's `$ref`s name, resolved against the `directory` it sits in. */
  public referencedFiles(directory: DirectoryPath): FilePath[] {
    return [...references(this.document)]
      .flatMap((reference) => referencedFile(reference) ?? [])
      .map((file) => new FilePath(directory.resolve(dirname(file)), new FileName(basename(file))));
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
   * A `portal` block to start from, so the wizard has one question fewer to ask. Both fields
   * are written into generated files, so each is collapsed to one line first -- taking only
   * the first line left the description cap unreachable for wrapped prose.
   */
  public suggestedConfig(): PortalConfig {
    const info = this.document.info;
    const fields = typeof info === 'object' && info !== null ? (info as Record<string, unknown>) : {};
    const title = oneLine(fields.title) ?? PortalConfig.placeholder.siteTitle();
    const description = oneLine(fields.description);
    return PortalConfig.create(title, description === null ? null : cap(description, DESCRIPTION_LIMIT));
  }

  private paths(): JsonObject {
    return isObject(this.document.paths) ? this.document.paths : {};
  }
}

function isInlinePathItem(value: unknown): value is JsonObject {
  return isObject(value) && !('$ref' in value);
}

function isOperation(key: string, value: unknown): value is JsonObject {
  return HTTP_METHODS.has(key.toLowerCase()) && isObject(value);
}

function pathItemWithSamples(path: string, pathItem: JsonObject, codeSamples: CodeSamples): JsonObject {
  return Object.fromEntries(
    Object.entries(pathItem).map(([key, value]) => [
      key,
      isOperation(key, value) ? withSamples(value, codeSamples.samplesFor(new Endpoint(key, path))) : value
    ])
  );
}

function withSamples(operation: JsonObject, samples: CodeSample[]): JsonObject {
  const rest = Object.fromEntries(Object.entries(operation).filter(([key]) => key !== CODE_SAMPLES_EXTENSION));
  return samples.length === 0 ? rest : { ...rest, [CODE_SAMPLES_EXTENSION]: samples };
}

function* references(node: unknown): Generator<string> {
  if (Array.isArray(node)) {
    for (const item of node) {
      yield* references(item);
    }
  } else if (isObject(node)) {
    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref' && typeof value === 'string') {
        yield value;
      } else {
        yield* references(value);
      }
    }
  }
}

function referencedFile(reference: string): string | undefined {
  const [file] = reference.split('#');
  return file === '' || URL_SCHEME.test(file) ? undefined : file;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
