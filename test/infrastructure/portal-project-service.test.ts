import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { PortalProjectService } from '../../src/infrastructure/portal-project-service';
import { DirectoryPath } from '../../src/types/file/directoryPath';
import { FileName } from '../../src/types/file/fileName';
import { FilePath } from '../../src/types/file/filePath';
import { PortalConfig } from '../../src/types/portal/portal-config';
import { PortalSource } from '../../src/types/portal/portal-source';
import { UrlPath } from '../../src/types/file/urlPath';

describe('PortalProjectService', () => {
  const service = new PortalProjectService();
  let root: string;
  let project: DirectoryPath;

  const sourceFor = (overrides: Partial<PortalSource> = {}): PortalSource => ({
    config: PortalConfig.create('My API'),
    specs: [
      {
        slug: 'calculator',
        file: new FilePath(new DirectoryPath(root).join('spec'), new FileName('api.json'))
      }
    ],
    contentDirectory: null,
    staticDirectory: null,
    ...overrides
  });

  const readConfig = () => JSON.parse(fs.readFileSync(path.join(project.toString(), 'portal.config.json'), 'utf8'));

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-project-'));
    project = new DirectoryPath(root).join('build');
    fs.mkdirSync(project.toString(), { recursive: true });
  });

  afterEach(() => {
    // Node's own removal deletes the links, never what they point at. A shell recursive
    // delete would follow a junction on Windows and empty the CLI's own node_modules.
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('reports no runtime problem on a supported Node with the dependencies installed', () => {
    expect(service.runtimeProblem()).to.be.null;
  });

  describe('prepare', () => {
    it('links every dependency the template imports, resolved to a real package', async () => {
      (await service.prepare(project, sourceFor()))._unsafeUnwrap();

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
      (await service.prepare(project, sourceFor()))._unsafeUnwrap();

      expect(fs.existsSync(path.join(process.cwd(), 'portal-template', 'vite.config.ts'))).to.be.true;
      expect(fs.existsSync(path.join(project.toString(), 'vite.config.ts'))).to.be.true;
    });

    it('writes the spec, title and description into the generated config', async () => {
      const source = sourceFor({ config: PortalConfig.create('My API', 'Docs for it') });

      (await service.prepare(project, source))._unsafeUnwrap();

      const config = readConfig();
      expect(config.title).to.equal('My API');
      expect(config.description).to.equal('Docs for it');
      expect(Object.keys(config.specs)).to.deep.equal(['calculator']);
      expect(config.specs.calculator).to.contain('api.json');
    });

    it('resolves the logo to a site URL and the site address to an origin', async () => {
      const config = PortalConfig.create(
        'My API',
        null,
        'static/images/logo.png',
        new UrlPath('https://docs.example.com')
      );

      (await service.prepare(project, sourceFor({ config })))._unsafeUnwrap();

      expect(readConfig().logoUrl).to.equal('/images/logo.png');
      expect(readConfig().siteUrl).to.equal('https://docs.example.com');
    });

    it('reports no static directory when the project has none', async () => {
      (await service.prepare(project, sourceFor()))._unsafeUnwrap();

      expect(readConfig().staticDir).to.be.null;
    });

    it('substitutes the content directory placeholder, which the Fumadocs macro needs as a literal', async () => {
      const contentDirectory = new DirectoryPath(root).join('content');
      fs.mkdirSync(contentDirectory.toString(), { recursive: true });

      (await service.prepare(project, sourceFor({ contentDirectory })))._unsafeUnwrap();

      const module = fs.readFileSync(path.join(project.toString(), 'src/lib/source.ts'), 'utf8');
      expect(module).to.not.contain('__APIMATIC_CONTENT_DIR__');
      expect(module).to.contain(JSON.stringify(contentDirectory.toString().split(path.sep).join('/')));
    });

    it('creates an empty content directory when the project has none, so the build has one to read', async () => {
      (await service.prepare(project, sourceFor()))._unsafeUnwrap();

      const config = readConfig();
      expect(fs.existsSync(config.contentDir)).to.be.true;
      expect(fs.readdirSync(config.contentDir)).to.be.empty;
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

    // V8 honours the last occurrence, so appending unconditionally overrode a limit the
    // user had raised deliberately -- NODE_OPTIONS is the only way in, since the child is
    // spawned with extendEnv false.
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
