import { withBasePath } from './base-path';
import { isOAuthCallbackPath } from './oauth-callback';
import type { PortalAnalytics, PortalScript } from './portal-types';

type Gtag = (...command: unknown[]) => void;

declare global {
  interface Window {
    gtag?: Gtag;
  }
}

export interface Adapter {
  setup(dataLayer: unknown[]): void;
  script: string;
  /** For a vendor that does not read the data layer itself, as GTM does. */
  send?(name: string, params: Record<string, unknown>): void;
}

type Vendor = Exclude<keyof PortalAnalytics, 'googleConsentMode' | 'keepQueryParams' | 'events'>;
const GOOGLE = 'https://www.googletagmanager.com';

/**
 * The window's gtag, when it is one. For an element whose id is `gtag`, such as a guide's heading, the browser
 * answers `window.gtag` with that element, and calling it stopped the whole bundle.
 */
function windowGtag(): Gtag | undefined {
  return typeof window.gtag === 'function' ? window.gtag : undefined;
}

/** The window's own, or one made here: Google reads only Arguments objects from the data layer, never arrays. */
function gtagFor(dataLayer: unknown[]): Gtag {
  const gtag =
    windowGtag() ??
    function () {
      dataLayer.push(arguments);
    };
  window.gtag = gtag;
  return gtag;
}

/** Ahead of every vendor's setup: Google reads a reader's answer from what is queued before its first event. */
export function queueConsentDefaults(dataLayer: unknown[]): void {
  gtagFor(dataLayer)('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    // Time for a consent tool to hand over a returning reader's answer, before the first hit goes out as denied.
    wait_for_update: 500
  });
}

/** Keyed by every vendor `PortalAnalytics` names, so a vendor without an adapter does not compile. */
export const adapters: { [V in Vendor]: (settings: PortalAnalytics) => Adapter | null } = {
  googleTagManager: ({ googleTagManager: setting }) => {
    if (setting === null) return null;
    const env = setting.environment;
    const environment = env
      ? `&gtm_auth=${encodeURIComponent(env.auth)}&gtm_preview=${encodeURIComponent(env.preview)}&gtm_cookies_win=x`
      : '';
    return {
      setup: (dataLayer) => dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' }),
      script: `${GOOGLE}/gtm.js?id=${encodeURIComponent(setting.containerId)}${environment}`
    };
  },
  googleAnalytics: ({ googleAnalytics: setting }) => {
    if (setting === null) return null;
    return {
      setup: (dataLayer) => {
        const gtag = gtagFor(dataLayer);
        gtag('js', new Date());
        gtag('config', setting.measurementId, { send_page_view: false });
      },
      script: `${GOOGLE}/gtag/js?id=${encodeURIComponent(setting.measurementId)}`,
      send: (name, params) => {
        // GA4's own events, such as a scroll, read this instead of the address, which may hold more.
        if (name === 'docs_page_view') windowGtag()?.('set', { page_location: params.page_location });
        // The window's gtag, since a second instance under `portal serve` never runs its setup.
        windowGtag()?.('event', name.replace(/^docs_/, ''), params);
      }
    };
  }
};

/** The address of every script the head already holds, as written: a host may inject one of the portal's itself. */
export function scriptsInHead(): string[] {
  return Array.from(document.head.querySelectorAll('script[src]'), (script) => script.getAttribute('src') ?? '');
}

/**
 * None on the OAuth callback, whose address holds the provider's answer; each once, so a later call adds the rest.
 * The page a sign-in returns to loads them at once, although the answer waits in the tab's session storage until
 * a playground reads it: tags read the address, not the storage, so that window is accepted. A listed script could
 * read it there, as it could anything else on the page. On a page that mounts no playground the answer stays until
 * one mounts in the tab or the tab closes, as with Fumadocs' own handler.
 */
export function insertTags(live: Adapter[], scripts: PortalScript[], inserted: Set<string>): void {
  if (isOAuthCallbackPath(window.location.pathname)) return;
  // A listed script is not async, so the browser runs them in the order listed, whichever arrives first.
  const wanted = [
    ...live.map(({ script: src }) => ({ src, async: true })),
    // A file of the portal's own is named from its root, which a host may serve under a path.
    ...scripts.map(({ src }) => ({ src: src.startsWith('/') ? withBasePath(src) : src, async: false }))
  ];
  for (const { src, async } of wanted) {
    // Remembered, not looked up in the head: a vendor's loader may take its own element out once it has run.
    if (inserted.has(src)) continue;
    inserted.add(src);
    const script = document.createElement('script');
    script.async = async;
    script.src = src;
    document.head.append(script);
  }
}
