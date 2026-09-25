const ABSOLUTE = /^https?:\/\//i;

/**
 * Where `npx context-plugins install` fetches the plugin from: an address elsewhere as it is, and a
 * path on this portal from the origin it is served at, when that is known.
 */
export function installAddress(path: string, origin: string | null): string {
  if (ABSOLUTE.test(path) || origin === null) {
    return path;
  }
  return `${origin.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}
