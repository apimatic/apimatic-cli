import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { PortalSourceContext } from '../../src/types/portal-source-context';
import { PortalConfig } from '../../src/types/portal/portal-config';
import { DirectoryPath } from '../../src/types/file/directoryPath';

const OPENAPI = JSON.stringify({ openapi: '3.0.0', info: { title: 'Calc', version: '1' }, paths: {} });

describe('PortalSourceContext', () => {
  let root: string;

  // A real directory rather than mock-fs: the context reads through FileService, and the
  // YAML parser used for .yaml specs is loaded lazily, which mock-fs breaks.
  const write = (relative: string, contents: string) => {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  };

  const resolve = () => new PortalSourceContext(new DirectoryPath(root)).resolve();

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-source-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('portal.json', () => {
    it('reports a missing config, with no migration when there is no old build file', async () => {
      write('spec/api.json', OPENAPI);

      const problem = (await resolve())._unsafeUnwrapErr();

      expect(problem).to.deep.equal({ kind: 'missingConfig', migration: null });
    });

    // Editors on Windows write one, and the YAML parser strips it, so without this the same
    // document is accepted as .yaml and refused as .json.
    it('reads inputs written with a byte-order mark', async () => {
      const mark = '﻿';
      write('portal.json', mark + JSON.stringify({ title: 'Calc' }));
      write('spec/api.json', mark + OPENAPI);

      const source = (await resolve())._unsafeUnwrap();

      expect(source.config.title).to.equal('Calc');
      expect(source.specs).to.have.lengthOf(1);
    });

    it('passes the field errors through when the config is invalid', async () => {
      write('portal.json', '{}');
      write('spec/api.json', OPENAPI);

      const problem = (await resolve())._unsafeUnwrapErr();

      expect(problem.kind).to.equal('invalidConfig');
    });
  });

  describe('logo', () => {
    // parse() checks the shape of `logo`; that the image is actually there it cannot know,
    // and a logo that is not there is a broken image on every page of a successful build.
    it('reports a configured logo that is not on disk', async () => {
      write('portal.json', JSON.stringify({ title: 'Calc', logo: 'static/images/logo.png' }));
      write('spec/api.json', OPENAPI);

      const problem = (await resolve())._unsafeUnwrapErr();

      expect(problem).to.deep.equal({ kind: 'missingLogo', logoPath: 'static/images/logo.png' });
    });

    it('accepts a logo that is', async () => {
      write('portal.json', JSON.stringify({ title: 'Calc', logo: 'static/images/logo.png' }));
      write('spec/api.json', OPENAPI);
      write('static/images/logo.png', 'x');

      expect((await resolve()).isOk()).to.be.true;
    });

    it('says nothing about a logo when none is configured', async () => {
      write('portal.json', JSON.stringify({ title: 'Calc' }));
      write('spec/api.json', OPENAPI);

      expect((await resolve()).isOk()).to.be.true;
    });
  });

  describe('spec discovery', () => {
    beforeEach(() => write('portal.json', JSON.stringify({ title: 'Calc' })));

    it('accepts json, yaml and yml documents, ordered by file name', async () => {
      write('spec/b.json', OPENAPI);
      write('spec/a.yaml', 'openapi: 3.0.0\ninfo:\n  title: A\n  version: "1"\npaths: {}\n');
      write('spec/c.yml', 'openapi: 3.1.0\ninfo:\n  title: C\n  version: "1"\npaths: {}\n');

      const source = (await resolve())._unsafeUnwrap();

      expect(source.specs.map((spec) => spec.slug)).to.deep.equal(['a', 'b', 'c']);
    });

    it('ignores documents that carry no version key', async () => {
      write('spec/api.json', OPENAPI);
      write('spec/APIMATIC-META.json', JSON.stringify({ anything: true }));
      write('spec/shared-schemas.json', JSON.stringify({ components: {} }));

      const source = (await resolve())._unsafeUnwrap();

      expect(source.specs.map((spec) => spec.slug)).to.deep.equal(['api']);
    });

    it('ignores files that are not specifications at all', async () => {
      write('spec/api.json', OPENAPI);
      write('spec/notes.md', '# not a spec');

      expect((await resolve())._unsafeUnwrap().specs).to.have.lengthOf(1);
    });

    it('names a Swagger document rather than ignoring it', async () => {
      write('spec/old.json', JSON.stringify({ swagger: '2.0', info: {}, paths: {} }));

      const problem = (await resolve())._unsafeUnwrapErr();

      expect(problem).to.deep.include({ kind: 'unsupportedSpec', format: 'Swagger 2.0' });
    });

    it('names an OpenAPI version it cannot build', async () => {
      write('spec/old.json', JSON.stringify({ openapi: '2.0.0', info: {}, paths: {} }));

      expect((await resolve())._unsafeUnwrapErr()).to.deep.include({
        kind: 'unsupportedSpec',
        format: 'OpenAPI 2.0.0'
      });
    });

    it('reports a document it cannot parse', async () => {
      write('spec/broken.json', '{ not json');

      expect((await resolve())._unsafeUnwrapErr().kind).to.equal('unreadableSpec');
    });

    it('reports an empty or absent spec directory', async () => {
      expect((await resolve())._unsafeUnwrapErr().kind).to.equal('noSpecs');

      fs.mkdirSync(path.join(root, 'spec'));
      expect((await resolve())._unsafeUnwrapErr().kind).to.equal('noSpecs');
    });

    it('moves a spec aside rather than let it collide with the search route', async () => {
      // A spec mounted at /api/search would make the build write a file where that
      // route's directory already stands, failing with an EISDIR that names no spec.
      write('spec/search.json', OPENAPI);

      expect((await resolve())._unsafeUnwrap().specs[0].slug).to.equal('search-2');
    });

    it('gives colliding file names distinct slugs so neither section is lost', async () => {
      write('spec/My API.json', OPENAPI);
      write('spec/my-api.yaml', 'openapi: 3.0.0\ninfo:\n  title: A\n  version: "1"\npaths: {}\n');

      const slugs = (await resolve())._unsafeUnwrap().specs.map((spec) => spec.slug);

      expect(new Set(slugs).size).to.equal(2);
      expect(slugs).to.include('my-api');
    });
  });

  describe('optional directories', () => {
    beforeEach(() => {
      write('portal.json', JSON.stringify({ title: 'Calc' }));
      write('spec/api.json', OPENAPI);
    });

    it('reports content and static as absent when they do not exist', async () => {
      const source = (await resolve())._unsafeUnwrap();

      expect(source.contentDirectory).to.be.null;
      expect(source.staticDirectory).to.be.null;
    });

    // The static directory is copied to the site root before the generated files are
    // written there, so a file of the same name silently replaces one of them.
    it('names the static files that replace ones the build generates', async () => {
      write('static/robots.txt', 'User-agent: *');
      write('static/sitemap.xml', '<urlset/>');
      write('static/logo.png', 'x');

      const source = (await resolve())._unsafeUnwrap();

      expect(source.shadowedFiles.map(String).sort()).to.deep.equal(['robots.txt', 'sitemap.xml']);
    });

    it('reports nothing when the static directory holds only its own files', async () => {
      write('static/logo.png', 'x');

      expect((await resolve())._unsafeUnwrap().shadowedFiles).to.deep.equal([]);
    });

    it('reports them once they exist', async () => {
      write('content/index.md', '# hi');
      write('static/logo.png', 'x');

      const source = (await resolve())._unsafeUnwrap();

      expect(source.contentDirectory).to.not.be.null;
      expect(source.staticDirectory).to.not.be.null;
    });
  });

  describe('migration from APIMATIC-BUILD.json', () => {
    it('suggests a config from the old page title and logo, and names what is unsupported', async () => {
      write(
        'APIMATIC-BUILD.json',
        JSON.stringify({
          generatePortal: {
            pageTitle: 'My Portal',
            logoUrl: 'static/images/logo.png',
            navTitle: 'Nav',
            languageConfig: { http: {} }
          }
        })
      );

      const problem = (await resolve())._unsafeUnwrapErr();

      expect(problem.kind).to.equal('missingConfig');
      const migration = (problem as { migration: NonNullable<unknown> }).migration as {
        suggestedConfig: unknown;
        unsupportedFields: string[];
      };
      expect(JSON.parse(JSON.stringify(migration.suggestedConfig))).to.deep.equal({
        title: 'My Portal',
        logo: 'static/images/logo.png'
      });
      expect(migration.unsupportedFields).to.deep.equal(['languageConfig', 'navTitle']);
    });

    it('falls back to a placeholder title when the old file has none', async () => {
      write('APIMATIC-BUILD.json', JSON.stringify({ generatePortal: {} }));

      const problem = (await resolve())._unsafeUnwrapErr() as { migration: { suggestedConfig: { title: string } } };

      expect(problem.migration.suggestedConfig.title).to.equal('My API');
    });

    it('reports a versioned portal as unsupported', async () => {
      write('APIMATIC-BUILD.json', JSON.stringify({ generateVersionedPortal: {} }));

      const problem = (await resolve())._unsafeUnwrapErr() as { migration: { unsupportedFields: string[] } };

      expect(problem.migration.unsupportedFields).to.deep.equal(['generateVersionedPortal']);
    });

    it('offers no migration for a build file that configures no portal', async () => {
      write('APIMATIC-BUILD.json', JSON.stringify({ generateSdk: {} }));

      expect((await resolve())._unsafeUnwrapErr()).to.deep.equal({ kind: 'missingConfig', migration: null });
    });

    it('still offers a migration when the build file carries a byte-order mark', async () => {
      write('APIMATIC-BUILD.json', '﻿' + JSON.stringify({ generatePortal: { pageTitle: 'Acme' } }));

      const problem = (await resolve())._unsafeUnwrapErr() as {
        migration: { suggestedConfig: { title: string } } | null;
      };

      expect(problem.migration).to.not.be.null;
      expect((problem.migration as { suggestedConfig: { title: string } }).suggestedConfig.title).to.equal('Acme');
    });

    it('offers no migration for a build file it cannot parse', async () => {
      write('APIMATIC-BUILD.json', '{ broken');

      expect((await resolve())._unsafeUnwrapErr()).to.deep.equal({ kind: 'missingConfig', migration: null });
    });

    // `portal toc new`'s own removal message tells the user that meta.json replaced toc.yml,
    // so listing it as having no equivalent said the opposite.
    it('flags a table of contents rather than calling it unsupported', async () => {
      write(
        'APIMATIC-BUILD.json',
        JSON.stringify({ generatePortal: { pageTitle: 'Acme', tableOfContentsPath: 'content/toc.yml' } })
      );

      const problem = (await resolve())._unsafeUnwrapErr() as {
        migration: { hadTableOfContents: boolean; unsupportedFields: string[] };
      };

      expect(problem.migration.hadTableOfContents).to.be.true;
      expect(problem.migration.unsupportedFields).to.not.include('tableOfContentsPath');
    });

    it('does not flag one for a build file that never had it', async () => {
      write('APIMATIC-BUILD.json', JSON.stringify({ generatePortal: { pageTitle: 'Acme' } }));

      const problem = (await resolve())._unsafeUnwrapErr() as { migration: { hadTableOfContents: boolean } };

      expect(problem.migration.hadTableOfContents).to.be.false;
    });

    it('names a logo it cannot carry over instead of listing it as unsupported', async () => {
      write(
        'APIMATIC-BUILD.json',
        JSON.stringify({ generatePortal: { pageTitle: 'Acme', logoUrl: 'images/logo.png' } })
      );

      const problem = (await resolve())._unsafeUnwrapErr() as {
        migration: { unmigratableLogo: string | null; unsupportedFields: string[] };
      };

      expect(problem.migration.unmigratableLogo).to.equal('images/logo.png');
      expect(problem.migration.unsupportedFields).to.not.include('logoUrl');
    });

    it('carries a logo already inside static/ over, with nothing to report', async () => {
      write(
        'APIMATIC-BUILD.json',
        JSON.stringify({ generatePortal: { pageTitle: 'Acme', logoUrl: 'static/images/logo.png' } })
      );

      const problem = (await resolve())._unsafeUnwrapErr() as { migration: { unmigratableLogo: string | null } };

      expect(problem.migration.unmigratableLogo).to.be.null;
    });

    // The suggestion is printed for the user to paste, so anything it can produce has to be
    // something `PortalConfig.parse` accepts -- otherwise the migration hint dead-ends on the
    // very next command.
    describe('every suggestion it can produce is a config the CLI accepts', () => {
      const oldPortals: Record<string, unknown>[] = [
        { pageTitle: 'Acme', logoUrl: 'static/images/logo.png' },
        { pageTitle: 'Acme', logoUrl: 'images/logo.png' },
        { pageTitle: 'Acme', logoUrl: 'https://cdn.example.com/logo.png' },
        { pageTitle: 'Acme', logoUrl: 'static/../../secrets.png' },
        { pageTitle: 'Acme', logoUrl: 'static/' },
        { pageTitle: 'Acme', logoUrl: '   ' },
        { pageTitle: 'Acme', logoUrl: 42 },
        { pageTitle: '' },
        { pageTitle: '   ' },
        { pageTitle: 7 },
        {},
        { pageTitle: 'Acme', logoUrl: 'images/l.png', portalStyle: 'default', enableApiCopilot: true }
      ];

      oldPortals.forEach((generatePortal) => {
        it(`accepts its own suggestion for ${JSON.stringify(generatePortal)}`, async () => {
          write('APIMATIC-BUILD.json', JSON.stringify({ generatePortal }));

          const problem = (await resolve())._unsafeUnwrapErr() as { migration: { suggestedConfig: unknown } };
          // Exactly what the prompt prints for the user to paste.
          const suggestion = JSON.stringify(problem.migration.suggestedConfig, null, 2);

          expect(PortalConfig.parse(suggestion).isOk(), suggestion).to.be.true;
        });
      });
    });
  });
});
