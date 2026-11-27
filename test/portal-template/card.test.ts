import { expect } from 'chai';
import { renderedUnder, type StandIn } from '../helpers/template-render';

// The router's link marks itself, so a card it renders can be told from Fumadocs' plain link.
const fixture = `
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FrameworkProvider } from 'fumadocs-core/framework';
import { getMDXComponents } from '/portal-template/src/components/mdx.tsx';

const RouterLink = ({ prefetch, ...props }) => createElement('a', { ...props, 'data-router': '' });

export function render(props) {
  const { Card } = getMDXComponents();
  return renderToStaticMarkup(
    createElement(
      FrameworkProvider,
      { Link: RouterLink, usePathname: () => '/', useRouter: () => ({}), useParams: () => ({}) },
      createElement(Card, props)
    )
  );
}
`;

// The generated file `portal.ts` imports, with what the components read from it when loaded.
const identity: StandIn = {
  replaces: (id) => id.endsWith('/portal.identity.json'),
  source: `export default ${JSON.stringify({
    analytics: { googleTagManager: null, googleAnalytics: null, googleConsentMode: null },
    scripts: []
  })};`
};

interface CardProps {
  title: string;
  href: string;
  external?: boolean;
}

/** Where a card leads, whether the router renders it, and whether it opens a new tab. */
interface Shown {
  href: string;
  router: boolean;
  newTab: boolean;
}

describe("an author's Card in a portal under a path", function () {
  this.timeout(60 * 1000);

  const render = renderedUnder<[CardProps]>('/docs/', fixture, { standIns: [identity] });

  const shown = (props: CardProps): Shown => {
    const link = /<a [^>]*>/.exec(render(props));
    expect(link, 'the card renders a link').to.not.be.null;
    return {
      href: /\shref="([^"]*)"/.exec(link![0])![1],
      router: link![0].includes('data-router'),
      newTab: link![0].includes('target="_blank"')
    };
  };

  it('links under the path when marked external, still in a new tab', () => {
    expect(shown({ title: 'Agent-Friendly Docs', href: '/llms.txt', external: true })).to.deep.equal({
      href: '/docs/llms.txt',
      router: false,
      newTab: true
    });
  });

  // The router adds the path to its own links.
  it('hands a card not marked external to the router as written', () => {
    expect(shown({ title: 'SDKs', href: '/sdks' })).to.deep.equal({ href: '/sdks', router: true, newTab: false });
  });
});
