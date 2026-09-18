import type { OpenAPIPageProps_Spec } from 'fumadocs-openapi/ui';

type Document = OpenAPIPageProps_Spec['payload']['bundled'];
type Components = Record<string, Record<string, unknown>>;
type Wanted = { key: string; method?: string };

// A reference names a component by kind and name; anything after that addresses a node
// inside it, which is kept along with the whole component rather than on its own.
const COMPONENT_REF = /^#\/components\/([^/]+)\/([^/]+)/;

// The bundler embeds every external document under `x-ext` and rewrites file and URL
// references to point inside it, at whatever depth the original reference reached. These
// never take the `#/components/` shape, so they need their own rule.
const EXTERNAL_REF = /^#\/x-ext\/(.+)$/;

const METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);

/**
 * Cuts the bundled document down to what this page can reach: the operations it renders,
 * the components and embedded external documents they reference (transitively), and the
 * document-level fields the client reads (info, servers, security, tags).
 *
 * Without this every page carries the whole specification twice, inlined in its HTML and
 * again in the server-function cache, so the output grows with pages × document size.
 */
export function slimOpenAPIPageProps(props: OpenAPIPageProps_Spec): OpenAPIPageProps_Spec {
  const bundled = props.payload.bundled as Document & {
    paths?: Record<string, unknown>;
    webhooks?: Record<string, unknown>;
    components?: Components;
    'x-ext'?: Record<string, unknown>;
    security?: unknown;
  };

  const { paths, webhooks, components, 'x-ext': external, ...rest } = bundled;
  const operations: Wanted[] = (props.operations ?? []).map((operation) => ({
    key: operation.path,
    method: operation.method
  }));
  const hooks: Wanted[] = (props.webhooks ?? []).map((webhook) => ({ key: webhook.name, method: webhook.method }));

  const keptPaths = pick(paths, operations);
  const keptWebhooks = pick(webhooks, hooks);
  const reached = reachable({ components, external }, [keptPaths, keptWebhooks]);

  return {
    ...props,
    payload: {
      ...props.payload,
      bundled: {
        ...rest,
        ...(keptPaths && { paths: keptPaths }),
        ...(keptWebhooks && { webhooks: keptWebhooks }),
        ...(reached.components && { components: reached.components }),
        ...(reached.external && { 'x-ext': reached.external })
      } as Document
    }
  };
}

/** Keeps the named path items or webhooks, each cut down to the methods the page renders. */
function pick(
  record: Record<string, unknown> | undefined,
  wanted: Wanted[]
): Record<string, unknown> | undefined {
  if (!record) return undefined;

  const methodsByKey = new Map<string, Set<string>>();
  for (const { key, method } of wanted) {
    if (!(key in record)) continue;
    const methods = methodsByKey.get(key) ?? new Set<string>();
    if (typeof method === 'string') methods.add(method.toLowerCase());
    methodsByKey.set(key, methods);
  }

  const out: Record<string, unknown> = {};
  for (const [key, methods] of methodsByKey) out[key] = narrowToMethods(record[key], methods);
  return out;
}

/**
 * Drops the operations the page does not render. Fumadocs renders one operation per page and
 * reads only `pathItem[method]`, so without this a page carries every sibling method on its
 * path and the whole schema closure each one reaches. Fields that are not methods stay: the
 * renderer reads path-level `parameters` and `servers` from the same item.
 */
function narrowToMethods(item: unknown, methods: Set<string>): unknown {
  if (methods.size === 0 || item === null || typeof item !== 'object' || Array.isArray(item)) return item;

  const entries = Object.entries(item as Record<string, unknown>);
  // An item that is itself a reference carries no operations to narrow.
  if (entries.some(([key]) => key === '$ref')) return item;

  const out: Record<string, unknown> = {};
  for (const [key, value] of entries) {
    if (!METHODS.has(key.toLowerCase()) || methods.has(key.toLowerCase())) out[key] = value;
  }
  return out;
}

interface Sections {
  components?: Components;
  external?: Record<string, unknown>;
}

/**
 * Walks from the roots and keeps everything the page's own items can reach: the named
 * component behind any `#/components/...` string, and the exact node a `#/x-ext/...` string
 * addresses, rebuilt at the same path so the reference still resolves. Matching any string,
 * not only `$ref`, also covers `discriminator.mapping` and vendor extensions.
 */
function reachable(sections: Sections, roots: unknown[]): Sections {
  const { components, external } = sections;
  const keptComponents: Components = {};
  const keptExternal: Record<string, unknown> = {};
  // Security schemes are looked up by name from `security`, never through a reference.
  if (components?.securitySchemes) keptComponents.securitySchemes = components.securitySchemes;

  const seenExternal = new Set<string>();
  const queue: unknown[] = [...roots];

  const visitComponent = (kind: string, name: string): void => {
    const target = components?.[kind]?.[name];
    if (target === undefined || keptComponents[kind]?.[name] !== undefined) return;
    keptComponents[kind] ??= {};
    keptComponents[kind][name] = target;
    queue.push(target);
  };

  const visitExternal = (pointer: string): void => {
    if (seenExternal.has(pointer)) return;
    seenExternal.add(pointer);
    const segments = pointer.split('/').map(unescapePointer);
    const target = resolvePointer(external, segments);
    if (target === undefined) return;
    writePointer(keptExternal, segments, target);
    queue.push(target);
  };

  const visit = (node: unknown): void => {
    if (typeof node === 'string') {
      const component = COMPONENT_REF.exec(node);
      if (component) {
        visitComponent(component[1], unescapePointer(component[2]));
        return;
      }
      const embedded = EXTERNAL_REF.exec(node);
      if (embedded) visitExternal(embedded[1]);
    } else if (Array.isArray(node)) {
      for (const item of node) visit(item);
    } else if (node !== null && typeof node === 'object') {
      for (const value of Object.values(node)) visit(value);
    }
  };

  while (queue.length > 0) visit(queue.pop());

  return {
    components: components && Object.keys(keptComponents).length > 0 ? keptComponents : undefined,
    external: external && Object.keys(keptExternal).length > 0 ? keptExternal : undefined
  };
}

function resolvePointer(root: unknown, segments: string[]): unknown {
  let node: unknown = root;
  for (const segment of segments) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return node;
}

// Rebuilds just enough of the path for the reference to resolve against what is kept.
function writePointer(root: Record<string, unknown>, segments: string[], value: unknown): void {
  let node = root;
  for (const segment of segments.slice(0, -1)) {
    const next = node[segment];
    if (next === null || typeof next !== 'object') node[segment] = {};
    node = node[segment] as Record<string, unknown>;
  }
  node[segments[segments.length - 1]] = value;
}

/** A component named `a/b` is referenced as `a~1b`, and may also be percent-encoded. */
function unescapePointer(segment: string): string {
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    // Not percent-encoded; use it as written.
  }
  return decoded.replaceAll('~1', '/').replaceAll('~0', '~');
}
