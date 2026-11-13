import { isOAuthCallbackPath } from './oauth-callback';
import type { PortalAnalytics } from './portal-types';
import { type Adapter, adapters, insertTags } from './vendor-tags';

/** The query parameters attribution reads from an address: campaign, ad-click and cross-domain tags. */
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

/** Customers' GTM triggers match these names, so renaming or removing one breaks them without an error. */
export interface PortalEvents {
  docs_page_view: { page_title: string };
  docs_markdown_copy: Record<string, never>;
  docs_plugin_install: Record<string, never>;
  docs_sdk_download: { language: string };
  docs_code_copy: { language: string };
  docs_search: { search_term: string; result: string; result_count: number };
  docs_not_found: { page_referrer: string };
  docs_api_request: { endpoint: string; status: string; duration_ms: number };
}
export type PortalEventName = keyof PortalEvents;

type DataLayerEntry = { docs: null } | { event: PortalEventName; docs: Readonly<Record<string, string | number>> };

declare global {
  interface Window {
    dataLayer?: unknown[];
    /** Held by the window: a config save under `portal serve` evaluates this module again. */
    portalAnalyticsStarted?: string;
  }
}

/** The address as reported: no `#` part, and no query but the kept tags. */
export function pageLocation(href: string, keep: readonly string[]): string {
  const url = new URL(href);
  url.search = new URLSearchParams(
    [...url.searchParams].filter(
      ([name]) => KEPT_PREFIXES.some((prefix) => name.startsWith(prefix)) || KEPT_NAMES.has(name) || keep.includes(name)
    )
  ).toString();
  url.hash = '';
  return url.href;
}

export class Analytics {
  private readonly live: Adapter[];
  private lastPageView: string | null = null;
  private previousPageView: string | null = null;
  private lastNotFound: string | null = null;

  public constructor(private readonly settings: PortalAnalytics) {
    this.live = Object.values(adapters)
      .map((build) => build(settings))
      .filter((adapter) => adapter !== null);
  }

  public start(): void {
    const settings = JSON.stringify(this.settings);
    if (window.portalAnalyticsStarted === settings) return;
    // Other vendors after a config save: only a fresh page holds exactly their tags.
    if (window.portalAnalyticsStarted !== undefined) {
      window.location.reload();
      return;
    }
    window.portalAnalyticsStarted = settings;
    const dataLayer = (window.dataLayer ??= []);
    for (const adapter of this.live) adapter.setup(dataLayer);
    insertTags(this.live);
  }

  /** `href` is the page the event belongs to, when the caller saw the address move on first. */
  public report<E extends PortalEventName>(name: E, params: PortalEvents[E], href = window.location.href): void {
    if (isOAuthCallbackPath(new URL(href).pathname)) return;
    const docs = { ...params, page_location: pageLocation(href, this.settings.keepQueryParams) };
    const dataLayer = (window.dataLayer ??= []);
    // GTM merges every push into what it holds, so a tag would send the last event's details without this.
    dataLayer.push({ docs: null } satisfies DataLayerEntry);
    dataLayer.push({ event: name, docs } satisfies DataLayerEntry);
    for (const adapter of this.live) adapter.send?.(name, docs);
  }

  public reportPageView(): void {
    if (isOAuthCallbackPath(window.location.pathname)) return;
    // The tags held back on the OAuth callback start here, on the first page after it.
    insertTags(this.live);
    const page = pageLocation(window.location.href, this.settings.keepQueryParams);
    if (page === this.lastPageView) return;
    this.previousPageView = this.lastPageView;
    this.lastPageView = page;
    if (this.lastNotFound !== page) this.lastNotFound = null;
    this.report('docs_page_view', { page_title: document.title });
  }

  public reportNotFound(): void {
    const page = pageLocation(window.location.href, this.settings.keepQueryParams);
    if (page === this.lastNotFound) return;
    this.lastNotFound = page;
    const referrer = document.referrer === '' ? null : new URL(document.referrer);
    if (referrer !== null) {
      referrer.search = '';
      referrer.hash = '';
    }
    // The missing page's own view may be reported before this or after it.
    const left = this.lastPageView === page ? this.previousPageView : this.lastPageView;
    this.report('docs_not_found', { page_referrer: left ?? referrer?.href ?? '' });
  }
}
