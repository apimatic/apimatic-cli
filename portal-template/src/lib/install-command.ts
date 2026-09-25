const ABSOLUTE = /^https?:\/\//i;

// Quoted, so a `&` or a space in the address stays one argument in any shell a reader pastes it into.
export function installCommand(path: string, origin: string | null): string {
  return `npx context-plugins install "${installAddress(path, origin)}"`;
}

function installAddress(path: string, origin: string | null): string {
  if (ABSOLUTE.test(path) || origin === null) {
    return path;
  }
  return `${origin.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}
