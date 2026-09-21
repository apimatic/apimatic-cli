export interface Portal {
  title: string;
  description: string | null;
  /** Site-relative, and inside the static directory. */
  logoUrl: string | null;
  /** Origin only, with no trailing slash. */
  siteUrl: string | null;
  /** Whether each page offers to open itself in an external AI assistant. */
  aiPageActions: boolean;
}

// The CLI substitutes the placeholder with the portal's identity when it prepares the build,
// as it does for the content directory in `source.ts`.
//
// This module is imported by the browser bundle, so it carries those four values and nothing
// else: a retained JSON module is not tree-shaken per property, so importing
// `portal.config.json` here would publish the build machine's absolute paths to every
// visitor. Those fields live in `portal.server.ts`.
export const portal = '__APIMATIC_PORTAL_IDENTITY__' as unknown as Portal;
