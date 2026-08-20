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

    // Once published, the plugin directory is the user's repository. Clearing it wholesale would
    // discard their history, their remote and every tag they have pushed.
    it('leaves an existing repository in place', async () => {
      mockFs({
        plugin: {
          'stale.md': 'from a language that is gone',
          '.git': { HEAD: 'ref: refs/heads/main', config: '[remote "origin"]', refs: { tags: { 'v0.1.66': 'abc123' } } }
        },
        temp: { downloaded: 'zip-bytes' }
      });

      await context.save(tempZip, true);

      const git = path.join(pluginDirectory.toString(), '.git');
      expect(fs.readFileSync(path.join(git, 'HEAD'), 'utf-8')).to.equal('ref: refs/heads/main');
      expect(fs.readFileSync(path.join(git, 'config'), 'utf-8')).to.equal('[remote "origin"]');
      expect(fs.readFileSync(path.join(git, 'refs', 'tags', 'v0.1.66'), 'utf-8')).to.equal('abc123');
      expect(fs.existsSync(path.join(pluginDirectory.toString(), 'stale.md'))).to.be.false;
    });
  });
});
