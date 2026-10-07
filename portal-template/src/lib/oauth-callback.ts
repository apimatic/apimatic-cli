/**
 * The one redirect URI a portal owner registers with their OAuth provider, instead of the
 * address of every endpoint page that can start a sign-in. The CLI keeps the user's pages off
 * it, in `src/types/portal/content-tree.ts`.
 */
export const oauthCallbackPath = '/oauth/callback';

/** The cookie the playground writes before it leaves, naming the page that started the flow. */
const PAGE_COOKIE_NAME = 'fumadocs-openapi-oauth';
const PAGE_COOKIE = new RegExp(`(?:^|;\\s*)${PAGE_COOKIE_NAME}=([^;]+)`);

/** What the callback does with the browser that lands on it. */
export type OAuthCallback =
  /** Sends it back to the page that started the flow, with the provider's answer still attached. */
  | { kind: 'return'; url: string }
  /** Stays, to show the error the provider ended the sign-in with, and a link back to that page. */
  | { kind: 'providerError'; error: string; description: string | null; page: string }
  /** Stays, since the cookie names no page: no sign-in was started in this browser. */
  | { kind: 'notStarted' }
  /** Stays, since the cookie names a page on another site, or one that cannot be read. */
  | { kind: 'unknownPage' };

/** Every outcome but sending the browser on, which leaves the callback before it renders again. */
export type OAuthCallbackFailure = Exclude<OAuthCallback, { kind: 'return' }>;

/**
 * The provider answers in the query for the authorization code flow and in the fragment for the
 * implicit one, an error included. Only a sign-in this browser started is answered with the
 * provider's error: anyone can link here with an `error_description` of their own.
 */
export function oauthCallback(cookie: string, location: Pick<Location, 'origin' | 'search' | 'hash'>): OAuthCallback {
  const value = PAGE_COOKIE.exec(cookie)?.[1];
  if (value === undefined) return { kind: 'notStarted' };

  let page: URL;
  try {
    page = new URL(decodeURIComponent(value), location.origin);
  } catch {
    return { kind: 'unknownPage' };
  }
  // Anything else is an open redirect, carrying the authorization code to another site.
  if (page.origin !== location.origin) return { kind: 'unknownPage' };

  const query = new URLSearchParams(location.search);
  const answer = query.has('error') ? query : new URLSearchParams(location.hash.slice(1));
  const error = answer.get('error');
  if (error !== null) {
    return { kind: 'providerError', error, description: answer.get('error_description'), page: page.href };
  }

  // Whole, not as a path: a path of `//evil.test/x` would be read as another site's address.
  page.search = location.search;
  page.hash = location.hash;
  return { kind: 'return', url: page.href };
}

/**
 * The playground leaves the cookie for the session, so a later visit would be sent back to the
 * last page that signed in. Forgotten once read, it names only the flow just started.
 */
export function forgetStartingPage(): void {
  document.cookie = `${PAGE_COOKIE_NAME}=; path=/; max-age=0`;
}
