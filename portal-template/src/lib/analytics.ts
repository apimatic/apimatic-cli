import { withBasePath } from './base-path';
import { oauthCallbackPath } from './oauth-callback';

/** Names the OAuth standard puts in an answer. While one is in the address, the loader inserts nothing. */
const OAUTH_ANSWER = [
  'code',
  'state',
  'access_token',
  'id_token',
  'token_type',
  'expires_in',
  'error',
  'session_state',
  'iss'
];

/** Query parameters a reported address keeps: campaign, ad-click and cross-domain tags, which attribution reads from the address. */
const KEPT_PREFIXES = ['utm_', 'hsa_'];
const KEPT_NAMES = new Set([
  '_gl',
  'gclid',
  'gbraid',
  'wbraid',
  'gad_source',
  'dclid',
  'fbclid',
  'msclkid',
  'ttclid',
  'twclid',
  'li_fat_id',
  'mc_cid',
  '_hsenc',
  '_hsmi',
  'ref'
]);

/**
 * Each event's keys, besides the `page_location` every report adds. Customers' GTM triggers
 * match these names, so renaming or removing one breaks them without an error.
 */
export interface PortalEvents {
  docs_page_view: { page_title: string };
}
export type PortalEventName = keyof PortalEvents;

export interface PortalEvent {
  readonly name: PortalEventName;
  readonly params: Readonly<Record<string, unknown>>;
  readonly time: number;
  /** Lets a later shape be told from this one. */
  readonly version: 1;
}

/** The reset entry, then the event entry with every detail under `docs`. */
export type DataLayerEntry =
  | { docs: null }
  | { event: PortalEventName; docs: Readonly<Record<string, string | number>> };

/** The address as reported: no `#` part, no query but the kept tags, and null on the OAuth callback. */
export function pageLocation(href: string, keep: readonly string[], base?: string): string | null {
  const url = new URL(href);
  // A static host may answer `/oauth/callback` at `/oauth/callback/` and keep the query.
  if (url.pathname.replace(/\/$/, '') === withBasePath(oauthCallbackPath, base)) return null;
  const kept = (name: string) =>
    KEPT_PREFIXES.some((prefix) => name.startsWith(prefix)) || KEPT_NAMES.has(name) || keep.includes(name);
  url.search = new URLSearchParams([...url.searchParams].filter(([name]) => kept(name))).toString();
  url.hash = '';
  return url.href;
}

/** True while the query or the `#` part holds a name the OAuth standard puts in an answer. */
export function holdsOAuthAnswer(href: string): boolean {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.slice(1));
  return OAUTH_ANSWER.some((name) => url.searchParams.has(name) || hash.has(name));
}
