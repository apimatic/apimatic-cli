import { expect } from 'chai';
import { oauthCallback, oauthCallbackPath } from '../../portal-template/src/lib/oauth-callback';
import { OAUTH_CALLBACK_ADDRESS } from '../../src/types/portal/content-tree';

// The CLI refuses a page of the user's at the address the template serves the callback at.
describe('oauthCallbackPath', () => {
  it('is the address the CLI keeps the content pages off', () => {
    expect(oauthCallbackPath).to.equal(OAUTH_CALLBACK_ADDRESS);
  });
});

describe('oauthCallback', () => {
  const origin = 'https://docs.test';
  const pageCookie = (path: string) => `theme=dark; fumadocs-openapi-oauth=${encodeURIComponent(path)}`;
  const answered = (search: string, hash = '') => ({ origin, search, hash });

  it("sends the authorization code back to the page that started the flow, in the provider's query", () => {
    const callback = oauthCallback(pageCookie('/api/pets/pets/listPets'), answered('?code=abc&state=123'));

    expect(callback).to.deep.equal({
      kind: 'return',
      url: 'https://docs.test/api/pets/pets/listPets?code=abc&state=123'
    });
  });

  // The implicit flow answers in the fragment, which a browser never sends to a server either.
  it("sends the implicit flow's token back in the provider's fragment", () => {
    const callback = oauthCallback(pageCookie('/api/pets/pets/listPets'), answered('', '#access_token=xyz&state=123'));

    expect(callback).to.deep.equal({
      kind: 'return',
      url: 'https://docs.test/api/pets/pets/listPets#access_token=xyz&state=123'
    });
  });

  it('keeps an encoded page address as the page wrote it', () => {
    const callback = oauthCallback(pageCookie('/api/pets/Get%20Pets'), answered('?code=abc'));

    expect(callback).to.deep.equal({ kind: 'return', url: 'https://docs.test/api/pets/Get%20Pets?code=abc' });
  });

  // As a bare path, `//evil.test/x?code=abc` would send the code to evil.test.
  it('keeps the code on this site for a page whose path reads as another site', () => {
    const callback = oauthCallback(
      pageCookie('https://docs.test//evil.test/x'),
      answered('?code=abc', '#access_token=xyz')
    );

    expect(callback).to.deep.equal({ kind: 'return', url: 'https://docs.test//evil.test/x?code=abc#access_token=xyz' });
  });

  // The playground's own return handling finds no code or token in it, and says nothing.
  it("stays to show the provider's error, in the query, with a way back to the page", () => {
    const callback = oauthCallback(
      pageCookie('/api/pets/listPets'),
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
    const callback = oauthCallback(pageCookie('/api/pets/listPets'), answered('', '#error=access_denied&state=123'));

    expect(callback).to.deep.equal({
      kind: 'providerError',
      error: 'access_denied',
      description: null,
      page: 'https://docs.test/api/pets/listPets'
    });
  });

  it('says no authorization was started without the cookie', () => {
    expect(oauthCallback('theme=dark', answered('?code=abc'))).to.deep.equal({ kind: 'notStarted' });
    expect(oauthCallback('', answered('?code=abc'))).to.deep.equal({ kind: 'notStarted' });
  });

  // Anyone can link here, so an error and its description are only shown for an authorization this browser started.
  it("shows no provider's error for an authorization this browser did not start", () => {
    const callback = oauthCallback('', answered('?error=access_denied&error_description=Call+this+number'));

    expect(callback).to.deep.equal({ kind: 'notStarted' });
  });

  it('refuses to send the code to another site', () => {
    for (const page of ['https://evil.test/steal', '//evil.test/steal']) {
      expect(oauthCallback(pageCookie(page), answered('?code=abc')), page).to.deep.equal({ kind: 'unknownPage' });
    }
  });

  it('refuses a cookie that is not encoded the way the playground writes it', () => {
    const callback = oauthCallback('fumadocs-openapi-oauth=%E0%A4%A', answered('?code=abc'));

    expect(callback).to.deep.equal({ kind: 'unknownPage' });
  });
});
