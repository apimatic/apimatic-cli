// Kept out of `portal.ts`, which imports the generated `portal.identity.json`, so the CLI's tests
// can compare these with the type the CLI writes that file from, without a prepared project.

export type PortalLayout = 'docs' | 'notebook' | 'notebook-navbar' | 'glass';

export type PortalColorMode = 'light' | 'dark' | 'both';

export interface PortalLink {
  label: string;
  url: string;
  /** Whether it leaves the portal, which opens it in a new tab. */
  external: boolean;
}

/** Site-relative, one per colour mode; the same URL twice when one image serves both. */
export interface PortalLogo {
  light: string;
  dark: string;
}

export interface PortalFavicon {
  /** Site-relative, and inside the static directory. */
  url: string;
  type: string | null;
}

export interface Portal {
  name: string;
  description: string | null;
  /** Origin only, with no trailing slash. */
  siteUrl: string | null;
  logo: PortalLogo | null;
  favicon: PortalFavicon | null;
  /** The Google Fonts stylesheet, or null when both families are the system's own. */
  fontsUrl: string | null;
  layout: PortalLayout;
  colorMode: PortalColorMode;
  links: PortalLink[];
  homeCta: PortalLink | null;
  /** Whether each page offers to open itself in an external AI assistant. */
  pageActions: boolean;
}
