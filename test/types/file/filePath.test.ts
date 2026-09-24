import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { DirectoryPath } from '../../../src/types/file/directoryPath';
import { FileName } from '../../../src/types/file/fileName';
import { FilePath } from '../../../src/types/file/filePath';

describe('FilePath', () => {
  describe('isEqual', () => {
    const root = path.join(os.tmpdir(), 'project');
    const file = (directory: string, name: string) =>
      new FilePath(new DirectoryPath(root, directory), new FileName(name));

    it('holds for the same directory and name', () => {
      expect(file('static', 'logo.png').isEqual(file('static', 'logo.png'))).to.equal(true);
    });

    it('holds however the directory was reached', () => {
      const joined = new FilePath(new DirectoryPath(root).join('static'), new FileName('logo.png'));

      expect(joined.isEqual(file('static', 'logo.png'))).to.equal(true);
    });

    it('tells apart names that differ only in case, as the hosts portals are published to do', () => {
      expect(file('static', 'Logo.png').isEqual(file('static', 'logo.png'))).to.equal(false);
    });

    it('tells apart directories that differ only in case', () => {
      expect(file('Static', 'logo.png').isEqual(file('static', 'logo.png'))).to.equal(false);
    });

    it('tells apart the same name in another directory', () => {
      expect(file('static', 'logo.png').isEqual(file('images', 'logo.png'))).to.equal(false);
    });
  });
});
