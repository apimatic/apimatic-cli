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
import { GeneratedPages } from '../../src/types/portal/generated-pages';
import {
  ContentProblem,
  PortalSettings,
  PortalSource,
  PortalSourceProblem
} from '../../src/types/portal/portal-source';
import { PortalTab } from '../../src/types/portal/portal-tabs';
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

  /** The smallest page the build accepts: front matter giving its title. */
  const page = (title: string) => `---\ntitle: ${title}\n---\n`;

  /** The smallest `languages` block the portal accepts. */
  const LANGUAGES = { typescript: {} };

  /** A configuration holding the given portal block and the smallest languages block. */
  const writeConfig = (portal: object) => write('apimatic.json', JSON.stringify({ portal, languages: LANGUAGES }));

  const REQUIRED_LANGUAGES = /^'languages' must name at least one SDK language/;

  const resolve = () => new PortalSourceContext(new DirectoryPath(root)).resolve();

  /** The ignored navigation files as the warning names them, relative to the source directory. */
  const ignored = (source: PortalSource): string[] =>
    source.contentNotices.ignoredNavigationFiles.map((file) => file.relativeTo(new DirectoryPath(root)));

  /** The hidden pages as the warning names them, relative to the source directory. */
  const hidden = (source: PortalSource): string[] =>
    source.contentNotices.hiddenPages.map((file) => file.relativeTo(new DirectoryPath(root))).sort();

  /** Every problem found in `content/`, when that is what refused the source. */
  const contentProblems = (problem: PortalSourceProblem): ContentProblem[] => {
    if (problem.kind !== 'invalidContent') {
      throw new Error(`expected problems in content/, got '${problem.kind}'`);
    }
    return problem.problems;
  };

  /** The one problem found in `content/`. */
  const contentProblem = (problem: PortalSourceProblem): ContentProblem => {
    const problems = contentProblems(problem);
    expect(problems.map(({ kind }) => kind)).to.have.lengthOf(1);
    return problems[0];
  };

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
      expect(config.identity().description).to.equal('Adds.');
    });

    it('lets the block describe the portal instead, or not at all', async () => {
      write(
        'spec/api.json',
        JSON.stringify({ openapi: '3.0.0', info: { title: 'Calc', version: '1', description: 'x' } })
      );

      writeConfig({ site: { description: 'Our docs.' } });
      expect((await resolve())._unsafeUnwrap().config.identity().description).to.equal('Our docs.');
      writeConfig({ site: { description: '' } });
      expect((await resolve())._unsafeUnwrap().config.identity().description).to.be.null;
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
  describe('resolveSettings', () => {
    const context = () => new PortalSourceContext(new DirectoryPath(root));

    beforeEach(() => write('spec/api.json', OPENAPI));

    it('gives the config resolve gives, from the site the specifications suggested', async () => {
      writeConfig({ brand: { colors: { primary: '#1d4ed8' } } });
      const resolved = (await resolve())._unsafeUnwrap();

      const reloaded = (await context().resolveSettings(resolved.suggestedSite))._unsafeUnwrap();

      expect(reloaded.config.toJSON()).to.deep.equal(resolved.config.toJSON());
      expect(reloaded.config.siteTitle()).to.equal(resolved.config.siteTitle());
    });

    // The specifications are not read again, so with several the name is still required.
    it('holds the file to the rules resolve holds it to', async () => {
      writeConfig({});

      const errors = (await context().resolveSettings(null))._unsafeUnwrapErr();

      expect(errors).to.deep.equal({
        kind: 'invalidConfig',
        errors: ["'portal.site.name' is required when 'spec' holds more than one specification."],
        missingPortal: false
      });
    });

    it('reports a file the block names that is not on disk', async () => {
      writeConfig({ site: { name: 'Calc' }, brand: { favicon: 'static/favicon.ico' } });

      expect(missingFiles(await context().resolveSettings(null))).to.deep.equal([
        ['portal.brand.favicon', 'static/favicon.ico', null]
      ]);
    });

    it('reports a file removed while the preview runs', async () => {
      expect((await context().resolveSettings(null))._unsafeUnwrapErr()).to.deep.equal({ kind: 'missingConfig' });
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

    it('skips a document in another format when an OpenAPI 3.x document is beside it', async () => {
      write('spec/api.json', OPENAPI);
      write('spec/old.json', JSON.stringify({ swagger: '2.0', info: {}, paths: {} }));

      expect((await resolve())._unsafeUnwrap().specs.map((spec) => spec.slug)).to.deep.equal(['api']);
    });

    /** How the problem says to convert the directory: the file, its format, where `api transform` writes, and how many more. */
    const conversion = async () => {
      const problem = (await resolve())._unsafeUnwrapErr();
      if (problem.kind !== 'noOpenApiSpec') {
        throw new Error(`expected no OpenAPI 3.x document, got '${problem.kind}'`);
      }
      const { file, format, converted, others } = problem.conversion;
      const relative = (each: FilePath) => each.relativeTo(new DirectoryPath(root));
      return [relative(file), format, relative(converted), others];
    };

    // Named, with where `api transform` writes the result: its own folder, which the portal does not read.
    it('reports no OpenAPI 3.x document whatever format the others are in, naming one to convert', async () => {
      write('spec/swagger.json', JSON.stringify({ swagger: '2.0', info: {}, paths: {} }));
      write('spec/openapi2.json', JSON.stringify({ openapi: '2.0.0', info: {}, paths: {} }));
      write('spec/postman.json', JSON.stringify({ info: { schema: 'postman' }, item: [] }));
      write('spec/api.raml', '#%RAML 1.0\ntitle: Calc\n');

      expect(await conversion()).to.deep.equal([
        'spec/openapi2.json',
        'OpenAPI 2.0.0',
        'spec/transformations/openapi2_OpenApi3Yaml.yaml',
        1
      ]);
    });

    it('names a document that says nothing of its format ahead of any other file', async () => {
      write('spec/README.md', '# Specs');
      write('spec/api.raml', '#%RAML 1.0\ntitle: Calc\n');
      write('spec/postman.json', JSON.stringify({ info: { schema: 'postman' }, item: [] }));

      expect(await conversion()).to.deep.equal([
        'spec/postman.json',
        null,
        'spec/transformations/postman_OpenApi3Yaml.yaml',
        0
      ]);
    });

    it('names the first file when nothing the portal reads is there', async () => {
      write('spec/api.raml', '#%RAML 1.0\ntitle: Calc\n');

      expect(await conversion()).to.deep.equal([
        'spec/api.raml',
        null,
        'spec/transformations/api_OpenApi3Yaml.yaml',
        0
      ]);
    });

    it('reports a document it cannot parse', async () => {
      write('spec/broken.json', '{ not json');

      expect((await resolve())._unsafeUnwrapErr().kind).to.equal('unreadableSpec');
    });

    it('reports an empty or absent spec directory', async () => {
      expect((await resolve())._unsafeUnwrapErr()).to.deep.equal({ kind: 'emptySpecDirectory', folders: [] });

      fs.mkdirSync(path.join(root, 'spec'));
      expect((await resolve())._unsafeUnwrapErr()).to.deep.equal({ kind: 'emptySpecDirectory', folders: [] });
    });

    // Where `api transform --destination=src/spec` puts its result.
    it('names the folders of a spec directory that holds nothing else, whose documents are not read', async () => {
      write('spec/transformations/api_OpenApi3Yaml.yaml', 'openapi: 3.0.0');

      const problem = (await resolve())._unsafeUnwrapErr();

      expect(problem.kind === 'emptySpecDirectory' && problem.folders.map((folder) => folder.leafName())).to.deep.equal(
        ['transformations']
      );
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

    it('lists the operations of a path item kept in another file under the path that mounts it', async () => {
      writeConfig({ site: { name: 'Calc' } });
      write('spec/paths/pets.yaml', JSON.stringify({ get: {}, post: {} }));
      write('spec/shared.json', JSON.stringify({ items: { owners: { delete: {} } } }));
      write(
        'spec/api.json',
        JSON.stringify({
          openapi: '3.1.0',
          info: { title: 'Calc', version: '1' },
          paths: {
            '/health': { get: {} },
            '/pets': { $ref: './paths/pets.yaml' },
            '/owners': { $ref: 'shared.json#/items/owners' },
            '/missing': { $ref: './nowhere.yaml' }
          }
        })
      );

      const [spec] = (await resolve())._unsafeUnwrap().specs;

      expect(spec.endpoints.map(String)).to.deep.equal(['GET /health', 'GET /pets', 'POST /pets', 'DELETE /owners']);
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
      write('content/index.md', page('Home'));
      // Only the content tree fails; the spec directory is walked the same way and must not.
      const content = new DirectoryPath(root).join('content');
      const original = FileService.prototype.getDirectory;
      const getDirectory = sinon
        .stub(FileService.prototype, 'getDirectory')
        .callsFake(function (this: FileService, directory: DirectoryPath) {
          return directory.isEqual(content) ? Promise.reject(new Error('EACCES')) : original.call(this, directory);
        });

      try {
        expect((await resolve())._unsafeUnwrapErr()).to.deep.equal({
          kind: 'invalidContent',
          problems: [{ kind: 'unreadableContent' }]
        });
      } finally {
        getDirectory.restore();
      }
    });

    // A glob over the tree would skip such an entry; failing the whole build for one is worse
    // than describing the pages that are there.
    it('walks past an entry that cannot be examined, such as a link to nothing', async function () {
      write('content/index.md', page('Home'));
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
      write('content/api/api/authentication.md', page('Authentication'));

      expect(hidden((await resolve())._unsafeUnwrap())).to.deep.equal(['content/api/api/authentication.md']);
    });

    it('reports a page hidden however deep it sits in the section', async () => {
      write('content/api/api/pets/guide.mdx', page('Guide'));
      write('content/api/api/pets/(drafts)/notes.md', page('Notes'));

      expect(hidden((await resolve())._unsafeUnwrap())).to.deep.equal([
        'content/api/api/pets/(drafts)/notes.md',
        'content/api/api/pets/guide.mdx'
      ]);
    });

    // The reference emits no page at the section's own address, so a page there is served
    // and shown: as the section's landing page, or beside it.
    for (const landing of ['content/api/api.md', 'content/api/api/index.md']) {
      it(`does not report ${landing}, at the section’s own address`, async () => {
        write(landing, page('Landing'));

        expect(hidden((await resolve())._unsafeUnwrap())).to.deep.equal([]);
      });
    }

    // An index page is a folder's own link, and the folders directly below a section are the
    // tag folders, which the CLI cannot tell from the user's without reading the specification.
    it('does not report an index page one folder below the section, where the tag folders sit', async () => {
      write('content/api/api/pets/index.md', page('Pets'));
      write('content/api/api/pets/deeper/index.md', page('Deeper'));

      expect(hidden((await resolve())._unsafeUnwrap())).to.deep.equal(['content/api/api/pets/deeper/index.md']);
    });

    // The page tree is keyed on the path as written: a differently cased directory, or a
    // route group on the way, is another folder, and no metadata hides what is in it.
    it('does not report pages whose directories only resolve to the section’s address', async () => {
      write('content/API/api/guide.md', page('Guide'));
      write('content/api/API/guide.md', page('Guide'));
      write('content/api/(guides)/api/notes.md', page('Notes'));

      expect(hidden((await resolve())._unsafeUnwrap())).to.deep.equal([]);
    });

    it('does not report pages under content/api in a folder that is no specification', async () => {
      write('content/api/guides/intro.md', page('Intro'));
      write('content/api/overview.md', page('Overview'));
      write('content/api/index.md', page('API reference'));

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
      write('content/index.md', page('hi'));
      write('static/logo.png', 'x');

      const source = (await resolve())._unsafeUnwrap();

      expect(source.contentDirectory).to.not.be.null;
      expect(source.staticDirectory).to.not.be.null;
    });
  });

  describe('the generated pages', () => {
    beforeEach(() => write('spec/api.json', OPENAPI));

    const writeFile = (file: object) => write('apimatic.json', JSON.stringify(file));

    /** Each generated page as its folder and file. */
    const generated = (settings: PortalSettings) =>
      settings.generatedPages.pages().map((page) => `${page.section.folder}/${page.fileName}`);

    it('carries a page per language, in the order the block lists them', async () => {
      writeFile({ portal: {}, languages: { python: {}, typescript: {} } });

      expect(generated((await resolve())._unsafeUnwrap())).to.deep.equal([
        'sdks/index.mdx',
        'sdks/python.mdx',
        'sdks/typescript.mdx'
      ]);
    });

    it('carries the context plugin page only when there is a plugin block', async () => {
      writeFile({ portal: {}, languages: LANGUAGES, plugin: {} });
      expect(generated((await resolve())._unsafeUnwrap())).to.include('context-plugin/index.mdx');

      writeFile({ portal: {}, languages: LANGUAGES });
      expect(generated((await resolve())._unsafeUnwrap())).to.not.include('context-plugin/index.mdx');
    });

    /** What the context plugin page tells readers to install from. */
    const installPath = (settings: PortalSettings) =>
      settings.generatedPages.pages().find((page) => page.template === 'context-plugin')?.data.installPath;

    it('installs the plugin block from the copy bundled into the portal', async () => {
      writeFile({ portal: {}, languages: LANGUAGES, plugin: {} });

      expect(installPath((await resolve())._unsafeUnwrap())).to.equal('/__downloads/plugin.zip');
    });

    // The portal artifacts carry no plugin when it is hosted elsewhere.
    it('carries the page for a pluginUrl, with or without a plugin block, installing from it', async () => {
      writeFile({ portal: { pluginUrl: 'https://plugins.acme.test/calc.zip' }, languages: LANGUAGES });
      expect(installPath((await resolve())._unsafeUnwrap())).to.equal('https://plugins.acme.test/calc.zip');

      writeFile({ portal: { pluginUrl: 'https://plugins.acme.test/calc.zip' }, languages: LANGUAGES, plugin: {} });
      expect(installPath((await resolve())._unsafeUnwrap())).to.equal('https://plugins.acme.test/calc.zip');
    });

    // The plugin commands judge the block; a build does not fail over it, and gets no page.
    it('treats a plugin block that is not an object as no block', async () => {
      writeFile({ portal: {}, languages: LANGUAGES, plugin: 'yes' });

      expect(generated((await resolve())._unsafeUnwrap())).to.not.include('context-plugin/index.mdx');
    });

    // Nothing in the block is read, so an identity the plugin commands would refuse still gets the page.
    it('carries the context plugin page for a block whose identity is malformed', async () => {
      writeFile({ portal: {}, languages: LANGUAGES, plugin: { pluginId: 'Bad Id!', pluginVersion: 'one' } });

      expect(generated((await resolve())._unsafeUnwrap())).to.include('context-plugin/index.mdx');
    });

    it('reads them again for portal serve', async () => {
      // Named, because nothing suggests a site when the specifications are not read again.
      writeFile({ portal: { site: { name: 'Calc' } }, languages: { csharp: {} }, plugin: {} });

      const reloaded = (await new PortalSourceContext(new DirectoryPath(root)).resolveSettings(null))._unsafeUnwrap();

      expect(generated(reloaded)).to.deep.equal(['sdks/index.mdx', 'sdks/csharp.mdx', 'context-plugin/index.mdx']);
    });
  });

  describe('the addresses the generated pages are served at', () => {
    beforeEach(() => {
      writeConfig({ site: { name: 'Calc' } });
      write('spec/api.json', OPENAPI);
      write('content/index.md', page('Home'));
    });

    /** Each refused page as the file, where it would be served, and the section it collides with. */
    const reserved = (refused: PortalSourceProblem): string[] => {
      const problem = contentProblem(refused);
      if (problem.kind !== 'reservedAddresses') {
        throw new Error(`expected a 'reservedAddresses' problem, got '${problem.kind}'`);
      }
      return problem.pages
        .map(({ file, address, section }) => `${file.relativeTo(new DirectoryPath(root))} ${address} ${section.folder}`)
        .sort();
    };

    // Three of them share /sdks as well, which is not said again.
    it('refuses every page the SDK pages would share an address with, naming each', async () => {
      write('content/sdks.md', page('Mine'));
      write('content/sdks/setup.mdx', page('Setup'));
      write('content/(intro)/sdks.md', page('Grouped'));
      write('content/sdks/index.md', page('Index'));

      expect(reserved((await resolve())._unsafeUnwrapErr())).to.deep.equal([
        'content/(intro)/sdks.md /sdks sdks',
        'content/sdks.md /sdks sdks',
        'content/sdks/index.md /sdks sdks',
        'content/sdks/setup.mdx /sdks/setup sdks'
      ]);
    });

    // Reserved with or without a plugin block, so adding one never refuses a page that built.
    it('refuses a page at the context plugin address although there is no plugin block', async () => {
      write('content/context-plugin.md', page('Mine'));
      write('content/context-plugin/faq.md', page('FAQ'));

      expect(reserved((await resolve())._unsafeUnwrapErr())).to.deep.equal([
        'content/context-plugin.md /context-plugin context-plugin',
        'content/context-plugin/faq.md /context-plugin/faq context-plugin'
      ]);
    });

    // A group folder's name is not part of the address; only the folder it groups is.
    it('accepts pages whose address only starts with the same letters, or sits deeper', async () => {
      write('content/sdks-overview.md', page('Overview'));
      write('content/guides/sdks.md', page('Nested'));
      write('content/(sdks)/intro.md', page('Grouped'));
      write('content/plugin.md', page('Plugin'));

      expect((await resolve()).isOk()).to.be.true;
    });

    it('leaves a nav.json alone in a directory of that name, which is no page', async () => {
      write('content/sdks/nav.json', JSON.stringify({ pages: [] }));

      expect((await resolve()).isOk()).to.be.true;
    });

    it('answers an entry that names a generated section with its token', async () => {
      write('content/nav.json', JSON.stringify({ pages: ['index', 'sdks', 'context-plugin'] }));

      const problem = contentProblem((await resolve())._unsafeUnwrapErr());

      expect(problem.kind === 'invalidNavigation' && problem.errors).to.deep.equal([
        "content/nav.json: 'sdks' is not a page or folder in this directory. 'apimatic:sdks' positions the SDK pages.",
        "content/nav.json: 'context-plugin' is not a page or folder in this directory. 'apimatic:plugin' positions the context plugin page."
      ]);
    });
  });

  describe('the addresses the pages are served at', () => {
    beforeEach(() => {
      writeConfig({ site: { name: 'Calc' } });
      write('spec/api.json', OPENAPI);
      write('content/index.md', page('Home'));
    });

    /** Each shared address with the pages that would be served there. */
    const shared = (refused: PortalSourceProblem): string[] => {
      const problem = contentProblem(refused);
      if (problem.kind !== 'sharedAddresses') {
        throw new Error(`expected a 'sharedAddresses' problem, got '${problem.kind}'`);
      }
      return problem.addresses
        .map(
          ({ address, pages }) => `${address} ${pages.map((page) => page.relativeTo(new DirectoryPath(root))).sort()}`
        )
        .sort();
    };

    it('refuses a page named like a (group) folder, which Fumadocs throws on', async () => {
      write('content/(intro).md', page('Intro'));

      expect(contentProblem((await resolve())._unsafeUnwrapErr())).to.deep.equal({
        kind: 'groupNamedPages',
        pages: [new FilePath(new DirectoryPath(root).join('content'), new FileName('(intro).md'))]
      });
    });

    // It has no address, so it cannot share one with the page it looks like it would.
    it('refuses such a page only for its name', async () => {
      write('content/(intro).md', page('Intro'));
      write('content/(start)/(intro).md', page('Intro again'));

      expect(contentProblem((await resolve())._unsafeUnwrapErr()).kind).to.equal('groupNamedPages');
    });

    // Vite's glob, which the build reads the content through, never loads them.
    it('leaves out dot files, dot folders and node_modules, whatever they hold', async () => {
      write('content/._index.md', 'binary AppleDouble data');
      write('content/.drafts/notes.md', '# No front matter');
      write('content/.drafts/nav.json', 'not even JSON');
      write('content/node_modules/pkg/README.md', '# Readme');
      write('content/nav.json', JSON.stringify({ pages: ['index'] }));

      const source = (await resolve())._unsafeUnwrap();

      expect(source.contentNotices.hiddenPages).to.deep.equal([]);
    });

    it('does not count a dot folder as one a nav.json entry can name', async () => {
      write('content/.drafts/notes.md', page('Notes'));
      write('content/nav.json', JSON.stringify({ pages: ['index', '.drafts'] }));

      const problem = contentProblem((await resolve())._unsafeUnwrapErr());

      expect(problem.kind === 'invalidNavigation' && problem.errors).to.deep.equal([
        "content/nav.json: '.drafts' is not a page or folder in this directory."
      ]);
    });

    // The build would serve the page there and move the folder's own to /guides/index.
    it('refuses a page beside a folder whose index page has the same address', async () => {
      write('content/guides.md', page('Guides page'));
      write('content/guides/index.md', page('Guides'));

      expect(shared((await resolve())._unsafeUnwrapErr())).to.deep.equal([
        '/guides content/guides.md,content/guides/index.md'
      ]);
    });

    it('refuses every address two pages share, through a (group) folder or two extensions', async () => {
      write('content/(start)/index.md', page('Start'));
      write('content/intro.md', page('Intro'));
      write('content/(learn)/intro.mdx', page('Grouped intro'));
      write('content/faq.md', page('FAQ'));
      write('content/faq.mdx', page('FAQ again'));

      expect(shared((await resolve())._unsafeUnwrapErr())).to.deep.equal([
        '/ content/(start)/index.md,content/index.md',
        '/faq content/faq.md,content/faq.mdx',
        '/intro content/(learn)/intro.mdx,content/intro.md'
      ]);
    });

    it('names an address as the build serves it, encoded as a URL is', async () => {
      write('content/café.md', page('Café'));
      write('content/(menu)/café.mdx', page('Café again'));

      expect(shared((await resolve())._unsafeUnwrapErr())).to.deep.equal([
        '/caf%C3%A9 content/(menu)/café.mdx,content/café.md'
      ]);
    });

    it('accepts a page beside a folder of the same name that has no index page', async () => {
      write('content/guides.md', page('Guides page'));
      write('content/guides/intro.md', page('Intro'));

      expect((await resolve()).isOk()).to.be.true;
    });
  });

  // What `portal serve` runs on each save in content/, with the specifications `resolve` found.
  describe('resolveContent', () => {
    beforeEach(() => {
      writeConfig({ site: { name: 'Calc' } });
      write('spec/api.json', OPENAPI);
      write('content/index.md', page('Home'));
    });

    it('refuses what resolve refuses about the content, and accepts it once fixed', async () => {
      const { specs, generatedPages } = (await resolve())._unsafeUnwrap();
      const context = new PortalSourceContext(new DirectoryPath(root));

      write('content/nav.json', JSON.stringify({ pages: ['index', 'missing'] }));
      const refused = (await context.resolveContent(specs, generatedPages))._unsafeUnwrapErr();
      write('content/nav.json', JSON.stringify({ pages: ['index'] }));

      expect(refused.map(({ kind }) => kind)).to.deep.equal(['invalidNavigation']);
      expect((await context.resolveContent(specs, generatedPages)).isOk()).to.be.true;
    });

    // The reference's folders are the specifications' own, which it takes as they were at startup.
    it('lets content/api/nav.json name a specification without reading it again', async () => {
      const { specs, generatedPages } = (await resolve())._unsafeUnwrap();
      write('content/api/nav.json', JSON.stringify({ pages: [specs[0].slug] }));
      fs.rmSync(path.join(root, 'spec/api.json'));

      const content = await new PortalSourceContext(new DirectoryPath(root)).resolveContent(specs, generatedPages);

      expect(content.isOk()).to.be.true;
    });

    it('gives the notices resolve gives about the content', async () => {
      write('content/guides/intro.md', page('Intro'));
      write('content/nav.json', JSON.stringify({ pages: ['index', 'guides'] }));
      write('content/api/api/notes.md', page('Notes'));
      write('content/guides/Nav.json', JSON.stringify({ pages: ['intro'] }));
      const source = (await resolve())._unsafeUnwrap();

      const accepted = await new PortalSourceContext(new DirectoryPath(root)).resolveContent(
        source.specs,
        source.generatedPages
      );

      expect(accepted._unsafeUnwrap().notices).to.deep.equal(source.contentNotices);
      expect(hidden(source)).to.deep.equal(['content/api/api/notes.md']);
      expect(ignored(source)).to.deep.equal(['content/guides/Nav.json']);
      expect(source.contentNotices.folderTabs.map((folder) => folder.leafName())).to.deep.equal(['guides']);
    });

    // What `portal serve` writes into the preview's copy, since a save made after it read them went unchecked.
    it('gives each page and nav.json it accepted, as it read them', async () => {
      write('content/guides/intro.md', page('Intro'));
      write('content/nav.json', JSON.stringify({ pages: ['index', 'guides'] }));
      write('content/logo.png', 'x');
      const { specs, generatedPages } = (await resolve())._unsafeUnwrap();

      const { files } = (
        await new PortalSourceContext(new DirectoryPath(root)).resolveContent(specs, generatedPages)
      )._unsafeUnwrap();

      expect(
        files.map(({ file, contents }) => [file.relativeTo(new DirectoryPath(root)), contents]).sort()
      ).to.deep.equal([
        ['content/guides/intro.md', page('Intro')],
        ['content/index.md', page('Home')],
        ['content/nav.json', JSON.stringify({ pages: ['index', 'guides'] })]
      ]);
    });

    // `portal serve` passes the generated pages the preview shows, which an edit to apimatic.json changes.
    it('names the tabs against the generated pages it is given', async () => {
      write('content/extensions/first.md', page('First'));
      write('content/extensions/nav.json', JSON.stringify({ title: 'Context Plugin' }));
      write('content/nav.json', JSON.stringify({ pages: ['index', 'extensions'] }));
      const { specs, generatedPages: withoutPlugin } = (await resolve())._unsafeUnwrap();
      write('apimatic.json', JSON.stringify({ portal: { site: { name: 'Calc' } }, languages: LANGUAGES, plugin: {} }));
      const { generatedPages: withPlugin } = (await resolve())._unsafeUnwrap();
      const context = new PortalSourceContext(new DirectoryPath(root));

      const names = async (generatedPages: GeneratedPages) =>
        (await context.resolveContent(specs, generatedPages))
          ._unsafeUnwrap()
          .notices.sharedTabNames.map(({ name }) => name);

      expect(await names(withoutPlugin)).to.deep.equal([]);
      expect(await names(withPlugin)).to.deep.equal(['Context Plugin']);
    });
  });

  // One run lists all of it, so a project upgraded from 1.x is not fixed one kind of mistake at a time.
  describe('every problem in the content', () => {
    beforeEach(() => {
      writeConfig({ site: { name: 'Calc' } });
      write('spec/api.json', OPENAPI);
      write('content/index.md', page('Home'));
    });

    const kinds = async () => contentProblems((await resolve())._unsafeUnwrapErr()).map(({ kind }) => kind);

    it('reports the front matter and the nav.json files together', async () => {
      write('content/notes.md', '# Notes');
      write('content/nav.json', JSON.stringify({ pages: ['index', 'missing'] }));

      expect(await kinds()).to.deep.equal(['invalidFrontMatter', 'invalidNavigation']);
    });

    it('reports every kind of page at the wrong address together, with the front matter', async () => {
      write('content/(intro).md', page('Intro'));
      write('content/sdks.md', page('Mine'));
      write('content/faq.md', page('FAQ'));
      write('content/faq.mdx', '# FAQ again');

      expect(await kinds()).to.deep.equal([
        'groupNamedPages',
        'reservedAddresses',
        'sharedAddresses',
        'invalidFrontMatter'
      ]);
    });

    // An entry naming such a page would be answered as if the page were served where it sits.
    it('leaves the nav.json files until every page has an address of its own', async () => {
      write('content/guides.md', page('Guides page'));
      write('content/guides/index.md', page('Guides'));
      write('content/nav.json', JSON.stringify({ pages: ['index', 'guides', 'missing'] }));

      expect(await kinds()).to.deep.equal(['sharedAddresses']);
    });
  });

  // The build fails as a whole over one page its schema refuses, with a stack trace for a message.
  describe('the front matter of the pages', () => {
    beforeEach(() => {
      writeConfig({ site: { name: 'Calc' } });
      write('spec/api.json', OPENAPI);
      write('content/index.md', page('Home'));
    });

    it('refuses every page whose front matter the build would refuse, naming each', async () => {
      write('content/notes.md', 'Just a body, no front matter.');
      write('content/guides/intro.mdx', '---\ntitle: 2024\n---\n');

      const problem = contentProblem((await resolve())._unsafeUnwrapErr());

      expect(problem.kind === 'invalidFrontMatter' && [...problem.errors].sort()).to.deep.equal([
        "content/guides/intro.mdx: 'title' must be text. Put it in quotes if it looks like a number or true or false.",
        'content/notes.md has no front matter, which is where its title goes.'
      ]);
    });

    it('reports a page it cannot read, rather than throwing', async () => {
      write('content/notes.md', page('Notes'));
      const getContents = FileService.prototype.getContents;
      const read = sinon
        .stub(FileService.prototype, 'getContents')
        .callsFake(function (this: FileService, file: FilePath) {
          return file.name().is('notes.md') ? Promise.reject(new Error('EACCES')) : getContents.call(this, file);
        });

      try {
        const problem = contentProblem((await resolve())._unsafeUnwrapErr());

        expect(problem.kind === 'invalidFrontMatter' && problem.errors).to.deep.equal([
          'content/notes.md could not be read.'
        ]);
      } finally {
        read.restore();
      }
    });

    it('checks the pages below content/api too, which the build compiles as well', async () => {
      write('content/api/overview.md', '# Overview');

      const problem = contentProblem((await resolve())._unsafeUnwrapErr());

      expect(problem.kind === 'invalidFrontMatter' && problem.errors).to.deep.equal([
        'content/api/overview.md has no front matter, which is where its title goes.'
      ]);
    });
  });

  // The build imports each Markdown image, and fails as a whole over one it cannot find.
  describe('the images the pages show', () => {
    beforeEach(() => {
      writeConfig({ site: { name: 'Calc' } });
      write('spec/api.json', OPENAPI);
      write('static/images/logo.png', 'png');
      write('content/guides/diagram.png', 'png');
    });

    /** Each missing image: its page and line, as written, where it was looked for and what is there instead. */
    const missingImages = async () => {
      const problem = contentProblem((await resolve())._unsafeUnwrapErr());
      if (problem.kind !== 'missingImages') {
        throw new Error(`expected missing images, got '${problem.kind}'`);
      }
      const relative = (file: FilePath | null) => (file === null ? null : file.relativeTo(new DirectoryPath(root)));
      return problem.images.map(({ page, line, url, missing }) => [
        `${relative(page)}:${line}`,
        url,
        relative(missing?.file ?? null),
        relative(missing?.foundAs ?? null)
      ]);
    };

    it('accepts images in the static directory and beside their page, whatever the query or encoding', async () => {
      write('static/images/team photo.png', 'png');
      write(
        'content/guides/index.md',
        page('Guides') +
          '![Logo](/images/logo.png)\n\n![Diagram](./diagram.png?v=2)\n\n![Again](diagram.png#top)\n\n' +
          '![Team](/images/team%20photo.png)\n\n![Remote](https://example.com/x.png)\n\n![Inline](data:image/png;base64,AA)\n'
      );

      expect((await resolve()).isOk()).to.be.true;
    });

    it('names each image the build would not find, with its page and line', async () => {
      write(
        'content/guides/index.md',
        page('Guides') + '\n![Logo](/images/missing.png)\n\nText ![Diagram](./missing.png) inline.\n'
      );

      expect(await missingImages()).to.deep.equal([
        ['content/guides/index.md:5', '/images/missing.png', 'static/images/missing.png', null],
        ['content/guides/index.md:7', './missing.png', 'content/guides/missing.png', null]
      ]);
    });

    // Found by this machine's file system, and lost by a build on one that matches case.
    it('names the spelling on disk of an image written in another case', async () => {
      write('content/index.md', page('Home') + '![Logo](/images/Logo.png)\n');

      expect(await missingImages()).to.deep.equal([
        ['content/index.md:4', '/images/Logo.png', 'static/images/Logo.png', 'static/images/logo.png']
      ]);
    });

    it('refuses a static image when there is no static directory', async () => {
      fs.rmSync(path.join(root, 'static'), { recursive: true });
      write('content/index.md', page('Home') + '![Logo](/images/logo.png)\n');

      expect(await missingImages()).to.deep.equal([
        ['content/index.md:4', '/images/logo.png', 'static/images/logo.png', null]
      ]);
    });

    // The build reads a copy of content/, which neither of these is in.
    it('refuses an image beside the page that points out of content/ or into a folder the build skips', async () => {
      write('content/.drafts/sketch.png', 'png');
      write('content/index.md', page('Home') + '![Logo](../static/images/logo.png)\n\n![Sketch](.drafts/sketch.png)\n');

      expect(await missingImages()).to.deep.equal([
        ['content/index.md:4', '../static/images/logo.png', null, null],
        ['content/index.md:6', '.drafts/sketch.png', null, null]
      ]);
    });

    it('reads an image in a code block or inline code as the text it is', async () => {
      write('content/index.md', page('Home') + '```md\n![Logo](/images/missing.png)\n```\n\nWrite `![a](/b.png)`.\n');

      expect((await resolve()).isOk()).to.be.true;
    });

    it('reads an .mdx page as MDX, where an image inside a component is still an image', async () => {
      write('content/index.mdx', page('Home') + '<Callout>\n\n![Logo](/images/missing.png)\n\n</Callout>\n');

      expect(await missingImages()).to.deep.equal([
        ['content/index.mdx:6', '/images/missing.png', 'static/images/missing.png', null]
      ]);
    });

    it('reports the images with the other problems in the content', async () => {
      write('content/notes.md', '# Notes');
      write('content/index.md', page('Home') + '![Logo](/images/missing.png)\n');

      const kinds = contentProblems((await resolve())._unsafeUnwrapErr()).map(({ kind }) => kind);

      expect(kinds).to.deep.equal(['invalidFrontMatter', 'missingImages']);
    });
  });

  describe('nav.json', () => {
    beforeEach(() => {
      writeConfig({ site: { name: 'Calc' } });
      write('spec/api.json', OPENAPI);
      write('content/index.md', page('Home'));
      write('content/authentication.md', page('Auth'));
    });

    /** The errors behind an `invalidNavigation` problem, as their own type. */
    const navigationErrors = (refused: PortalSourceProblem): string[] => {
      const problem = contentProblem(refused);
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

    it('reports a file it cannot read, rather than throwing', async () => {
      write('content/nav.json', JSON.stringify({ pages: ['index'] }));
      const getContents = FileService.prototype.getContents;
      const read = sinon
        .stub(FileService.prototype, 'getContents')
        .callsFake(function (this: FileService, file: FilePath) {
          return file.name().is('nav.json') ? Promise.reject(new Error('EACCES')) : getContents.call(this, file);
        });

      try {
        expect(navigationErrors((await resolve())._unsafeUnwrapErr())).to.deep.equal([
          'content/nav.json could not be read.'
        ]);
      } finally {
        read.restore();
      }
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
      write('content/api/overview.md', page('Overview'));
      write('content/api/nav.json', JSON.stringify({ pages: ['overview', 'api', 'billing'] }));

      expect((await resolve()).isOk()).to.be.true;
    });

    // Listing a folder in the content root's file is what makes it a tab.
    it('reports a root setting in a folder’s nav.json as unknown', async () => {
      write('content/tutorials/first-call.md', page('First call'));
      write('content/tutorials/nav.json', JSON.stringify({ root: true }));

      const errors = navigationErrors((await resolve())._unsafeUnwrapErr());

      expect(errors).to.deep.equal([
        "content/tutorials/nav.json: 'root' is not a nav.json setting. The settings are 'pages' and 'title'."
      ]);
    });

    it('makes a tab of each folder the root nav.json lists, in its order, and of no other', async () => {
      write('content/tutorials/first-call.md', page('First call'));
      write('content/guides/intro.md', page('Intro'));
      write('content/concepts/pets.md', page('Pets'));
      write('content/nav.json', JSON.stringify({ pages: ['index', 'tutorials', 'guides', '...'] }));

      const folders = (await resolve())._unsafeUnwrap().contentNotices.folderTabs.map((folder) => folder.leafName());

      expect(folders).to.deep.equal(['tutorials', 'guides']);
    });

    it('refuses a name shared by a page and a folder, since only the folder could be positioned', async () => {
      write('content/guides.md', page('Guides'));
      write('content/guides/intro.md', page('Intro'));
      write('content/nav.json', JSON.stringify({ pages: ['guides', 'index'] }));

      const errors = navigationErrors((await resolve())._unsafeUnwrapErr());

      expect(errors[0]).to.contain("content/nav.json: 'guides' is both a page and a folder");
    });

    // The reference is mounted at content/api with no directory there to see, so nothing in
    // the tree makes `api` look like two children. Listing it is what turns the entry the
    // template would honour as the reference into an error rather than a silent reordering.
    it('refuses api at the root when a page carries the name the reference is mounted at', async () => {
      write('content/api.md', page('My API notes'));
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
      write('content/api/overview.md', page('Overview'));
      write('content/nav.json', JSON.stringify({ pages: ['index', 'api'] }));

      expect((await resolve()).isOk()).to.be.true;
    });

    // One node, so the two spellings name it twice wherever the directory came from.
    it('refuses api together with the token, with or without a directory of that name', async () => {
      write('content/api/overview.md', page('Overview'));
      write('content/nav.json', JSON.stringify({ pages: ['index', 'api', 'apimatic:api'] }));

      const errors = navigationErrors((await resolve())._unsafeUnwrapErr());

      expect(errors[0]).to.contain("'api' and 'apimatic:api' both position the API reference");
    });

    // The specification's folder is one child; a page of the same name beside it is another.
    it('refuses a specification’s name when a page under content/api carries it too', async () => {
      write('content/api/api.md', page('Landing'));
      write('content/api/nav.json', JSON.stringify({ pages: ['api'] }));

      const errors = navigationErrors((await resolve())._unsafeUnwrapErr());

      expect(errors[0]).to.contain("content/api/nav.json: 'api' is both a page and a folder");
    });

    it('refuses a specification named anywhere but in content/api', async () => {
      write('content/guides/intro.md', page('Intro'));
      write('content/guides/nav.json', JSON.stringify({ pages: ['intro', 'api'] }));

      const errors = navigationErrors((await resolve())._unsafeUnwrapErr());

      expect(errors[0]).to.contain("content/guides/nav.json: 'api' is not a page or folder");
    });

    it('validates a nested file against its own directory', async () => {
      write('content/guides/intro.md', page('Intro'));
      write('content/nav.json', JSON.stringify({ pages: ['index', 'guides'] }));
      write('content/guides/nav.json', JSON.stringify({ pages: ['intro'] }));

      expect((await resolve()).isOk()).to.be.true;
    });

    // A folder's index page is what the folder itself links to, not one of its children.
    it('refuses index in a nested file while keeping it at the content root', async () => {
      write('content/guides/index.md', page('Guides'));
      write('content/guides/intro.md', page('Intro'));
      write('content/nav.json', JSON.stringify({ pages: ['index', 'guides'] }));
      write('content/guides/nav.json', JSON.stringify({ pages: ['index', 'intro'] }));

      const errors = navigationErrors((await resolve())._unsafeUnwrapErr());

      expect(errors).to.have.lengthOf(1);
      expect(errors[0]).to.contain("content/guides/nav.json: 'index' is the page this folder opens on");
    });

    it('refuses a page named in the wrong directory', async () => {
      write('content/guides/intro.md', page('Intro'));
      // 'authentication' is a sibling of the content root's nav.json, not of this one.
      write('content/guides/nav.json', JSON.stringify({ pages: ['authentication'] }));

      const errors = navigationErrors((await resolve())._unsafeUnwrapErr());

      expect(errors[0]).to.contain("content/guides/nav.json: 'authentication' is not a page or folder");
    });

    it('refuses an apimatic token outside the content root', async () => {
      write('content/guides/intro.md', page('Intro'));
      write('content/guides/nav.json', JSON.stringify({ pages: ['intro', 'apimatic:api'] }));

      const errors = navigationErrors((await resolve())._unsafeUnwrapErr());

      expect(errors[0]).to.contain("content/guides/nav.json: 'apimatic:api' can only be used");
    });

    it('collects the errors of every file in the tree', async () => {
      write('content/guides/intro.md', page('Intro'));
      write('content/nav.json', JSON.stringify({ pages: ['nope'] }));
      write('content/guides/nav.json', JSON.stringify({ pages: ['also-nope'] }));

      const errors = navigationErrors((await resolve())._unsafeUnwrapErr());

      expect(errors).to.have.lengthOf(2);
      expect(errors.join('\n')).to.contain('content/nav.json');
      expect(errors.join('\n')).to.contain('content/guides/nav.json');
    });

    it('addresses a page by its name without the extension, for both md and mdx', async () => {
      write('content/tour.mdx', page('Tour'));
      write('content/nav.json', JSON.stringify({ pages: ['index', 'tour', 'authentication'] }));

      expect((await resolve()).isOk()).to.be.true;
    });

    // The sidebar shows no folder for a directory with no pages under it, so an entry naming
    // one would resolve to nothing.
    it('refuses a directory that holds no pages', async () => {
      write('content/assets/logo.png', 'x');
      write('content/nav.json', JSON.stringify({ pages: ['index', 'assets'] }));

      const errors = navigationErrors((await resolve())._unsafeUnwrapErr());

      expect(errors[0]).to.contain("'assets' is a folder with no page in it or below it");
    });

    // The template drops the empty folder Fumadocs would otherwise build for it.
    it('refuses a directory that holds only a nav.json', async () => {
      write('content/guides/nav.json', JSON.stringify({ pages: [] }));
      write('content/nav.json', JSON.stringify({ pages: ['index', 'guides'] }));

      const errors = navigationErrors((await resolve())._unsafeUnwrapErr());

      expect(errors).to.deep.equal([
        "content/nav.json: 'guides' is a folder with no page in it or below it, so it is not in the sidebar. " +
          'Add a page to it, or remove the entry.'
      ]);
    });

    it('refuses to make a tab of a (group) folder that serves the home page, however deep', async () => {
      fs.rmSync(path.join(root, 'content/index.md'));
      write('content/(start)/(welcome)/index.md', page('Welcome'));
      write('content/nav.json', JSON.stringify({ pages: ['(start)', 'authentication'] }));

      const errors = navigationErrors((await resolve())._unsafeUnwrapErr());

      expect(errors).to.have.lengthOf(1);
      expect(errors[0]).to.match(
        /^content\/nav\.json: '\(start\)' serves the home page, which belongs to the Home tab/
      );
    });

    it('makes a tab of a (group) folder that does not serve the home page', async () => {
      write('content/(start)/intro/index.md', page('Intro'));
      write('content/nav.json', JSON.stringify({ pages: ['index', '(start)'] }));

      const { folderTabs } = (await resolve())._unsafeUnwrap().contentNotices;

      expect(folderTabs.map((folder) => folder.leafName())).to.deep.equal(['(start)']);
    });

    it('accepts a directory whose pages are nested below it', async () => {
      write('content/guides/deep/intro.md', page('Intro'));
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
      first.contentNotices.ignoredNavigationFiles.length = 0;

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
      write('content/guides/intro.md', page('Intro'));
      write('content/guides/nav.yaml', 'pages: [nonsense]');

      const source = (await resolve())._unsafeUnwrap();

      expect(ignored(source)).to.deep.equal([]);
    });
  });

  describe('tab names', () => {
    beforeEach(() => {
      writeConfig({ site: { name: 'Calc' } });
      write('spec/api.json', OPENAPI);
      write('content/index.md', '---\ntitle: Welcome\n---\n');
    });

    /** A tab as its kind and, when a file names it, that file. */
    const described = ({ owner, namedBy }: PortalTab) =>
      namedBy === null ? owner.kind : `${owner.kind} ${namedBy.relativeTo(new DirectoryPath(root))}`;

    /** Each name more than one tab shares, with its tabs described and sorted. */
    const shared = async (): Promise<[string, string[]][]> => {
      const source = (await resolve())._unsafeUnwrap();
      return source.contentNotices.sharedTabNames.map(({ name, tabs }) => [name, tabs.map(described).sort()]);
    };

    /** A folder directly under `content/`, which `listFolders` makes a tab. */
    const folder = (directory: string, title?: string, indexTitle?: string) => {
      write(`content/${directory}/first.md`, '---\ntitle: First\n---\n');
      if (title !== undefined) {
        write(`content/${directory}/nav.json`, JSON.stringify({ title }));
      }
      if (indexTitle !== undefined) {
        write(`content/${directory}/index.md`, `---\ntitle: ${indexTitle}\n---\n`);
      }
    };

    /** The root `nav.json`, listing these folders and so making each a tab, and naming Home if given a title. */
    const listFolders = (folders: string[], title?: string) =>
      write(
        'content/nav.json',
        JSON.stringify({ ...(title === undefined ? {} : { title }), pages: ['index', ...folders] })
      );

    it('finds none when every tab has a name of its own', async () => {
      folder('tutorials', 'Tutorials');
      listFolders(['tutorials']);

      expect(await shared()).to.deep.equal([]);
    });

    it('finds a folder tab titled like the Home tab', async () => {
      folder('start', 'Home');
      listFolders(['start']);

      expect(await shared()).to.deep.equal([['Home', ['folder content/start/nav.json', 'home']]]);
    });

    it('finds the Home tab titled like a folder tab in another case', async () => {
      folder('guides', 'Guides');
      listFolders(['guides'], 'guides');

      expect(await shared()).to.deep.equal([['guides', ['folder content/guides/nav.json', 'home content/nav.json']]]);
    });

    it('finds the Home tab titled like a folder tab its index page names', async () => {
      folder('guides', undefined, 'Guides');
      listFolders(['guides'], 'Guides');

      expect(await shared()).to.deep.equal([['Guides', ['folder content/guides/index.md', 'home content/nav.json']]]);
    });

    it('names a folder tab after its directory when nothing else does', async () => {
      folder('getting-started');
      listFolders(['getting-started'], 'Getting started');

      expect(await shared()).to.deep.equal([['Getting started', ['folder', 'home content/nav.json']]]);
    });

    it('prefers the title in a folder tab’s nav.json to its index page’s', async () => {
      folder('guides', 'Learn', 'Home');
      listFolders(['guides']);

      expect(await shared()).to.deep.equal([]);
    });

    it('finds a folder tab titled like the API reference, which no directory has to back', async () => {
      folder('reference', 'API Reference');
      listFolders(['reference']);

      expect(await shared()).to.deep.equal([['API Reference', ['apiReference', 'folder content/reference/nav.json']]]);
    });

    it('names the API reference by content/api/nav.json, then by its index page', async () => {
      folder('guides', 'Guides');
      folder('tutorials', 'Tutorials');
      listFolders(['guides', 'tutorials']);
      write('content/api/index.md', '---\ntitle: Tutorials\n---\n');
      write('content/api/nav.json', JSON.stringify({ title: 'Guides' }));

      expect(await shared()).to.deep.equal([
        ['Guides', ['apiReference content/api/nav.json', 'folder content/guides/nav.json']]
      ]);

      fs.rmSync(path.join(root, 'content/api/nav.json'));

      expect(await shared()).to.deep.equal([
        ['Tutorials', ['apiReference content/api/index.md', 'folder content/tutorials/nav.json']]
      ]);
    });

    it('finds a folder tab titled like a generated tab', async () => {
      folder('downloads', 'SDKs');
      listFolders(['downloads']);

      expect(await shared()).to.deep.equal([['SDKs', ['folder content/downloads/nav.json', 'generated']]]);
    });

    it('counts the context plugin’s tab only when there is a plugin block', async () => {
      folder('assistant', 'Context Plugin');
      listFolders(['assistant']);

      expect(await shared()).to.deep.equal([]);

      write('apimatic.json', JSON.stringify({ portal: { site: { name: 'Calc' } }, languages: LANGUAGES, plugin: {} }));

      expect(await shared()).to.deep.equal([['Context Plugin', ['folder content/assistant/nav.json', 'generated']]]);
    });

    it('does not count a folder the root nav.json does not list, which stays in Home', async () => {
      folder('start', 'Home');
      listFolders([]);

      expect(await shared()).to.deep.equal([]);
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
      expect(Object.keys(written.portal)).to.deep.equal(['site', 'brand', 'navigation', 'ai']);
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
      expect(scaffolded.contentNotices.ignoredNavigationFiles).to.deep.equal([]);
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

    // What a build downloaded from the platform arrives as: `spec/` filled, and nothing else.
    describe('adopt', () => {
      const writeSourceSpec = (name: string, info: Record<string, unknown>): FilePath => {
        write(path.join('project', 'src', 'spec', name), JSON.stringify({ openapi: '3.0.0', info, paths: {} }));
        return new FilePath(source.join('spec'), new FileName(name));
      };

      it('writes the tree around a specification already in the source directory', async () => {
        const specPath = writeSourceSpec('petstore.json', { title: 'Petstore', version: '1' });

        (await new PortalSourceContext(source).adopt(specPath, APIMATIC_SCHEMA_URL))._unsafeUnwrap();
        addLanguages();

        const resolved = (await new PortalSourceContext(source).resolve())._unsafeUnwrap();
        expect(resolved.config.siteTitle()).to.equal('Petstore');
        // The one that was there, and no copy of it beside itself.
        expect(fs.readdirSync(path.join(source.toString(), 'spec'))).to.deep.equal(['petstore.json']);
      });

      it('finds the document the portal speaks for, sorted as every other list sorts it', async () => {
        writeSourceSpec('zebra.yaml', { title: 'Zebra', version: '1' });
        writeSourceSpec('alpha.json', { title: 'Alpha', version: '1' });
        write(path.join('project', 'src', 'spec', 'README.md'), '# not a specification');

        const found = await new PortalSourceContext(source).primarySpec();

        expect(found?.name().toString()).to.equal('alpha.json');
      });

      it('finds nothing in a project with no source directory', async () => {
        expect(await new PortalSourceContext(source).primarySpec()).to.be.null;
      });

      it('finds nothing when the specification directory holds no document', async () => {
        write(path.join('project', 'src', 'spec', 'notes.txt'), 'nothing here');

        expect(await new PortalSourceContext(source).primarySpec()).to.be.null;
      });
    });
  });
});
