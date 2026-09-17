import { expect } from 'chai';
import { PortalConfig } from '../../../src/types/portal/portal-config';

describe('PortalConfig', () => {
  const parse = (value: unknown) => PortalConfig.parse(JSON.stringify(value));
  const errorsOf = (result: ReturnType<typeof parse>) => result._unsafeUnwrapErr();

  describe('title', () => {
    it('accepts a document with only a title', () => {
      const config = parse({ title: 'My API' })._unsafeUnwrap();

      expect(config.title).to.equal('My API');
      expect(config.description).to.be.null;
      expect(config.logoPath()).to.be.null;
      expect(config.siteOrigin()).to.be.null;
    });

    it('trims surrounding whitespace', () => {
      expect(parse({ title: '  My API  ' })._unsafeUnwrap().title).to.equal('My API');
    });

    it('rejects a missing, empty or blank title', () => {
      for (const title of [undefined, '', '   ', 7]) {
        expect(errorsOf(parse({ title }))).to.include("'title' is required and must be a non-empty string.");
      }
    });
  });

  it('reports every invalid field at once rather than stopping at the first', () => {
    const errors = errorsOf(parse({ description: 5, logo: 'images/logo.png', siteUrl: 'https://x.test/docs' }));

    expect(errors).to.have.lengthOf(4);
  });

  it('rejects a document that is not a JSON object', () => {
    expect(PortalConfig.parse('nonsense')._unsafeUnwrapErr()).to.deep.equal(['portal.json is not valid JSON.']);
    expect(PortalConfig.parse('[]')._unsafeUnwrapErr()).to.deep.equal(['portal.json must contain a JSON object.']);
  });

  describe('logo', () => {
    it('resolves a path inside static/ to its site URL', () => {
      const config = parse({ title: 'x', logo: 'static/images/logo.png' })._unsafeUnwrap();

      expect(config.logoPath()).to.equal('static/images/logo.png');
      expect(config.logoSiteUrl()).to.equal('/images/logo.png');
    });

    it('accepts backslashes and a leading ./ from hand-written paths', () => {
      const config = parse({ title: 'x', logo: './static\\images\\logo.png' })._unsafeUnwrap();

      expect(config.logoSiteUrl()).to.equal('/images/logo.png');
    });

    it('rejects a logo outside static/, or one escaping it', () => {
      for (const logo of ['images/logo.png', 'static/', 'static/../secret.png']) {
        expect(errorsOf(parse({ title: 'x', logo })), logo).to.have.lengthOf(1);
      }
    });
  });

  describe('siteUrl', () => {
    it('keeps the origin and drops a trailing slash', () => {
      const config = parse({ title: 'x', siteUrl: 'https://docs.example.com/' })._unsafeUnwrap();

      expect(config.siteOrigin()?.toString()).to.equal('https://docs.example.com');
    });

    it('keeps an explicit port', () => {
      const config = parse({ title: 'x', siteUrl: 'https://docs.example.com:8443' })._unsafeUnwrap();

      expect(config.siteOrigin()?.toString()).to.equal('https://docs.example.com:8443');
    });

    it('rejects an address carrying a path, query or fragment', () => {
      // Anything below the origin would produce canonical links that do not resolve.
      for (const siteUrl of ['https://x.test/docs', 'https://x.test/?a=1', 'https://x.test/#top']) {
        expect(errorsOf(parse({ title: 'x', siteUrl })), siteUrl).to.have.lengthOf(1);
      }
    });

    it('rejects a non-http address', () => {
      for (const siteUrl of ['ftp://x.test', 'docs.example.com', '']) {
        expect(errorsOf(parse({ title: 'x', siteUrl })), siteUrl).to.have.lengthOf(1);
      }
    });
  });

  it('serialises back to the fields it was given', () => {
    const config = parse({
      title: 'My API',
      description: 'Docs',
      logo: 'static/logo.png',
      siteUrl: 'https://docs.example.com'
    })._unsafeUnwrap();

    expect(JSON.parse(JSON.stringify(config))).to.deep.equal({
      title: 'My API',
      description: 'Docs',
      logo: 'static/logo.png',
      siteUrl: 'https://docs.example.com'
    });
  });

  it('omits absent optional fields when serialised', () => {
    expect(JSON.parse(JSON.stringify(PortalConfig.create('My API')))).to.deep.equal({ title: 'My API' });
  });
});
