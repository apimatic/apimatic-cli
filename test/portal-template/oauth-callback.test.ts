import { expect } from 'chai';
import { oauthCallbackPath, oauthReturnUrl } from '../../portal-template/src/lib/oauth-callback';
import { OAUTH_CALLBACK_ADDRESS } from '../../src/types/portal/content-tree';

// The CLI refuses a page of the user's at the address the template serves the callback at.
describe('oauthCallbackPath', () => {
  it('is the address the CLI keeps the content pages off', () => {
    expect(oauthCallbackPath).to.equal(OAUTH_CALLBACK_ADDRESS);
  });
});

describe('oauthReturnUrl', () => {
  const origin = 'https://docs.test';
  const pageCookie = (path: string) => `theme=dark; fumadocs-openapi-oauth=${encodeURIComponent(path)}`;

  it("sends the authorization code back to the page that started the flow, in the provider's query", () => {
    const target = oauthReturnUrl(pageCookie('/api/pets/pets/listPets'), {
      origin,
      search: '?code=abc&state=123',
      hash: ''
    });

    expect(target).to.equal('https://docs.test/api/pets/pets/listPets?code=abc&state=123');
  });

  // The implicit flow answers in the fragment, which a browser never sends to a server either.
  it("sends the implicit flow's token back in the provider's fragment", () => {
    const target = oauthReturnUrl(pageCookie('/api/pets/pets/listPets'), {
      origin,
      search: '',
      hash: '#access_token=xyz&state=123'
    });

    expect(target).to.equal('https://docs.test/api/pets/pets/listPets#access_token=xyz&state=123');
  });

  it('keeps an encoded page address as the page wrote it', () => {
    const target = oauthReturnUrl(pageCookie('/api/pets/Get%20Pets'), { origin, search: '?code=abc', hash: '' });

    expect(target).to.equal('https://docs.test/api/pets/Get%20Pets?code=abc');
  });

  it('finds no page without the cookie', () => {
    expect(oauthReturnUrl('theme=dark', { origin, search: '?code=abc', hash: '' })).to.be.null;
    expect(oauthReturnUrl('', { origin, search: '?code=abc', hash: '' })).to.be.null;
  });

  it('refuses to send the code to another site', () => {
    for (const page of ['https://evil.test/steal', '//evil.test/steal']) {
      expect(oauthReturnUrl(pageCookie(page), { origin, search: '?code=abc', hash: '' }), page).to.be.null;
    }
  });

  // As a bare path, `//evil.test/x?code=abc` would send the code to evil.test.
  it('keeps the code on this site for a page whose path reads as another site', () => {
    const target = oauthReturnUrl(pageCookie('https://docs.test//evil.test/x'), {
      origin,
      search: '?code=abc',
      hash: '#access_token=xyz'
    });

    expect(target).to.equal('https://docs.test//evil.test/x?code=abc#access_token=xyz');
  });

  it('finds no page in a cookie that is not encoded the way the playground writes it', () => {
    expect(oauthReturnUrl('fumadocs-openapi-oauth=%E0%A4%A', { origin, search: '?code=abc', hash: '' })).to.be.null;
  });
});
