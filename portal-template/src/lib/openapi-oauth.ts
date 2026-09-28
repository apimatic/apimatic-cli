import type { Document } from 'fumadocs-openapi';
import { isJsonObject, JsonObject } from './json';

const FLOW_URLS = ['authorizationUrl', 'tokenUrl', 'refreshUrl'] as const;

/**
 * Resolves each relative OAuth URL against the document's first server, as OpenAPI has it. The
 * playground fetches the URL as written, which would send a token request to the portal itself
 * and read its HTML page as the token. Returns the very document it was given when nothing is
 * relative, and modifies nothing it was given.
 */
export function withAbsoluteOAuthUrls(document: Document): Document {
  const root = document as unknown as JsonObject;
  const base = serverUrl(root.servers);
  const components = root.components;
  if (base === undefined || !isJsonObject(components) || !isJsonObject(components.securitySchemes)) {
    return document;
  }
  const schemes = components.securitySchemes;
  const resolved = Object.fromEntries(Object.entries(schemes).map(([name, scheme]) => [name, withAbsoluteFlows(scheme, base)]));
  if (Object.keys(schemes).every((name) => resolved[name] === schemes[name])) {
    return document;
  }
  return { ...root, components: { ...components, securitySchemes: resolved } } as unknown as Document;
}

/** The first server's URL with each variable at its default, when that makes it absolute. */
function serverUrl(servers: unknown): URL | undefined {
  const server: unknown = Array.isArray(servers) ? servers[0] : undefined;
  if (!isJsonObject(server) || typeof server.url !== 'string') {
    return undefined;
  }
  const variables = isJsonObject(server.variables) ? server.variables : {};
  let filled = true;
  const url = server.url.replace(/\{([^}]+)\}/g, (placeholder, name: string) => {
    const variable = variables[name];
    if (isJsonObject(variable) && typeof variable.default === 'string') return variable.default;
    filled = false;
    return placeholder;
  });
  return filled && URL.canParse(url) ? new URL(url) : undefined;
}

function withAbsoluteFlows(scheme: unknown, base: URL): unknown {
  if (!isJsonObject(scheme) || scheme.type !== 'oauth2' || !isJsonObject(scheme.flows)) {
    return scheme;
  }
  const flows = scheme.flows;
  const resolved = Object.fromEntries(Object.entries(flows).map(([type, flow]) => [type, withAbsoluteUrls(flow, base)]));
  return Object.keys(flows).every((type) => resolved[type] === flows[type]) ? scheme : { ...scheme, flows: resolved };
}

function withAbsoluteUrls(flow: unknown, base: URL): unknown {
  if (!isJsonObject(flow)) {
    return flow;
  }
  const relative = FLOW_URLS.filter((field) => typeof flow[field] === 'string' && !URL.canParse(flow[field]));
  if (relative.length === 0) {
    return flow;
  }
  const resolved: JsonObject = { ...flow };
  for (const field of relative) resolved[field] = new URL(flow[field] as string, base).href;
  return resolved;
}
