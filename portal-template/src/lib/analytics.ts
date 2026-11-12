import { withBasePath } from './base-path';
import { oauthCallbackPath } from './oauth-callback';
import type { PortalAnalytics } from './portal-types';

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
  docs_markdown_copy: Record<never, never>;
  docs_plugin_install: Record<never, never>;
  docs_sdk_download: { language: string };
  docs_code_copy: { language: string };
  docs_search: { search_term: string; result: string; result_count: number };
  docs_not_found: { page_referrer: string };
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
        gtag('config', setting.measurementId, { send_page_view: false });
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

/**
 * The language of the code block a copy button sits in: a titled block's caption, or the selected tab's name
 * when the block is one of a tabbed set. Null for a block with neither, and for a button outside any block.
 */
export function copiedLanguage(button: Element): string | null {
  const figure = button.closest('figure');
  if (figure === null) return null;
  const tabs = figure.closest('[role="tabpanel"]')?.parentElement;
  const name = tabs
    ? tabs.querySelector('[role="tab"][aria-selected="true"]')?.textContent
    : figure.querySelector('figcaption')?.textContent;
  return name?.trim() || null;
}

/** The one instance a portal runs: started when the bundle evaluates, reporting from the root effect and the components. */
export class Analytics {
  private readonly live: Adapter[] = [];
  private started = false;
  private lastPageView: string | null = null;
  private previousPageView: string | null = null;

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
    this.previousPageView = this.lastPageView;
    this.lastPageView = page;
    this.report('docs_page_view', { page_title: document.title });
  }
  /** For a click anywhere on the page: a code block's copy button reports the copy with the block's language. */
  public reportCodeCopy(target: EventTarget | null): void {
    const button = target !== null && 'closest' in target ? (target as Element).closest('figure button') : null;
    // A block that reports its own copy, such as the install command, is not a code copy as well.
    if (button === null || button.closest('[data-copy-reported]') !== null) return;
    const language = copiedLanguage(button);
    if (language !== null) this.report('docs_code_copy', { language });
  }
  /** One search, as the dialog closes: what was typed, the result picked or '' for none, and how many were shown. */
  public reportSearch(term: string, picked: string, resultCount: number): void {
    const search_term = term.trim();
    if (search_term === '') return;
    this.report('docs_search', { search_term, result: picked, result_count: resultCount });
  }
  /** The not-found page: `page_referrer` is the portal page left for it, else the document's referrer without its query. */
  public reportNotFound(documentReferrer: string): void {
    const referrer = documentReferrer === '' ? null : new URL(documentReferrer);
    if (referrer !== null) {
      referrer.search = '';
      referrer.hash = '';
    }
    this.report('docs_not_found', { page_referrer: this.previousPageView ?? referrer?.href ?? '' });
  }
}
