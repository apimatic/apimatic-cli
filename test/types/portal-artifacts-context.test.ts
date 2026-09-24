import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect } from 'chai';
import { ZipService } from '../../src/infrastructure/zip-service';
import { DirectoryPath } from '../../src/types/file/directoryPath';
import { FileName } from '../../src/types/file/fileName';
import { FilePath } from '../../src/types/file/filePath';
import { CodeSamples } from '../../src/types/portal/code-samples';
import { PortalArtifacts } from '../../src/types/portal/portal-artifacts';
import { PortalArtifactsContext } from '../../src/types/portal-artifacts-context';

describe('PortalArtifactsContext', () => {
  let root: string;
  let downloaded: string;
  let sourceDirectory: DirectoryPath;

  const staticPath = (...parts: string[]) => path.join(root, 'src', 'static', ...parts);
  const pluginPath = (...parts: string[]) => path.join(root, 'plugin', ...parts);

  /** Stands in for an SDK the run downloaded; the contents only have to be recognisable. */
  const sdk = (language: string): FilePath => {
    const file = path.join(downloaded, `${language}.zip`);
    fs.writeFileSync(file, `PK ${language}`);
    return FilePath.create(file)!;
  };

  /** A real archive, because placing the plugin unzips it. */
  const pluginArchive = async (entries: Record<string, string>): Promise<FilePath> => {
    const staging = path.join(downloaded, 'plugin-contents');
    for (const [entry, contents] of Object.entries(entries)) {
      const file = path.join(staging, entry);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, contents);
    }

    const archive = new FilePath(new DirectoryPath(downloaded), new FileName('plugin.zip'));
    await new ZipService().archive(new DirectoryPath(staging), archive);
    return archive;
  };

  const place = async (artifacts: PortalArtifacts) =>
    await new PortalArtifactsContext(sourceDirectory).place(artifacts);

  const artifactsOf = (sdks: ReadonlyMap<string, FilePath>, plugin?: FilePath) =>
    new PortalArtifacts(new CodeSamples([]), sdks, plugin);

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-artifacts-context-'));
    downloaded = path.join(root, 'downloaded');
    fs.mkdirSync(downloaded, { recursive: true });
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    sourceDirectory = new DirectoryPath(path.join(root, 'src'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('the SDKs', () => {
    it('places one archive per language under the portal static directory', async () => {
      await place(artifactsOf(new Map([['csharp', sdk('csharp')], ['python', sdk('python')]])));

      expect(fs.readFileSync(staticPath('sdk', 'csharp.zip'), 'utf8')).to.equal('PK csharp');
      expect(fs.readFileSync(staticPath('sdk', 'python.zip'), 'utf8')).to.equal('PK python');
    });

    // A language dropped from apimatic.json would otherwise stay on the download page, offering
    // an SDK for something the portal no longer documents.
    it('drops an SDK the run no longer carries', async () => {
      fs.mkdirSync(staticPath('sdk'), { recursive: true });
      fs.writeFileSync(staticPath('sdk', 'java.zip'), 'PK stale');

      await place(artifactsOf(new Map([['csharp', sdk('csharp')]])));

      expect(fs.existsSync(staticPath('sdk', 'java.zip'))).to.be.false;
      expect(fs.existsSync(staticPath('sdk', 'csharp.zip'))).to.be.true;
    });

    // A portal that documents no language should not grow an empty download directory.
    it('takes the directory away when the run carries no SDK', async () => {
      fs.mkdirSync(staticPath('sdk'), { recursive: true });
      fs.writeFileSync(staticPath('sdk', 'java.zip'), 'PK stale');

      await place(artifactsOf(new Map()));

      expect(fs.existsSync(staticPath('sdk'))).to.be.false;
    });

    it('leaves the rest of the static directory alone', async () => {
      fs.mkdirSync(staticPath(), { recursive: true });
      fs.writeFileSync(staticPath('logo.png'), 'not an sdk');

      await place(artifactsOf(new Map([['csharp', sdk('csharp')]])));

      expect(fs.readFileSync(staticPath('logo.png'), 'utf8')).to.equal('not an sdk');
    });
  });

  describe('the plugin', () => {
    it('expands it beside the source directory and serves the archive', async () => {
      const archive = await pluginArchive({ 'plugin.json': '{}', 'skills/auth/SKILL.md': '# skill' });

      const placed = await place(artifactsOf(new Map(), archive));

      expect(fs.readFileSync(pluginPath('plugin.json'), 'utf8')).to.equal('{}');
      expect(fs.readFileSync(pluginPath('skills', 'auth', 'SKILL.md'), 'utf8')).to.equal('# skill');
      expect(fs.existsSync(staticPath('plugin.zip'))).to.be.true;
      expect(placed.plugin!.toString()).to.equal(path.join(root, 'plugin'));
    });

    // `plugin publish` turns this directory into its own repository. Replacing it outright would
    // take the history the user has already pushed with it.
    it('keeps a repository the user already published from', async () => {
      fs.mkdirSync(pluginPath('.git'), { recursive: true });
      fs.writeFileSync(pluginPath('.git', 'HEAD'), 'ref: refs/heads/main');
      fs.writeFileSync(pluginPath('stale.md'), 'from an older run');

      await place(artifactsOf(new Map(), await pluginArchive({ 'plugin.json': '{}' })));

      expect(fs.readFileSync(pluginPath('.git', 'HEAD'), 'utf8')).to.equal('ref: refs/heads/main');
      expect(fs.existsSync(pluginPath('stale.md'))).to.be.false;
    });

    // A portal whose config carries no `plugin` block asked for none, and must not be given one.
    it('writes nothing when the run carried no plugin', async () => {
      const placed = await place(artifactsOf(new Map()));

      expect(placed.plugin).to.be.undefined;
      expect(fs.existsSync(pluginPath())).to.be.false;
      expect(fs.existsSync(staticPath('plugin.zip'))).to.be.false;
    });
  });
});
