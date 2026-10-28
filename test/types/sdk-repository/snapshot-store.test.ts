import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { GitService } from '../../../src/infrastructure/git-service.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { CodeGenerationVersion, Language, Stability } from '../../../src/types/sdk/generate.js';
import { SdkGeneration } from '../../../src/types/sdk/sdk-generation.js';
import { SdkPath } from '../../../src/types/sdk/sdk-path.js';
import { SnapshotStore } from '../../../src/types/sdk-repository/snapshot-store.js';
import { describeCommit, snapshotFiles } from '../../helpers/snapshots.js';

const TYPESCRIPT = SdkGeneration.create({
  language: Language.TYPESCRIPT,
  codegenVersion: CodeGenerationVersion.V4,
  stability: Stability.STABLE
})!;

describe('SnapshotStore', () => {
  let root: string;
  const git = new GitService();

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-store-'));
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const write = (directory: DirectoryPath, relative: string, contents: string) => {
    const target = path.join(directory.toString(), relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  };

  const generated = (files: Record<string, string>): DirectoryPath => {
    const directory = new DirectoryPath(fs.mkdtempSync(path.join(root, 'generated-')));
    for (const [relative, contents] of Object.entries(files)) {
      write(directory, relative, contents);
    }
    return directory;
  };

  /** The store for the SDK at `sdk` in the repository at `project`, once `git init` ran there. */
  const store = async (project: DirectoryPath, sdk: DirectoryPath): Promise<SnapshotStore> => {
    fs.mkdirSync(sdk.toString(), { recursive: true });
    (await git.init(project))._unsafeUnwrap();
    return new SnapshotStore(project, SdkPath.of(project, sdk)!);
  };

  describe('savePrevious', () => {
    it('keeps the directory as it is, without its own .git, and replaces the last one', async () => {
      const sdk = new DirectoryPath(path.join(root, 'sdk', 'typescript'));
      write(sdk, 'README.md', '# edited');
      write(sdk, path.join('.apimatic', 'generation.json'), '{}');
      const snapshots = await store(sdk, sdk);

      const first = (await snapshots.savePrevious(undefined))._unsafeUnwrap();
      write(sdk, 'README.md', '# edited again');
      const second = (await snapshots.savePrevious(undefined))._unsafeUnwrap();

      const kept = await snapshotFiles(sdk, second);
      expect([...kept.keys()]).to.have.members(['README.md', '.apimatic/generation.json']);
      expect(kept.get('README.md')).to.equal('# edited again');
      expect((await git.resolveRef(sdk, snapshots.previousRef()))._unsafeUnwrap()?.isEqual(second)).to.be.true;
      expect((await describeCommit(sdk, second)).parents).to.be.empty;
      expect((await snapshotFiles(sdk, first)).get('README.md')).to.equal('# edited');
    });

    it('includes a generated file the SDK’s own .gitignore matches, and leaves other ignored files out', async () => {
      const project = new DirectoryPath(path.join(root, 'project'));
      const sdk = project.join('sdk', 'typescript');
      const snapshots = await store(project, sdk);
      const tree = (
        await snapshots.snapshotGenerated(generated({ '.gitignore': 'dist/\n', 'dist/generated.js': 'generated' }))
      )._unsafeUnwrap();
      const base = (await snapshots.recordPristine(tree, TYPESCRIPT))._unsafeUnwrap();
      write(sdk, '.gitignore', 'dist/\n');
      write(sdk, 'dist/generated.js', 'generated');
      write(sdk, 'dist/built.js', 'built');

      const previous = (await snapshots.savePrevious(base))._unsafeUnwrap();

      expect([...(await snapshotFiles(project, previous)).keys()]).to.have.members(['.gitignore', 'dist/generated.js']);
    });
  });
});
