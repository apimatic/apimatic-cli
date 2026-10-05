import { expect } from 'chai';
import { oauthReturnUrl } from '../../portal-template/src/lib/oauth-callback';

describe('oauthReturnUrl', () => {
  const origin = 'https://docs.test';
  const pageCookie = (path: string) => `theme=dark; fumadocs-openapi-oauth=${encodeURIComponent(path)}`;

  it("sends the authorization code back to the page that started the flow, in the provider's query", () => {
    const target = oauthReturnUrl(pageCookie('/api/pets/pets/listPets'), {
      origin,
      search: '?code=abc&state=123',
      hash: ''
    });

    expect(target).to.equal('/api/pets/pets/listPets?code=abc&state=123');
  });

  // The implicit flow answers in the fragment, which a browser never sends to a server either.
  it("sends the implicit flow's token back in the provider's fragment", () => {
    const target = oauthReturnUrl(pageCookie('/api/pets/pets/listPets'), {
      origin,
      search: '',
      hash: '#access_token=xyz&state=123'
    });

    expect(target).to.equal('/api/pets/pets/listPets#access_token=xyz&state=123');
  });

  it('keeps an encoded page address as the page wrote it', () => {
    const target = oauthReturnUrl(pageCookie('/api/pets/Get%20Pets'), { origin, search: '?code=abc', hash: '' });

    expect(target).to.equal('/api/pets/Get%20Pets?code=abc');
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

  it('finds no page in a cookie that is not encoded the way the playground writes it', () => {
    expect(oauthReturnUrl('fumadocs-openapi-oauth=%E0%A4%A', { origin, search: '?code=abc', hash: '' })).to.be.null;
  });
});
