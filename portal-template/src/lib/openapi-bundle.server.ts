import type { Document } from 'fumadocs-openapi';
import { bundle } from '@scalar/json-magic/bundle';
import { fetchUrls, parseJson, parseYaml, readFiles } from '@scalar/json-magic/bundle/plugins/node';
import { escapeJsonPointer } from '@scalar/json-magic/helpers/escape-json-pointer';
import { getSegmentsFromPath } from '@scalar/json-magic/helpers/get-segments-from-path';
import { getValueByPath } from '@scalar/json-magic/helpers/get-value-by-path';

type JsonObject = Record<string, unknown>;

interface Reference {
  /** As written, so a rewrite keeps whatever escaping the rest of the pointer had. */
  raw: string[];
  segments: string[];
}

interface Walk {
  document: JsonObject;
  path: string[];
  references: Map<JsonObject, Reference>;
  targets: Map<string, string[]>;
  inStructure: WeakSet<object>;
  inData: WeakSet<object>;
}

// Where the bundler embeds each referenced file, keyed by a hash of its location, and where it
// records which location each hash stands for.
const EXTERNAL = 'x-ext';
const EXTERNAL_LOCATIONS = 'x-ext-urls';

// Where OpenAPI and JSON Schema put a schema: under one of these keys, as a value in one of
// these maps, or as an entry in one of these lists.
const SCHEMA_KEYS = new Set([
  'schema',
  'itemSchema',
  'items',
  'not',
  'additionalProperties',
  'unevaluatedProperties',
  'unevaluatedItems',
  'contains',
  'propertyNames',
  'if',
  'then',
  'else',
  'contentSchema'
]);
const SCHEMA_MAPS = new Set(['properties', 'patternProperties', 'dependentSchemas', '$defs', 'definitions']);
const SCHEMA_LISTS = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems']);

// Hold values, or examples of them, and never a schema.
const DATA_KEYS = new Set(['example', 'examples', 'default', 'enum', 'const']);

// The segments by which the OpenAPI 3.0 upgrader decides a node is a schema: `isSchemaPath`
// in @scalar/openapi-upgrader 0.2.15, which fumadocs-openapi bundles rather than depends on,
// so it cannot be imported. A schema anywhere this misses is upgraded as some other object.
const UPGRADER_SCHEMA_SEGMENTS = new Set([
  'properties',
  'items',
  'allOf',
  'anyOf',
  'oneOf',
  'not',
  'additionalProperties',
  'schema'
]);

/**
 * The document with every file and URL it references embedded in it, the way fumadocs-openapi
 * bundles a document itself, then reshaped where fumadocs misreads the result.
 *
 * Handing fumadocs one document is also what upgrades a split OpenAPI 3.0 specification: the
 * upgrader recognises a document by its own `openapi` key, so given a path it upgrades the
 * root file alone and leaves `example`, `nullable` and the rest in every referenced file.
 */
export async function bundleSpecification(file: string): Promise<Document> {
  const unresolved: string[] = [];
  let document: JsonObject;
  try {
    document = (await bundle(file, {
      plugins: [readFiles(), fetchUrls(), parseJson(), parseYaml()],
      treeShake: true,
      urlMap: true,
      hooks: {
        onResolveError(node) {
          unresolved.push(String(node.$ref));
        }
      }
    })) as JsonObject;
  } catch (error) {
    throw new Error(`[OpenAPI] Failed to resolve input: ${file}`, { cause: error });
  }
  if (unresolved.length > 0) {
    throw new Error(`[OpenAPI] Failed to resolve $ref in ${file}: ${unresolved.join(', ')}`);
  }

  // Read for the names of the files, then dropped: every page carries the document's
  // top-level fields, and these are paths on the machine running the build.
  const locations = (document[EXTERNAL_LOCATIONS] ?? {}) as Record<string, string>;
  delete document[EXTERNAL_LOCATIONS];

  inlinePathItems(document);
  hoistSchemas(document, locations);
  return document as unknown as Document;
}

/**
 * Fumadocs lists a document's operations by reading the methods off each path item without
 * following a `$ref`, so every operation behind one gets no page and no error says so.
 */
function inlinePathItems(document: JsonObject): void {
  const paths = document.paths;
  if (!isJsonObject(paths)) return;
  for (const [route, item] of Object.entries(paths)) paths[route] = dereference(document, item, new Set());
}

// Siblings of a `$ref` override what it points to, as OpenAPI 3.1 has it.
function dereference(document: JsonObject, item: unknown, seen: Set<string>): unknown {
  if (!isJsonObject(item) || typeof item.$ref !== 'string' || seen.has(item.$ref)) return item;
  seen.add(item.$ref);
  const { $ref, ...siblings } = item;
  const segments = pointerSegments($ref);
  const target = segments && dereference(document, resolve(document, segments), seen);
  return isJsonObject(target) ? { ...target, ...siblings } : item;
}

/**
 * Gives each schema that comes from another file a place in `components/schemas`, named after
 * the file, and points every reference to it there.
 *
 * Left where the bundler puts it, a schema is named after the last segment of the references
 * to it, which for a whole file is the bundler's hash. And the upgrader tells a schema from
 * anything else by where it sits, so a 3.0 `example` at the top of a schema file becomes an
 * Example Object map where a schema's `examples` is a list of values.
 */
function hoistSchemas(document: JsonObject, locations: Record<string, string>): void {
  const externals = document[EXTERNAL];
  if (!isJsonObject(externals)) return;

  const { references, targets } = collectReferences(document);
  for (const [target, segments] of passedOnSchemas(document, targets)) targets.set(target, segments);
  if (targets.size === 0) return;

  rewriteReferences(references, placeSchemas(document, targets, locations));
  removeMovedFiles(document, externals, targets);
}

// Every reference is collected, since each one into a moved file has to follow it, but only
// those outside data say whether what they point to is a schema.
function collectReferences(document: JsonObject): Pick<Walk, 'references' | 'targets'> {
  const walk: Walk = {
    document,
    path: [],
    references: new Map(),
    targets: new Map(),
    inStructure: new WeakSet(),
    inData: new WeakSet()
  };
  visit(walk, document, false);
  return walk;
}

function visit(walk: Walk, value: unknown, data: boolean): void {
  if (!firstVisit(walk, value, data)) return;

  if (Array.isArray(value)) {
    value.forEach((item, index) => visitChild(walk, String(index), item, data));
    return;
  }

  const node = value as JsonObject;
  record(walk, node, data);
  const named = isNamedMap(walk.path);
  for (const [name, child] of Object.entries(node)) {
    visitChild(walk, name, child, data || (!named && DATA_KEYS.has(name)));
  }
}

function visitChild(walk: Walk, name: string, child: unknown, data: boolean): void {
  walk.path.push(name);
  visit(walk, child, data);
  walk.path.pop();
}

function firstVisit(walk: Walk, value: unknown, data: boolean): value is object {
  if (typeof value !== 'object' || value === null) return false;
  if (walk.inStructure.has(value) || (data && walk.inData.has(value))) return false;
  (data ? walk.inData : walk.inStructure).add(value);
  return true;
}

function record(walk: Walk, node: JsonObject, data: boolean): void {
  const segments = typeof node.$ref === 'string' ? pointerSegments(node.$ref) : undefined;
  if (!segments) return;
  walk.references.set(node, { raw: (node.$ref as string).slice(2).split('/'), segments });
  if (!data && isSchemaPosition(walk.path) && isHoistable(walk.document, segments)) {
    walk.targets.set(key(segments), segments);
  }
}

// In these maps a key is a name, so `default` there is a response and `enum` a property.
function isNamedMap(path: string[]): boolean {
  const last = path.at(-1) ?? '';
  return SCHEMA_MAPS.has(last) || last === 'responses' || isComponentMap(path);
}

// A schema file that is nothing but a reference makes what it names a schema too, though
// nothing may reference that from a schema position itself.
function passedOnSchemas(document: JsonObject, targets: Map<string, string[]>): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const segments of targets.values()) {
    let next = passedOn(document, segments);
    while (next && !targets.has(key(next)) && !found.has(key(next))) {
      found.set(key(next), next);
      next = passedOn(document, next);
    }
  }
  return found;
}

function passedOn(document: JsonObject, segments: string[]): string[] | undefined {
  const node = resolve(document, segments);
  const next = isJsonObject(node) && typeof node.$ref === 'string' ? pointerSegments(node.$ref) : undefined;
  return next && isHoistable(document, next) ? next : undefined;
}

/** Files each target under `components/schemas`, and returns the pointer to where each one went. */
function placeSchemas(
  document: JsonObject,
  targets: Map<string, string[]>,
  locations: Record<string, string>
): Map<string, string> {
  const schemas = componentSchemas(document);
  const aliases = findAliases(schemas);
  const moved = new Map<string, string>();
  for (const [target, segments] of targets) {
    const name = aliases.get(target) ?? uniqueName(schemas, preferredName(segments, locations));
    schemas[name] = resolve(document, segments);
    moved.set(target, `#/components/schemas/${escapeJsonPointer(name)}`);
  }
  return moved;
}

function componentSchemas(document: JsonObject): JsonObject {
  if (!isJsonObject(document.components)) document.components = {};
  const components = document.components as JsonObject;
  if (!isJsonObject(components.schemas)) components.schemas = {};
  return components.schemas as JsonObject;
}

// A component that is nothing but a reference to the file already names it; the file's
// content takes its place rather than sitting beside it under a second name.
function findAliases(schemas: JsonObject): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const [name, schema] of Object.entries(schemas)) {
    if (!isJsonObject(schema) || typeof schema.$ref !== 'string' || Object.keys(schema).length !== 1) continue;
    const segments = pointerSegments(schema.$ref);
    if (segments && !aliases.has(key(segments))) aliases.set(key(segments), name);
  }
  return aliases;
}

function rewriteReferences(references: Map<JsonObject, Reference>, moved: Map<string, string>): void {
  for (const [node, { raw, segments }] of references) {
    for (let length = segments.length; length >= 2; length--) {
      const pointer = moved.get(key(segments.slice(0, length)));
      if (pointer) {
        node.$ref = [pointer, ...raw.slice(length)].join('/');
        break;
      }
    }
  }
}

// Nothing points into a moved file any more, and left in place the upgrader would convert it a
// second time. A node moved out of a file stays in it: the file may still be used.
function removeMovedFiles(document: JsonObject, externals: JsonObject, targets: Map<string, string[]>): void {
  for (const segments of targets.values()) {
    if (segments.length === 2) delete externals[segments[1]];
  }
  if (Object.keys(externals).length === 0) delete document[EXTERNAL];
}

function isSchemaPosition(path: string[]): boolean {
  if (isComponentMap(path, path.length - 1)) return path.at(-2) === 'schemas';
  const parent = path.at(-2) ?? '';
  if (SCHEMA_MAPS.has(parent) || SCHEMA_LISTS.has(parent)) return true;
  return SCHEMA_KEYS.has(path.at(-1) ?? '');
}

// Also a `components` map in a file embedded whole: a full OpenAPI document used as a library.
function isComponentMap(path: string[], length = path.length): boolean {
  if (length === 2) return path[0] === 'components';
  return length === 4 && path[0] === EXTERNAL && path[2] === 'components';
}

/**
 * A node in an embedded file that the upgrader would not take for a schema where it sits. One
 * inside a schema it does recognise is upgraded, and named, as that schema's part.
 */
function isHoistable(document: JsonObject, segments: string[]): boolean {
  if (segments[0] !== EXTERNAL || segments.length < 2) return false;
  if (segments.some((segment) => UPGRADER_SCHEMA_SEGMENTS.has(segment) || segment.endsWith('Schema'))) return false;
  return isJsonObject(resolve(document, segments));
}

function preferredName(segments: string[], locations: Record<string, string>): string {
  const [, file, ...inner] = segments;
  const name = inner.at(-1) ?? baseName(locations[file] ?? file);
  // Read back out of a reference, `#` would start a fragment and `%` an escape.
  return name.replace(/[#%]/g, '_').trim() || file;
}

function baseName(location: string): string {
  const last = location.split(/[?#]/)[0].split('/').at(-1) ?? location;
  return last.replace(/\.[^.]+$/, '');
}

function uniqueName(schemas: JsonObject, name: string): string {
  let candidate = name;
  let suffix = 1;
  while (Object.hasOwn(schemas, candidate)) candidate = `${name}-${++suffix}`;
  return candidate;
}

function resolve(document: JsonObject, segments: string[]): unknown {
  return getValueByPath(document, segments).value;
}

// Decoded the way the renderer resolves a reference. `decodeURI` throws on a malformed escape,
// and a reference it cannot read is left as it is.
function pointerSegments(ref: string): string[] | undefined {
  if (!ref.startsWith('#/')) return undefined;
  try {
    return getSegmentsFromPath(ref.slice(1));
  } catch {
    return undefined;
  }
}

function key(segments: string[]): string {
  return JSON.stringify(segments);
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
