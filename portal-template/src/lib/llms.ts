import { llms } from 'fumadocs-core/source';
import { source } from './source';
import { portal } from './portal';

type PortalPage = ReturnType<typeof source.getPages>[number];

const index = llms(source);

export async function renderPage(page: PortalPage): Promise<string> {
  if (page.type !== 'docs') return `# ${page.data.title}\n\n${page.data.description ?? ''}`;
  return `# ${page.data.title} (${page.url})\n\n${await page.data.getText('processed')}`;
}

export function renderIndex(): string {
  return index.index();
}

// Deliberately cheap per page: dumping the bundled spec for every OpenAPI page would
// make this file balloon to hundreds of megabytes.
export async function renderFull(): Promise<string> {
  const pages = await Promise.all(source.getPages().map(renderPage));
  return pages.join('\n\n');
}

export function renderHome(): string {
  return `# ${portal.title}\n\n${portal.description ?? ''}`.trimEnd() + '\n';
}
