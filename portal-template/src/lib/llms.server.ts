import type * as PageTree from 'fumadocs-core/page-tree';
import { llms } from 'fumadocs-core/source';
import { stringify } from 'yaml';
import { getMDXComponents } from '@/components/mdx';
import { withBasePath } from './base-path';
import { operationLabels } from './openapi-labels';
import { slimOpenAPIPageProps } from './openapi-slim';
import { source } from './source.server';
import { portal } from './portal';

type PortalPage = ReturnType<typeof source.getPages>[number];
type ReferencePage = Extract<PortalPage, { type: 'openapi' }>;

// `llms()` links each page by its tree node's URL and has no base of its own; titles are found by `$ref`.
const index = llms({ ...source, getPageTree: (locale?: string) => servedTree(source.getPageTree(locale)) });

function servedTree(root: PageTree.Root): PageTree.Root {
  return { ...root, children: root.children.map(servedNode) };
}

function servedNode(node: PageTree.Node): PageTree.Node {
  if (node.type === 'page') return { ...node, url: withBasePath(node.url) };
  if (node.type === 'folder') {
    return {
      ...node,
      index: node.index && { ...node.index, url: withBasePath(node.index.url) },
      children: node.children.map(servedNode)
    };
  }
  return node;
}

export async function renderPage(page: PortalPage): Promise<string> {
  return await render(page, true);
}

export async function renderIndex(): Promise<string> {
  return await index.index();
}

// The specifications stay out: each page's would repeat every schema it shares with the others.
export async function renderFull(): Promise<string> {
  const pages = await Promise.all(source.getPages().map((page) => render(page, false)));
  return pages.join('\n\n');
}

async function render(page: PortalPage, withSpecification: boolean): Promise<string> {
  return page.type === 'openapi' ? renderReference(page, withSpecification) : await renderContent(page);
}

export function renderHome(): string {
  return `# ${portal.name}\n\n${portal.description ?? ''}`.trimEnd() + '\n';
}

async function renderContent(page: Exclude<PortalPage, ReferencePage>): Promise<string> {
  return `# ${page.data.title} (${withBasePath(page.url)})\n\n${await page.data.getText('processed', { components: getMDXComponents() })}`;
}

/** An operation's page, with the part of its specification that page renders: what an assistant reads best. */
function renderReference(page: ReferencePage, withSpecification: boolean): string {
  const props = slimOpenAPIPageProps(page.data.getOpenAPIPageProps());
  const endpoints = operationLabels(props, (signature) => `\`${signature}\``);
  const sections = [
    `# ${page.data.title} (${withBasePath(page.url)})`,
    endpoints.join('\n'),
    page.data.description ?? ''
  ];
  if (withSpecification) {
    // Its tags and the document's description are the portal's to show, and would come with every operation.
    const { info, tags: _tags, ...document } = props.payload.bundled as Record<string, unknown> & {
      info?: { title?: string; version?: string };
    };
    const specification = { ...document, info: { title: info?.title, version: info?.version } };
    sections.push('```yaml\n' + stringify(specification, { aliasDuplicateObjects: false }) + '```');
  }
  return sections.filter((section) => section.length > 0).join('\n\n');
}
