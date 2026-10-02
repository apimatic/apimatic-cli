import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { dependencyDirectories } from '../../portal-template/dependency-directories';

/**
 * The directories `server.fs.allow` names so the dev server serves a linked dependency even
 * when the browser, from its cache, asks for it before the module importing it.
 */
describe('dependencyDirectories', () => {
  let root: string;

  const install = (relative: string): string => {
    const directory = path.join(root, relative);
    fs.mkdirSync(directory, { recursive: true });
    return directory;
  };

  const link = (name: string, target: string) => {
    const linkPath = path.join(root, 'project', 'node_modules', name);
    fs.mkdirSync(path.dirname(linkPath), { recursive: true });
    // A junction is the only link type Windows grants without elevation.
    fs.symlinkSync(target, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
  };

  const project = () => path.join(root, 'project');

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'dependency-directories-'));
    fs.mkdirSync(path.join(root, 'project', 'node_modules'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('answers the installation a linked dependency resolves to', () => {
    link('vite', install(path.join('cli', 'node_modules', 'vite')));

    expect(dependencyDirectories(project())).to.deep.equal([fs.realpathSync(path.join(root, 'cli', 'node_modules'))]);
  });

  it('answers one directory for dependencies installed side by side, scoped ones included', () => {
    link('vite', install(path.join('cli', 'node_modules', 'vite')));
    link(path.join('@tanstack', 'react-start'), install(path.join('cli', 'node_modules', '@tanstack', 'react-start')));

    expect(dependencyDirectories(project())).to.deep.equal([fs.realpathSync(path.join(root, 'cli', 'node_modules'))]);
  });

  it('answers the store around a pnpm installation, not the one package inside it', () => {
    link('vite', install(path.join('cli', 'node_modules', '.pnpm', 'vite@8.2.2', 'node_modules', 'vite')));

    expect(dependencyDirectories(project())).to.deep.equal([fs.realpathSync(path.join(root, 'cli', 'node_modules'))]);
  });

  it('keeps a copied dependency where it is', () => {
    install(path.join('project', 'node_modules', '@fontsource-variable', 'geist'));

    expect(dependencyDirectories(project())).to.deep.equal([
      fs.realpathSync(path.join(root, 'project', 'node_modules'))
    ]);
  });

  it('leaves out a link leading nowhere rather than failing the server over it', () => {
    link('vite', install(path.join('cli', 'node_modules', 'vite')));
    fs.rmdirSync(path.join(root, 'cli', 'node_modules', 'vite'));

    expect(dependencyDirectories(project())).to.deep.equal([]);
  });

  it('answers nothing for a project without dependencies', () => {
    expect(dependencyDirectories(path.join(root, 'nowhere'))).to.deep.equal([]);
  });
});
