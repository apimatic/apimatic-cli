import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import sinon from 'sinon';
import { parse as parseYaml } from 'yaml';
import { FileService } from '../../src/infrastructure/file-service';
import { PortalSourceContext } from '../../src/types/portal-source-context';
import { PortalConfig } from '../../src/types/portal/portal-config';
import { PortalMigration, PortalSource, PortalSourceProblem } from '../../src/types/portal/portal-source';
import { DirectoryPath } from '../../src/types/file/directoryPath';
import { FileName } from '../../src/types/file/fileName';
import { FilePath } from '../../src/types/file/filePath';
import { ZipService } from '../../src/infrastructure/zip-service';

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

  /** The ignored navigation files as the warning names them, relative to the source directory. */
  const ignored = (source: PortalSource): string[] =>
    source.ignoredNavigationFiles.map((file) => file.relativeTo(new DirectoryPath(root)));

  /** The hidden pages as the warning names them, relative to the source directory. */
  const hidden = (source: PortalSource): string[] =>
    source.hiddenPages.map((file) => file.relativeTo(new DirectoryPath(root))).sort();

  /** The migration hint behind a `missingConfig` problem, as its own type. */
  const migrationOf = (problem: PortalSourceProblem): PortalMigration => {
    if (problem.kind !== 'missingConfig') {
      throw new Error(`expected a 'missingConfig' problem, got '${problem.kind}'`);
    }
    if (problem.migration === null) {
      throw new Error('expected a migration hint, got none');
    }
    return problem.migration;
  };

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

    it('reads inputs written with a byte-order mark', async () => {
      const mark = '﻿';
      write('portal.json', mark + JSON.stringify({ title: 'Calc' }));
      write('spec/api.json', mark + OPENAPI);

      const source = (await resolve())._unsafeUnwrap();

      expect(source.config.siteTitle()).to.equal('Calc');
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

    it('leaves a spec named after the search route with its own name', async () => {
      write('spec/search.json', OPENAPI);

      expect((await resolve())._unsafeUnwrap().specs[0].slug).to.equal('search');
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

    // Swallowing the failure would pass the tree off as empty, and a nav.json in it would go
    // unvalidated to a build that drops bad entries without a word.
    it('reports a content tree that cannot be walked instead of treating it as empty', async () => {
      write('content/index.md', '# Home');
      // Only the content tree fails; the spec directory is walked the same way and must not.
      const content = new DirectoryPath(root).join('content');
      const original = FileService.prototype.getDirectory;
      const getDirectory = sinon
        .stub(FileService.prototype, 'getDirectory')
        .callsFake(function (this: FileService, directory: DirectoryPath) {
          return directory.isEqual(content) ? Promise.reject(new Error('EACCES')) : original.call(this, directory);
        });

      try {
        expect((await resolve())._unsafeUnwrapErr()).to.deep.equal({ kind: 'unreadableContent' });
      } finally {
        getDirectory.restore();
      }
    });

    // A glob over the tree would skip such an entry; failing the whole build for one is worse
    // than describing the pages that are there.
    it('walks past an entry that cannot be examined, such as a link to nothing', async function () {
      write('content/index.md', '# Home');
      write('content/nav.json', JSON.stringify({ pages: ['index'] }));
      const target = path.join(root, 'content', 'gone');
      try {
        fs.symlinkSync(target, path.join(root, 'content', 'dangling.md'), 'file');
      } catch {
        // A file link needs a privilege some Windows accounts lack; a junction does not, and
        // a junction to nothing fails to stat just the same.
        try {
          fs.symlinkSync(target, path.join(root, 'content', 'dangling'), 'junction');
        } catch {
          this.skip();
        }
      }

      expect((await resolve()).isOk()).to.be.true;
    });

    it('reports content and static as absent when they do not exist', async () => {
      const source = (await resolve())._unsafeUnwrap();

      expect(source.contentDirectory).to.be.null;
      expect(source.staticDirectory).to.be.null;
    });

    // The section's generated metadata lists only the reference pages, and metadata hides
    // whatever it does not name, so the page never reaches the sidebar.
    it('reports a page inside a specification’s section as hidden', async () => {
      write('content/api/api/authentication.md', '# Authentication');

      expect(hidden((await resolve())._unsafeUnwrap())).to.deep.equal(['content/api/api/authentication.md']);
    });

    it('reports a page hidden however deep it sits in the section', async () => {
      write('content/api/api/pets/guide.mdx', '# Guide');
      write('content/api/api/pets/(drafts)/notes.md', '# Notes');

      expect(hidden((await resolve())._unsafeUnwrap())).to.deep.equal([
        'content/api/api/pets/(drafts)/notes.md',
        'content/api/api/pets/guide.mdx'
      ]);
    });

    // The reference emits no page at the section's own address, so a page there is served
    // and shown: as the section's landing page, or beside it.
    it('does not report a page at the section’s own address', async () => {
      write('content/api/api.md', '# Landing');
      write('content/api/api/index.md', '# Overview');

      expect(hidden((await resolve())._unsafeUnwrap())).to.deep.equal([]);
    });

    // The page tree is keyed on the path as written: a differently cased directory, or a
    // route group on the way, is another folder, and no metadata hides what is in it.
    it('does not report pages whose directories only resolve to the section’s address', async () => {
      write('content/API/api/guide.md', '# Guide');
      write('content/api/API/guide.md', '# Guide');
      write('content/api/(guides)/api/notes.md', '# Notes');

      expect(hidden((await resolve())._unsafeUnwrap())).to.deep.equal([]);
    });

    it('does not report pages under content/api in a folder that is no specification', async () => {
      write('content/api/guides/intro.md', '# Intro');
      write('content/api/overview.md', '# Overview');
      write('content/api/index.md', '# API reference');

      expect(hidden((await resolve())._unsafeUnwrap())).to.deep.equal([]);
    });

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

    it('ignores a generated name sitting below the top of the static directory', async () => {
      write('static/docs/robots.txt', 'User-agent: *');

      expect((await resolve())._unsafeUnwrap().shadowedFiles).to.deep.equal([]);
    });

    it('survives an entry in the static directory that cannot be read', async function () {
      write('static/robots.txt', 'User-agent: *');
      const dangling = path.join(root, 'static', 'assets');
      const target = path.join(root, 'gone');
      fs.mkdirSync(target);
      try {
        fs.symlinkSync(target, dangling, 'junction');
      } catch {
        // Creating links is a privileged operation on some Windows runners.
        this.skip();
      }
      fs.rmSync(target, { recursive: true, force: true });

      const source = (await resolve())._unsafeUnwrap();

      expect(source.shadowedFiles.map(String)).to.deep.equal(['robots.txt']);
    });

    it('reports them once they exist', async () => {
      write('content/index.md', '# hi');
      write('static/logo.png', 'x');

      const source = (await resolve())._unsafeUnwrap();

      expect(source.contentDirectory).to.not.be.null;
      expect(source.staticDirectory).to.not.be.null;
    });
  });

  describe('nav.json', () => {
    beforeEach(() => {
      write('portal.json', JSON.stringify({ title: 'Calc' }));
      write('spec/api.json', OPENAPI);
      write('content/index.md', '# Home');
      write('content/authentication.md', '# Auth');
    });

    /** The errors behind an `invalidNavigation` problem, as their own type. */
    const navigationErrors = (problem: PortalSourceProblem): string[] => {
      if (problem.kind !== 'invalidNavigation') {
        throw new Error(`expected an 'invalidNavigation' problem, got '${problem.kind}'`);
      }
      return problem.errors;
    };

    it('accepts a file naming the pages beside it, and both tokens at the root', async () => {
      write(
        'content/nav.json',
        JSON.stringify({ pages: ['index', 'apimatic:pages', 'authentication', 'apimatic:api'] })
      );

      expect((await resolve()).isOk()).to.be.true;
    });

    it('resolves with no navigation file at all', async () => {
      expect((await resolve()).isOk()).to.be.true;
    });

    // The build parses the file as JSON whatever its size, so an empty one has to be refused
    // here rather than pass as if it were absent.
    it('refuses an empty file the same way as a broken one', async () => {
      write('content/nav.json', '');

      const errors = navigationErrors((await resolve())._unsafeUnwrapErr());

      expect(errors).to.deep.equal(['content/nav.json is not valid JSON.']);
    });

    it('names the file and the entry when a page does not exist', async () => {
      write('content/nav.json', JSON.stringify({ pages: ['index', 'missing'] }));

      const errors = navigationErrors((await resolve())._unsafeUnwrapErr());

      expect(errors).to.deep.equal(["content/nav.json: 'missing' is not a page or folder in this directory."]);
    });

    it('validates a nested file against its own directory', async () => {
      write('content/guides/intro.md', '# Intro');
      write('content/nav.json', JSON.stringify({ pages: ['index', 'guides'] }));
      write('content/guides/nav.json', JSON.stringify({ pages: ['intro'] }));

      expect((await resolve()).isOk()).to.be.true;
    });

    // A folder's index page is what the folder itself links to, not one of its children.
    it('refuses index in a nested file while keeping it at the content root', async () => {
      write('content/guides/index.md', '# Guides');
      write('content/guides/intro.md', '# Intro');
      write('content/nav.json', JSON.stringify({ pages: ['index', 'guides'] }));
      write('content/guides/nav.json', JSON.stringify({ pages: ['index', 'intro'] }));

      const errors = navigationErrors((await resolve())._unsafeUnwrapErr());

      expect(errors).to.have.lengthOf(1);
      expect(errors[0]).to.contain("content/guides/nav.json: 'index' is the page this folder links to");
    });

    it('refuses a page named in the wrong directory', async () => {
      write('content/guides/intro.md', '# Intro');
      // 'authentication' is a sibling of the content root's nav.json, not of this one.
      write('content/guides/nav.json', JSON.stringify({ pages: ['authentication'] }));

      const errors = navigationErrors((await resolve())._unsafeUnwrapErr());

      expect(errors[0]).to.contain("content/guides/nav.json: 'authentication' is not a page or folder");
    });

    it('refuses an apimatic token outside the content root', async () => {
      write('content/guides/intro.md', '# Intro');
      write('content/guides/nav.json', JSON.stringify({ pages: ['intro', 'apimatic:api'] }));

      const errors = navigationErrors((await resolve())._unsafeUnwrapErr());

      expect(errors[0]).to.contain("content/guides/nav.json: 'apimatic:api' can only be used");
    });

    it('collects the errors of every file in the tree', async () => {
      write('content/guides/intro.md', '# Intro');
      write('content/nav.json', JSON.stringify({ pages: ['nope'] }));
      write('content/guides/nav.json', JSON.stringify({ pages: ['also-nope'] }));

      const errors = navigationErrors((await resolve())._unsafeUnwrapErr());

      expect(errors).to.have.lengthOf(2);
      expect(errors.join('\n')).to.contain('content/nav.json');
      expect(errors.join('\n')).to.contain('content/guides/nav.json');
    });

    it('addresses a page by its name without the extension, for both md and mdx', async () => {
      write('content/tour.mdx', '# Tour');
      write('content/nav.json', JSON.stringify({ pages: ['index', 'tour', 'authentication'] }));

      expect((await resolve()).isOk()).to.be.true;
    });

    it('warns about a leftover meta.json without failing the build', async () => {
      write('content/meta.json', JSON.stringify({ pages: ['index'] }));
      write('content/guides/intro.md', '# Intro');
      write('content/guides/meta.json', JSON.stringify({ pages: ['intro'] }));

      const source = (await resolve())._unsafeUnwrap();

      expect(ignored(source).sort()).to.deep.equal(['content/guides/meta.json', 'content/meta.json']);
    });

    // Fumadocs reads its own metadata as YAML too, and the default glob the build replaced
    // would have loaded these; now nothing does, so they are named rather than left inert.
    it('warns about metadata and navigation files in a format the build does not read', async () => {
      write('content/meta.yaml', 'pages: [index]');
      write('content/guides/intro.md', '# Intro');
      write('content/guides/meta.yml', 'pages: [intro]');
      write('content/guides/nav.yaml', 'pages: [intro]');

      const source = (await resolve())._unsafeUnwrap();

      expect(ignored(source).sort()).to.deep.equal([
        'content/guides/meta.yml',
        'content/guides/nav.yaml',
        'content/meta.yaml'
      ]);
    });

    // The sidebar shows no folder for a directory with no pages under it, so an entry naming
    // one would resolve to nothing.
    it('refuses a directory that holds no pages', async () => {
      write('content/assets/logo.png', 'x');
      write('content/nav.json', JSON.stringify({ pages: ['index', 'assets'] }));

      const errors = navigationErrors((await resolve())._unsafeUnwrapErr());

      expect(errors[0]).to.contain("'assets' is not a page or folder in this directory");
    });

    // The template drops the empty folder Fumadocs would otherwise build for it.
    it('refuses a directory that holds only a nav.json', async () => {
      write('content/guides/nav.json', JSON.stringify({ pages: [] }));
      write('content/nav.json', JSON.stringify({ pages: ['index', 'guides'] }));

      const errors = navigationErrors((await resolve())._unsafeUnwrapErr());

      expect(errors).to.deep.equal(["content/nav.json: 'guides' is not a page or folder in this directory."]);
    });

    it('accepts a directory whose pages are nested below it', async () => {
      write('content/guides/deep/intro.md', '# Intro');
      write('content/nav.json', JSON.stringify({ pages: ['index', 'guides'] }));

      expect((await resolve()).isOk()).to.be.true;
    });

    // The docs glob matches by code point, so `Guide.MD` is not a page in the build either.
    it('does not offer a page whose extension differs in case', async () => {
      write('content/Guide.MD', '# Guide');
      write('content/nav.json', JSON.stringify({ pages: ['index', 'Guide'] }));

      const errors = navigationErrors((await resolve())._unsafeUnwrapErr());

      expect(errors[0]).to.contain("'Guide' is not a page or folder in this directory");
    });

    it('hands each resolve its own list rather than a shared one', async () => {
      write('content/meta.json', JSON.stringify({ pages: ['index'] }));

      const first = (await resolve())._unsafeUnwrap();
      first.ignoredNavigationFiles.length = 0;

      expect(ignored((await resolve())._unsafeUnwrap())).to.deep.equal(['content/meta.json']);
    });

    it('reports no ignored files when there are none', async () => {
      write('content/nav.json', JSON.stringify({ pages: ['index'] }));

      expect(ignored((await resolve())._unsafeUnwrap())).to.deep.equal([]);
    });

    // The build matches `**/nav.json` by code point, so a case variant orders nothing. It is
    // reported rather than validated, because validating it would describe a file nothing reads.
    it('reports a case variant of nav.json instead of applying it', async () => {
      write('content/Nav.json', JSON.stringify({ pages: ['nonsense'] }));

      const source = (await resolve())._unsafeUnwrap();

      expect(ignored(source)).to.deep.equal(['content/Nav.json']);
    });

    // The file is not loaded by the build at all, so it cannot make a nav.json invalid.
    it('does not validate a leftover meta.json', async () => {
      write('content/meta.json', JSON.stringify({ pages: ['nonsense'] }));

      expect((await resolve()).isOk()).to.be.true;
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

      const migration = migrationOf((await resolve())._unsafeUnwrapErr());

      expect(JSON.parse(JSON.stringify(migration.suggestedConfig))).to.deep.equal({
        title: 'My Portal',
        logo: 'static/images/logo.png'
      });
      expect(migration.unsupportedFields).to.deep.equal(['languageConfig', 'navTitle']);
    });

    it('falls back to a placeholder title when the old file has none', async () => {
      write('APIMATIC-BUILD.json', JSON.stringify({ generatePortal: {} }));

      const migration = migrationOf((await resolve())._unsafeUnwrapErr());

      expect(migration.suggestedConfig.siteTitle()).to.equal('My API');
    });

    it('reports a versioned portal as unsupported', async () => {
      write('APIMATIC-BUILD.json', JSON.stringify({ generateVersionedPortal: {} }));

      const migration = migrationOf((await resolve())._unsafeUnwrapErr());

      expect(migration.unsupportedFields).to.deep.equal(['generateVersionedPortal']);
    });

    it('offers no migration for a build file that configures no portal', async () => {
      write('APIMATIC-BUILD.json', JSON.stringify({ generateSdk: {} }));

      expect((await resolve())._unsafeUnwrapErr()).to.deep.equal({ kind: 'missingConfig', migration: null });
    });

    it('still offers a migration when the build file carries a byte-order mark', async () => {
      write('APIMATIC-BUILD.json', '﻿' + JSON.stringify({ generatePortal: { pageTitle: 'Acme' } }));

      const migration = migrationOf((await resolve())._unsafeUnwrapErr());

      expect(migration.suggestedConfig.siteTitle()).to.equal('Acme');
    });

    it('offers no migration for a build file it cannot parse', async () => {
      write('APIMATIC-BUILD.json', '{ broken');

      expect((await resolve())._unsafeUnwrapErr()).to.deep.equal({ kind: 'missingConfig', migration: null });
    });

    it('flags a table of contents rather than calling it unsupported', async () => {
      write(
        'APIMATIC-BUILD.json',
        JSON.stringify({ generatePortal: { pageTitle: 'Acme', tableOfContentsPath: 'content/toc.yml' } })
      );

      const migration = migrationOf((await resolve())._unsafeUnwrapErr());

      expect(migration.hadTableOfContents).to.be.true;
      expect(migration.unsupportedFields).to.not.include('tableOfContentsPath');
    });

    it('does not flag one for a build file that never had it', async () => {
      write('APIMATIC-BUILD.json', JSON.stringify({ generatePortal: { pageTitle: 'Acme' } }));

      const migration = migrationOf((await resolve())._unsafeUnwrapErr());

      expect(migration.hadTableOfContents).to.be.false;
    });

    it('names a logo it cannot carry over instead of listing it as unsupported', async () => {
      write(
        'APIMATIC-BUILD.json',
        JSON.stringify({ generatePortal: { pageTitle: 'Acme', logoUrl: 'images/logo.png' } })
      );

      const migration = migrationOf((await resolve())._unsafeUnwrapErr());

      expect(migration.unmigratableLogo).to.equal('images/logo.png');
      expect(migration.unsupportedFields).to.not.include('logoUrl');
    });

    it('carries a logo already inside static/ over, with nothing to report', async () => {
      write(
        'APIMATIC-BUILD.json',
        JSON.stringify({ generatePortal: { pageTitle: 'Acme', logoUrl: 'static/images/logo.png' } })
      );

      const migration = migrationOf((await resolve())._unsafeUnwrapErr());

      expect(migration.unmigratableLogo).to.be.null;
    });

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

          const migration = migrationOf((await resolve())._unsafeUnwrapErr());
          // Exactly what the prompt prints for the user to paste.
          const suggestion = JSON.stringify(migration.suggestedConfig, null, 2);

          expect(PortalConfig.parse(suggestion).isOk(), suggestion).to.be.true;
        });
      });
    });
  });

  describe('scaffold', () => {
    let source: DirectoryPath;

    /** A specification outside the source directory, where the wizard downloads it to. */
    const writeSpec = (info: Record<string, unknown>, name = 'petstore.json'): FilePath => {
      write(path.join('downloads', name), JSON.stringify({ openapi: '3.0.0', info, paths: {} }));
      return new FilePath(new DirectoryPath(root).join('downloads'), new FileName(name));
    };

    const scaffold = (specPath: FilePath) => new PortalSourceContext(source).scaffold(specPath);
    const read = (relative: string) => fs.readFileSync(path.join(source.toString(), relative), 'utf8');

    const frontMatterOf = (markdown: string): Record<string, unknown> => {
      const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
      expect(match, `no front matter in:\n${markdown}`).to.not.be.null;
      return parseYaml((match as RegExpExecArray)[1]);
    };

    beforeEach(() => {
      source = new DirectoryPath(root).join('project').join('src');
    });

    it('writes a source directory it accepts itself', async () => {
      await scaffold(writeSpec({ title: 'Petstore', version: '1' }));

      const resolved = (await new PortalSourceContext(source).resolve())._unsafeUnwrap();
      expect(resolved.config.siteTitle()).to.equal('Petstore');
      expect(resolved.specs.map((spec) => spec.slug)).to.deep.equal(['petstore']);
      expect(resolved.contentDirectory).to.not.be.null;
    });

    it('describes the portal from the specification', async () => {
      await scaffold(writeSpec({ title: 'Petstore', version: '1', description: 'All the pets.' }));

      expect(JSON.parse(read('portal.json'))).to.deep.equal({ title: 'Petstore', description: 'All the pets.' });
    });

    it('orders the sidebar with the welcome page first', async () => {
      await scaffold(writeSpec({ title: 'Petstore', version: '1' }));

      expect(JSON.parse(read('content/nav.json'))).to.deep.equal({ pages: ['index', '...'] });
    });

    // It used to write meta.json, which the build no longer reads: a freshly scaffolded
    // project would have warned about its own file on the very next command.
    it('writes a navigation file the build reads, and nothing it ignores', async () => {
      await scaffold(writeSpec({ title: 'Petstore', version: '1' }));

      const scaffolded = (await new PortalSourceContext(source).resolve())._unsafeUnwrap();

      expect(scaffolded.ignoredNavigationFiles).to.deep.equal([]);
    });

    it('falls back to a placeholder title for a specification it cannot read', async () => {
      write('downloads/broken.json', '{ not json');

      await scaffold(new FilePath(new DirectoryPath(root).join('downloads'), new FileName('broken.json')));

      expect(JSON.parse(read('portal.json'))).to.deep.equal({ title: 'My API' });
    });

    it('unpacks a split specification into the spec directory', async () => {
      write('split/openapi.json', JSON.stringify({ openapi: '3.0.0', info: { title: 'Split', version: '1' } }));
      write('split/paths/pets.json', '{}');
      const archive = new FilePath(new DirectoryPath(root), new FileName('spec.zip'));
      await new ZipService().archive(new DirectoryPath(root).join('split'), archive);

      await scaffold(archive);

      expect(fs.existsSync(path.join(source.toString(), 'spec', 'openapi.json'))).to.be.true;
      expect(fs.existsSync(path.join(source.toString(), 'spec', 'paths', 'pets.json'))).to.be.true;
      // The parts of an archive are left to the build to read, so nothing names the portal yet.
      expect(JSON.parse(read('portal.json'))).to.deep.equal({ title: 'My API' });
    });

    describe('the welcome page front matter', () => {
      const titles = [
        'Swagger Petstore',
        'Swagger Petstore: Extended',
        'Swagger Petstore:',
        'Swagger Petstore:Extended',
        'Petstore #1',
        'Petstore - v2',
        'The "Best" API',
        'C:\\petstore',
        "Ann's API",
        '@petstore',
        'yes',
        '1.0',
        '[bracketed]',
        '{braced}',
        'a: b: c'
      ];

      titles.forEach((title) => {
        it(`parses, and keeps the title intact, for ${JSON.stringify(title)}`, async () => {
          await scaffold(writeSpec({ title, version: '1' }));

          expect(frontMatterOf(read('content/index.md')).description).to.equal(`Getting started with ${title}`);
        });
      });
    });
  });
});
