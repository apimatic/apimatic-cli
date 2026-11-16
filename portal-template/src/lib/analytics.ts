import { isOAuthCallbackPath } from './oauth-callback';
import type { PortalAnalytics, PortalScript } from './portal-types';
import { type Adapter, adapters, insertTags } from './vendor-tags';

/** The query parameters an ad or mail platform reads from an address itself; a customer adds names and removes none. */
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
  '_hsmi'
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
  /** `status` is always text: the HTTP status in digits, or `client_error` for a request that never reached the API. */
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

  public constructor(private readonly settings: PortalAnalytics, private readonly scripts: PortalScript[]) {
    this.live = Object.values(adapters)
      .map((build) => build(settings))
      .filter((adapter) => adapter !== null);
  }

  public start(): void {
    const started = JSON.stringify([this.settings, this.scripts]);
    if (window.portalAnalyticsStarted === started) return;
    // Other vendors or scripts after a config save: only a fresh page holds exactly their tags.
    if (window.portalAnalyticsStarted !== undefined) {
      window.location.reload();
      return;
    }
    window.portalAnalyticsStarted = started;
    const dataLayer = (window.dataLayer ??= []);
    for (const adapter of this.live) adapter.setup(dataLayer);
    insertTags(this.live, this.scripts);
  }

  /** The tags held back while the address held an OAuth answer, once something has taken it out. */
  public loadTags(): void {
    insertTags(this.live, this.scripts);
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
    this.loadTags();
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
