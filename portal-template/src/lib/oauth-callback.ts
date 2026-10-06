/**
 * The one redirect URI a portal owner registers with their OAuth provider, instead of the
 * address of every endpoint page that can start a sign-in. The CLI keeps the user's pages off
 * it, in `src/types/portal/content-tree.ts`.
 */
export const oauthCallbackPath = '/oauth/callback';

/** The cookie the playground writes before it leaves, naming the page that started the flow. */
const PAGE_COOKIE = /(?:^|;\s*)fumadocs-openapi-oauth=([^;]+)/;

/**
 * Where the callback sends the browser: the page that started the flow, with the provider's
 * answer still attached, or null when the cookie names no page on this site. The answer is the
 * query for the authorization code flow and the fragment for the implicit one.
 */
export function oauthReturnUrl(cookie: string, location: Pick<Location, 'origin' | 'search' | 'hash'>): string | null {
  const page = PAGE_COOKIE.exec(cookie)?.[1];
  if (page === undefined) return null;

  let target: URL;
  try {
    target = new URL(decodeURIComponent(page), location.origin);
  } catch {
    return null;
  }
  // Anything else is an open redirect, carrying the authorization code to another site.
  if (target.origin !== location.origin) return null;
  // Whole, not as a path: a path of `//evil.test/x` would be read as another site's address.
  target.search = location.search;
  target.hash = location.hash;
  return target.href;
}
