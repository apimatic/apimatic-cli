import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { getSlugs, loader } from 'fumadocs-core/source';
import { createOpenAPI } from 'fumadocs-openapi/server';
import type { PortalConfig } from './portal-config.ts';

const CONTENT_EXTENSIONS = new Set(['.md', '.mdx']);

/**
 * Every URL the static build has to emit. TanStack Start's crawler misses links inside
 * collapsed sidebar folders and never sees the `.md` URLs the page actions fetch, so
 * the list is computed here from the same sources the site is built from.
 */
export async function prerenderPages(config: PortalConfig): Promise<{ path: string }[]> {
  const urls = new Set<string>(['/', '/api/search', '/llms.txt', '/llms-full.txt']);
  // Both need absolute URLs, so they are only emitted for a portal that declares its address.
  if (config.siteUrl) {
    urls.add('/sitemap.xml');
    urls.add('/robots.txt');
  }

  for (const url of await contentUrls(config.contentDir)) urls.add(url);
  for (const url of await openApiUrls(config.specs)) urls.add(url);

  for (const url of [...urls]) {
    if (url === '/') urls.add('/index.md');
    else if (url !== '/api/search' && !url.endsWith('.txt') && !url.endsWith('.xml')) urls.add(`${url}.md`);
  }

  return [...urls].map((url) => ({ path: url }));
}

async function contentUrls(contentDir: string): Promise<string[]> {
  const entries = await readdir(contentDir, { recursive: true, withFileTypes: true }).catch(() => []);

  return entries
    .filter((entry) => entry.isFile() && CONTENT_EXTENSIONS.has(path.extname(entry.name)))
    .map((entry) => {
      const relative = path.relative(contentDir, path.join(entry.parentPath, entry.name));
      // Same slug rules the content source applies, rather than a second implementation
      // of them: "(group)" folders drop out, "index" collapses into its parent.
      return '/' + getSlugs(relative.split(path.sep).join('/')).join('/');
    });
}

async function openApiUrls(specs: Record<string, string>): Promise<string[]> {
  const sources = Object.fromEntries(
    await Promise.all(
      Object.entries(specs).map(async ([id, file]) => {
        const server = createOpenAPI({ input: { [id]: file } });
        return [id, await server.staticSource({ baseDir: `api/${id}`, groupBy: 'tag', meta: true })];
      })
    )
  );
  if (Object.keys(sources).length === 0) return [];
  return loader(sources, { baseUrl: '/' })
    .getPages()
    .map((page) => page.url);
}
