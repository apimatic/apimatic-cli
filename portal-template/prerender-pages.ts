import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { getSlugs, loader } from 'fumadocs-core/source';
import type { PortalConfig } from './portal-config.ts';
import { openApiSection } from './src/lib/openapi-section.server';

const CONTENT_EXTENSIONS = new Set(['.md', '.mdx']);

/**
 * Every URL the static build has to emit. TanStack Start's crawler misses links inside
 * collapsed sidebar folders and never sees the `.md` URLs the page actions fetch, so
 * the list is computed here from the same sources the site is built from.
 */
export async function prerenderPages(config: PortalConfig, siteUrl: string | null): Promise<{ path: string }[]> {
  const urls = new Set<string>(['/', '/api/search.json', '/llms.txt', '/llms-full.txt']);
  // Both need absolute URLs, so they are only emitted for a portal that declares its address.
  if (siteUrl) {
    urls.add('/sitemap.xml');
    urls.add('/robots.txt');
  }

  for (const url of await contentUrls(config.contentDir)) urls.add(url);
  for (const url of await openApiUrls(config.specs)) urls.add(url);

  // The copy is load-bearing, not redundant: this loop adds to `urls`, and a `Set` visits
  // entries added during iteration, so iterating `urls` itself would suffix the `.md` URLs it
  // creates in turn -- `/guides.md.md` and on, never terminating.
  for (const url of [...urls]) {
    if (url === '/') urls.add('/index.md');
    else if (!/\.(txt|xml|json)$/.test(url)) urls.add(`${url}.md`);
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
      // The content source's own slug rules, not a second implementation: "(group)" folders
      // drop out, "index" collapses into its parent.
      return { slugs: getSlugs(file), isIndex: path.basename(file, path.extname(file)) === 'index' };
    });

  // `guides.md` and `guides/index.md` both collapse to "guides". The content source settles
  // that by taking the non-index files first and appending "index" to the loser, so the same
  // order has to hold here or the page it moves to /guides/index is never written.
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

// Through the same sections as the site, so an internal operation gets no page here either.
async function openApiUrls(specs: Record<string, string>): Promise<string[]> {
  const sources = Object.fromEntries(
    await Promise.all(Object.entries(specs).map(async ([id, file]) => [id, await openApiSection(id, file)]))
  );
  if (Object.keys(sources).length === 0) return [];
  return loader(sources, { baseUrl: '/' })
    .getPages()
    .map((page) => page.url);
}
