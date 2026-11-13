import { expect } from 'chai';
import type { SecuritySchemeObject } from 'fumadocs-openapi';
import { requestOAuthToken } from 'fumadocs-openapi/playground';
import {
  isOAuthCallbackPath,
  oauthCallback,
  oauthCallbackPath,
  takeStartingPage
} from '../../portal-template/src/lib/oauth-callback';
import { OAUTH_CALLBACK_ADDRESS } from '../../src/types/portal/content-tree';

// The CLI refuses a page of the user's at the address the template serves the callback at.
describe('oauthCallbackPath', () => {
  it('is the address the CLI keeps the content pages off', () => {
    expect(oauthCallbackPath).to.equal(OAUTH_CALLBACK_ADDRESS);
  });
});

/**
 * The playground notes the page under a key of its own before it leaves for the provider, and the
 * callback takes the note from the same place. The playground's flow is run here, in a stand-in
 * tab, so a move of the note, as 12.5.7 made from a cookie, fails this test and not a portal.
 */
describe('isOAuthCallbackPath', () => {
  it('is the callback at the root, and under a base path', () => {
    expect(isOAuthCallbackPath('/oauth/callback')).to.be.true;
    expect(isOAuthCallbackPath('/docs/oauth/callback', '/docs/')).to.be.true;
  });

  // A static host may answer `/oauth/callback` at `/oauth/callback/`.
  it('is the callback with a trailing slash', () => {
    expect(isOAuthCallbackPath('/oauth/callback/')).to.be.true;
    expect(isOAuthCallbackPath('/docs/oauth/callback/', '/docs/')).to.be.true;
  });

  it('is not the callback at the root when the portal is under a base path, nor any other page', () => {
    expect(isOAuthCallbackPath('/oauth/callback', '/docs/')).to.be.false;
    expect(isOAuthCallbackPath('/guides/quickstart')).to.be.false;
    expect(isOAuthCallbackPath('/oauth/callback/more')).to.be.false;
  });
});

describe('takeStartingPage', () => {
  const origin = 'https://docs.test';
  const pathname = '/api/pets/pets/listPets';
  const scheme: SecuritySchemeObject = {
    type: 'oauth2',
    flows: {
      authorizationCode: {
        authorizationUrl: 'https://provider.test/authorize',
        tokenUrl: 'https://provider.test/token',
        scopes: {}
      }
    }
  };
  // As the template starts a flow: the callback page as the redirect URL, see `api-page.tsx`.
  const flow = {
    schemeId: 'oauth',
    scopes: [],
    clientId: 'client',
    serverUrl: 'https://api.test',
    redirectUrl: oauthCallbackPath
  };

  const tab = globalThis as Record<string, unknown>;
  const before: Record<string, unknown> = {};
  let storage: Map<string, string>;
  let leftFor: URL | undefined;

  beforeEach(() => {
    storage = new Map();
    leftFor = undefined;
    for (const name of ['sessionStorage', 'window']) before[name] = tab[name];
    tab.sessionStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key)
    };
    tab.window = { location: { origin, pathname, replace: (url: URL) => void (leftFor = url) } };
  });

  afterEach(() => {
    for (const name of ['sessionStorage', 'window']) {
      if (before[name] === undefined) delete tab[name];
      else tab[name] = before[name];
    }
  });

  it("sends the provider's answer back to the page the playground noted before it left", async () => {
    await requestOAuthToken(scheme, 'authorizationCode', flow);
    expect(leftFor?.origin, 'left for the provider').to.equal('https://provider.test');
    expect(leftFor?.searchParams.get('redirect_uri')).to.equal(`${origin}${oauthCallbackPath}`);
    const state = leftFor?.searchParams.get('state');

    const callback = oauthCallback(takeStartingPage(), { origin, search: `?code=abc&state=${state}`, hash: '' });

    expect(callback).to.deep.equal({ kind: 'return', url: `${origin}${pathname}?code=abc&state=${state}` });
  });

  it('takes the note once', async () => {
    await requestOAuthToken(scheme, 'authorizationCode', flow);

    expect(takeStartingPage()).to.equal(pathname);
    expect(takeStartingPage()).to.equal(null);
  });
});

describe('oauthCallback', () => {
  const origin = 'https://docs.test';
  const answered = (search: string, hash = '') => ({ origin, search, hash });

  it("sends the authorization code back to the page that started the flow, in the provider's query", () => {
    const callback = oauthCallback('/api/pets/pets/listPets', answered('?code=abc&state=123'));

    expect(callback).to.deep.equal({
      kind: 'return',
      url: 'https://docs.test/api/pets/pets/listPets?code=abc&state=123'
    });
  });

  // The implicit flow answers in the fragment, which a browser never sends to a server either.
  it("sends the implicit flow's token back in the provider's fragment", () => {
    const callback = oauthCallback('/api/pets/pets/listPets', answered('', '#access_token=xyz&state=123'));

    expect(callback).to.deep.equal({
      kind: 'return',
      url: 'https://docs.test/api/pets/pets/listPets#access_token=xyz&state=123'
    });
  });

  // The playground notes `location.pathname`, which the browser has already percent-encoded.
  it('keeps an encoded page path as the playground wrote it', () => {
    const callback = oauthCallback('/api/pets/Get%20Pets', answered('?code=abc'));

    expect(callback).to.deep.equal({ kind: 'return', url: 'https://docs.test/api/pets/Get%20Pets?code=abc' });
  });

  // As a bare path, `//evil.test/x?code=abc` would send the code to evil.test.
  it('keeps the code on this site for a page whose path reads as another site', () => {
    const callback = oauthCallback('https://docs.test//evil.test/x', answered('?code=abc', '#access_token=xyz'));

    expect(callback).to.deep.equal({ kind: 'return', url: 'https://docs.test//evil.test/x?code=abc#access_token=xyz' });
  });

  // The playground's own return handling finds no code or token in it, and says nothing.
  it("stays to show the provider's error, in the query, with a way back to the page", () => {
    const callback = oauthCallback(
      '/api/pets/listPets',
      answered('?error=access_denied&error_description=The+user+said+no&state=123')
    );

    expect(callback).to.deep.equal({
      kind: 'providerError',
      error: 'access_denied',
      description: 'The user said no',
      page: 'https://docs.test/api/pets/listPets'
    });
  });

  it("stays to show the implicit flow's error, in the fragment, without a description it was not given", () => {
    const callback = oauthCallback('/api/pets/listPets', answered('', '#error=access_denied&state=123'));

    expect(callback).to.deep.equal({
      kind: 'providerError',
      error: 'access_denied',
      description: null,
      page: 'https://docs.test/api/pets/listPets'
    });
  });

  it('says no authorization was started without a noted page', () => {
    expect(oauthCallback(null, answered('?code=abc'))).to.deep.equal({ kind: 'notStarted' });
  });

  // Anyone can link here, so an error and its description are only shown for an authorization this tab started.
  it("shows no provider's error for an authorization this tab did not start", () => {
    const callback = oauthCallback(null, answered('?error=access_denied&error_description=Call+this+number'));

    expect(callback).to.deep.equal({ kind: 'notStarted' });
  });

  // The last is the path of a page at `//a b/x`, which does not read as an address at all.
  it('refuses to send the code to another site, or to a page that does not read as one', () => {
    for (const page of ['https://evil.test/steal', '//evil.test/steal', '//a%20b/x']) {
      expect(oauthCallback(page, answered('?code=abc')), page).to.deep.equal({ kind: 'unknownPage' });
    }
  });
});
