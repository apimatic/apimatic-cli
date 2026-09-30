import { expect } from 'chai';
import { SiteAddress } from '../../../../src/types/portal/config/site-address';

describe('SiteAddress', () => {
  const SETTING = 'portal.site.url';

  const address = (value: string) => SiteAddress.parse(value, SETTING)._unsafeUnwrap();
  const refusal = (value: unknown) => SiteAddress.parse(value, SETTING)._unsafeUnwrapErr();

  describe('parse', () => {
    it('reads an address at the root of its host', () => {
      for (const value of ['https://docs.example.com', 'https://docs.example.com/', ' http://docs.example.com:8443 ']) {
        expect(address(value).path(), value).to.equal('/');
        expect(address(value).hasPath(), value).to.be.false;
      }
      expect(address('https://Docs.Example.com/').toString()).to.equal('https://docs.example.com');
    });

    it('reads the path an address carries, keeping its case and dropping one trailing slash', () => {
      const cases: [string, string, string][] = [
        ['https://acme.github.io/docs', 'https://acme.github.io/docs', '/docs/'],
        ['https://acme.github.io/docs/', 'https://acme.github.io/docs', '/docs/'],
        [
          'https://example.com/Docs/v2.1/api_ref~x-y',
          'https://example.com/Docs/v2.1/api_ref~x-y',
          '/Docs/v2.1/api_ref~x-y/'
        ],
        ['https://example.com/...', 'https://example.com/...', '/.../']
      ];
      for (const [value, site, path] of cases) {
        expect(address(value).toString(), value).to.equal(site);
        expect(address(value).path(), value).to.equal(path);
        expect(address(value).hasPath(), value).to.be.true;
      }
    });

    it('refuses what is not a web address', () => {
      for (const value of ['ftp://x.test', 'x.test', 'https:x.test', 'https://', '', 7]) {
        expect(refusal(value), String(value)).to.deep.equal([
          `'${SETTING}' must be the address the portal is hosted at, for example 'https://docs.example.com' or 'https://example.com/docs'.`
        ]);
      }
    });

    // As written: the URL parser would read the backslash as a slash and drop the empty query.
    it('refuses a query, a fragment or a backslash, naming it', () => {
      const cases: [string, string][] = [
        ['https://x.test/docs?', '?'],
        ['https://x.test/?a=1', '?'],
        ['https://x.test/docs#', '#'],
        ['https://x.test/docs\\guides', '\\']
      ];
      for (const [value, character] of cases) {
        expect(refusal(value), value).to.deep.equal([
          `'${SETTING}' cannot contain '${character}'. Give the address the portal is hosted at, for example 'https://example.com/docs'.`
        ]);
      }
    });

    it('refuses an empty part in the path, beyond one trailing slash', () => {
      for (const value of [
        'https://x.test//docs',
        'https://x.test/docs//x',
        'https://x.test/docs//',
        'https://x.test//'
      ]) {
        expect(refusal(value), value).to.deep.equal([`'${SETTING}' has an empty part ('//') in its path.`]);
      }
    });

    it('refuses a part of the path that would be spelled differently once encoded or resolved, naming it', () => {
      const cases: [string, string][] = [
        ['https://x.test/docs/.', '.'],
        ['https://x.test/docs/../x', '..'],
        ['https://x.test/my%20docs', 'my%20docs'],
        ['https://x.test/my docs', 'my docs'],
        ['https://x.test/bücher', 'bücher']
      ];
      for (const [value, segment] of cases) {
        expect(refusal(value), value).to.deep.equal([
          `'${SETTING}' has '${segment}' in its path. Each part between '/'s can use only letters, digits, '.', '_', '~' and '-', and cannot be '.' or '..'.`
        ]);
      }
    });
  });
});
