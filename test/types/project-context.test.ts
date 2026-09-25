import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

  const versionedBuild = (build: object = { generateVersionedPortal: {} }) =>
    write('src/APIMATIC-BUILD.json', JSON.stringify(build));

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
      expect(project().sdkDirectory().toString()).to.equal(inProject('sdk'));
      expect(project().portalDirectory().toString()).to.equal(inProject('portal'));
      expect(project().pluginDirectory().toString()).to.equal(inProject('plugin'));
    });

    // A destination flag is relative to where the CLI runs, like every other path the user types.
    it('writes where the destination flag says instead, when it says anywhere', () => {
      expect(project().sdkDirectory('elsewhere').toString()).to.equal(path.resolve('elsewhere'));
      expect(project().portalDirectory('').toString()).to.equal(inProject('portal'));
    });

    it('takes the project from the input flag, or the directory it runs in without one', () => {
      expect(ProjectContext.at(projectDirectory).sourceDirectory().toString()).to.equal(inProject('src'));
      expect(ProjectContext.at(undefined).sourceDirectory().toString()).to.equal(path.resolve('src'));
    });

    // Derived from the names the outputs are written under, so a rename reaches both.
    it('ignores exactly the directories it writes by default', () => {
      expect(GENERATED).to.deep.equal(['/sdk/', '/portal/', '/plugin/']);
    });
  });

  describe('the source', () => {
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

      const zip = await project().buildZip(temp, settings);

      expect(fs.existsSync(zip.toString())).to.be.true;
      expect(fs.existsSync(inProject('temp', 'build', 'spec', 'openapi.json'))).to.be.true;
      expect(fs.existsSync(inProject('temp', 'build', 'package-settings', 'package.json'))).to.be.true;
    });
  });

  describe('versionToBuild', () => {
    const ask = () => sinon.stub<[string[]], Promise<string | undefined>>();

    it('builds from the project itself when it has no build file', async () => {
      const whole = project();

      expect((await whole.versionToBuild(undefined, ask()))._unsafeUnwrap()).to.equal(whole);
      expect(await whole.isVersioned()).to.be.false;
    });

    it('builds from the project itself when its build file declares no versions', async () => {
      versionedBuild({});
      const whole = project();

      expect((await whole.versionToBuild('v2', ask()))._unsafeUnwrap()).to.equal(whole);
    });

    it('has nothing to build from when a versioned build holds no versions', async () => {
      versionedBuild();
      expect(await project().isVersioned()).to.be.true;
      expect((await project().versionToBuild(undefined, ask()))._unsafeUnwrapErr()).to.equal('noVersions');

      fs.mkdirSync(inProject('src', 'versioned_docs'));

      expect((await project().versionToBuild(undefined, ask()))._unsafeUnwrapErr()).to.equal('noVersions');
    });

    it('reads the only version there is without asking', async () => {
      versionedBuild();
      fs.mkdirSync(inProject('src', 'versioned_docs', 'v1'), { recursive: true });
      const asked = ask();

      const version = (await project().versionToBuild(undefined, asked))._unsafeUnwrap();

      expect(version.sourceDirectory().toString()).to.equal(inProject('src', 'versioned_docs', 'v1'));
      expect(asked.called).to.be.false;
    });

    it('asks which version when there are several, offering each by name', async () => {
      versionedBuild();
      fs.mkdirSync(inProject('src', 'versioned_docs', 'v1'), { recursive: true });
      fs.mkdirSync(inProject('src', 'versioned_docs', 'v2'), { recursive: true });
      const asked = ask().resolves('v2');

      const version = (await project().versionToBuild(undefined, asked))._unsafeUnwrap();

      expect(asked.firstCall.args[0]).to.have.members(['v1', 'v2']);
      expect(version.sourceDirectory().toString()).to.equal(inProject('src', 'versioned_docs', 'v2'));
    });

    it('reads the version the flag names without asking, even when it is the only one', async () => {
      versionedBuild({ generateVersionedPortal: {}, versionsPath: 'versions' });
      fs.mkdirSync(inProject('src', 'versions', 'v3'), { recursive: true });
      const asked = ask();

      const version = (await project().versionToBuild('v3', asked))._unsafeUnwrap();

      expect(version.sourceDirectory().toString()).to.equal(inProject('src', 'versions', 'v3'));
      expect(asked.called).to.be.false;
    });

    it('has no version to build when the flag or the answer names none there is', async () => {
      versionedBuild();
      fs.mkdirSync(inProject('src', 'versioned_docs', 'v1'), { recursive: true });
      fs.mkdirSync(inProject('src', 'versioned_docs', 'v2'), { recursive: true });

      expect((await project().versionToBuild('v9', ask()))._unsafeUnwrapErr()).to.equal('versionNotFound');
      expect((await project().versionToBuild(undefined, ask().resolves(undefined)))._unsafeUnwrapErr()).to.equal(
        'versionNotFound'
      );
    });

    // Narrowed to read one version, the project still writes where it always writes.
    it('writes a version where the project writes, the SDK under the version it was built from', async () => {
      versionedBuild();
      fs.mkdirSync(inProject('src', 'versioned_docs', 'v1'), { recursive: true });
      const empty = new DirectoryPath(inProject('empty'));
      fs.mkdirSync(empty.toString());

      const version = (await project().versionToBuild(undefined, ask()))._unsafeUnwrap();
      const saved = await version.sdk(Language.TYPESCRIPT, version.sdkDirectory()).save(empty, false);

      expect(version.sdkDirectory().toString()).to.equal(inProject('sdk'));
      expect(saved.toString()).to.equal(inProject('sdk', 'v1', 'typescript'));
    });

    it('writes an unversioned SDK straight under the SDK directory', async () => {
      const empty = new DirectoryPath(inProject('empty'));
      fs.mkdirSync(empty.toString());

      const saved = await project().sdk(Language.PYTHON, project().sdkDirectory()).save(empty, false);

      expect(saved.toString()).to.equal(inProject('sdk', 'python'));
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

    // `plugin publish` turns /plugin into its own repository; a parent tracking it would nest one
    // repository inside another.
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

    // The caller is a wizard that has already written a portal, so a `.gitignore` it cannot write
    // has to come back as an answer it can report rather than as a throw through the whole run.
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
