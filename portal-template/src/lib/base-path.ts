/// <reference types="vite/client" />

// Undefined outside Vite, as under the template's unit tests; Fumadocs guards it the same way.
const BASE = typeof import.meta.env === 'undefined' ? '/' : import.meta.env.BASE_URL;

/** A portal-relative path as the host serves it, under `base`: Vite's own unless one is given. */
export function withBasePath(path: string, base: string = BASE): string {
  return `${base.replace(/\/$/, '')}${path}`;
}

/** A portal-relative path's full address as the browser sees it; the path itself where there is no window. */
export function fullAddress(path: string): string {
  return typeof window === 'undefined' ? path : new URL(withBasePath(path), window.location.origin).toString();
}
