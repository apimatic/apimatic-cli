import { holdsOAuthAnswer } from './oauth-callback';
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

type Vendor = Exclude<keyof PortalAnalytics, 'keepQueryParams'>;
const GOOGLE = 'https://www.googletagmanager.com';

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
        // gtag.js reads only Arguments objects from the data layer, never an array of the same values.
        const gtag = (window.gtag ??= function () {
          dataLayer.push(arguments);
        });
        gtag('js', new Date());
        gtag('config', setting.measurementId, { send_page_view: false });
      },
      script: `${GOOGLE}/gtag/js?id=${encodeURIComponent(setting.measurementId)}`,
      send: (name, params) => {
        // GA4's own events, such as a scroll, read this instead of the address, which may hold more.
        if (name === 'docs_page_view') window.gtag?.('set', { page_location: params.page_location });
        // The page's gtag, since a second instance under `portal serve` never runs its setup.
        window.gtag?.('event', name.replace(/^docs_/, ''), params);
      }
    };
  }
};

/** None while the address holds an OAuth answer, which the tags read for themselves; each once, so a later call adds the rest. */
export function insertTags(live: Adapter[], scripts: PortalScript[]): void {
  if (holdsOAuthAnswer(window.location)) return;
  // A listed script is not async, so the browser runs them in the order listed, whichever arrives first.
  const wanted = [
    ...live.map(({ script: src }) => ({ src, async: true })),
    ...scripts.map(({ src }) => ({ src, async: false }))
  ];
  for (const { src, async } of wanted) {
    // Compared as written, since a selector built from a customer's address breaks on a backslash.
    const inserted = Array.from(document.head.querySelectorAll('script'), (script) => script.getAttribute('src'));
    if (inserted.includes(src)) continue;
    const script = document.createElement('script');
    script.async = async;
    script.src = src;
    document.head.append(script);
  }
}
