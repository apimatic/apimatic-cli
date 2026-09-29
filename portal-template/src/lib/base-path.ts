const ABSOLUTE = /^[a-z][a-z\d+\-.]*:|^\/\//i;

/**
 * The path the portal is mounted under, taken from what Vite was configured with rather than
 * from the identity file, so it cannot disagree with the addresses the build emits.
 */
export const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

/**
 * Where a site-relative address is actually served from. The router prefixes its own links and
 * Vite prefixes the assets it emits, but neither sees an address that reaches the browser as a
 * string: the identity file's images, the search index, and the downloads pages link to. An
 * address that names its own host is left alone.
 */
export function withBasePath(address: string): string {
  return ABSOLUTE.test(address) ? address : `${basePath}${address}`;
}
