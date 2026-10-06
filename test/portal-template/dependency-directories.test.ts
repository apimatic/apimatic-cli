import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { dependencyDirectories, narrowest } from '../../portal-template/dependency-directories';

describe('dependencyDirectories', () => {
  let root: string;

  const install = (...segments: string[]): string => {
    const directory = path.join(root, ...segments);
    fs.mkdirSync(directory, { recursive: true });
    return directory;
  };

  const link = (name: string, target: string) => {
    const linkPath = path.join(root, 'project', 'node_modules', ...name.split('/'));
    fs.mkdirSync(path.dirname(linkPath), { recursive: true });
    // A junction is the only link type Windows grants without elevation.
    fs.symlinkSync(target, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
  };

  const project = () => path.join(root, 'project');
  const real = (...segments: string[]) => fs.realpathSync.native(path.join(root, ...segments));

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'dependency-directories-'));
    fs.mkdirSync(path.join(root, 'project', 'node_modules'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('answers the node_modules the linked dependencies are installed in, scoped ones included', () => {
    link('vite', install('cli', 'node_modules', 'vite'));
    link('@tanstack/react-start', install('cli', 'node_modules', '@tanstack', 'react-start'));

    expect(dependencyDirectories(project())).to.deep.equal([real('cli', 'node_modules')]);
  });

  it("answers the CLI's own node_modules in an npm global install, not every global package around it", () => {
    const cli = ['lib', 'node_modules', '@apimatic', 'cli', 'node_modules'];
    install('lib', 'node_modules', 'some-other-global-package');
    link('vite', install(...cli, 'vite'));
    link('@tanstack/react-start', install(...cli, '@tanstack', 'react-start'));

    expect(dependencyDirectories(project())).to.deep.equal([real(...cli)]);
  });

  it('answers the whole pnpm store, where each dependency sits in a directory of its own', () => {
    const store = ['global', 'node_modules', '.pnpm'];
    link('vite', install(...store, 'vite@8.2.2', 'node_modules', 'vite'));
    link(
      '@tanstack/react-start',
      install(...store, '@tanstack+react-start@1.168.50', 'node_modules', '@tanstack', 'react-start')
    );

    expect(dependencyDirectories(project())).to.deep.equal([real(...store)]);
  });

  it("answers the pnpm 11 global store's links directory, where each dependency sits under a hash of its own", () => {
    const links = ['store', 'links'];
    link('vite', install(...links, 'vite', '8.2.2', 'a1b2', 'node_modules', 'vite'));
    link(
      '@tanstack/react-start',
      install(...links, '@tanstack', 'react-start', '1.168.50', 'c3d4', 'node_modules', '@tanstack', 'react-start')
    );

    expect(dependencyDirectories(project())).to.deep.equal([real(...links)]);
  });

  it('leaves a copied dependency to the workspace root, which already holds it', () => {
    install('project', 'node_modules', '@fontsource-variable', 'geist');
    link('vite', install('cli', 'node_modules', 'vite'));

    expect(dependencyDirectories(project())).to.deep.equal([real('cli', 'node_modules')]);
  });

  it('leaves out a link leading nowhere rather than failing the server over it', () => {
    link('vite', install('cli', 'node_modules', 'vite'));
    fs.rmdirSync(path.join(root, 'cli', 'node_modules', 'vite'));

    expect(dependencyDirectories(project())).to.deep.equal([]);
  });

  it('lists installations one by one rather than the whole disk, when only its root holds them all', () => {
    const disk = path.parse(root).root;
    const installations = [
      path.join(disk, 'usr', 'lib', 'node_modules', '@apimatic', 'cli', 'node_modules'),
      path.join(disk, 'home', 'me', 'src', 'node_modules')
    ];

    expect(narrowest(installations)).to.deep.equal(installations);
  });

  it('answers nothing for a project without dependencies', () => {
    expect(dependencyDirectories(path.join(root, 'nowhere'))).to.deep.equal([]);
  });

  it('reports a node_modules it cannot read, rather than serving less than the page needs', () => {
    fs.rmdirSync(path.join(root, 'project', 'node_modules'));
    fs.writeFileSync(path.join(root, 'project', 'node_modules'), '');

    expect(() => dependencyDirectories(project())).to.throw(/ENOTDIR/);
  });
});
