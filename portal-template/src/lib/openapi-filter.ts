import type { Document } from 'fumadocs-openapi';

/** Which operations the reference documents. */
export interface OperationFilter {
  showDeprecated: boolean;
  /** Whether operations marked `x-internal: true` are documented. */
  showInternal: boolean;
}

/**
 * The fixed fields of a path item that hold an operation, OpenAPI 3.2's `query` included.
 * Fumadocs builds pages for fewer of them, but any it keeps rides along in every page's payload.
 */
const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace', 'query'];

type Json = Record<string, unknown>;

/**
 * The bundled document without the operations the portal leaves out, from `paths` and
 * `webhooks` alike, without a path item that has none left, and without a tag that only
 * those operations carried. Filtering the document rather than the generated pages is what
 * keeps a hidden operation out of everything built from it: no page, no sidebar row, no
 * emptied tag folder, and no trace of it or its tag in another page's payload.
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
  withoutEmptiedTags(root, shown);
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
  const resolved = resolvePathItem(root, item);
  if (resolved === undefined) {
    return item;
  }
  // A whole path can be marked internal, as a single operation can.
  if (resolved['x-internal'] === true && !filter.showInternal) {
    return undefined;
  }

  const copy: Json = { ...resolved };
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

/**
 * The path item as it reads once every `#/` reference is followed, the fields written beside
 * each one winning over what it points to, as OpenAPI 3.1 has it and Fumadocs reads it: a
 * split specification reaches a path item through a component that is itself a reference into
 * the bundled files. Undefined for anything that is no object. A reference that cannot be
 * followed is left in place, with what was found on the way.
 */
function resolvePathItem(root: Json, item: unknown, seen = new Set<string>()): Json | undefined {
  if (!isObject(item)) {
    return undefined;
  }
  const { $ref, ...siblings } = item;
  if (typeof $ref !== 'string' || seen.has($ref)) {
    return item;
  }
  seen.add($ref);
  const target = resolvePathItem(root, resolveLocal(root, $ref), seen);
  return target === undefined ? item : { ...target, ...siblings };
}

function isHidden(operation: Json, filter: OperationFilter): boolean {
  return (
    (operation.deprecated === true && !filter.showDeprecated) ||
    (operation['x-internal'] === true && !filter.showInternal)
  );
}

/**
 * Drops the tags that only removed operations carried, from `tags` and from Redocly's
 * `x-tagGroups`. Fumadocs builds no folder for such a tag, but every page's payload carries the
 * document's tags, so a hidden section's name and description would still reach the reader. A
 * tag another kept tag names as its `parent` stays, as the group it is.
 */
function withoutEmptiedTags(root: Json, shown: Json): void {
  const kept = tagsUsed(shown);
  const emptied = new Set([...tagsUsed(root)].filter((name) => !kept.has(name)));
  if (emptied.size === 0) {
    return;
  }
  if (Array.isArray(shown.tags)) {
    const tags = shown.tags as unknown[];
    const nameOf = (tag: unknown) => (isObject(tag) && typeof tag.name === 'string' ? tag.name : undefined);
    const parentOf = (tag: unknown) => (isObject(tag) && typeof tag.parent === 'string' ? [tag.parent] : []);
    // Until no group is left holding only tags that went: each pass can empty the one above.
    let staying = tags;
    for (;;) {
      const parents = new Set(staying.flatMap(parentOf));
      const next = tags.filter((tag) => {
        const name = nameOf(tag);
        return name === undefined || !emptied.has(name) || parents.has(name);
      });
      if (next.length === staying.length) break;
      staying = next;
    }
    shown.tags = staying;
  }
  if (Array.isArray(shown['x-tagGroups'])) {
    shown['x-tagGroups'] = (shown['x-tagGroups'] as unknown[]).flatMap((group) => {
      if (!isObject(group) || !Array.isArray(group.tags)) return [group];
      const tags = group.tags.filter((name) => typeof name !== 'string' || !emptied.has(name));
      return tags.length > 0 ? [{ ...group, tags }] : [];
    });
  }
}

/** Every tag an operation of the document carries. */
function tagsUsed(document: Json): Set<string> {
  const used = new Set<string>();
  for (const items of [document.paths, document.webhooks]) {
    if (!isObject(items)) continue;
    for (const item of Object.values(items)) {
      const resolved = resolvePathItem(document, item);
      if (resolved === undefined) continue;
      const additional = isObject(resolved.additionalOperations) ? Object.values(resolved.additionalOperations) : [];
      for (const operation of [...METHODS.map((method) => resolved[method]), ...additional]) {
        if (!isObject(operation) || !Array.isArray(operation.tags)) continue;
        for (const tag of operation.tags) {
          if (typeof tag === 'string') used.add(tag);
        }
      }
    }
  }
  return used;
}

/** A JSON pointer into the document itself, such as `#/components/pathItems/Pets`. */
function resolveLocal(root: Json, ref: string): unknown {
  if (!ref.startsWith('#/')) {
    return undefined;
  }
  let node: unknown = root;
  for (const token of ref.slice(2).split('/')) {
    if (!isObject(node)) return undefined;
    let key: string;
    try {
      key = decodeURIComponent(token);
    } catch {
      // A stray `%`: no key of the document is spelt that way, so the reference leads nowhere.
      return undefined;
    }
    node = node[key.replaceAll('~1', '/').replaceAll('~0', '~')];
  }
  return node;
}

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
