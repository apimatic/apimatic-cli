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

  describe('isGitInitialized', () => {
    it('is false when the directory is not a repository', async () => {
      mockFs({ plugin: { 'README.md': '# plugin' } });

      expect(await context.isGitInitialized()).to.be.false;
    });

    it('is true when the directory holds a repository', async () => {
      mockFs({ plugin: { 'README.md': '# plugin', '.git': { HEAD: 'ref: refs/heads/main' } } });

      expect(await context.isGitInitialized()).to.be.true;
    });
  });

  describe('describeContents', () => {
    it('counts files and directories recursively', async () => {
      mockFs({
        plugin: {
          'README.md': '# plugin',
          skills: { auth: { 'SKILL.md': '# skill' }, 'index.md': '# skills' },
          commands: { 'setup.md': '# setup' }
        }
      });

      expect(await context.describeContents()).to.deep.equal({ fileCount: 4, directoryCount: 3 });
    });

    it('counts dot-directories, which a publish exposes like any other', async () => {
      mockFs({ plugin: { '.claude-plugin': { 'plugin.json': '{}' } } });

      expect(await context.describeContents()).to.deep.equal({ fileCount: 1, directoryCount: 1 });
    });

    it('leaves the repository out of the counts', async () => {
      mockFs({
        plugin: {
          'README.md': '# plugin',
          '.git': { HEAD: 'ref: refs/heads/main', refs: { tags: { 'v0.1.66': 'abc123' } } }
        }
      });

      expect(await context.describeContents()).to.deep.equal({ fileCount: 1, directoryCount: 0 });
    });

    it('reports nothing for an empty directory', async () => {
      mockFs({ plugin: {} });

      expect(await context.describeContents()).to.deep.equal({ fileCount: 0, directoryCount: 0 });
    });
  });

  // Real files rather than mock-fs: adm-zip reads the archive itself, so the bytes have to be
  // a genuine zip.
  describe('save', () => {
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
      await new PluginContext(destination).save(archive);

      expect(fs.readFileSync(path.join(destination.toString(), 'README.md'), 'utf-8')).to.equal('# plugin');
      expect(fs.readFileSync(path.join(destination.toString(), 'skills', 'SKILL.md'), 'utf-8')).to.equal('# skill');
      expect(fs.existsSync(path.join(destination.toString(), 'plugin.zip'))).to.be.false;
    });

    it('creates the destination directory when it does not exist yet', async () => {
      await new PluginContext(destination).save(archive);

      expect(fs.existsSync(path.join(destination.toString(), 'README.md'))).to.be.true;
    });

    it('leaves an existing repository in place', async () => {
      const git = path.join(destination.toString(), '.git');
      fs.mkdirSync(path.join(git, 'refs', 'tags'), { recursive: true });
      fs.writeFileSync(path.join(git, 'HEAD'), 'ref: refs/heads/main');
      fs.writeFileSync(path.join(git, 'refs', 'tags', 'v0.1.66'), 'abc123');
      fs.writeFileSync(path.join(destination.toString(), 'stale.md'), 'from a language that is gone');

      await new PluginContext(destination).save(archive);

      expect(fs.readFileSync(path.join(git, 'HEAD'), 'utf-8')).to.equal('ref: refs/heads/main');
      expect(fs.readFileSync(path.join(git, 'refs', 'tags', 'v0.1.66'), 'utf-8')).to.equal('abc123');
      expect(fs.existsSync(path.join(destination.toString(), 'stale.md'))).to.be.false;
      expect(fs.existsSync(path.join(destination.toString(), 'README.md'))).to.be.true;
    });

    it('clears a previous run before expanding', async () => {
      fs.mkdirSync(destination.toString(), { recursive: true });
      fs.writeFileSync(path.join(destination.toString(), 'stale.md'), 'from a language that is gone');

      await new PluginContext(destination).save(archive);

      expect(fs.existsSync(path.join(destination.toString(), 'stale.md'))).to.be.false;
      expect(fs.existsSync(path.join(destination.toString(), 'README.md'))).to.be.true;
    });
  });
});
