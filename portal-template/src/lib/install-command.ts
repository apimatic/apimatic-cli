const ABSOLUTE = /^https?:\/\//i;

// Quoted, so a `&` or a space in the address stays one argument in any shell a reader pastes it into.
export function installCommand(path: string, site: string | null): string {
  return `npx context-plugins install "${installAddress(path, site)}"`;
}

function installAddress(path: string, site: string | null): string {
  if (ABSOLUTE.test(path) || site === null) {
    return path;
  }
  return `${site.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}
