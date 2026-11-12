import { withBasePath } from './base-path';
import { oauthCallbackPath } from './oauth-callback';
import type { PortalAnalytics } from './portal-types';

/** 5 seconds in all: long enough for a slow page chunk to run the playground's effect that removes the answer. */
const ANSWER_CHECKS = 50;
const ANSWER_CHECK_MS = 100;

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

/** The reset entry, then the event entry with every detail under `docs`. */
export type DataLayerEntry =
  | { docs: null }
  | { event: PortalEventName; docs: Readonly<Record<string, string | number>> };

type Gtag = (...command: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

/** Our code for one vendor. The shared adapter suite runs against each. */
export interface Adapter {
  setup(dataLayer: unknown[]): void;
  scripts(): string[];
  /** GTM needs nothing here: it reads the data layer. */
  send(name: PortalEventName, params: Record<string, unknown>): void;
}

type Vendor = 'googleTagManager' | 'googleAnalytics';
const GOOGLE = 'https://www.googletagmanager.com';

/** Keyed by every vendor in the union: a vendor without an adapter does not compile. */
export const adapters: { [V in Vendor]: (setting: NonNullable<PortalAnalytics[V]>) => Adapter } = {
  googleTagManager: (setting) => {
    const env = setting.environment;
    const environment = env ? `&gtm_auth=${env.auth}&gtm_preview=${env.preview}&gtm_cookies_win=x` : '';
    return {
      setup: (dataLayer) => dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' }),
      scripts: () => [`${GOOGLE}/gtm.js?id=${setting.containerId}${environment}`],
      send: () => {}
    };
  },
  googleAnalytics: (setting) => {
    let gtag: Gtag;
    return {
      setup: (dataLayer) => {
        // gtag.js reads only Arguments objects from the data layer, never an array of the same values.
        gtag = window.gtag ??= function () {
          dataLayer.push(arguments);
        };
        gtag('js', new Date());
        gtag('config', setting.measurementId, {
          send_page_view: false,
          ...(setting.debugMode ? { debug_mode: true } : {})
        });
      },
      scripts: () => [`${GOOGLE}/gtag/js?id=${setting.measurementId}`],
      // GA4 gets its own names: the `docs_` prefix comes off.
      send: (name, params) => gtag('event', name.replace(/^docs_/, ''), params)
    };
  }
};

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

export function analyticsFor(settings: PortalAnalytics) {
  const live: Adapter[] = [];
  if (settings.googleTagManager) live.push(adapters.googleTagManager(settings.googleTagManager));
  if (settings.googleAnalytics) live.push(adapters.googleAnalytics(settings.googleAnalytics));
  let set = false;
  let inserted = false;
  let waiting = false;
  let lastPageView: string | null = null;

  function startAnalytics(): void {
    if (set) return;
    set = true;
    const dataLayer = (window.dataLayer ??= []);
    for (const adapter of live) adapter.setup(dataLayer);
    insertWhenClean();
  }

  function insertWhenClean(): void {
    if (inserted || waiting) return;
    if (!holdsOAuthAnswer(window.location.href)) {
      insert();
      return;
    }
    // The playground's effect that removes the answer can run after ours, and vendor tags read the address themselves.
    waiting = true;
    let checks = 0;
    const timer = setInterval(() => {
      const answered = holdsOAuthAnswer(window.location.href);
      if (answered && ++checks < ANSWER_CHECKS) return;
      // After the last check the next page change calls this again, so a page never cleaned loads nothing.
      clearInterval(timer);
      waiting = false;
      if (!answered) insert();
    }, ANSWER_CHECK_MS);
  }

  function insert(): void {
    inserted = true;
    for (const adapter of live) for (const src of adapter.scripts()) add(src);
  }

  function report<E extends PortalEventName>(name: E, params: PortalEvents[E]): void {
    const page_location = pageLocation(window.location.href, settings.keepQueryParams);
    if (page_location === null) return;
    const all = { ...params, page_location };
    const dataLayer = (window.dataLayer ??= []);
    // GTM keeps every key from earlier pushes and merges objects, so clear ours first: a shared GA4 tag never sends the last event's details.
    const reset: DataLayerEntry = { docs: null };
    const entry: DataLayerEntry = { event: name, docs: all };
    dataLayer.push(reset);
    dataLayer.push(entry);
    for (const adapter of live) adapter.send(name, all);
  }

  function reportPageViews(router: { subscribe(event: 'onRendered', listener: () => void): () => void }): () => void {
    const pageView = () => {
      const page = pageLocation(window.location.href, settings.keepQueryParams);
      if (page === null || page === lastPageView) return;
      lastPageView = page;
      report('docs_page_view', { page_title: document.title });
    };
    pageView();
    return router.subscribe('onRendered', pageView);
  }

  return { startAnalytics, insertWhenClean, report, reportPageViews };
}

function add(src: string): void {
  const script = document.createElement('script');
  script.async = true;
  script.src = src;
  document.head.append(script);
}
