import { metaSchema } from 'fumadocs-core/source/schema';

/**
 * Fumadocs' metadata plus the root file's `tabs`, typed as `pages` is. Fumadocs strips what the
 * collection's schema does not name, so without this the key would never reach the transformer.
 * Its own module: `defineDocs` from `fumadocs-mdx/macro` throws outside the bundler, so no test
 * can import `source.ts`.
 */
export const navigationSchema: NavigationSchema = metaSchema.extend({ tabs: metaSchema.shape.pages });

// Spelled through `metaSchema`: an inferred type would name Zod's classes, which this project
// does not depend on directly, and the test project checks declarations.
type NavigationSchema = ReturnType<typeof metaSchema.extend<{ tabs: typeof metaSchema.shape.pages }>>;
