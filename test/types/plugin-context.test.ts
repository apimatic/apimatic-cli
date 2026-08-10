import fs from 'fs';
import path from 'path';
import mockFs from 'mock-fs';
import { expect } from 'chai';
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
});
