import path from 'node:path';
import { createOpenAPI, type OpenAPIPageData } from 'fumadocs-openapi/server';
import { bundleSpec } from './openapi-bundle.server';
import { placeCodeSamples, readCodeSamples } from './code-samples.server';
import { isJsonObject, type JsonObject } from './json';
import { operationLabels } from './openapi-labels';
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
    meta: true,
    slugify
  });
  refuseSharedPages(section.files, path.basename(file));
  return { files: section.files };
}

// Fumadocs' default, owned here so the check below names a tag's folder the way Fumadocs does.
function slugify(name: string): string {
  return name.replace(/\s+/g, '-').toLowerCase();
}

type SectionFile = Awaited<ReturnType<ReturnType<typeof createOpenAPI>['staticSource']>>['files'][number];

/**
 * Fumadocs writes a page per tag an operation lists, in the tag's folder and named after the
 * operationId, so two pages land at one path, and one is left out without a word, when two
 * operations share an operationId (or have none, and paths that read alike), or when one
 * operation lists a tag twice, or two tags that differ only in case or spacing.
 */
function refuseSharedPages(files: SectionFile[], specName: string): void {
  const pages = new Map<string, OpenAPIPageData>();
  for (const file of files) {
    if (file.type === 'meta') {
      continue;
    }
    const earlier = pages.get(file.path);
    if (earlier) {
      const folder = path.basename(path.dirname(file.path));
      throw new Error(sharedPageMessage(folder, documented(earlier), documented(file.data), specName));
    }
    pages.set(file.path, file.data);
  }
}

/** The operation or webhook a page documents, and what its page is named after. */
interface DocumentedOperation {
  label: string;
  /** Where it sits in the document: under `paths` or `webhooks`, at a path or name, under a method. */
  location: { in: 'paths' | 'webhooks'; key: string | undefined; method: string | undefined };
  operationId: string | undefined;
  tags: string[];
}

function documented(page: OpenAPIPageData): DocumentedOperation {
  const props = page.getOpenAPIPageProps();
  const document = props.payload.bundled as unknown as JsonObject;
  const [operation] = props.operations ?? [];
  const [webhook] = props.webhooks ?? [];
  const location = operation
    ? { in: 'paths' as const, key: operation.path, method: operation.method }
    : { in: 'webhooks' as const, key: webhook?.name, method: webhook?.method };
  const { operationId, tags } = operationObject(document[location.in], location.key, location.method);
  return {
    label: operationLabels(props).join(', '),
    location,
    operationId: typeof operationId === 'string' ? operationId : undefined,
    tags: Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === 'string') : []
  };
}

function operationObject(items: unknown, key: string | undefined, method: string | undefined): JsonObject {
  const item = isJsonObject(items) && key !== undefined ? items[key] : undefined;
  const operation = isJsonObject(item) && method !== undefined ? item[method] : undefined;
  return isJsonObject(operation) ? operation : {};
}

function sharedPageMessage(
  folder: string,
  earlier: DocumentedOperation,
  later: DocumentedOperation,
  specName: string
): string {
  if (sameLocation(earlier.location, later.location)) {
    return sharedTagFolderMessage(folder, earlier, specName);
  }
  const labels = [`  ${earlier.label}`, `  ${later.label}`];
  if (earlier.operationId !== undefined && earlier.operationId === later.operationId) {
    return [
      `Two operations in '${specName}' have the same operationId '${earlier.operationId}':`,
      ...labels,
      'Give each operation a unique operationId.'
    ].join('\n');
  }
  if (earlier.operationId === undefined && later.operationId === undefined) {
    return [
      `Two operations in '${specName}' have no operationId, so they would be documented on the same page:`,
      ...labels,
      'Give each operation an operationId.'
    ].join('\n');
  }
  return [
    `Two operations in '${specName}' would be documented on the same page:`,
    ...labels,
    'Give each operation a unique operationId.'
  ].join('\n');
}

function sameLocation(a: DocumentedOperation['location'], b: DocumentedOperation['location']): boolean {
  return a.in === b.in && a.key === b.key && a.method === b.method;
}

/** One operation lands twice on a page when two of its tags name the page's folder. */
function sharedTagFolderMessage(folder: string, operation: DocumentedOperation, specName: string): string {
  const tags = operation.tags.filter((tag) => slugify(tag) === folder);
  const repeated = tags.find((tag, index) => tags.indexOf(tag) !== index);
  if (repeated !== undefined) {
    return [
      `The operation ${operation.label} in '${specName}' lists the tag '${repeated}' more than once.`,
      'Remove the repeated tag.'
    ].join('\n');
  }
  if (tags.length >= 2) {
    return [
      `The operation ${operation.label} in '${specName}' lists the tags '${tags[0]}' and '${tags[1]}', which the portal shows as one section.`,
      'Rename one of them so they differ in more than case or spacing.'
    ].join('\n');
  }
  return [
    `The operation ${operation.label} in '${specName}' would be documented twice on the same page.`,
    'Give each of its tags a distinct name.'
  ].join('\n');
}
