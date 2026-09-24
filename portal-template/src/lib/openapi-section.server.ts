import { createOpenAPI } from 'fumadocs-openapi/server';
import { bundleSpecification } from './openapi-bundle.server';
import { withoutInternalOperations } from './openapi-filter';
import { apiBaseDir } from './shared';

/**
 * The reference pages of one OpenAPI document, mounted under `api/<slug>`. Shared by the
 * site and the prerender list so the URLs emitted at build time are the routes that exist.
 * One server per document, because `staticSource()` emits pages for every schema its server
 * knows about, so sharing a server across sections duplicates pages.
 */
export async function openApiSection(slug: string, file: string) {
  const section = await createOpenAPI({
    input: { [slug]: async () => withoutInternalOperations(await bundleSpecification(file)) }
  }).staticSource({
    baseDir: `${apiBaseDir}/${slug}`,
    groupBy: 'tag',
    meta: true
  });
  refuseSharedPages(section.files, slug);
  return { files: section.files };
}

type SectionFile = Awaited<ReturnType<ReturnType<typeof createOpenAPI>['staticSource']>>['files'][number];

/**
 * Fumadocs names a page after its tag and operationId, so two operations sharing an operationId
 * would share a page, and one would be left out without a word.
 */
function refuseSharedPages(files: SectionFile[], slug: string): void {
  const pages = new Set<string>();
  for (const file of files) {
    if (file.type === 'meta') {
      continue;
    }
    if (pages.has(file.path)) {
      throw new Error(
        `[OpenAPI] Two operations of '${slug}' would share the page ${file.path.replaceAll('\\', '/')}, so one would be left ` +
          `out. Give each operation an operationId of its own.`
      );
    }
    pages.add(file.path);
  }
}
