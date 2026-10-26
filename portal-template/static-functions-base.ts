import type { Plugin } from 'vite';
import { withBasePath } from './src/lib/base-path';

/** The package whose browser half fetches a prerendered server function's result. */
const PACKAGE = /[\\/]@tanstack[\\/]start-static-server-functions[\\/]/;

/** Where it fetches that result from, opening backtick included so nothing else naming the folder matches. */
export const CACHE_ADDRESS = '`/__tsr/staticServerFnCache/';

/** Puts the browser's fetch of prerendered page data under the base, until TanStack/router#6152 does it itself. */
export function staticFunctionsBase(): Plugin {
  let base = '/';
  let found = false;
  return {
    name: 'apimatic:static-functions-base',
    apply: 'build',
    enforce: 'pre',
    // The server writes the files under the output directory, which the host already serves at the base.
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
