import { createReadStream } from 'node:fs';
import { cp, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';

/** Where the site offers the downloads: a name the user's static directory is not expected to use. */
export const DOWNLOADS_ADDRESS = '__downloads';

/**
 * Adds the SDKs and the context plugin the CLI downloaded to the site, which Vite's one
 * `publicDir` cannot, since that is the user's static directory.
 */
export function downloads(directory: string | null, basePath: string): Plugin {
  return {
    name: 'apimatic:downloads',
    async configureServer(server) {
      if (directory === null) return;
      const files = await filesByAddress(directory);
      server.middlewares.use((request, response, next) => {
        const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
        // This runs ahead of Vite's own middlewares, so the request still carries the base.
        const file = files.get(pathname.startsWith(basePath) ? pathname.slice(basePath.length) : pathname);
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

async function filesByAddress(directory: string): Promise<Map<string, string>> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const files = new Map<string, string>();
  for (const entry of entries.filter((candidate) => candidate.isFile())) {
    const file = path.join(entry.parentPath, entry.name);
    files.set(`/${DOWNLOADS_ADDRESS}/${path.relative(directory, file).split(path.sep).join('/')}`, file);
  }
  return files;
}
