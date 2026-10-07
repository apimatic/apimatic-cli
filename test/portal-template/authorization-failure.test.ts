import { expect } from 'chai';
import { createServer, type Plugin, type ViteDevServer } from 'vite';
import type { OAuthCallbackFailure } from '../../portal-template/src/lib/oauth-callback';

const ENTRY = 'virtual:authorization-failure-fixture';

const fixture = `
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AuthorizationFailure } from '/portal-template/src/components/authorization-failure.tsx';

export function render(failure) {
  return renderToStaticMarkup(createElement(AuthorizationFailure, { failure }));
}
`;

function signInFailureFixture(): Plugin {
  return {
    name: 'authorization-failure-fixture',
    enforce: 'pre',
    resolveId: (id) => (id === ENTRY ? `\0${ENTRY}` : null),
    load: (id) => (id === `\0${ENTRY}` ? fixture : null)
  };
}

/** What the reader is told, as text, and where its one link goes. */
interface Shown {
  text: string;
  link: { label: string; href: string };
}

describe('the OAuth callback when it cannot complete the authorization', function () {
  this.timeout(60 * 1000);

  let server: ViteDevServer;
  let render: (failure: OAuthCallbackFailure) => string;

  before(async () => {
    server = await createServer({
      configFile: false,
      root: process.cwd(),
      logLevel: 'silent',
      appType: 'custom',
      server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      optimizeDeps: { noDiscovery: true, include: [] },
      plugins: [signInFailureFixture()]
    });
    ({ render } = (await server.ssrLoadModule(ENTRY)) as { render: typeof render });
  });

  after(() => server.close());

  const shown = (failure: OAuthCallbackFailure): Shown => {
    const markup = render(failure);
    const link = /<a [^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/s.exec(markup);
    expect(link, 'the page offers a way on').to.not.be.null;
    return { text: readable(markup), link: { label: readable(link![2]), href: link![1] } };
  };

  it("names the provider's error and its description, with a link back to the starting page", () => {
    const page = 'https://docs.test/api/pets/pets/listPets';

    expect(
      shown({ kind: 'providerError', error: 'access_denied', description: 'The user said no.', page })
    ).to.deep.equal({
      text: 'Authorization could not be completed The provider ended the authorization with access_denied: The user said no. Back to the endpoint',
      link: { label: 'Back to the endpoint', href: page }
    });
  });

  // `server_error` is no refusal, so the wording fits every code the provider can send.
  it("names the provider's error alone when the provider gives no description", () => {
    const { text } = shown({
      kind: 'providerError',
      error: 'server_error',
      description: null,
      page: 'https://docs.test/'
    });

    expect(text).to.contain('The provider ended the authorization with server_error.');
  });

  it('says no authorization was started in this browser, and leads to the home page', () => {
    expect(shown({ kind: 'notStarted' })).to.deep.equal({
      text:
        "Authorization could not be completed This page completes an authorization started from an endpoint's playground, and none " +
        "was started in this browser. Open the endpoint's page and authorize from there. Go to the home page",
      link: { label: 'Go to the home page', href: '/' }
    });
  });

  it('says the authorization was not started from a page of this site, and leads to the home page', () => {
    expect(shown({ kind: 'unknownPage' })).to.deep.equal({
      text:
        'Authorization could not be completed The authorization was not started from a page of this site, so it cannot be ' +
        "completed here. Open the endpoint's page and authorize from there. Go to the home page",
      link: { label: 'Go to the home page', href: '/' }
    });
  });
});

/** Markup as the reader sees it: tags dropped, each block apart, entities spelled out. */
function readable(markup: string): string {
  return markup
    .replace(/<\/(h1|p)>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}
