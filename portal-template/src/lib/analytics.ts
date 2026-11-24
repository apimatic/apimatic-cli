import { EventFeed } from './event-feed';
import { isOAuthCallbackPath } from './oauth-callback';
import type { PortalAnalytics, PortalScript } from './portal-types';
import { type Adapter, adapters, insertTags, queueConsentDefaults } from './vendor-tags';

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
  // Neither is named `language`: gtag takes that name on an event for the reader's own language.
  docs_sdk_download: { sdk_language: string };
  docs_code_copy: { code_language: string };
  docs_search: { search_term: string; picked_result: string; result_count: number };
  docs_not_found: { page_referrer: string };
  /** `status` is always text: the HTTP status in digits, or `client_error` for a request that never reached the API. */
  docs_api_request: { endpoint: string; status: string; duration_ms: number };
}
export type PortalEventName = keyof PortalEvents;

type DataLayerEntry = { docs: null } | { event: PortalEventName; docs: Readonly<Record<string, string | number>> };

/** A symbol, so the window holds it under no name a script comes across and builds on. */
const WINDOW_ANALYTICS = Symbol.for('apimatic.portal.analytics');

/**
 * One per `Window` object (https://developer.mozilla.org/en-US/docs/Web/API/Window), which a reload replaces.
 * Every instance in it shares this one: a config save under `portal serve` makes a second.
 */
interface WindowAnalytics {
  /** The settings and scripts the window started with. */
  started: string;
  feed: EventFeed;
  /** The address of every script the head held at the start, and of each tag and script inserted since. */
  inserted: Set<string>;
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    [WINDOW_ANALYTICS]?: WindowAnalytics;
    /** What customers' scripts are given: `subscribe()` and nothing else. */
    apimatic?: { analytics?: Pick<EventFeed, 'subscribe'> };
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
  /** The window's, once `start()` has made it or joined it: no other method reads the global. */
  private windowAnalytics: WindowAnalytics | undefined;
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
    const existing = window[WINDOW_ANALYTICS];
    if (existing !== undefined) {
      // Other vendors or scripts after a config save: only a fresh window holds exactly their tags.
      if (existing.started === started) this.windowAnalytics = existing;
      else window.location.reload();
      return;
    }
    const feed = new EventFeed();
    // Each script the head holds already, by its src as written: a host may inject one of the portal's itself.
    const head = document.head.querySelectorAll('script[src]');
    const inserted = new Set(Array.from(head, (script) => script.getAttribute('src') ?? ''));
    this.windowAnalytics = { started, feed, inserted };
    window[WINDOW_ANALYTICS] = this.windowAnalytics;
    const dataLayer = (window.dataLayer ??= []);
    if (this.settings.googleConsentMode !== null) queueConsentDefaults(dataLayer);
    for (const adapter of this.live) adapter.setup(dataLayer);
    // Ours whatever the window held there first, and `subscribe` alone, bound so a script may call it on its own.
    const analytics = Object.freeze({ subscribe: feed.subscribe.bind(feed) });
    try {
      // On the host's own object if it takes one: a copy lacks its class's methods and is not the object it holds.
      // A frozen object takes none, nor one that fixed the name.
      const host: unknown = window.apimatic;
      const property = { value: analytics, writable: true, enumerable: true, configurable: true };
      const taken = Object(host) === host && Reflect.defineProperty(host as object, 'analytics', property);
      if (!taken) window.apimatic = { ...window.apimatic, analytics };
    } catch (error) {
      // A host may have locked the name. Thrown later, so it shows in the console and the bundle goes on loading.
      setTimeout(() => {
        throw error;
      });
    }
    // The listed scripts wait for `loadScripts()`: React drops a change one makes to the page before it hydrates.
    insertTags(this.live, [], inserted);
  }

  /** From `ListedScripts`, once the page has hydrated. */
  public loadScripts(): void {
    const inserted = this.windowAnalytics?.inserted;
    if (inserted !== undefined) insertTags([], this.scripts, inserted);
  }

  /** `href` is the page the event belongs to, when the caller saw the address move on first. */
  public report<E extends PortalEventName>(name: E, params: PortalEvents[E], href = window.location.href): void {
    // A `--no-analytics` build reports nothing, even to the data layer: a container a kept script loads reads it.
    if (this.settings.events === 'off') return;
    if (isOAuthCallbackPath(new URL(href).pathname)) return;
    const docs = { ...params, page_location: pageLocation(href, this.settings.keepQueryParams) };
    const dataLayer = (window.dataLayer ??= []);
    // GTM merges every push into what it holds, so a tag would send the last event's details without this.
    dataLayer.push({ docs: null } satisfies DataLayerEntry);
    dataLayer.push({ event: name, docs } satisfies DataLayerEntry);
    for (const adapter of this.live) adapter.send?.(name, docs);
    this.windowAnalytics?.feed.publish(name, docs);
  }

  public reportPageView(): void {
    if (isOAuthCallbackPath(window.location.pathname)) return;
    const inserted = this.windowAnalytics?.inserted;
    // The tags a start on the OAuth callback left out, now that the reader has moved on from it.
    if (inserted !== undefined) insertTags(this.live, [], inserted);
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
