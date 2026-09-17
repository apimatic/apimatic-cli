import type { OpenAPIPageProps_Spec } from 'fumadocs-openapi/ui';

type Document = OpenAPIPageProps_Spec['payload']['bundled'];
type Components = Record<string, Record<string, unknown>>;

const COMPONENT_REF = /^#\/components\/([^/]+)\/(.+)$/;

/**
 * Cuts the bundled document down to what this page can reach: its own path items and
 * webhooks, the components they reference (transitively), and the document-level fields
 * the client reads (info, servers, security, tags).
 *
 * Without this every page carries the whole specification twice, inlined in its HTML and
 * again in the server-function cache, so the output grows with pages × document size.
 */
export function slimOpenAPIPageProps(props: OpenAPIPageProps_Spec): OpenAPIPageProps_Spec {
  const bundled = props.payload.bundled as Document & {
    paths?: Record<string, unknown>;
    webhooks?: Record<string, unknown>;
    components?: Components;
    security?: unknown;
  };

  const { paths, webhooks, components, ...rest } = bundled;
  const keptPaths = pick(paths, (props.operations ?? []).map((operation) => operation.path));
  const keptWebhooks = pick(webhooks, (props.webhooks ?? []).map((webhook) => webhook.name));
  const keptComponents = reachableComponents(components, [keptPaths, keptWebhooks]);

  return {
    ...props,
    payload: {
      ...props.payload,
      bundled: {
        ...rest,
        ...(keptPaths && { paths: keptPaths }),
        ...(keptWebhooks && { webhooks: keptWebhooks }),
        ...(keptComponents && { components: keptComponents }),
      } as Document,
    },
  };
}

function pick<T>(record: Record<string, T> | undefined, keys: string[]): Record<string, T> | undefined {
  if (!record) return undefined;
  const out: Record<string, T> = {};
  for (const key of keys) if (key in record) out[key] = record[key];
  return out;
}

/**
 * Walks from the roots and keeps every component a `#/components/...` string points at,
 * following references inside kept components until nothing new appears. Matching any
 * string, not only `$ref`, also covers `discriminator.mapping` and vendor extensions.
 */
function reachableComponents(components: Components | undefined, roots: unknown[]): Components | undefined {
  if (!components) return undefined;
  const kept: Components = {};
  // Security schemes are looked up by name from `security`, never through a reference.
  if (components.securitySchemes) kept.securitySchemes = components.securitySchemes;

  const queue: unknown[] = [...roots];
  const visit = (node: unknown): void => {
    if (typeof node === 'string') {
      const match = COMPONENT_REF.exec(node);
      if (!match) return;
      const kind = match[1];
      const name = unescapePointer(match[2]);
      const target = components[kind]?.[name];
      if (target === undefined || kept[kind]?.[name] !== undefined) return;
      kept[kind] ??= {};
      kept[kind][name] = target;
      queue.push(target);
    } else if (Array.isArray(node)) {
      for (const item of node) visit(item);
    } else if (node !== null && typeof node === 'object') {
      for (const value of Object.values(node)) visit(value);
    }
  };
  while (queue.length > 0) visit(queue.pop());
  return kept;
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
