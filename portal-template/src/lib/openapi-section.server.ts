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
  const baseDir = `${apiBaseDir}/${slug}`;
  const section = await createOpenAPI({ input: { [slug]: load } }).staticSource({
    baseDir,
    groupBy: 'tag',
    meta: true,
    slugify
  });
  refuseUnnamedPages(section.files, path.basename(file));
  refuseSharedPages(section.files, path.basename(file));
  refuseSharedFolders(section.files, baseDir, path.basename(file));
  return { files: section.files };
}

/** What a Windows folder name cannot hold, and what a URL path segment cannot hold unescaped. */
const UNSAFE_IN_PATH = /[<>:"/\\|?*#%{}[\]^`\p{Cc}]/gu;

/**
 * A tag's folder, and so its URL. Fumadocs' default only turns whitespace into dashes, so
 * 'Component: Price Points' became a folder Windows cannot create. An unsafe character is
 * read as a space, and dots are trimmed: Windows drops a trailing one, and '..' climbs out.
 */
function slugify(name: string): string {
  return name
    .replace(UNSAFE_IN_PATH, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase();
}

type SectionFile = Awaited<ReturnType<ReturnType<typeof createOpenAPI>['staticSource']>>['files'][number];

/** A webhook without an operationId is named after its slug, and an empty one reads as its folder's index. */
function refuseUnnamedPages(files: SectionFile[], specName: string): void {
  for (const file of files) {
    if (file.type !== 'meta' && path.basename(file.path) === '.mdx') {
      const { location } = documented(file.data);
      throw new Error(
        [
          `The webhook '${location.key}' in '${specName}' has no operationId, and no character in its name the portal can use in a URL.`,
          'Give it an operationId.'
        ].join('\n')
      );
    }
  }
}

/**
 * Fumadocs writes a page per tag an operation lists, in the tag's folder and named after the
 * operationId, so two pages land at one path, and one is left out without a word, when two
 * operations share an operationId (or have none, and paths that read alike), or when one
 * operation lists a tag twice, or two tags that differ only in case, spacing or punctuation.
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
      'Rename one of them so they differ in more than case, spacing or punctuation.'
    ].join('\n');
  }
  return [
    `The operation ${operation.label} in '${specName}' would be documented twice on the same page.`,
    'Give each of its tags a distinct name.'
  ].join('\n');
}

/**
 * Fumadocs groups by a tag's name but names the folder after its slug, so two tags that slugify
 * alike, on different operations, write two metas into one folder. One replaces the other, and
 * the operations it listed drop out of the sidebar without a word.
 */
function refuseSharedFolders(files: SectionFile[], baseDir: string, specName: string): void {
  const metas = new Set<string>();
  for (const file of files) {
    if (file.type !== 'meta') {
      continue;
    }
    if (metas.has(file.path)) {
      const folder = path.join(path.relative(baseDir, path.dirname(file.path)));
      const parents = tagParents(files);
      const tags = [...parents.keys()].filter((tag) => folderOf(tag, parents) === folder);
      throw new Error(sharedFolderMessage(folder.split(path.sep).join('/'), tags, specName));
    }
    metas.add(file.path);
  }
}

/** The tags the document declares, then those its operations list without declaring them, each with its parent. */
function tagParents(files: SectionFile[]): Map<string, string | undefined> {
  const parents = new Map<string, string | undefined>();
  for (const file of files) {
    if (file.type === 'meta') {
      continue;
    }
    const { tags } = file.data.getOpenAPIPageProps().payload.bundled as unknown as JsonObject;
    for (const tag of Array.isArray(tags) ? tags : []) {
      if (isJsonObject(tag) && typeof tag.name === 'string') {
        parents.set(tag.name, typeof tag.parent === 'string' ? tag.parent : undefined);
      }
    }
    for (const tag of documented(file.data).tags) {
      if (!parents.has(tag)) {
        parents.set(tag, undefined);
      }
    }
  }
  return parents;
}

/** Where Fumadocs files a tag: its slug, inside its parent's folder. */
function folderOf(tag: string, parents: Map<string, string | undefined>, seen = new Set<string>()): string {
  seen.add(tag);
  const parent = parents.get(tag);
  const above = parent !== undefined && !seen.has(parent) ? folderOf(parent, parents, seen) : '';
  return path.join(above, slugify(tag));
}

function sharedFolderMessage(folder: string, tags: string[], specName: string): string {
  // A tag with an empty slug is filed in its parent's folder, or the section's own.
  const unnamed = tags.find((tag) => slugify(tag) === '');
  if (unnamed !== undefined) {
    return [
      `The tag '${unnamed}' in '${specName}' has no character the portal can use in a URL or a folder name.`,
      'Rename it.'
    ].join('\n');
  }
  const [first, second] = tags;
  if (second !== undefined) {
    return [
      `The tags '${first}' and '${second}' in '${specName}' would share the folder '${folder}', so the portal would show only one of them.`,
      'Rename one of them so they differ in more than case, spacing or punctuation.'
    ].join('\n');
  }
  // Fumadocs files the operations that list no tag under 'unknown'.
  return [
    `The tag '${first ?? folder}' in '${specName}' would share the folder '${folder}' with the operations that have no tag.`,
    'Rename the tag, or tag those operations.'
  ].join('\n');
}
