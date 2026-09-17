import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { PortalSourceContext } from '../../src/types/portal-source-context';
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

    it('passes the field errors through when the config is invalid', async () => {
      write('portal.json', '{}');
      write('spec/api.json', OPENAPI);

      const problem = (await resolve())._unsafeUnwrapErr();

      expect(problem.kind).to.equal('invalidConfig');
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

    it('offers no migration for a build file it cannot parse', async () => {
      write('APIMATIC-BUILD.json', '{ broken');

      expect((await resolve())._unsafeUnwrapErr()).to.deep.equal({ kind: 'missingConfig', migration: null });
    });
  });
});
