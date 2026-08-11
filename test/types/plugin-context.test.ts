import fs from 'fs';
import os from 'os';
import path from 'path';
import mockFs from 'mock-fs';
import { expect } from 'chai';
import { ZipService } from '../../src/infrastructure/zip-service';
import { PluginContext } from '../../src/types/plugin-context';
import { DirectoryPath } from '../../src/types/file/directoryPath';
import { FileName } from '../../src/types/file/fileName';
import { FilePath } from '../../src/types/file/filePath';

describe('PluginContext', () => {
  const pluginDirectory = new DirectoryPath('plugin');
  const tempDirectory = new DirectoryPath('temp');
  const tempZip = new FilePath(tempDirectory, new FileName('downloaded'));
  const context = new PluginContext(pluginDirectory);

  afterEach(() => mockFs.restore());

  describe('exists', () => {
    it('is false when the directory is absent', async () => {
      mockFs({});

      expect(await context.exists()).to.be.false;
    });

    it('is false when the directory holds nothing but dotfiles', async () => {
      mockFs({ plugin: { '.gitkeep': '' } });

      expect(await context.exists()).to.be.false;
    });

    it('is true when the directory holds artifacts', async () => {
      mockFs({ plugin: { 'README.md': '# plugin' } });

      expect(await context.exists()).to.be.true;
    });
  });

  describe('save', () => {
    it('copies the archive as plugin.zip when asked to keep it zipped', async () => {
      mockFs({ plugin: {}, temp: { downloaded: 'zip-bytes' } });

      await context.save(tempZip, true);

      expect(fs.readFileSync(path.join(pluginDirectory.toString(), 'plugin.zip'), 'utf-8')).to.equal('zip-bytes');
    });

    it('clears artifacts from a previous run before saving', async () => {
      mockFs({ plugin: { 'stale.md': 'from a language that is gone' }, temp: { downloaded: 'zip-bytes' } });

      await context.save(tempZip, true);

      expect(fs.existsSync(path.join(pluginDirectory.toString(), 'stale.md'))).to.be.false;
    });

    it('creates the destination directory when it does not exist yet', async () => {
      mockFs({ temp: { downloaded: 'zip-bytes' } });

      await context.save(tempZip, true);

      expect(fs.existsSync(path.join(pluginDirectory.toString(), 'plugin.zip'))).to.be.true;
    });
  });

  // The default `--zip=false` path, which every ordinary run takes. Real files rather than
  // mock-fs: adm-zip reads the archive itself, so the bytes have to be a genuine zip.
  describe('save, expanding the archive', () => {
    let workDir: string;
    let archive: FilePath;
    let destination: DirectoryPath;

    beforeEach(async () => {
      workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-context-'));
      const source = new DirectoryPath(path.join(workDir, 'source'));
      fs.mkdirSync(path.join(source.toString(), 'skills'), { recursive: true });
      fs.writeFileSync(path.join(source.toString(), 'README.md'), '# plugin');
      fs.writeFileSync(path.join(source.toString(), 'skills', 'SKILL.md'), '# skill');

      archive = new FilePath(new DirectoryPath(workDir), new FileName('plugin.zip'));
      await new ZipService().archive(source, archive);

      destination = new DirectoryPath(path.join(workDir, 'destination'));
    });

    afterEach(() => fs.rmSync(workDir, { recursive: true, force: true }));

    it('expands the archive into the destination', async () => {
      await new PluginContext(destination).save(archive, false);

      expect(fs.readFileSync(path.join(destination.toString(), 'README.md'), 'utf-8')).to.equal('# plugin');
      expect(fs.readFileSync(path.join(destination.toString(), 'skills', 'SKILL.md'), 'utf-8')).to.equal('# skill');
      expect(fs.existsSync(path.join(destination.toString(), 'plugin.zip'))).to.be.false;
    });

    it('clears a previous run before expanding', async () => {
      fs.mkdirSync(destination.toString(), { recursive: true });
      fs.writeFileSync(path.join(destination.toString(), 'stale.md'), 'from a language that is gone');

      await new PluginContext(destination).save(archive, false);

      expect(fs.existsSync(path.join(destination.toString(), 'stale.md'))).to.be.false;
      expect(fs.existsSync(path.join(destination.toString(), 'README.md'))).to.be.true;
    });
  });
});
