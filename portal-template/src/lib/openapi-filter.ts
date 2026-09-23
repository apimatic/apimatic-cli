import type { Document } from 'fumadocs-openapi';

/** Which operations the reference documents. */
export interface OperationFilter {
  showDeprecated: boolean;
  /** Whether operations marked `x-internal: true` are documented. */
  showInternal: boolean;
}

/** The fixed fields of a path item that hold an operation, OpenAPI 3.2's `query` included. */
const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace', 'query'];

type Json = Record<string, unknown>;

/**
 * The bundled document without the operations the portal leaves out, from `paths` and
 * `webhooks` alike, and without a path item that has none left. Filtering the document rather
 * than the generated pages is what keeps a hidden operation out of everything built from it:
 * no page, no sidebar row, no emptied tag folder, and no trace in another page's payload.
 *
 * Returns the very document it was given when nothing is left out. Nothing it was given is
 * modified.
 */
export function withoutHiddenOperations(document: Document, filter: OperationFilter): Document {
  if (filter.showDeprecated && filter.showInternal) {
    return document;
  }
  const root = document as unknown as Json;
  const paths = pathItemsShown(root, root.paths, filter);
  const webhooks = pathItemsShown(root, root.webhooks, filter);
  if (paths === root.paths && webhooks === root.webhooks) {
    return document;
  }
  const shown: Json = { ...root };
  if (paths !== root.paths) shown.paths = paths;
  if (webhooks !== root.webhooks) shown.webhooks = webhooks;
  return shown as unknown as Document;
}

/** The map as given when nothing in it is hidden, else a copy without what is. */
function pathItemsShown(root: Json, items: unknown, filter: OperationFilter): unknown {
  if (!isObject(items)) {
    return items;
  }
  let changed = false;
  const kept: Json = {};
  for (const [key, item] of Object.entries(items)) {
    const shown = pathItemShown(root, item, filter);
    if (shown !== item) changed = true;
    if (shown !== undefined) kept[key] = shown;
  }
  return changed ? kept : items;
}

/**
 * The path item as given when none of its operations is hidden, a copy without them when some
 * are, or undefined when none is left. A path item that is a reference into the document is
 * followed, and inlined only when something in it is hidden: another path may share it.
 */
function pathItemShown(root: Json, item: unknown, filter: OperationFilter): unknown {
  if (!isObject(item)) {
    return item;
  }
  const { $ref, ...siblings } = item;
  const target = typeof $ref === 'string' ? resolveLocal(root, $ref) : item;
  if (!isObject(target)) {
    return item;
  }
  // A whole path can be marked internal, as a single operation can.
  if (target['x-internal'] === true && !filter.showInternal) {
    return undefined;
  }

  const copy: Json = typeof $ref === 'string' ? { ...target, ...siblings } : { ...target };
  let removed = false;
  let remaining = 0;
  for (const method of METHODS) {
    if (!isObject(copy[method])) continue;
    if (isHidden(copy[method], filter)) {
      delete copy[method];
      removed = true;
    } else {
      remaining += 1;
    }
  }
  if (isObject(copy.additionalOperations)) {
    const additional: Json = {};
    for (const [method, operation] of Object.entries(copy.additionalOperations)) {
      if (isObject(operation) && isHidden(operation, filter)) {
        removed = true;
      } else {
        additional[method] = operation;
        remaining += 1;
      }
    }
    if (Object.keys(additional).length > 0) copy.additionalOperations = additional;
    else delete copy.additionalOperations;
  }

  if (!removed) {
    return item;
  }
  return remaining > 0 ? copy : undefined;
}

function isHidden(operation: Json, filter: OperationFilter): boolean {
  return (
    (operation.deprecated === true && !filter.showDeprecated) ||
    (operation['x-internal'] === true && !filter.showInternal)
  );
}

/** A JSON pointer into the document itself, such as `#/components/pathItems/Pets`. */
function resolveLocal(root: Json, ref: string): unknown {
  if (!ref.startsWith('#/')) {
    return undefined;
  }
  let node: unknown = root;
  for (const token of ref.slice(2).split('/')) {
    if (!isObject(node)) return undefined;
    node = node[decodeURIComponent(token).replaceAll('~1', '/').replaceAll('~0', '~')];
  }
  return node;
}

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
