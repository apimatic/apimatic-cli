import { metaSchema } from 'fumadocs-core/source/schema';

/**
 * What a `nav.json` may hold: Fumadocs' own metadata plus `tabs`, the root file's list of the
 * tabs after Home, typed as `pages` is. Fumadocs validates every metadata file against the
 * collection's schema and strips what it does not name, so without this the key would never
 * reach the transformer. Unknown keys are still stripped, so a misspelt `tab` stays the CLI's
 * to report.
 *
 * A module of its own because `defineDocs` from `fumadocs-mdx/macro` throws when its module is
 * loaded without the bundler plugin, so a test cannot import `source.ts`.
 */
export const navigationSchema: NavigationSchema = metaSchema.extend({ tabs: metaSchema.shape.pages });

// Spelled through `metaSchema` alone: the test project checks declarations, and an inferred
// type would name Zod's classes from a package this project does not depend on directly.
type NavigationSchema = ReturnType<typeof metaSchema.extend<{ tabs: typeof metaSchema.shape.pages }>>;
