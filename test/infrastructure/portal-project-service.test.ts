import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import semver from 'semver';
import sinon from 'sinon';
import { FileService } from '../../src/infrastructure/file-service';
import {
  GENERATED_DIRECTORY_NAME,
  PortalProjectService,
  TEMPLATE_DEPENDENCIES
} from '../../src/infrastructure/portal-project-service';
import { DirectoryPath } from '../../src/types/file/directoryPath';
import { FileName } from '../../src/types/file/fileName';
import { FilePath } from '../../src/types/file/filePath';
import { CodeSampleCatalog, CodeSampleCatalogs } from '../../src/types/portal/code-samples';
import { GeneratedPages } from '../../src/types/portal/generated-pages';
import { PortalConfig, PortalIdentity } from '../../src/types/portal/portal-config';
import { PortalArtifacts } from '../../src/types/portal/portal-artifacts';
import { PortalLanguages } from '../../src/types/portal/portal-languages';
import { PortalSource } from '../../src/types/portal/portal-source';
import { PortalStylesheet } from '../../src/types/portal/portal-stylesheet';
import { Language } from '../../src/types/sdk/generate';

const NO_ARTIFACTS = PortalArtifacts.none();

describe('PortalProjectService', () => {
  const service = new PortalProjectService();
  let root: string;
  let project: DirectoryPath;

  const configFor = (block: object) => PortalConfig.fromBlock(block, null)._unsafeUnwrap();

  const pagesFor = (languages: Record<string, object> = { typescript: {} }, plugin = false) =>
    GeneratedPages.of(PortalLanguages.fromBlock(languages, [])._unsafeUnwrap(), plugin);

  /** What `portal serve` passes on an edit: the block, and the pages the default source generates. */
  const settingsFor = (config: PortalConfig, generatedPages = pagesFor()) => ({ config, generatedPages });

  /** Every file in the generated directory, relative to it. */
  const generatedFiles = () => {
    const directory = path.join(project.toString(), GENERATED_DIRECTORY_NAME);
    return fs
      .readdirSync(directory, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => path.relative(directory, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
      .sort();
  };

  const sourceFor = (overrides: Partial<PortalSource> = {}): PortalSource => ({
    config: configFor({ site: { name: 'My API' } }),
    generatedPages: pagesFor(),
    suggestedSite: null,
    specs: [
      {
        slug: 'calculator',
        file: new FilePath(new DirectoryPath(root).join('spec'), new FileName('api.json')),
        endpoints: []
      }
    ],
    contentDirectory: null,
    staticDirectory: null,
    shadowedFiles: [],
    hiddenPages: [],
    ignoredNavigationFiles: [],
    ...overrides
  });

  const readConfig = () => JSON.parse(fs.readFileSync(path.join(project.toString(), 'portal.config.json'), 'utf8'));
  const readIdentity = () =>
    JSON.parse(fs.readFileSync(path.join(project.toString(), 'portal.identity.json'), 'utf8')) as PortalIdentity;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-project-'));
    project = new DirectoryPath(root).join('build');
    fs.mkdirSync(project.toString(), { recursive: true });
  });

  afterEach(() => {
    sinon.restore();
    // Node's own removal deletes the links, never what they point at. A shell recursive
    // delete would follow a junction on Windows and empty the CLI's own node_modules.
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('reports no runtime problem with the dependencies installed', () => {
    expect(service.runtimeProblem()).to.be.null;
  });

  // The init hook is the only Node version gate, so a template dependency that raises its own
  // floor above the CLI's must raise `engines.node` with it rather than crash inside Vite.
  it('supports only Node versions every template dependency supports', () => {
    const readManifest = (directory: string) =>
      JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
    const supported = readManifest('.').engines.node;

    for (const dependency of TEMPLATE_DEPENDENCIES) {
      const required = readManifest(path.join('node_modules', dependency)).engines?.node;
      if (required !== undefined) {
        expect(semver.subset(supported, required), `${dependency} needs Node ${required}`).to.be.true;
      }
    }
  });

  describe('prepare', () => {
    it('links every dependency the template imports, resolved to a real package', async () => {
      (await service.prepare(project, sourceFor(), NO_ARTIFACTS))._unsafeUnwrap();

      const modules = path.join(project.toString(), 'node_modules');
      const linked = fs
        .readdirSync(modules, { withFileTypes: true })
        .flatMap((entry) =>
          entry.name.startsWith('@')
            ? fs.readdirSync(path.join(modules, entry.name)).map((nested) => `${entry.name}/${nested}`)
            : [entry.name]
        );

      expect(linked).to.include.members(['react', 'vite', 'fumadocs-ui', '@tanstack/react-start']);
      for (const name of linked) {
        // Each link must reach that package's own manifest, not merely exist.
        const manifest = JSON.parse(fs.readFileSync(path.join(modules, name, 'package.json'), 'utf8'));
        expect(manifest.name, `${name} resolves to the wrong package`).to.equal(name);
      }
    });

    it('copies the template rather than moving it', async () => {
      (await service.prepare(project, sourceFor(), NO_ARTIFACTS))._unsafeUnwrap();

      expect(fs.existsSync(path.join(process.cwd(), 'portal-template', 'vite.config.ts'))).to.be.true;
      expect(fs.existsSync(path.join(project.toString(), 'vite.config.ts'))).to.be.true;
    });

    it('writes the specs and the directories into the build-only config', async () => {
      (await service.prepare(project, sourceFor(), NO_ARTIFACTS))._unsafeUnwrap();

      const config = readConfig();
      expect(Object.keys(config).sort()).to.deep.equal([
        'codeSamples',
        'contentDir',
        'downloadsDir',
        'generatedDir',
        'specs',
        'staticDir'
      ]);
      expect(Object.keys(config.specs)).to.deep.equal(['calculator']);
      expect(config.specs.calculator).to.contain('api.json');
    });

    it('writes the generated pages into the project, and names their directory in the build-only config', async () => {
      (
        await service.prepare(project, sourceFor({ generatedPages: pagesFor({ typescript: {} }, true) }), NO_ARTIFACTS)
      )._unsafeUnwrap();

      expect(generatedFiles()).to.deep.equal([
        'context-plugin/index.mdx',
        'context-plugin/nav.json',
        'sdks/index.mdx',
        'sdks/nav.json',
        'sdks/typescript.mdx'
      ]);
      expect(readConfig().generatedDir).to.equal(
        path.join(project.toString(), GENERATED_DIRECTORY_NAME).split(path.sep).join('/')
      );
    });

    it('writes what the browser is told into a file of its own', async () => {
      const config = configFor({
        site: { name: 'My API', url: 'https://docs.example.com', description: 'Docs for it' },
        brand: { logo: 'static/images/logo.png' }
      });

      (await service.prepare(project, sourceFor({ config }), NO_ARTIFACTS))._unsafeUnwrap();

      expect(readIdentity()).to.deep.equal(config.identity());
      expect(readIdentity().logo).to.deep.equal({ light: '/images/logo.png', dark: '/images/logo.png' });
      expect(readIdentity().siteUrl).to.equal('https://docs.example.com');
    });

    // The browser bundle imports the file whole, so a path from this machine in it would be
    // published to every visitor.
    it('keeps every path from this machine out of what the browser is told', async () => {
      const contentDirectory = new DirectoryPath(root).join('content');
      fs.mkdirSync(contentDirectory.toString(), { recursive: true });

      (await service.prepare(project, sourceFor({ contentDirectory }), NO_ARTIFACTS))._unsafeUnwrap();

      const identity = fs.readFileSync(path.join(project.toString(), 'portal.identity.json'), 'utf8');
      expect(identity).to.not.contain(root.split(path.sep).join('/'));
      expect(identity).to.not.contain(JSON.stringify(root).slice(1, -1));
      expect(identity).to.not.contain('specs');
    });

    it('writes the stylesheet the block describes beside the one that imports it', async () => {
      const config = configFor({
        site: { name: 'My API' },
        brand: { colors: { primary: '#1d4ed8' } }
      });

      (await service.prepare(project, sourceFor({ config }), NO_ARTIFACTS))._unsafeUnwrap();

      const styles = path.join(project.toString(), 'src/styles');
      expect(fs.readFileSync(path.join(styles, 'theme.css'), 'utf8')).to.equal(PortalStylesheet.of(config).toString());
      expect(fs.readFileSync(path.join(styles, 'app.css'), 'utf8')).to.contain("@import './theme.css';");
    });

    it('leaves no identity placeholder in the module the browser receives', async () => {
      (await service.prepare(project, sourceFor(), NO_ARTIFACTS))._unsafeUnwrap();

      const module = fs.readFileSync(path.join(project.toString(), 'src/lib/portal.ts'), 'utf8');
      expect(module).to.not.contain('__APIMATIC_');
      expect(module).to.contain("from '../../portal.identity.json'");
    });

    it('reports no static directory when the project has none', async () => {
      (await service.prepare(project, sourceFor(), NO_ARTIFACTS))._unsafeUnwrap();

      expect(readConfig().staticDir).to.be.null;
    });

    it('substitutes the content directory placeholder, which the Fumadocs macro needs as a literal', async () => {
      const contentDirectory = new DirectoryPath(root).join('content');
      fs.mkdirSync(contentDirectory.toString(), { recursive: true });

      (await service.prepare(project, sourceFor({ contentDirectory }), NO_ARTIFACTS))._unsafeUnwrap();

      const module = fs.readFileSync(path.join(project.toString(), 'src/lib/source.ts'), 'utf8');
      expect(module).to.not.contain('__APIMATIC_CONTENT_DIR__');
      expect(module).to.contain(JSON.stringify(contentDirectory.toString().split(path.sep).join('/')));
    });

    it('substitutes the content directory into the stylesheet Tailwind scans', async () => {
      const contentDirectory = new DirectoryPath(root).join('content');
      fs.mkdirSync(contentDirectory.toString(), { recursive: true });

      (await service.prepare(project, sourceFor({ contentDirectory }), NO_ARTIFACTS))._unsafeUnwrap();

      const stylesheet = fs.readFileSync(path.join(project.toString(), 'src/styles/app.css'), 'utf8');
      expect(stylesheet).to.not.contain('__APIMATIC_CONTENT_DIR__');
      expect(stylesheet).to.contain(contentDirectory.toString().split(path.sep).join('/'));
    });

    it('creates an empty content directory when the project has none, so the build has one to read', async () => {
      (await service.prepare(project, sourceFor(), NO_ARTIFACTS))._unsafeUnwrap();

      const config = readConfig();
      expect(fs.existsSync(config.contentDir)).to.be.true;
      expect(fs.readdirSync(config.contentDir)).to.be.empty;
    });
  });

  describe('code samples', () => {
    const withCatalogs = new PortalArtifacts(
      new CodeSampleCatalogs([
        CodeSampleCatalog.fromJson(Language.TYPESCRIPT, {
          paths: { '/pets': { GET: { Example: 'await client.pets.list();' } } },
          webhooks: {}
        }) as CodeSampleCatalog
      ]),
      new Map(),
      undefined
    );

    it('writes the samples beside the configuration, keyed by path and method, and names them in it', async () => {
      (await service.prepare(project, sourceFor(), withCatalogs))._unsafeUnwrap();

      const config = readConfig();
      expect(config.codeSamples).to.equal(path.join(project.toString(), 'code-samples.json').split(path.sep).join('/'));
      expect(JSON.parse(fs.readFileSync(config.codeSamples, 'utf8'))).to.deep.equal({
        '/pets': {
          GET: [{ lang: 'typescript', label: 'TypeScript', sources: { Example: 'await client.pets.list();' } }]
        }
      });
    });

    it('points each spec at its own file, samples or not', async () => {
      const source = sourceFor();

      (await service.prepare(project, source, withCatalogs))._unsafeUnwrap();

      expect(readConfig().specs.calculator).to.equal(source.specs[0].file.toString().split(path.sep).join('/'));
    });

    it('names no samples when there are none', async () => {
      (await service.prepare(project, sourceFor(), NO_ARTIFACTS))._unsafeUnwrap();

      expect(readConfig().codeSamples).to.be.null;
      expect(fs.existsSync(path.join(project.toString(), 'code-samples.json'))).to.be.false;
    });
  });

  describe('downloads', () => {
    const downloaded = (name: string, contents: string): FilePath => {
      const file = path.join(root, name);
      fs.writeFileSync(file, contents);
      return FilePath.create(file)!;
    };

    const downloadsFile = (...parts: string[]) => path.join(project.toString(), 'downloads', ...parts);

    it('lays out one archive per language and the plugin inside the project, and names them in the config', async () => {
      const artifacts = new PortalArtifacts(
        new CodeSampleCatalogs([]),
        new Map([
          ['csharp', downloaded('a.zip', 'PK csharp')],
          ['python', downloaded('b.zip', 'PK python')]
        ]),
        downloaded('c.zip', 'PK plugin')
      );

      (await service.prepare(project, sourceFor(), artifacts))._unsafeUnwrap();

      expect(fs.readFileSync(downloadsFile('sdk', 'csharp.zip'), 'utf8')).to.equal('PK csharp');
      expect(fs.readFileSync(downloadsFile('sdk', 'python.zip'), 'utf8')).to.equal('PK python');
      expect(fs.readFileSync(downloadsFile('plugin.zip'), 'utf8')).to.equal('PK plugin');
      expect(readConfig().downloadsDir).to.equal(downloadsFile().split(path.sep).join('/'));
    });

    it('offers no SDK directory for a run that carried only the plugin', async () => {
      const artifacts = new PortalArtifacts(new CodeSampleCatalogs([]), new Map(), downloaded('c.zip', 'PK plugin'));

      (await service.prepare(project, sourceFor(), artifacts))._unsafeUnwrap();

      expect(fs.readdirSync(downloadsFile())).to.deep.equal(['plugin.zip']);
    });

    it('names no downloads when the run carried none', async () => {
      (await service.prepare(project, sourceFor(), NO_ARTIFACTS))._unsafeUnwrap();

      expect(readConfig().downloadsDir).to.be.null;
      expect(fs.existsSync(downloadsFile())).to.be.false;
    });
  });

  // What `portal serve` does with an edited block: the dev server reloads whatever changes.
  describe('applyConfig', () => {
    const themeFile = () => path.join(project.toString(), 'src/styles/theme.css');
    const identityFile = () => path.join(project.toString(), 'portal.identity.json');

    it('writes nothing, and says so, when the block makes the same site', async () => {
      const config = configFor({ site: { name: 'My API' }, brand: { colors: { primary: '#1d4ed8' } } });
      (await service.prepare(project, sourceFor({ config }), NO_ARTIFACTS))._unsafeUnwrap();
      const before = [fs.statSync(themeFile()).mtimeMs, fs.statSync(identityFile()).mtimeMs];

      // Written differently, read the same: the comparison is of what the preview shows.
      const same = configFor({
        site: { name: 'My API' },
        brand: { colors: { primary: '#1d4ed8' } },
        ai: { pageActions: true }
      });
      const applied = await service.applyConfig(project, settingsFor(same));

      expect(applied._unsafeUnwrap()).to.be.false;
      expect([fs.statSync(themeFile()).mtimeMs, fs.statSync(identityFile()).mtimeMs]).to.deep.equal(before);
    });

    it('rewrites both files for a brand change, to what a fresh build would write', async () => {
      (await service.prepare(project, sourceFor(), NO_ARTIFACTS))._unsafeUnwrap();
      const config = configFor({
        site: { name: 'My API' },
        brand: { colors: { primary: '#1d4ed8' }, colorMode: 'dark' }
      });

      expect((await service.applyConfig(project, settingsFor(config)))._unsafeUnwrap()).to.be.true;

      expect(fs.readFileSync(themeFile(), 'utf8')).to.equal(PortalStylesheet.of(config).toString());
      expect(readIdentity()).to.deep.equal(config.identity());
    });

    it('leaves the stylesheet alone when only what the browser is told changes', async () => {
      (await service.prepare(project, sourceFor(), NO_ARTIFACTS))._unsafeUnwrap();
      const before = fs.statSync(themeFile()).mtimeMs;

      const renamed = configFor({ site: { name: 'Renamed API' } });
      expect((await service.applyConfig(project, settingsFor(renamed)))._unsafeUnwrap()).to.be.true;

      expect(readIdentity().name).to.equal('Renamed API');
      expect(fs.statSync(themeFile()).mtimeMs).to.equal(before);
    });

    // The dev server is watching both files, and could read one truncated before it is written.
    it('replaces each file whole rather than writing it in place', async () => {
      (await service.prepare(project, sourceFor(), NO_ARTIFACTS))._unsafeUnwrap();
      const replace = sinon.spy(FileService.prototype, 'replaceContents');
      const write = sinon.spy(FileService.prototype, 'writeContents');

      const config = configFor({ site: { name: 'Renamed API' }, brand: { colors: { primary: '#1d4ed8' } } });
      expect((await service.applyConfig(project, settingsFor(config)))._unsafeUnwrap()).to.be.true;

      expect(replace.args.map(([file]) => file.toString())).to.deep.equal([identityFile(), themeFile()]);
      expect(write.called).to.be.false;
    });

    // A file where the project's directories should be: nothing can be written beneath it.
    it('reports a project it cannot write into rather than throwing', async () => {
      const blocked = new DirectoryPath(root).join('blocked');
      fs.writeFileSync(blocked.toString(), '');

      const applied = await service.applyConfig(blocked, settingsFor(configFor({ site: { name: 'My API' } })));

      expect(applied.isErr()).to.be.true;
    });

    it('writes the page for a language added, and says so', async () => {
      (await service.prepare(project, sourceFor(), NO_ARTIFACTS))._unsafeUnwrap();
      const config = sourceFor().config;

      const applied = await service.applyConfig(project, settingsFor(config, pagesFor({ typescript: {}, go: {} })));

      expect(applied._unsafeUnwrap()).to.be.true;
      expect(generatedFiles()).to.include('sdks/go.mdx');
    });

    it('writes the context plugin folder for a plugin block added, and removes it with the block', async () => {
      (await service.prepare(project, sourceFor(), NO_ARTIFACTS))._unsafeUnwrap();
      const config = sourceFor().config;

      expect(
        (await service.applyConfig(project, settingsFor(config, pagesFor({ typescript: {} }, true))))._unsafeUnwrap()
      ).to.be.true;
      expect(generatedFiles()).to.include.members(['context-plugin/index.mdx', 'context-plugin/nav.json']);

      expect((await service.applyConfig(project, settingsFor(config)))._unsafeUnwrap()).to.be.true;
      expect(fs.existsSync(path.join(project.toString(), GENERATED_DIRECTORY_NAME, 'context-plugin'))).to.be.false;
    });
  });

  describe('childEnvironment', () => {
    it('passes no authentication key or VITE_ variable to the build', () => {
      process.env.APIMATIC_AUTH_KEY = 'secret';
      process.env.VITE_LEAKED = 'secret';
      try {
        const environment = service.childEnvironment();

        expect(environment).to.not.have.property('APIMATIC_AUTH_KEY');
        expect(Object.keys(environment).filter((name) => name.startsWith('VITE_'))).to.be.empty;
      } finally {
        delete process.env.APIMATIC_AUTH_KEY;
        delete process.env.VITE_LEAKED;
      }
    });

    it('raises the heap limit without discarding options the user set', () => {
      const original = process.env.NODE_OPTIONS;
      process.env.NODE_OPTIONS = '--enable-source-maps';
      try {
        expect(service.childEnvironment().NODE_OPTIONS).to.equal('--enable-source-maps --max-old-space-size=4096');
      } finally {
        if (original === undefined) delete process.env.NODE_OPTIONS;
        else process.env.NODE_OPTIONS = original;
      }
    });

    it('leaves a heap limit the user set alone', () => {
      const original = process.env.NODE_OPTIONS;
      try {
        for (const set of ['--max-old-space-size=8192', '--enable-source-maps --max-old-space-size=8192']) {
          process.env.NODE_OPTIONS = set;
          expect(service.childEnvironment().NODE_OPTIONS, `NODE_OPTIONS was ${set}`).to.equal(set);
        }
      } finally {
        if (original === undefined) delete process.env.NODE_OPTIONS;
        else process.env.NODE_OPTIONS = original;
      }
    });
  });
});
