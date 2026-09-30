import type { Plugin } from 'vite';
import { withBasePath } from './src/lib/base-path';

/** The package whose browser half fetches a prerendered server function's result. */
const PACKAGE = /[\\/]@tanstack[\\/]start-static-server-functions[\\/]/;

/** Where it fetches that result from, opening backtick included so nothing else naming the folder matches. */
export const CACHE_ADDRESS = '`/__tsr/staticServerFnCache/';

/**
 * TanStack fetches a prerendered server function's result from the root of the host whatever
 * Vite's base is, so under a path every page reached by a link shows the not-found page
 * (TanStack/router#6152). This puts the browser's copy of that address under the base. The
 * server's copy is left alone: it writes the files by joining the address onto the output
 * directory, which is already where the host serves the base from. Delete it once #6152 ships.
 */
export function staticFunctionsBase(): Plugin {
  let base = '/';
  let found = false;
  return {
    name: 'apimatic:static-functions-base',
    apply: 'build',
    enforce: 'pre',
    applyToEnvironment: (environment) => environment.name === 'client',
    configResolved(config) {
      base = config.base;
    },
    transform: {
      filter: { id: PACKAGE, code: CACHE_ADDRESS },
      handler(code) {
        // Found at the root too, where the replacement is the address itself.
        found = true;
        return code.replaceAll(CACHE_ADDRESS, '`' + withBasePath(CACHE_ADDRESS.slice(1), base));
      }
    },
    // An upgrade that moves the address fails the build, rather than every link in the portal.
    buildEnd(error) {
      if (error === undefined && !found) {
        this.error(
          `No module of @tanstack/start-static-server-functions holds ${CACHE_ADDRESS}, so a portal ` +
            'served under a path could not load the pages its links lead to. See portal-template/static-functions-base.ts.'
        );
      }
    }
  };
}
