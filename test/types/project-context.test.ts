import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { expect } from 'chai';
import sinon from 'sinon';
import { DirectoryPath } from '../../src/types/file/directoryPath';
import { GENERATED, ProjectContext } from '../../src/types/project-context';
import { Language } from '../../src/types/sdk/generate';

describe('ProjectContext', () => {
  let projectDirectory: string;

  const project = () => ProjectContext.in(new DirectoryPath(projectDirectory));
  const inProject = (...parts: string[]) => path.join(projectDirectory, ...parts);

  const write = (relative: string, contents = '') => {
    fs.mkdirSync(path.dirname(inProject(relative)), { recursive: true });
    fs.writeFileSync(inProject(relative), contents);
  };

  beforeEach(() => {
    projectDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'project-context-'));
  });

  afterEach(() => {
    sinon.restore();
    fs.rmSync(projectDirectory, { recursive: true, force: true });
  });

  describe('layout', () => {
    it('reads the source directory inside the project', () => {
      expect(project().sourceDirectory().toString()).to.equal(inProject('src'));
    });

    it('writes each output beside the source directory', () => {
      expect(project().sdkDirectory(Language.PYTHON).toString()).to.equal(inProject('sdk', 'python'));
      expect(project().portalDirectory().toString()).to.equal(inProject('portal'));
      expect(project().pluginDirectory().toString()).to.equal(inProject('plugin'));
    });

    it('writes where the destination flag says instead, when it says anywhere', () => {
      expect(project().sdk(Language.PYTHON, new DirectoryPath('elsewhere')).directory().toString()).to.equal(
        path.resolve('elsewhere')
      );
      expect(project().portalDirectory('').toString()).to.equal(inProject('portal'));
    });

    it('takes the project from the input flag, or the directory it runs in without one', () => {
      expect(ProjectContext.at(projectDirectory).sourceDirectory().toString()).to.equal(inProject('src'));
      expect(ProjectContext.at(undefined).sourceDirectory().toString()).to.equal(path.resolve('src'));
    });

    it('ignores exactly the directories it writes by default', () => {
      expect(GENERATED).to.deep.equal(['/sdk/', '/portal/', '/plugin/']);
    });
  });

  describe('the source', () => {
    it('is told apart from a destination that is it, or that holds it', () => {
      const source = new DirectoryPath(inProject('src'));

      expect(project().isSourceDirectory(source)).to.be.true;
      expect(project().isSourceDirectory(new DirectoryPath(inProject('sdk')))).to.be.false;
      expect(project().isSourceWithin(new DirectoryPath(projectDirectory))).to.be.true;
      expect(project().isSourceWithin(source)).to.be.true;
      expect(project().isSourceWithin(new DirectoryPath(inProject('portal')))).to.be.false;
    });

    it('exists once the source directory does', async () => {
      expect(await project().sourceExists()).to.be.false;
      expect(project().sourceExistsSync()).to.be.false;

      fs.mkdirSync(inProject('src'));

      expect(await project().sourceExists()).to.be.true;
      expect(project().sourceExistsSync()).to.be.true;
    });

    it('has specs once spec/ holds a file', async () => {
      fs.mkdirSync(inProject('src', 'spec'), { recursive: true });
      expect(await project().specsExist()).to.be.false;

      write('src/spec/openapi.json', '{}');

      expect(await project().specsExist()).to.be.true;
    });

    it('zips the source directory for the generators, with the package settings when given', async () => {
      write('src/spec/openapi.json', '{}');
      const temp = new DirectoryPath(inProject('temp'));
      const settings = new DirectoryPath(inProject('settings'));
      write('settings/package.json', '{}');

      const zip = (await project().srcDirZip(temp, settings))._unsafeUnwrap();

      expect(fs.existsSync(zip.toString())).to.be.true;
      expect(fs.existsSync(inProject('temp', 'src', 'spec', 'openapi.json'))).to.be.true;
      expect(fs.existsSync(inProject('temp', 'src', 'package-settings', 'package.json'))).to.be.true;
    });

    it('zips all of spec/ for validation, so a spec split across files keeps the ones it references', async () => {
      write('src/spec/openapi.yaml', 'openapi: 3.0.3');
      write('src/spec/schemas/pet.yaml', 'type: object');
      write('src/APIMATIC-BUILD.json', '{}');
      fs.mkdirSync(inProject('temp'));

      const zip = (await project().specZip(new DirectoryPath(inProject('temp'))))._unsafeUnwrap();

      const entries = new AdmZip(zip.toString()).getEntries().map((entry) => entry.entryName);
      expect(entries).to.have.members(['openapi.yaml', 'schemas/pet.yaml']);
    });

    it('zips nothing when spec/ is empty, and names the directory it looked in', async () => {
      fs.mkdirSync(inProject('src', 'spec'), { recursive: true });
      fs.mkdirSync(inProject('temp'));

      const problem = (await project().specZip(new DirectoryPath(inProject('temp'))))._unsafeUnwrapErr();

      expect(problem.kind).to.equal('noSpec');
      expect(problem.kind === 'noSpec' && problem.specDirectory.toString()).to.equal(inProject('src', 'spec'));
      expect(fs.readdirSync(inProject('temp'))).to.be.empty;
    });

    it('zips nothing when spec/ cannot be read, and says why', async () => {
      write('src/spec', 'a file where the directory should be');
      fs.mkdirSync(inProject('temp'));

      const problem = (await project().specZip(new DirectoryPath(inProject('temp'))))._unsafeUnwrapErr();

      expect(problem.kind).to.equal('unreadable');
      expect(problem.kind === 'unreadable' && problem.specDirectory.toString()).to.equal(inProject('src', 'spec'));
      expect(problem.kind === 'unreadable' && problem.reason).to.contain('ENOTDIR');
      expect(fs.readdirSync(inProject('temp'))).to.be.empty;
    });

    it('zips nothing when spec/ holds symlinks at any depth, and names every one', async () => {
      write('src/spec/openapi.yaml', 'openapi: 3.0.3');
      write('shared/pet.yaml', 'type: object');
      fs.mkdirSync(inProject('src', 'spec', 'schemas'));
      const symlinks = [inProject('src', 'spec', 'common'), inProject('src', 'spec', 'schemas', 'shared')];
      for (const symlink of symlinks) {
        fs.symlinkSync(inProject('shared'), symlink, process.platform === 'win32' ? 'junction' : 'dir');
      }
      fs.mkdirSync(inProject('temp'));

      const problem = (await project().specZip(new DirectoryPath(inProject('temp'))))._unsafeUnwrapErr();

      expect(problem.kind).to.equal('symlinks');
      expect(problem.kind === 'symlinks' && problem.symlinks.map((symlink) => symlink.toString())).to.have.members(
        symlinks
      );
      expect(fs.readdirSync(inProject('temp'))).to.be.empty;
    });

    it('reports a spec/ it could not zip, naming the directory and why', async () => {
      write('src/spec/openapi.yaml', 'openapi: 3.0.3');

      const problem = (await project().specZip(new DirectoryPath(inProject('missing-temp'))))._unsafeUnwrapErr();

      expect(problem.kind).to.equal('zipFailed');
      expect(problem.kind === 'zipFailed' && problem.specDirectory.toString()).to.equal(inProject('src', 'spec'));
      expect(problem.kind === 'zipFailed' && problem.reason).to.contain('ENOENT');
    });
  });

  describe('sdk', () => {
    it('writes an SDK under the SDK directory, by language', async () => {
      const empty = new DirectoryPath(inProject('empty'));
      fs.mkdirSync(empty.toString());

      const saved = await project().sdk(Language.PYTHON).save(empty);

      expect(saved.toString()).to.equal(inProject('sdk', 'python'));
    });

    it('writes into a named destination itself, adding no language', () => {
      const clone = new DirectoryPath(inProject('my-sdk'));

      expect(project().sdk(Language.TYPESCRIPT, clone).directory().isEqual(clone)).to.be.true;
    });
  });

  describe('upsertGitignore', () => {
    const gitignorePath = () => inProject('.gitignore');
    const gitignore = () => fs.readFileSync(gitignorePath(), 'utf8');
    const ignore = async () => await project().upsertGitignore();

    it('writes the generated paths into a project that has no gitignore', async () => {
      await ignore();

      expect(gitignore().split('\n').filter(Boolean)).to.deep.equal(['/sdk/', '/portal/', '/plugin/']);
    });

    it('names the plugin directory', async () => {
      await ignore();

      expect(gitignore()).to.contain('/plugin/');
    });

    it('appends to what the user already wrote, keeping it', async () => {
      fs.writeFileSync(gitignorePath(), 'node_modules/\n.env\n');

      await ignore();

      const lines = gitignore().split('\n').filter(Boolean);
      expect(lines.slice(0, 2)).to.deep.equal(['node_modules/', '.env']);
      expect(lines).to.contain('/plugin/');
    });

    it('starts a new line when the file does not end with one', async () => {
      fs.writeFileSync(gitignorePath(), 'node_modules/');

      await ignore();

      expect(gitignore().split('\n').filter(Boolean)).to.deep.equal(['node_modules/', '/sdk/', '/portal/', '/plugin/']);
    });

    // Re-running quickstart in an adopted project must not stack duplicates.
    it('adds nothing, and rewrites nothing, when every entry is already there', async () => {
      await ignore();
      const written = gitignore();

      await ignore();

      expect(gitignore()).to.equal(written);
    });

    it('adds only what is missing', async () => {
      fs.writeFileSync(gitignorePath(), '/plugin/\n');

      await ignore();

      expect(gitignore().split('\n').filter(Boolean)).to.deep.equal(['/plugin/', '/sdk/', '/portal/']);
    });

    // The wizard has already written a portal by then, so it reports the failure and carries on.
    it('reports a path it cannot write rather than throwing', async () => {
      fs.mkdirSync(gitignorePath());

      const result = await ignore();

      expect(result.isErr()).to.be.true;
      expect(result._unsafeUnwrapErr()).to.equal('unwritable');
    });

    it('answers with the entries it wrote', async () => {
      expect((await ignore()).isOk()).to.be.true;
    });
  });
});
