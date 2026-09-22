import { expect } from 'chai';
import { PortalConfig } from '../../../src/types/portal/portal-config';
import { UrlPath } from '../../../src/types/file/urlPath';

describe('PortalConfig', () => {
  // Through JSON so the block is what a file would hand over: `undefined` fields dropped.
  const parse = (value: unknown) => PortalConfig.fromBlock(JSON.parse(JSON.stringify(value)));
  const errorsOf = (result: ReturnType<typeof parse>) => result._unsafeUnwrapErr();

  describe('title', () => {
    it('accepts a document with only a title', () => {
      const config = parse({ title: 'My API' })._unsafeUnwrap();

      expect(config.siteTitle()).to.equal('My API');
      expect(config.siteDescription()).to.be.null;
      expect(config.logoPath()).to.be.null;
      expect(config.siteOrigin()).to.be.null;
    });

    it('trims surrounding whitespace', () => {
      expect(parse({ title: '  My API  ' })._unsafeUnwrap().siteTitle()).to.equal('My API');
    });

    it('rejects a missing, empty or blank title', () => {
      for (const title of [undefined, '', '   ', 7]) {
        expect(errorsOf(parse({ title }))).to.include("'portal.title' is required and must be a non-empty string.");
      }
    });
  });

  it('reports every invalid field at once rather than stopping at the first', () => {
    const errors = errorsOf(parse({ description: 5, logo: 'images/logo.png', siteUrl: 'https://x.test/docs' }));

    expect(errors).to.have.lengthOf(4);
  });

  describe('aiPageActions', () => {
    // Each page offers to open itself in ChatGPT, Claude, Cursor or Scira. A portal
    // published under someone else's brand carries that endorsement, so it can be refused.
    it('is on unless the document turns it off', () => {
      expect(parse({ title: 'Calc' })._unsafeUnwrap().offersAiPageActions()).to.be.true;
      expect(parse({ title: 'Calc', aiPageActions: true })._unsafeUnwrap().offersAiPageActions()).to.be.true;
    });

    it('is off when the document says so', () => {
      expect(parse({ title: 'Calc', aiPageActions: false })._unsafeUnwrap().offersAiPageActions()).to.be.false;
    });

    it('rejects a value that is not a boolean', () => {
      expect(parse({ title: 'Calc', aiPageActions: 'no' })._unsafeUnwrapErr()).to.deep.equal([
        "'portal.aiPageActions' must be true or false."
      ]);
    });

    it('serialises only when it differs from the default', () => {
      expect(JSON.parse(JSON.stringify(parse({ title: 'Calc' })._unsafeUnwrap()))).to.not.have.property(
        'aiPageActions'
      );
      expect(
        JSON.parse(JSON.stringify(parse({ title: 'Calc', aiPageActions: false })._unsafeUnwrap()))
      ).to.have.property('aiPageActions', false);
    });
  });

  describe('description', () => {
    it('trims surrounding whitespace', () => {
      expect(parse({ title: 'x', description: '  Docs  ' })._unsafeUnwrap().siteDescription()).to.equal('Docs');
    });

    it('treats a blank description as none at all', () => {
      for (const description of ['', '   ', '\n\t']) {
        expect(parse({ title: 'x', description })._unsafeUnwrap().siteDescription(), JSON.stringify(description)).to.be
          .null;
      }
    });
  });

  describe('unknown settings', () => {
    it('rejects a setting it does not know', () => {
      const errors = parse({ title: 'Calc', favicon: 'x.ico' })._unsafeUnwrapErr();

      expect(errors).to.deep.equal(["'favicon' is not a 'portal' setting."]);
    });

    it('names the setting a near miss means', () => {
      const errors = parse({ title: 'Calc', url: 'https://docs.example.com' })._unsafeUnwrapErr();

      expect(errors).to.deep.equal(["'url' is not a 'portal' setting; did you mean 'siteUrl'?"]);
    });

    // `JSON.parse` will happily hand back a document keyed by a prototype member.
    it('does not quote a prototype member back as the intended setting', () => {
      const errors = PortalConfig.fromBlock(JSON.parse('{"title":"Calc","toString":"x"}'))._unsafeUnwrapErr();

      expect(errors).to.deep.equal(["'toString' is not a 'portal' setting."]);
    });

    it('reports every unknown setting, alongside the invalid ones', () => {
      const errors = parse({ pageTitle: 'Calc', theme: {} })._unsafeUnwrapErr();

      expect(errors).to.have.lengthOf(3);
      expect(errors).to.include("'pageTitle' is not a 'portal' setting.");
      expect(errors).to.include("'theme' is not a 'portal' setting.");
      expect(errors).to.include("'portal.title' is required and must be a non-empty string.");
    });

    it('accepts a document using only the settings it knows', () => {
      const config = parse({
        title: 'Calc',
        description: 'A calculator.',
        logo: 'static/images/logo.png',
        siteUrl: 'https://docs.test'
      });

      expect(config.isOk()).to.be.true;
    });
  });

  describe('the block itself', () => {
    it('is required', () => {
      expect(PortalConfig.fromBlock(undefined)._unsafeUnwrapErr()).to.deep.equal(["'portal' is required."]);
    });

    it('must be a JSON object, and says so rather than calling a present block missing', () => {
      for (const block of ['Calc', [], null, 7]) {
        expect(PortalConfig.fromBlock(block)._unsafeUnwrapErr(), JSON.stringify(block)).to.deep.equal([
          "'portal' must be a JSON object."
        ]);
      }
    });
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

  describe('identity', () => {
    it('resolves the logo to its site URL and the address to its origin', () => {
      const config = PortalConfig.create(
        'My API',
        'Docs',
        'static/images/logo.png',
        new UrlPath('https://docs.example.com'),
        false
      );

      expect(config.identity()).to.deep.equal({
        title: 'My API',
        description: 'Docs',
        logoUrl: '/images/logo.png',
        siteUrl: 'https://docs.example.com',
        aiPageActions: false
      });
    });

    it('reports absent settings as null rather than leaving them out', () => {
      expect(PortalConfig.create('My API').identity()).to.deep.equal({
        title: 'My API',
        description: null,
        logoUrl: null,
        siteUrl: null,
        aiPageActions: true
      });
    });
  });
});
