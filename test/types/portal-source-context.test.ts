import fs from 'fs';
import os from 'os';
import path from 'path';
import Ajv from 'ajv';
import { expect } from 'chai';
import { Result } from 'neverthrow';
import sinon from 'sinon';
import { parse as parseYaml } from 'yaml';
import { FileService } from '../../src/infrastructure/file-service';
import { APIMATIC_SCHEMA_URL } from '../../src/types/apimatic-config/document';
import { PortalSourceContext } from '../../src/types/portal-source-context';
import { PortalSource, PortalSourceProblem } from '../../src/types/portal/portal-source';
import { DirectoryPath } from '../../src/types/file/directoryPath';
import { FileName } from '../../src/types/file/fileName';
import { FilePath } from '../../src/types/file/filePath';
import { ZipService } from '../../src/infrastructure/zip-service';

const OPENAPI = JSON.stringify({ openapi: '3.0.0', info: { title: 'Calc', version: '1' }, paths: {} });

describe('PortalSourceContext', () => {
  let root: string;

  const write = (relative: string, contents: string) => {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  };

  /** The smallest `languages` block the portal accepts. */
  const LANGUAGES = { typescript: {} };

  /** A configuration holding the given portal block and the smallest languages block. */
  const writeConfig = (portal: object) => write('apimatic.json', JSON.stringify({ portal, languages: LANGUAGES }));

  const REQUIRED_LANGUAGES = /^'languages' must name at least one SDK language/;

  const resolve = () => new PortalSourceContext(new DirectoryPath(root)).resolve();

  /** The ignored navigation files as the warning names them, relative to the source directory. */
  const ignored = (source: PortalSource): string[] =>
    source.ignoredNavigationFiles.map((file) => file.relativeTo(new DirectoryPath(root)));

  /** The hidden pages as the warning names them, relative to the source directory. */
  const hidden = (source: PortalSource): string[] =>
    source.hiddenPages.map((file) => file.relativeTo(new DirectoryPath(root))).sort();

  /** Each file the block names that is not on disk: its setting, its path, and its spelling on disk in another case. */
  const missingFiles = (result: Result<unknown, PortalSourceProblem>): [string, string, string | null][] => {
    const problem = result._unsafeUnwrapErr();
    if (problem.kind !== 'missingStaticFiles') {
      throw new Error(`expected missing static files, got ${JSON.stringify(problem)}`);
    }
    const relative = (file: FilePath) => file.relativeTo(new DirectoryPath(root));
    return problem.files.map(({ setting, file, foundAs }) => [
      setting,
      relative(file),
      foundAs === null ? null : relative(foundAs)
    ]);
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-source-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('apimatic.json', () => {
    it('reports a missing config', async () => {
      write('spec/api.json', OPENAPI);

      expect((await resolve())._unsafeUnwrapErr()).to.deep.equal({ kind: 'missingConfig' });
    });

    // An APIMATIC-BUILD.json is not read for the portal any more, so its presence changes
    // nothing about the answer.
    it('reports a missing config the same way beside an old build file', async () => {
      write('spec/api.json', OPENAPI);
      write('APIMATIC-BUILD.json', JSON.stringify({ generatePortal: { pageTitle: 'Acme' } }));

      expect((await resolve())._unsafeUnwrapErr()).to.deep.equal({ kind: 'missingConfig' });
    });

    it('reads inputs written with a byte-order mark', async () => {
      const mark = '﻿';
      write('apimatic.json', mark + JSON.stringify({ portal: { site: { name: 'Acme' } }, languages: LANGUAGES }));
      write('spec/api.json', mark + OPENAPI);

      const source = (await resolve())._unsafeUnwrap();

      expect(source.config.siteTitle()).to.equal('Acme');
      expect(source.specs).to.have.lengthOf(1);
    });

    it('passes the field errors through when the config is invalid', async () => {
      writeConfig({ site: { name: '' } });
      write('spec/api.json', OPENAPI);

      expect((await resolve())._unsafeUnwrapErr()).to.deep.equal({
        kind: 'invalidConfig',
        errors: ["'portal.site.name' must be a non-empty string."],
        missingPortal: false
      });
    });

    it('names and describes the portal after its only specification when the block does not', async () => {
      writeConfig({});
      write(
        'spec/api.json',
        JSON.stringify({ openapi: '3.0.0', info: { title: 'Calc', version: '1', description: 'Adds.\n\nMore.' } })
      );

      const { config } = (await resolve())._unsafeUnwrap();

      expect(config.siteTitle()).to.equal('Calc');
      expect(config.siteDescription()).to.equal('Adds.');
    });

    it('lets the block describe the portal instead, or not at all', async () => {
      write(
        'spec/api.json',
        JSON.stringify({ openapi: '3.0.0', info: { title: 'Calc', version: '1', description: 'x' } })
      );

      writeConfig({ site: { description: 'Our docs.' } });
      expect((await resolve())._unsafeUnwrap().config.siteDescription()).to.equal('Our docs.');
      writeConfig({ site: { description: '' } });
      expect((await resolve())._unsafeUnwrap().config.siteDescription()).to.be.null;
    });

    // No one of several specifications speaks for the whole portal.
    it('requires a name when there are several specifications', async () => {
      writeConfig({});
      write('spec/a.json', OPENAPI);
      write('spec/b.json', OPENAPI);

      expect((await resolve())._unsafeUnwrapErr()).to.deep.equal({
        kind: 'invalidConfig',
        errors: ["'portal.site.name' is required when 'spec' holds more than one specification."],
        missingPortal: false
      });
    });

    it('requires a languages block, and lists it with the portal errors', async () => {
      write('apimatic.json', JSON.stringify({ portal: { site: { name: '' } } }));
      write('spec/api.json', OPENAPI);

      const problem = (await resolve())._unsafeUnwrapErr();

      expect(problem.kind).to.equal('invalidConfig');
      const errors = problem.kind === 'invalidConfig' ? problem.errors : [];
      expect(errors).to.have.lengthOf(2);
      expect(errors[0]).to.equal("'portal.site.name' must be a non-empty string.");
      expect(errors[1]).to.match(REQUIRED_LANGUAGES);
    });

    it('reports a missing portal block as the one thing wrong, whatever else the file holds', async () => {
      write('apimatic.json', JSON.stringify({ plugin: { pluginId: 'acme' }, languages: { csharp: {} } }));
      write('spec/api.json', OPENAPI);

      expect((await resolve())._unsafeUnwrapErr()).to.deep.equal({
        kind: 'invalidConfig',
        errors: ["'portal' is required."],
        missingPortal: true
      });
    });

    // There is a block to fix, so the quickstart hint would point away from it.
    it('does not point at quickstart for a portal block that is not an object', async () => {
      write('apimatic.json', JSON.stringify({ portal: 'Calc', languages: LANGUAGES }));
      write('spec/api.json', OPENAPI);

      expect((await resolve())._unsafeUnwrapErr()).to.deep.equal({
        kind: 'invalidConfig',
        errors: ["'portal' must be a JSON object."],
        missingPortal: false
      });
    });

    it('reports a file holding no JSON object as invalid, not missing', async () => {
      write('apimatic.json', '{ not json');
      write('spec/api.json', OPENAPI);

      expect((await resolve())._unsafeUnwrapErr()).to.deep.equal({
        kind: 'invalidConfig',
        errors: ['apimatic.json is not valid JSON.'],
        missingPortal: false
      });
    });

    // Reading through the config context turns a fault into a problem rather than a throw.
    it('reports a file it cannot read as invalid, naming the fault', async () => {
      writeConfig({});
      write('spec/api.json', OPENAPI);
      const read = sinon.stub(FileService.prototype, 'getContents').rejects(new Error('EACCES: permission denied'));

      try {
        expect((await resolve())._unsafeUnwrapErr()).to.deep.equal({
          kind: 'invalidConfig',
          errors: ['apimatic.json could not be read: EACCES: permission denied.'],
          missingPortal: false
        });
      } finally {
        read.restore();
      }
    });

    it('ignores root keys it does not know', async () => {
      write(
        'apimatic.json',
        JSON.stringify({ $schema: 'https://example.com/schema.json', future: true, portal: {}, languages: LANGUAGES })
      );
      write('spec/api.json', OPENAPI);

      expect((await resolve()).isOk()).to.be.true;
    });

    // The plugin's identity is the plugin commands' to judge; a broken one must not fail a build.
    it('builds past a malformed plugin block', async () => {
      write('apimatic.json', JSON.stringify({ portal: {}, languages: LANGUAGES, plugin: 7 }));
      write('spec/api.json', OPENAPI);

      expect((await resolve()).isOk()).to.be.true;
    });

    // The languages are the portal's too: they are the SDKs it documents.
    it('refuses a malformed languages block, as the document found it', async () => {
      write('apimatic.json', JSON.stringify({ portal: {}, languages: { typescript: 'yes' } }));
      write('spec/api.json', OPENAPI);

      expect((await resolve())._unsafeUnwrapErr()).to.deep.equal({
        kind: 'invalidConfig',
        errors: ["'languages.typescript' is not a JSON object."],
        missingPortal: false
      });
    });

    it('accepts the schema version it reads', async () => {
      write('apimatic.json', JSON.stringify({ schemaVersion: 1, portal: {}, languages: LANGUAGES }));
      write('spec/api.json', OPENAPI);

      expect((await resolve()).isOk()).to.be.true;
    });

    it('refuses another schema version alongside the portal errors, so one edit fixes the file', async () => {
      write(
        'apimatic.json',
        JSON.stringify({ schemaVersion: 2, portal: { site: { name: '' } }, languages: LANGUAGES })
      );
      write('spec/api.json', OPENAPI);

      expect((await resolve())._unsafeUnwrapErr()).to.deep.equal({
        kind: 'invalidConfig',
        errors: [
          "'schemaVersion' is 2, which this version of the CLI does not read; it reads 1.",
          "'portal.site.name' must be a non-empty string."
        ],
        missingPortal: false
      });
    });
  });

  describe('static files', () => {
    beforeEach(() => write('spec/api.json', OPENAPI));

    it('reports a configured logo that is not on disk', async () => {
      writeConfig({ brand: { logo: 'static/images/logo.png' } });

      expect(missingFiles(await resolve())).to.deep.equal([['portal.brand.logo', 'static/images/logo.png', null]]);
    });

    it('reports every missing file at once, each with the setting that names it', async () => {
      writeConfig({
        brand: { logo: { light: 'static/light.svg', dark: 'static/dark.svg' }, favicon: 'static/favicon.ico' }
      });
      write('static/light.svg', 'x');

      expect(missingFiles(await resolve())).to.deep.equal([
        ['portal.brand.logo.dark', 'static/dark.svg', null],
        ['portal.brand.favicon', 'static/favicon.ico', null]
      ]);
    });

    // Windows and macOS open `logo.png` for `Logo.PNG`, and the site then 404s on a host that
    // does not, so every name on the way is matched exactly.
    it('reports a file spelt in another case, with its spelling on disk', async () => {
      writeConfig({ brand: { logo: 'static/Images/Logo.PNG', favicon: 'static/favicon.ico' } });
      write('static/images/logo.png', 'x');
      write('static/favicon.ico', 'x');

      expect(missingFiles(await resolve())).to.deep.equal([
        ['portal.brand.logo', 'static/Images/Logo.PNG', 'static/images/logo.png']
      ]);
    });

    it('accepts files that are there', async () => {
      writeConfig({ brand: { logo: 'static/images/logo.png', favicon: 'static/favicon.ico' } });
      write('static/images/logo.png', 'x');
      write('static/favicon.ico', 'x');

      expect((await resolve()).isOk()).to.be.true;
    });

    it('says nothing when none is configured', async () => {
      writeConfig({});

      expect((await resolve()).isOk()).to.be.true;
    });
  });

  // What `portal serve` runs on each save of `apimatic.json`.
  describe('resolveConfig', () => {
    const context = () => new PortalSourceContext(new DirectoryPath(root));

    beforeEach(() => write('spec/api.json', OPENAPI));

    it('gives the config resolve gives, from the site the specifications suggested', async () => {
      writeConfig({ brand: { colors: { preset: 'ocean' } } });
      const resolved = (await resolve())._unsafeUnwrap();

      const reloaded = (await context().resolveConfig(resolved.suggestedSite))._unsafeUnwrap();

      expect(reloaded.toJSON()).to.deep.equal(resolved.config.toJSON());
      expect(reloaded.siteTitle()).to.equal(resolved.config.siteTitle());
    });

    // The specifications are not read again, so with several the name is still required.
    it('holds the file to the rules resolve holds it to', async () => {
      writeConfig({});

      const errors = (await context().resolveConfig(null))._unsafeUnwrapErr();

      expect(errors).to.deep.equal({
        kind: 'invalidConfig',
        errors: ["'portal.site.name' is required when 'spec' holds more than one specification."],
        missingPortal: false
      });
    });

    it('reports a file the block names that is not on disk', async () => {
      writeConfig({ site: { name: 'Calc' }, brand: { favicon: 'static/favicon.ico' } });

      expect(missingFiles(await context().resolveConfig(null))).to.deep.equal([
        ['portal.brand.favicon', 'static/favicon.ico', null]
      ]);
    });

    it('reports a file removed while the preview runs', async () => {
      expect((await context().resolveConfig(null))._unsafeUnwrapErr()).to.deep.equal({ kind: 'missingConfig' });
    });
  });

  describe('spec discovery', () => {
    beforeEach(() => writeConfig({ site: { name: 'Calc' } }));

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
      writeConfig({ site: { name: 'Calc' } });
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

    // An index page is a folder's own link, and the folders directly below a section are the
    // tag folders, which the CLI cannot tell from the user's without reading the specification.
    it('does not report an index page one folder below the section, where the tag folders sit', async () => {
      write('content/api/api/pets/index.md', '# Pets');
      write('content/api/api/pets/deeper/index.md', '# Deeper');

      expect(hidden((await resolve())._unsafeUnwrap())).to.deep.equal(['content/api/api/pets/deeper/index.md']);
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
      writeConfig({ site: { name: 'Calc' } });
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
        JSON.stringify({ pages: ['index', 'apimatic:sdks', 'authentication', 'apimatic:api'] })
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

    // The reference is mounted in content/api, one folder per specification, so the nav.json
    // there positions those folders as it does the user's own pages.
    it('lets the nav.json in content/api name the specifications beside its pages', async () => {
      write('spec/billing.json', OPENAPI);
      write('content/api/overview.md', '# Overview');
      write('content/api/nav.json', JSON.stringify({ pages: ['overview', 'api', 'billing'] }));

      expect((await resolve()).isOk()).to.be.true;
    });

    // The walk is what tells a top-level folder from a nested one, which only it can know.
    it('makes a tab of a folder directly under content, and of no folder deeper down', async () => {
      write('content/tutorials/first-call.md', '# First call');
      write('content/tutorials/nav.json', JSON.stringify({ root: true }));
      write('content/tutorials/advanced/retries.md', '# Retries');
      write('content/tutorials/advanced/nav.json', JSON.stringify({ root: true }));
      write('content/api/overview.md', '# Overview');
      write('content/api/nav.json', JSON.stringify({ root: true }));

      const errors = navigationErrors((await resolve())._unsafeUnwrapErr());

      expect(errors).to.have.lengthOf(2);
      expect(errors.find((error) => error.startsWith('content/api/nav.json: '))).to.contain(
        'and the API reference is always one'
      );
      expect(errors.find((error) => error.startsWith('content/tutorials/advanced/nav.json: '))).to.contain(
        "only a folder directly under 'content' can be one"
      );
    });

    it('refuses a name shared by a page and a folder, since only the folder could be positioned', async () => {
      write('content/guides.md', '# Guides');
      write('content/guides/intro.md', '# Intro');
      write('content/nav.json', JSON.stringify({ pages: ['guides', 'index'] }));

      const errors = navigationErrors((await resolve())._unsafeUnwrapErr());

      expect(errors[0]).to.contain("content/nav.json: 'guides' is both a page and a folder");
    });

    // The reference is mounted at content/api with no directory there to see, so nothing in
    // the tree makes `api` look like two children. Listing it is what turns the entry the
    // template would honour as the reference into an error rather than a silent reordering.
    it('refuses api at the root when a page carries the name the reference is mounted at', async () => {
      write('content/api.md', '# My API notes');
      write('content/nav.json', JSON.stringify({ pages: ['index', 'api'] }));

      const errors = navigationErrors((await resolve())._unsafeUnwrapErr());

      expect(errors).to.have.lengthOf(1);
      expect(errors[0]).to.contain("content/nav.json: 'api' is where the API reference is mounted");
    });

    // The mount point is a child of the content root in every portal, so the entry positions
    // the reference whether or not the user keeps a directory of their own there.
    it('accepts api at the root with nothing of that name on disk at all', async () => {
      write('content/nav.json', JSON.stringify({ pages: ['index', 'api'] }));

      expect((await resolve()).isOk()).to.be.true;
    });

    it('accepts api at the root when a directory of that name holds the user’s own pages', async () => {
      write('content/api/overview.md', '# Overview');
      write('content/nav.json', JSON.stringify({ pages: ['index', 'api'] }));

      expect((await resolve()).isOk()).to.be.true;
    });

    // One node, so the two spellings name it twice wherever the directory came from.
    it('refuses api together with the token, with or without a directory of that name', async () => {
      write('content/api/overview.md', '# Overview');
      write('content/nav.json', JSON.stringify({ pages: ['index', 'api', 'apimatic:api'] }));

      const errors = navigationErrors((await resolve())._unsafeUnwrapErr());

      expect(errors[0]).to.contain("'api' and 'apimatic:api' both position the API reference");
    });

    // The specification's folder is one child; a page of the same name beside it is another.
    it('refuses a specification’s name when a page under content/api carries it too', async () => {
      write('content/api/api.md', '# Landing');
      write('content/api/nav.json', JSON.stringify({ pages: ['api'] }));

      const errors = navigationErrors((await resolve())._unsafeUnwrapErr());

      expect(errors[0]).to.contain("content/api/nav.json: 'api' is both a page and a folder");
    });

    it('refuses a specification named anywhere but in content/api', async () => {
      write('content/guides/intro.md', '# Intro');
      write('content/guides/nav.json', JSON.stringify({ pages: ['intro', 'api'] }));

      const errors = navigationErrors((await resolve())._unsafeUnwrapErr());

      expect(errors[0]).to.contain("content/guides/nav.json: 'api' is not a page or folder");
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
      write('content/Nav.json', JSON.stringify({ pages: ['index'] }));

      const first = (await resolve())._unsafeUnwrap();
      first.ignoredNavigationFiles.length = 0;

      expect(ignored((await resolve())._unsafeUnwrap())).to.deep.equal(['content/Nav.json']);
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

    // The build loads `**/nav.json` alone, so any other JSON or YAML in the content directory
    // is neither read nor remarked upon, whatever it contains.
    it('says nothing about other JSON and YAML files in the content directory', async () => {
      write('content/meta.json', JSON.stringify({ pages: ['nonsense'] }));
      write('content/guides/intro.md', '# Intro');
      write('content/guides/nav.yaml', 'pages: [nonsense]');

      const source = (await resolve())._unsafeUnwrap();

      expect(ignored(source)).to.deep.equal([]);
    });
  });

  describe('scaffold', () => {
    let source: DirectoryPath;

    /** A specification outside the source directory, where the wizard downloads it to. */
    const writeSpec = (info: Record<string, unknown>, name = 'petstore.json'): FilePath => {
      write(path.join('downloads', name), JSON.stringify({ openapi: '3.0.0', info, paths: {} }));
      return new FilePath(new DirectoryPath(root).join('downloads'), new FileName(name));
    };

    const scaffold = async (specPath: FilePath) =>
      (await new PortalSourceContext(source).scaffold(specPath, APIMATIC_SCHEMA_URL))._unsafeUnwrap();
    const read = (relative: string) => fs.readFileSync(path.join(source.toString(), relative), 'utf8');

    /** What the user adds by hand before the portal builds: nothing in quickstart writes it yet. */
    const addLanguages = () => {
      const file = path.join(source.toString(), 'apimatic.json');
      fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), languages: LANGUAGES }));
    };

    const frontMatterOf = (markdown: string): Record<string, unknown> => {
      const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
      expect(match, `no front matter in:\n${markdown}`).to.not.be.null;
      return parseYaml((match as RegExpExecArray)[1]);
    };

    beforeEach(() => {
      source = new DirectoryPath(root).join('project').join('src');
    });

    it('writes a source directory it accepts itself, once a language is named', async () => {
      await scaffold(writeSpec({ title: 'Petstore', version: '1' }));

      const unnamed = (await new PortalSourceContext(source).resolve())._unsafeUnwrapErr();
      expect(unnamed.kind === 'invalidConfig' ? unnamed.errors : []).to.have.lengthOf(1);
      addLanguages();

      const resolved = (await new PortalSourceContext(source).resolve())._unsafeUnwrap();
      expect(resolved.config.siteTitle()).to.equal('Petstore');
      expect(resolved.specs.map((spec) => spec.slug)).to.deep.equal(['petstore']);
      expect(resolved.contentDirectory).to.not.be.null;
    });

    it('describes the portal from the specification, with every default spelled out', async () => {
      await scaffold(writeSpec({ title: 'Petstore', version: '1', description: 'All the pets.' }));

      const written = JSON.parse(read('apimatic.json'));
      // The schema first, where an editor looks for it, and no `languages` block: nothing in
      // the wizard asks for the project's languages yet.
      expect(Object.keys(written)).to.deep.equal(['$schema', 'schemaVersion', 'portal']);
      expect(written.$schema).to.equal(APIMATIC_SCHEMA_URL);
      expect(written.schemaVersion).to.equal(1);
      expect(written.portal.site).to.deep.equal({ name: 'Petstore', description: 'All the pets.' });
      expect(Object.keys(written.portal)).to.deep.equal([
        'site',
        'brand',
        'navigation',
        'home',
        'api',
        'ai',
        'advanced'
      ]);
      expect(read('apimatic.json').endsWith('\n')).to.be.true;
    });

    // Defaults are applied twice, on purpose: written into a new block, and filled in for a
    // block written by hand. The two have to make the same portal.
    it('writes a block that resolves to the portal an empty block makes', async () => {
      await scaffold(writeSpec({ title: 'Petstore', version: '1', description: 'All the pets.' }));
      addLanguages();
      const scaffolded = (await new PortalSourceContext(source).resolve())._unsafeUnwrap().config;

      write('project/src/apimatic.json', JSON.stringify({ portal: {}, languages: LANGUAGES }));
      const empty = (await new PortalSourceContext(source).resolve())._unsafeUnwrap().config;

      expect(scaffolded.toJSON()).to.deep.equal(empty.toJSON());
      expect(scaffolded.identity()).to.deep.equal(empty.identity());
    });

    // Every block the wizard writes has to pass the schema it points editors at.
    it('writes a file the schema it names accepts', async () => {
      await scaffold(writeSpec({ title: 'Petstore', version: '1', description: 'All the pets.' }));
      const schema = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'apimatic.schema.json'), 'utf8'));
      const validate = new Ajv({ strict: true, allErrors: true }).compile(schema);

      expect(validate(JSON.parse(read('apimatic.json'))), JSON.stringify(validate.errors)).to.be.true;
    });

    it('answers with the apimatic.json it wrote', async () => {
      const configFile = await scaffold(writeSpec({ title: 'Petstore', version: '1' }));

      expect(configFile.isEqual(new FilePath(source, new FileName('apimatic.json')))).to.be.true;
      expect(fs.existsSync(configFile.toString())).to.be.true;
    });

    it('orders the sidebar with the welcome page first', async () => {
      await scaffold(writeSpec({ title: 'Petstore', version: '1' }));

      expect(JSON.parse(read('content/nav.json'))).to.deep.equal({ pages: ['index', '...'] });
    });

    // A freshly scaffolded project must not carry a file the build never reads, such as a
    // `meta.json`, which the CLI would not remark on and the sidebar would not honour.
    it('writes a navigation file the build reads, and nothing it ignores', async () => {
      await scaffold(writeSpec({ title: 'Petstore', version: '1' }));
      addLanguages();

      const contentFiles = fs.readdirSync(path.join(source.toString(), 'content')).sort();
      const scaffolded = (await new PortalSourceContext(source).resolve())._unsafeUnwrap();

      expect(contentFiles).to.deep.equal(['index.md', 'nav.json']);
      expect(scaffolded.ignoredNavigationFiles).to.deep.equal([]);
    });

    it('falls back to a placeholder title for a specification it cannot read', async () => {
      write('downloads/broken.json', '{ not json');

      await scaffold(new FilePath(new DirectoryPath(root).join('downloads'), new FileName('broken.json')));

      expect(JSON.parse(read('apimatic.json')).portal.site).to.deep.equal({ name: 'My API' });
    });

    // The wizard asks its questions before it writes anything, so a fault here has to come back
    // as a message it can report -- a throw would leave oclif to print a stack over the wizard.
    it('reports a configuration it cannot write into rather than throwing', async () => {
      write('project/src/apimatic.json', '{ not json');

      const scaffolded = await new PortalSourceContext(source).scaffold(
        writeSpec({ title: 'Petstore', version: '1' }),
        APIMATIC_SCHEMA_URL
      );

      expect(scaffolded._unsafeUnwrapErr()).to.deep.equal({ kind: 'configUnreadable' });
    });

    it('reports a source directory it cannot write rather than throwing', async () => {
      const failing = sinon.stub(FileService.prototype, 'writeContents').rejects(new Error('EACCES: denied'));

      try {
        const scaffolded = await new PortalSourceContext(source).scaffold(
          writeSpec({ title: 'Petstore', version: '1' }),
          APIMATIC_SCHEMA_URL
        );

        expect(scaffolded._unsafeUnwrapErr()).to.deep.equal({
          kind: 'sourceUnwritable',
          reason: 'EACCES: denied'
        });
      } finally {
        failing.restore();
      }
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
      expect(JSON.parse(read('apimatic.json')).portal.site).to.deep.equal({ name: 'My API' });
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
