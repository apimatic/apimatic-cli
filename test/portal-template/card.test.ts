import { expect } from 'chai';
import { createServer, type Plugin, type ViteDevServer } from 'vite';

const ENTRY = 'virtual:card-fixture';
const IDENTITY = '\0card-fixture-identity';

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
const identity = `export default ${JSON.stringify({
  analytics: { googleTagManager: null, googleAnalytics: null, googleConsentMode: null },
  scripts: []
})};`;

function cardFixture(): Plugin {
  return {
    name: 'card-fixture',
    enforce: 'pre',
    resolveId(id) {
      if (id === ENTRY) return `\0${ENTRY}`;
      if (id.endsWith('/portal.identity.json')) return IDENTITY;
      return null;
    },
    load(id) {
      if (id === `\0${ENTRY}`) return fixture;
      if (id === IDENTITY) return identity;
      return null;
    }
  };
}

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

/** Cards as a portal built under `base` renders them, from a server started before the block's cases. */
function cardsUnder(base: string): (props: CardProps) => Shown {
  let server: ViteDevServer;
  let render: (props: CardProps) => string;

  before(async () => {
    server = await createServer({
      configFile: false,
      root: process.cwd(),
      base,
      resolve: { tsconfigPaths: true },
      logLevel: 'silent',
      appType: 'custom',
      server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      optimizeDeps: { noDiscovery: true, include: [] },
      plugins: [cardFixture()]
    });
    ({ render } = (await server.ssrLoadModule(ENTRY)) as { render: typeof render });
  });

  after(() => server.close());

  return (props) => {
    const link = /<a [^>]*>/.exec(render(props));
    expect(link, 'the card renders a link').to.not.be.null;
    return {
      href: /\shref="([^"]*)"/.exec(link![0])![1],
      router: link![0].includes('data-router'),
      newTab: link![0].includes('target="_blank"')
    };
  };
}

describe("an author's Card", function () {
  this.timeout(60 * 1000);

  describe('in a portal under a path', () => {
    const shown = cardsUnder('/docs/');

    it("links one of the portal's files under the path, still in a new tab", () => {
      expect(shown({ title: 'Agent-Friendly Docs', href: '/llms.txt', external: true })).to.deep.equal({
        href: '/docs/llms.txt',
        router: false,
        newTab: true
      });
      expect(shown({ title: 'Guide', href: '/guides/intro.md', external: true }).href).to.equal(
        '/docs/guides/intro.md'
      );
    });

    it('leaves any other address as the author wrote it', () => {
      for (const href of ['/pricing', 'https://example.com/llms.txt', '//cdn.example.com/llms.txt', '/docs/llms.txt']) {
        expect(shown({ title: 'Elsewhere', href, external: true }).href, href).to.equal(href);
      }
    });

    // The router adds the path to its own links.
    it('hands a card not marked external to the router as written', () => {
      for (const href of ['/sdks', '/llms.txt']) {
        expect(shown({ title: 'Inside', href }), href).to.deep.equal({ href, router: true, newTab: false });
      }
    });
  });

  describe('in a portal at the root of its host', () => {
    const shown = cardsUnder('/');

    it("links one of the portal's files as written", () => {
      expect(shown({ title: 'Agent-Friendly Docs', href: '/llms.txt', external: true }).href).to.equal('/llms.txt');
    });
  });
});
