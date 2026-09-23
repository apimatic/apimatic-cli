import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { ZipService } from '../../src/infrastructure/zip-service';
import { PluginContext } from '../../src/types/plugin-context';
import { DirectoryPath } from '../../src/types/file/directoryPath';
import { FileName } from '../../src/types/file/fileName';
import { FilePath } from '../../src/types/file/filePath';

describe('PluginContext', () => {
  let root: string;
  let pluginDirectory: DirectoryPath;
  let context: PluginContext;

  const write = (relative: string, contents: string) => {
    const target = path.join(pluginDirectory.toString(), relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  };

  const mkdir = (relative = '.') => fs.mkdirSync(path.join(pluginDirectory.toString(), relative), { recursive: true });

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-context-'));
    pluginDirectory = new DirectoryPath(path.join(root, 'plugin'));
    context = new PluginContext(pluginDirectory);
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  describe('exists', () => {
    it('is false when the directory is absent', async () => {
      expect(await context.exists()).to.be.false;
    });

    it('is false when the directory holds nothing but dotfiles', async () => {
      write('.gitkeep', '');

      expect(await context.exists()).to.be.false;
    });

    it('is true when the directory holds artifacts', async () => {
      write('README.md', '# plugin');

      expect(await context.exists()).to.be.true;
    });
  });

  describe('isGitInitialized', () => {
    it('is false when the directory is not a repository', async () => {
      write('README.md', '# plugin');

      expect(await context.isGitInitialized()).to.be.false;
    });

    it('is true when the directory holds a repository', async () => {
      write('README.md', '# plugin');
      write('.git/HEAD', 'ref: refs/heads/main');

      expect(await context.isGitInitialized()).to.be.true;
    });
  });

  describe('describeContents', () => {
    it('counts files and directories recursively', async () => {
      write('README.md', '# plugin');
      write('skills/auth/SKILL.md', '# skill');
      write('skills/index.md', '# skills');
      write('commands/setup.md', '# setup');

      expect(await context.describeContents()).to.deep.equal({ fileCount: 4, directoryCount: 3 });
    });

    it('counts dot-directories, which a publish exposes like any other', async () => {
      write('.claude-plugin/plugin.json', '{}');

      expect(await context.describeContents()).to.deep.equal({ fileCount: 1, directoryCount: 1 });
    });

    it('leaves the repository out of the counts', async () => {
      write('README.md', '# plugin');
      write('.git/HEAD', 'ref: refs/heads/main');
      write('.git/refs/tags/v0.1.66', 'abc123');

      expect(await context.describeContents()).to.deep.equal({ fileCount: 1, directoryCount: 0 });
    });

    it('reports nothing for an empty directory', async () => {
      mkdir();

      expect(await context.describeContents()).to.deep.equal({ fileCount: 0, directoryCount: 0 });
    });
  });

  describe('save', () => {
    let archive: FilePath;
    let destination: DirectoryPath;

    beforeEach(async () => {
      const source = new DirectoryPath(path.join(root, 'source'));
      fs.mkdirSync(path.join(source.toString(), 'skills'), { recursive: true });
      fs.writeFileSync(path.join(source.toString(), 'README.md'), '# plugin');
      fs.writeFileSync(path.join(source.toString(), 'skills', 'SKILL.md'), '# skill');

      archive = new FilePath(new DirectoryPath(root), new FileName('plugin.zip'));
      await new ZipService().archive(source, archive);

      destination = new DirectoryPath(path.join(root, 'destination'));
    });

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
