import { expect } from 'chai';
import { oauthCallback, oauthCallbackPath, STARTING_PAGE_KEY } from '../../portal-template/src/lib/oauth-callback';
import { OAUTH_CALLBACK_ADDRESS } from '../../src/types/portal/content-tree';

// The CLI refuses a page of the user's at the address the template serves the callback at.
describe('oauthCallbackPath', () => {
  it('is the address the CLI keeps the content pages off', () => {
    expect(oauthCallbackPath).to.equal(OAUTH_CALLBACK_ADDRESS);
  });
});

// The playground notes the starting page under this key before it leaves (fumadocs-openapi `leavePage()`).
describe('STARTING_PAGE_KEY', () => {
  it('is the session storage key the playground writes', () => {
    expect(STARTING_PAGE_KEY).to.equal('fumadocs-openapi-oauth');
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

  it('refuses to send the code to another site', () => {
    for (const page of ['https://evil.test/steal', '//evil.test/steal']) {
      expect(oauthCallback(page, answered('?code=abc')), page).to.deep.equal({ kind: 'unknownPage' });
    }
  });
});
