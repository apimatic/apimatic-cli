import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect } from 'chai';
import { DirectoryPath } from '../../src/types/file/directoryPath';
import { ProjectContext } from '../../src/types/project-context';

describe('ProjectContext.upsertGitignore', () => {
  let root: string;

  const gitignorePath = () => path.join(root, '.gitignore');
  const gitignore = () => fs.readFileSync(gitignorePath(), 'utf8');
  const ignore = async () => await new ProjectContext(new DirectoryPath(root)).upsertGitignore();

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'project-context-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

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
