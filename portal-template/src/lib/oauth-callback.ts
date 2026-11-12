/**
 * The one redirect URI a portal owner registers with their OAuth provider, instead of the
 * address of every endpoint page that can start an authorization. The CLI keeps the user's
 * pages off it, in `src/types/portal/content-tree.ts`.
 */
export const oauthCallbackPath = '/oauth/callback';

/** Where the playground notes the path of the page that started the flow before it leaves: this tab's session storage. */
const STARTING_PAGE_KEY = 'fumadocs-openapi-oauth';

/** What the callback does with the browser that lands on it. */
export type OAuthCallback =
  /** Sends it back to the page that started the flow, with the provider's answer still attached. */
  | { kind: 'return'; url: string }
  /** Stays, to show the error the provider ended the authorization with, and a link back to that page. */
  | { kind: 'providerError'; error: string; description: string | null; page: string }
  /** Stays, since no page is noted: no authorization was started in this tab. */
  | { kind: 'notStarted' }
  /** Stays, since the noted page is on another site, or cannot be read as an address. */
  | { kind: 'unknownPage' };

/** Every outcome but sending the browser on, which leaves the callback before it renders again. */
export type OAuthCallbackFailure = Exclude<OAuthCallback, { kind: 'return' }>;

/**
 * The provider answers in the query for the authorization code flow and in the fragment for the
 * implicit one, an error included. Only an authorization this tab started is answered with
 * the provider's error: anyone can link here with an `error_description` of their own.
 */
export function oauthCallback(
  startingPage: string | null,
  location: Pick<Location, 'origin' | 'search' | 'hash'>
): OAuthCallback {
  if (startingPage === null) return { kind: 'notStarted' };

  let page: URL;
  try {
    page = new URL(startingPage, location.origin);
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
 * The page the playground noted, taken from the tab's session: left there, a later arrival would
 * be sent back to the last page that started an authorization, so once read it names only the
 * flow just started.
 */
export function takeStartingPage(): string | null {
  const page = sessionStorage.getItem(STARTING_PAGE_KEY);
  sessionStorage.removeItem(STARTING_PAGE_KEY);
  return page;
}
