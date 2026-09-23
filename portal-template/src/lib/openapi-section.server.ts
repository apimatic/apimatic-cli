import { createOpenAPI } from 'fumadocs-openapi/server';
import type { ApiOptions } from '../../portal-config';
import { bundleSpecification } from './openapi-bundle.server';
import { withoutHiddenOperations } from './openapi-filter';
import { apiBaseDir } from './shared';

/**
 * The reference pages of one OpenAPI document, mounted under `api/<slug>`. Shared by the
 * site and the prerender list so the URLs emitted at build time are the routes that exist.
 * One server per document, because `staticSource()` emits pages for every schema its server
 * knows about, so sharing a server across sections duplicates pages.
 *
 * The operations `portal.api` leaves out are removed from the bundled document before any
 * page is generated from it, so Fumadocs is handed the document already filtered.
 */
export async function openApiSection(slug: string, file: string, api: ApiOptions) {
  const section = await createOpenAPI({
    input: { [slug]: async () => withoutHiddenOperations(await bundleSpecification(file), api) }
  }).staticSource({
    baseDir: `${apiBaseDir}/${slug}`,
    groupBy: api.groupBy,
    meta: true
  });
  return { files: withOneFilePerPath(section.files, slug) };
}

type SectionFile = Awaited<ReturnType<ReturnType<typeof createOpenAPI>['staticSource']>>['files'][number];

/**
 * Grouped by route, the operations on `/` form a folder named '' -- the section itself -- so
 * Fumadocs writes two `meta.json` there. The section's lists that folder as '', which names
 * nothing, and whichever the loader keeps leaves the other's pages out of the sidebar. They are
 * merged, the '' entry giving way to the pages it stood for. Two operations with one page, a
 * path and a webhook of one name, would have one silently dropped, so that is refused.
 */
function withOneFilePerPath(files: SectionFile[], slug: string): SectionFile[] {
  const pages = new Set<string>();
  const metas = new Map<string, SectionFile[]>();
  const out: SectionFile[] = [];
  for (const file of files) {
    if (file.type === 'meta') {
      const shared = metas.get(file.path);
      if (shared) {
        shared.push(file);
        continue;
      }
      metas.set(file.path, [file]);
    } else if (pages.has(file.path)) {
      throw new Error(
        `[OpenAPI] Two operations of '${slug}' would share the page ${file.path.replaceAll('\\', '/')}, so one would be left ` +
          `out. Group the reference by 'tag' or 'none' in portal.api.groupBy.`
      );
    } else {
      pages.add(file.path);
    }
    out.push(file);
  }
  return out.map((file) => {
    const shared = file.type === 'meta' ? metas.get(file.path) : undefined;
    return shared === undefined || shared.length === 1 ? file : mergedMeta(shared);
  });
}

type MetaData = { title?: string; description?: string; pages: string[] };

// The outer one lists the inner as '', and is emitted last, after the folders it holds.
function mergedMeta(shared: SectionFile[]): SectionFile {
  const [outer, ...inner] = [...shared].reverse();
  const innerPages = inner.flatMap((file) => (file.data as MetaData).pages);
  const data = outer.data as MetaData;
  const merged: MetaData = {
    ...data,
    title: data.title || inner.map((file) => (file.data as MetaData).title).find(Boolean),
    pages: data.pages.flatMap((page) => (page === '' ? innerPages : [page]))
  };
  return { ...outer, data: merged } as SectionFile;
}
