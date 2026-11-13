import type { PortalEventName } from './analytics';
import { isOAuthCallbackPath } from './oauth-callback';
import type { PortalAnalytics } from './portal-types';

type Gtag = (...command: unknown[]) => void;

declare global {
  interface Window {
    gtag?: Gtag;
  }
}

/** Our code for one vendor. The shared adapter suite runs against each. */
export interface Adapter {
  setup(dataLayer: unknown[]): void;
  script: string;
  /** GTM needs nothing here: it reads the data layer. */
  send(name: PortalEventName, params: Record<string, unknown>): void;
}

type Vendor = Exclude<keyof PortalAnalytics, 'keepQueryParams'>;
const GOOGLE = 'https://www.googletagmanager.com';

/**
 * Keyed by every vendor `PortalAnalytics` names, each building its adapter from the settings, or null with its vendor
 * unset: a vendor without an adapter does not compile, and an instance loads whatever the registry builds.
 */
export const adapters: { [V in Vendor]: (settings: PortalAnalytics) => Adapter | null } = {
  googleTagManager: ({ googleTagManager: setting }) => {
    if (setting === null) return null;
    const env = setting.environment;
    const environment = env
      ? `&gtm_auth=${encodeURIComponent(env.auth)}&gtm_preview=${encodeURIComponent(env.preview)}&gtm_cookies_win=x`
      : '';
    return {
      setup: (dataLayer) => dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' }),
      script: `${GOOGLE}/gtm.js?id=${encodeURIComponent(setting.containerId)}${environment}`,
      send: () => {}
    };
  },
  googleAnalytics: ({ googleAnalytics: setting }) => {
    if (setting === null) return null;
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
      script: `${GOOGLE}/gtag/js?id=${encodeURIComponent(setting.measurementId)}`,
      // GA4 gets its own names: the `docs_` prefix comes off.
      send: (name, params) => gtag('event', name.replace(/^docs_/, ''), params)
    };
  }
};

/**
 * Appends each vendor tag once, and none on the OAuth callback, whose address GTM's tags and gtag.js read for
 * themselves; a tag already in the page is left, so a page view after the callback adds only the rest.
 */
export function insertTags(live: Adapter[]): void {
  if (isOAuthCallbackPath(window.location.pathname)) return;
  for (const { script: src } of live) {
    if (document.head.querySelector(`script[src="${src}"]`) !== null) continue;
    const script = document.createElement('script');
    script.async = true;
    script.src = src;
    document.head.append(script);
  }
}
