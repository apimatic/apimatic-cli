/// <reference types="vite/client" />

// Undefined outside Vite, as under the template's unit tests; Fumadocs guards it the same way.
const BASE = typeof import.meta.env === 'undefined' ? '/' : import.meta.env.BASE_URL;

/** A portal-relative path as the host serves it, under `base`: Vite's own unless one is given. */
export function withBasePath(path: string, base: string = BASE): string {
  return `${base.replace(/\/$/, '')}${path}`;
}

/**
 * The files the portal writes beside its pages, at the paths of the routes that write them. Not
 * robots.txt: the build writes it only at the root of a host, where there is no base to add.
 */
const FILES = new Set(['/llms.txt', '/llms-full.txt', '/sitemap.xml', '/api/search.json']);

/** A page's Markdown copy, which the `{$}.md` route writes, at a path on the portal's own host. */
const MARKDOWN_COPY = /^\/[^/].*\.md$/;

/**
 * Where a link the router never sees leads. The router adds the base to its own links alone, so
 * one of the portal's files gets it here, unless the author already wrote it. Any other address,
 * such as `/pricing` on a sibling app of the same host, is left as written.
 */
export function externalHref(href: string, base: string = BASE): string {
  const path = href.split(/[?#]/, 1)[0];
  const portalFile = FILES.has(path) || MARKDOWN_COPY.test(path);
  return portalFile && !path.startsWith(base) ? withBasePath(href, base) : href;
}

/** A portal-relative path's full address as the browser sees it; the path itself where there is no window. */
export function fullAddress(path: string): string {
  return typeof window === 'undefined' ? path : new URL(withBasePath(path), window.location.origin).toString();
}
