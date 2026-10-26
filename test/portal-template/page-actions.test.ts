import { expect } from 'chai';
import { createServer, type Plugin, type ViteDevServer } from 'vite';

const ENTRY = 'virtual:page-actions-fixture';
const ALWAYS_OPEN_POPOVER = '\0page-actions-always-open-popover';

const fixture = `
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FrameworkProvider } from 'fumadocs-core/framework';
import { ViewOptionsPopover } from 'fumadocs-ui/layouts/notebook/page';

export function render(markdownUrl) {
  return renderToStaticMarkup(
    createElement(
      FrameworkProvider,
      { usePathname: () => '/guides/intro', useRouter: () => ({}), useParams: () => ({}) },
      createElement(ViewOptionsPopover, { markdownUrl, pageUrl: 'https://example.com/guides/intro' })
    )
  );
}
`;

const alwaysOpenPopover = `
import { createElement, Fragment } from 'react';
const passThrough = ({ children }) => createElement(Fragment, null, children);
export const Popover = passThrough;
export const PopoverTrigger = passThrough;
export const PopoverContent = passThrough;
export const PopoverClose = passThrough;
`;

function pageActionsFixture(): Plugin {
  return {
    name: 'page-actions-fixture',
    enforce: 'pre',
    resolveId(id, importer) {
      if (id === ENTRY) return `\0${ENTRY}`;
      if (id.endsWith('/components/ui/popover.js') && importer?.includes('fumadocs-ui')) return ALWAYS_OPEN_POPOVER;
      return null;
    },
    load(id) {
      if (id === `\0${ENTRY}`) return fixture;
      if (id === ALWAYS_OPEN_POPOVER) return alwaysOpenPopover;
      return null;
    }
  };
}

async function viewAsMarkdownHref(base: string, markdownUrl: string): Promise<string> {
  const server: ViteDevServer = await createServer({
    configFile: false,
    root: process.cwd(),
    base,
    logLevel: 'silent',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
    // Bundled, so Vite defines import.meta.env.BASE_URL for fumadocs-ui.
    ssr: { noExternal: ['fumadocs-ui'] },
    plugins: [pageActionsFixture()]
  });
  try {
    const { render } = (await server.ssrLoadModule(ENTRY)) as { render: (url: string) => string };
    const markup = render(markdownUrl);
    const link = /<a [^>]*href="([^"]*)"[^>]*>(?:(?!<\/a>).)*View as Markdown/s.exec(markup);
    expect(link, 'the popover renders a "View as Markdown" link').to.not.be.null;
    return link![1];
  } finally {
    await server.close();
  }
}

describe('the "View as Markdown" page action', function () {
  this.timeout(60 * 1000);

  it('links under the base path the site is built with', async () => {
    expect(await viewAsMarkdownHref('/docs/', '/guides/intro.md')).to.equal('/docs/guides/intro.md');
  });

  it('links from the root when the site is hosted there', async () => {
    expect(await viewAsMarkdownHref('/', '/guides/intro.md')).to.equal('/guides/intro.md');
  });
});
