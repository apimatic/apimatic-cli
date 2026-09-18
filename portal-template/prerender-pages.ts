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

  const files = entries
    .filter((entry) => entry.isFile() && CONTENT_EXTENSIONS.has(path.extname(entry.name)))
    .map((entry) => {
      const relative = path.relative(contentDir, path.join(entry.parentPath, entry.name));
      const file = relative.split(path.sep).join('/');
      // Same slug rules the content source applies, rather than a second implementation
      // of them: "(group)" folders drop out, "index" collapses into its parent.
      return { slugs: getSlugs(file), isIndex: path.basename(file, path.extname(file)) === 'index' };
    });

  // `guides.md` and `guides/index.md` both collapse to "guides". The content source settles
  // that by taking the non-index files first and appending "index" to the loser, so the same
  // order has to be applied here: mapping each file on its own emitted one URL for the two
  // of them, and the page the source had moved to /guides/index was never written, while the
  // sidebar, the sitemap and llms.txt all went on linking to it.
  const taken = new Set<string>();
  const claim = (slugs: string[]): string => {
    const key = slugs.join('/');
    taken.add(key);
    return '/' + key;
  };

  const urls = files.filter((file) => !file.isIndex).map((file) => claim(file.slugs));
  for (const file of files.filter((file) => file.isIndex)) {
    urls.push(claim(taken.has(file.slugs.join('/')) ? [...file.slugs, 'index'] : file.slugs));
  }
  return urls;
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
