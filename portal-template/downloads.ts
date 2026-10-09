import { createReadStream } from 'node:fs';
import { cp, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';
import { withBasePath } from './src/lib/base-path';

/** Where the site offers the downloads: a name the user's static directory is not expected to use. */
export const DOWNLOADS_ADDRESS = '__downloads';

/**
 * Adds the SDKs and the context plugin the CLI downloaded to the site, which Vite's one
 * `publicDir` cannot, since that is the user's static directory.
 */
export function downloads(directory: string | null): Plugin {
  return {
    name: 'apimatic:downloads',
    async configureServer(server) {
      if (directory === null) return;
      // Under the base only, as once built: this runs ahead of Vite's own base handling.
      const files = await filesByAddress(directory, server.config.base);
      server.middlewares.use((request, response, next) => {
        const file = files.get(decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname));
        if (file === undefined) return next();
        response.setHeader('Content-Type', 'application/zip');
        createReadStream(file).pipe(response);
      });
    },
    async writeBundle(options) {
      if (directory === null || this.environment.name !== 'client' || options.dir === undefined) return;
      await cp(directory, path.join(options.dir, DOWNLOADS_ADDRESS), { recursive: true });
    }
  };
}

async function filesByAddress(directory: string, base: string): Promise<Map<string, string>> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const files = new Map<string, string>();
  for (const entry of entries.filter((candidate) => candidate.isFile())) {
    const file = path.join(entry.parentPath, entry.name);
    const address = `/${DOWNLOADS_ADDRESS}/${path.relative(directory, file).split(path.sep).join('/')}`;
    files.set(withBasePath(address, base), file);
  }
  return files;
}
