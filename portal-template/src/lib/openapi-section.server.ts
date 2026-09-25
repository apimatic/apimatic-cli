import { createOpenAPI } from 'fumadocs-openapi/server';
import { bundleSpecification } from './openapi-bundle.server';
import { placeCodeSamples, readCodeSamples } from './code-samples.server';
import { withoutInternalOperations } from './openapi-filter';
import { apiBaseDir } from './shared';

/**
 * The reference pages of one OpenAPI document, mounted under `api/<slug>`. Shared by the
 * site and the prerender list so the URLs emitted at build time are the routes that exist.
 * One server per document, because `staticSource()` emits pages for every schema its server
 * knows about, so sharing a server across sections duplicates pages.
 */
export async function openApiSection(slug: string, file: string, codeSamplesFile: string | null) {
  const load = async () =>
    placeCodeSamples(withoutInternalOperations(await bundleSpecification(file)), await readCodeSamples(codeSamplesFile));
  const section = await createOpenAPI({ input: { [slug]: load } }).staticSource({
    baseDir: `${apiBaseDir}/${slug}`,
    groupBy: 'tag',
    meta: true
  });
  refuseSharedPages(section.files, slug);
  return { files: section.files };
}

type SectionFile = Awaited<ReturnType<ReturnType<typeof createOpenAPI>['staticSource']>>['files'][number];

/**
 * Fumadocs writes a page per tag an operation lists, named after the tag and the operationId, so
 * two operations sharing an operationId, or one listing a tag twice, would put two pages at one
 * path, and one would be left out without a word.
 */
function refuseSharedPages(files: SectionFile[], slug: string): void {
  const pages = new Set<string>();
  for (const file of files) {
    if (file.type === 'meta') {
      continue;
    }
    if (pages.has(file.path)) {
      throw new Error(
        `[OpenAPI] '${slug}' would put two pages at ${file.path.replaceAll('\\', '/')}, so one would be left out. ` +
          `Give each operation an operationId of its own, and list each of its tags once.`
      );
    }
    pages.add(file.path);
  }
}
