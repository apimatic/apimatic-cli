import path from 'node:path';
import { createOpenAPI, type OpenAPIPageData } from 'fumadocs-openapi/server';
import { bundleSpec } from './openapi-bundle.server';
import { placeCodeSamples, readCodeSamples } from './code-samples.server';
import { isJsonObject, type JsonObject } from './json';
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
    placeCodeSamples(withoutInternalOperations(await bundleSpec(file)), await readCodeSamples(codeSamplesFile));
  const section = await createOpenAPI({ input: { [slug]: load } }).staticSource({
    baseDir: `${apiBaseDir}/${slug}`,
    groupBy: 'tag',
    meta: true
  });
  refuseSharedPages(section.files, path.basename(file));
  return { files: section.files };
}

type SectionFile = Awaited<ReturnType<ReturnType<typeof createOpenAPI>['staticSource']>>['files'][number];

/** An operation or webhook as the spec's author knows it. */
interface Endpoint {
  label: string;
  operationId: unknown;
  tags: unknown[];
}

/**
 * Fumadocs writes a page per tag an operation lists, named after the tag and the operationId, so
 * two operations sharing an operationId, or one listing a tag twice, would put two pages at one
 * path, and one would be left out without a word.
 */
function refuseSharedPages(files: SectionFile[], specName: string): void {
  const pages = new Map<string, Endpoint>();
  for (const file of files) {
    if (file.type === 'meta') {
      continue;
    }
    const endpoint = endpointOf(file.data);
    const earlier = pages.get(file.path);
    if (earlier) {
      throw new Error(sharedPageMessage(earlier, endpoint, specName));
    }
    pages.set(file.path, endpoint);
  }
}

function endpointOf(page: OpenAPIPageData): Endpoint {
  const { payload, operations = [], webhooks = [] } = page.getOpenAPIPageProps();
  const document = payload.bundled as unknown as JsonObject;
  const [operation] = operations;
  if (operation) {
    return endpoint(document.paths, operation.path, operation.method, `${operation.method.toUpperCase()} ${operation.path}`);
  }
  const [webhook] = webhooks;
  return endpoint(document.webhooks, webhook.name, webhook.method, `${webhook.method.toUpperCase()} ${webhook.name} (webhook)`);
}

function endpoint(items: unknown, key: string, method: string, label: string): Endpoint {
  const item = isJsonObject(items) ? items[key] : undefined;
  const operation = isJsonObject(item) ? item[method] : undefined;
  const fields = isJsonObject(operation) ? operation : {};
  return { label, operationId: fields.operationId, tags: Array.isArray(fields.tags) ? fields.tags : [] };
}

function sharedPageMessage(earlier: Endpoint, later: Endpoint, specName: string): string {
  const repeatedTag = earlier.tags.find((tag, index) => earlier.tags.indexOf(tag) !== index);
  if (earlier.label === later.label && repeatedTag !== undefined) {
    return [
      `The operation ${earlier.label} in '${specName}' lists the tag '${repeatedTag}' more than once.`,
      'Remove the repeated tag, then run the command again.'
    ].join('\n');
  }
  if (earlier.label !== later.label && earlier.operationId !== undefined && earlier.operationId === later.operationId) {
    return [
      `Two operations in '${specName}' have the same operationId '${earlier.operationId}':`,
      `  ${earlier.label}`,
      `  ${later.label}`,
      'Give each operation a unique operationId, then run the command again.'
    ].join('\n');
  }
  return [
    `Two operations in '${specName}' would be documented on the same page:`,
    `  ${earlier.label}`,
    `  ${later.label}`,
    'Give each operation a unique operationId and each tag a distinct name, then run the command again.'
  ].join('\n');
}
