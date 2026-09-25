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

  describe('toPosix', () => {
    it('spells the directory and the name with forward slashes between them', () => {
      const spelt = new FilePath(new DirectoryPath(os.tmpdir(), 'project', 'src'), new FileName('api.json')).toPosix();

      expect(spelt.endsWith('/project/src/api.json')).to.equal(true);
      expect(spelt).to.not.contain('\\');
    });
  });

  describe('resolve', () => {
    const root = new DirectoryPath(os.tmpdir(), 'project');
    const relative = (file: FilePath) => file.relativeTo(root);

    it('names a file below the directory by a path with forward slashes, as a page writes it', () => {
      expect(relative(FilePath.resolve(root.join('static'), 'images/team photo.png'))).to.equal(
        'static/images/team photo.png'
      );
    });

    it('follows a path that climbs out of the directory', () => {
      expect(relative(FilePath.resolve(root.join('content', 'guides'), '../shared/diagram.png'))).to.equal(
        'content/shared/diagram.png'
      );
    });

    it('splits the name from its directory', () => {
      const file = FilePath.resolve(root, 'a/b.png');

      expect(file.name().toString()).to.equal('b.png');
      expect(file.directory().isEqual(root.join('a'))).to.equal(true);
    });
  });
});
