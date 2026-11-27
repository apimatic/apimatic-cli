import { expect } from 'chai';
import { renderedUnder, type StandIn } from '../helpers/template-render';

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

const alwaysOpenPopover: StandIn = {
  replaces: (id, importer) => id.endsWith('/components/ui/popover.js') && !!importer?.includes('fumadocs-ui'),
  source: `
import { createElement, Fragment } from 'react';
const passThrough = ({ children }) => createElement(Fragment, null, children);
export const Popover = passThrough;
export const PopoverTrigger = passThrough;
export const PopoverContent = passThrough;
export const PopoverClose = passThrough;
`
};

/** Where the popover's "View as Markdown" link goes, in a portal built under `base`. */
function viewAsMarkdownHref(base: string): (markdownUrl: string) => string {
  // Bundled, so Vite defines import.meta.env.BASE_URL for fumadocs-ui.
  const render = renderedUnder<[string]>(base, fixture, { standIns: [alwaysOpenPopover], bundled: ['fumadocs-ui'] });

  return (markdownUrl) => {
    const link = /<a [^>]*href="([^"]*)"[^>]*>(?:(?!<\/a>).)*View as Markdown/s.exec(render(markdownUrl));
    expect(link, 'the popover renders a "View as Markdown" link').to.not.be.null;
    return link![1];
  };
}

describe('the "View as Markdown" page action', function () {
  this.timeout(60 * 1000);

  describe('in a portal under a path', () => {
    const href = viewAsMarkdownHref('/docs/');

    it('links under the base path the site is built with', () => {
      expect(href('/guides/intro.md')).to.equal('/docs/guides/intro.md');
    });
  });

  describe('in a portal at the root of its host', () => {
    const href = viewAsMarkdownHref('/');

    it('links from the root when the site is hosted there', () => {
      expect(href('/guides/intro.md')).to.equal('/guides/intro.md');
    });
  });
});
