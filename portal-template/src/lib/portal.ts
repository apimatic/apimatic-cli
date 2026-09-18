export interface Portal {
  title: string;
  description: string | null;
  /** Site-relative URL of the logo inside the static directory, or null. */
  logoUrl: string | null;
  /** Origin the portal is hosted at (no trailing slash), or null when unknown. */
  siteUrl: string | null;
}

// The CLI substitutes the placeholder with the portal's identity when it prepares the build,
// the same way it does for the content directory in `source.ts`.
//
// This module is imported by the browser bundle, so it carries those four values and nothing
// else. Importing `portal.config.json` here instead published the build machine's absolute
// paths -- the specification files, the content and static directories -- to every visitor,
// because a retained JSON module is not tree-shaken per property. The fields that address
// the build machine live in `portal.server.ts`, which import protection keeps out of client
// code.
export const portal = '__APIMATIC_PORTAL_IDENTITY__' as unknown as Portal;
