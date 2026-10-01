import { expect } from 'chai';
import { createServer, type Plugin, type ViteDevServer } from 'vite';

const ENTRY = 'virtual:page-actions-fixture';
const POPOVER_STUB = '\0page-actions-popover-stub';

/**
 * Renders the page actions the content route renders, for a page whose Markdown companion is
 * at `markdownUrl`. The popover is stubbed to render its content inline, as an open popover
 * would, so the links can be read off the server-rendered markup.
 */
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

const popoverStub = `
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
      if (id.endsWith('/components/ui/popover.js') && importer?.includes('fumadocs-ui')) return POPOVER_STUB;
      return null;
    },
    load(id) {
      if (id === `\0${ENTRY}`) return fixture;
      if (id === POPOVER_STUB) return popoverStub;
      return null;
    }
  };
}

/** The `href` of the popover's "View as Markdown" link when the site is built with `base`. */
async function viewAsMarkdownHref(base: string, markdownUrl: string): Promise<string> {
  const server: ViteDevServer = await createServer({
    configFile: false,
    root: process.cwd(),
    base,
    logLevel: 'silent',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, ws: false },
    // Externalized, fumadocs-ui would be loaded by Node as is, and `import.meta.env.BASE_URL`
    // -- what the page actions prefix their links with -- would never be defined.
    ssr: { noExternal: ['fumadocs-ui'] },
    plugins: [pageActionsFixture()]
  });
  try {
    const { render } = (await server.ssrLoadModule(ENTRY)) as { render: (url: string) => string };
    const markup = render(markdownUrl);
    const link = /<a href="([^"]*)"[^>]*>(?:(?!<\/a>).)*View as Markdown/s.exec(markup);
    expect(link, 'the popover renders a "View as Markdown" link').to.not.be.null;
    return link![1];
  } finally {
    await server.close();
  }
}

// fuma-nama/fumadocs#3620: from 16.15.13 the link was handed out as given, so a portal hosted
// under a path sent the reader to the host's root, where the Markdown companion is not.
describe('the "View as Markdown" page action', function () {
  this.timeout(60 * 1000);

  it('links under the base path the site is built with', async () => {
    expect(await viewAsMarkdownHref('/docs/', '/guides/intro.md')).to.equal('/docs/guides/intro.md');
  });

  it('links from the root when the site is hosted there', async () => {
    expect(await viewAsMarkdownHref('/', '/guides/intro.md')).to.equal('/guides/intro.md');
  });
});
