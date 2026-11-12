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
  url.search = new URLSearchParams(
    [...url.searchParams].filter(
      ([name]) => KEPT_PREFIXES.some((prefix) => name.startsWith(prefix)) || KEPT_NAMES.has(name) || keep.includes(name)
    )
  ).toString();
  url.hash = '';
  return url.href;
}

/** True while the query or the `#` part holds a name the OAuth standard puts in an answer. */
export function holdsOAuthAnswer(href: string): boolean {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.slice(1));
  return OAUTH_ANSWER.some((name) => url.searchParams.has(name) || hash.has(name));
}

/** The one instance a portal runs: started when the bundle evaluates, reporting from the root effect and the components. */
export class Analytics {
  private readonly live: Adapter[] = [];
  private started = false;
  private inserted = false;
  private waiting = false;
  private lastPageView: string | null = null;

  public constructor(private readonly settings: PortalAnalytics) {
    if (settings.googleTagManager) this.live.push(adapters.googleTagManager(settings.googleTagManager));
    if (settings.googleAnalytics) this.live.push(adapters.googleAnalytics(settings.googleAnalytics));
  }

  /** Once, when the bundle starts: the data layer, every vendor's setup entries, then the vendor tags. */
  public start(): void {
    if (this.started) return;
    this.started = true;
    const dataLayer = (window.dataLayer ??= []);
    for (const adapter of this.live) adapter.setup(dataLayer);
    this.insertWhenClean();
  }

  /** The vendor tags: at once on a clean address, else once the OAuth answer is out of it, within 5 seconds. */
  public insertWhenClean(): void {
    if (this.inserted || this.waiting) return;
    if (holdsOAuthAnswer(window.location.href)) {
      // The playground's effect that removes the answer can run after ours, and vendor tags read the address themselves.
      this.waiting = true;
      let checks = 0;
      const timer = setInterval(() => {
        const answered = holdsOAuthAnswer(window.location.href);
        if (answered && ++checks < ANSWER_CHECKS) return;
        // After the last check the next page change calls this again, so a page never cleaned loads nothing.
        clearInterval(timer);
        this.waiting = false;
        if (!answered) this.insertWhenClean();
      }, ANSWER_CHECK_MS);
      return;
    }
    this.inserted = true;
    for (const src of this.live.flatMap((adapter) => adapter.scripts())) {
      const script = document.createElement('script');
      script.async = true;
      script.src = src;
      document.head.append(script);
    }
  }

  public report<E extends PortalEventName>(name: E, params: PortalEvents[E]): void {
    const page_location = pageLocation(window.location.href, this.settings.keepQueryParams);
    if (page_location === null) return;
    const docs = { ...params, page_location };
    const dataLayer = (window.dataLayer ??= []);
    // GTM keeps every key from earlier pushes and merges objects, so clear ours first: a shared GA4 tag never sends the last event's details.
    dataLayer.push({ docs: null } satisfies DataLayerEntry);
    dataLayer.push({ event: name, docs } satisfies DataLayerEntry);
    for (const adapter of this.live) adapter.send(name, docs);
  }

  /** `docs_page_view` for the current page, unless its cleaned address is the one last reported: a `#` jump sends none. */
  public reportPageView(): void {
    const page = pageLocation(window.location.href, this.settings.keepQueryParams);
    if (page === null || page === this.lastPageView) return;
    this.lastPageView = page;
    this.report('docs_page_view', { page_title: document.title });
  }
}
