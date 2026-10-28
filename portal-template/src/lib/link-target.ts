/**
 * Where a link within the portal goes, as TanStack Router takes it: the page, and the heading on it.
 * The router reads `to` as a path alone, so `/errors#status-codes` given whole names a page called
 * `errors#status-codes`: hovering preloads its data, which was never built (a 404 in the console),
 * and following it opens the not-found page. Fumadocs' own link for TanStack gives it whole.
 */
export function linkTarget(href: string): { to: string; hash?: string } {
  const at = href.indexOf('#');
  if (at < 0) return { to: href };
  const hash = href.slice(at + 1);
  return hash === '' ? { to: href.slice(0, at) } : { to: href.slice(0, at), hash };
}
