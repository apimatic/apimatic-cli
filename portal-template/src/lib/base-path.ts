/// <reference types="vite/client" />

// Undefined outside Vite, as under the template's unit tests; Fumadocs guards it the same way.
const BASE = typeof import.meta.env === 'undefined' ? '/' : import.meta.env.BASE_URL;

/** A portal-relative path as the host serves it, under `base`: Vite's own unless one is given. */
export function withBasePath(path: string, base: string = BASE): string {
  return `${base.replace(/\/$/, '')}${path}`;
}

// Files the routes write; robots.txt exists only at a host's root, and `{$}.md` would claim a sibling app's `.md`.
const FILES = new Set(['/llms.txt', '/llms-full.txt', '/sitemap.xml', '/api/search.json']);

/** The router adds the base to its own links alone, so an external link to one of the portal's files gets it here. */
export function externalHref(href: string, base: string = BASE): string {
  return FILES.has(href.split(/[?#]/, 1)[0]) ? withBasePath(href, base) : href;
}

/** A portal-relative path's full address as the browser sees it; the path itself where there is no window. */
export function fullAddress(path: string): string {
  return typeof window === 'undefined' ? path : new URL(withBasePath(path), window.location.origin).toString();
}
