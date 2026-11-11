// Kept out of `portal.ts`, which imports the generated `portal.identity.json`, so the CLI's tests
// can compare these with the type the CLI writes that file from, without a prepared project.

export type PortalColorMode = 'light' | 'dark' | 'both';

export interface PortalLink {
  label: string;
  url: string;
  /** Whether it leaves the portal, which opens it in a new tab. */
  external: boolean;
}

/** Portal-relative, one per colour mode; the same URL twice when one image serves both. */
export interface PortalLogo {
  light: string;
  dark: string;
}

export interface PortalFavicon {
  /** Portal-relative, and inside the static directory. */
  url: string;
  type: string | null;
}

export interface GoogleTagManagerSetting {
  containerId: string;
  environment: { auth: string; preview: string } | null;
}

/** `debugMode` is set by the CLI under `portal serve`. */
export interface GoogleAnalyticsSetting {
  measurementId: string;
  debugMode: boolean;
}

/** Public values: they sit in every page's scripts. */
export interface PortalAnalytics {
  googleTagManager: GoogleTagManagerSetting | null;
  googleAnalytics: GoogleAnalyticsSetting | null;
  keepQueryParams: string[];
}

export interface Portal {
  name: string;
  description: string | null;
  /** The site address, with no trailing slash. */
  siteUrl: string | null;
  logo: PortalLogo | null;
  favicon: PortalFavicon | null;
  colorMode: PortalColorMode;
  links: PortalLink[];
  /** Whether each page offers to open itself in an external AI assistant. */
  pageActions: boolean;
}
