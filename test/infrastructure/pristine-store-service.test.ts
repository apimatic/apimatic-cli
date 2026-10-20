import fs from 'fs';
import os from 'os';
import path from 'path';
import { TextDecoder } from 'node:util';
import { expect } from 'chai';
import git from 'isomorphic-git';
import { PristineStoreService } from '../../src/infrastructure/pristine-store-service.js';
import { DirectoryPath } from '../../src/types/file/directoryPath.js';
import { CommitId } from '../../src/types/sdk/commit-id.js';
import { CodeGenerationVersion, Language, Stability } from '../../src/types/sdk/generate.js';
import { GenerationRecord, SdkGeneration } from '../../src/types/sdk/generation-record.js';
import { SdkRepository } from '../../src/types/sdk/sdk-repository.js';

const TYPESCRIPT: SdkGeneration = {
  language: Language.TYPESCRIPT,
  codegenVersion: CodeGenerationVersion.V4,
  stability: Stability.STABLE
};

describe('PristineStoreService', () => {
  let root: string;
  let service: PristineStoreService;

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

  const project = async (sdk = path.join('sdk', 'typescript')): Promise<SdkRepository> => {
    const projectDirectory = new DirectoryPath(path.join(root, 'project'));
    fs.mkdirSync(projectDirectory.join(sdk).toString(), { recursive: true });
    await git.init({ fs, dir: projectDirectory.toString(), defaultBranch: 'main' });
    return (await service.findRepository(projectDirectory.join(sdk)))!;
  };

  const read = async (repository: SdkRepository, ref: string) =>
    git.resolveRef({ fs, dir: repository.root().toString(), ref });

  const commitOf = async (repository: SdkRepository, oid: string) =>
    (await git.readCommit({ fs, dir: repository.root().toString(), oid })).commit;

  const text = (bytes: Uint8Array | undefined) => (bytes === undefined ? undefined : new TextDecoder().decode(bytes));

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'pristine-store-'));
    service = new PristineStoreService();
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('findRepository', () => {
    it('finds nothing outside a repository', async () => {
      const sdk = new DirectoryPath(path.join(root, 'sdk', 'typescript'));
      fs.mkdirSync(sdk.toString(), { recursive: true });

      expect(await service.findRepository(sdk)).to.be.undefined;
    });

    it('answers with the enclosing repository, however deep the SDK directory sits', async () => {
      const repository = await project(path.join('packages', 'sdk', 'typescript'));

      expect(repository.root().isEqual(new DirectoryPath(path.join(root, 'project')))).to.be.true;
      expect(repository.isRootSdk()).to.be.false;
      expect(repository.pristineRef().toString()).to.equal('refs/apimatic/pristine/packages/sdk/typescript');
    });
  });

  describe('initRepository', () => {
    it('makes the SDK directory its own repository, on main', async () => {
      const sdk = new DirectoryPath(path.join(root, 'sdk', 'typescript'));
      write(sdk, 'README.md', '# sdk');

      const repository = (await service.initRepository(sdk))._unsafeUnwrap();

      expect(repository.isRootSdk()).to.be.true;
      expect(repository.pristineRef().toString()).to.equal('refs/apimatic/pristine');
      expect(fs.readFileSync(path.join(sdk.toString(), '.git', 'HEAD'), 'utf-8').trim()).to.equal(
        'ref: refs/heads/main'
      );
      expect(fs.readFileSync(path.join(sdk.toString(), 'README.md'), 'utf-8')).to.equal('# sdk');
    });
  });

  describe('recordPristine', () => {
    it('records the first snapshot with no parent, under the SDK directory’s ref', async () => {
      const repository = await project();

      const commit = (
        await service.recordPristine(
          repository,
          generated({ 'README.md': '# v1', 'src/index.ts': 'export {};' }),
          TYPESCRIPT
        )
      )._unsafeUnwrap();

      expect(await read(repository, 'refs/apimatic/pristine/sdk/typescript')).to.equal(commit.toString());
      const object = await commitOf(repository, commit.toString());
      expect(object.parent).to.be.empty;
      expect(object.message.trim()).to.equal('apimatic: pristine typescript v4 stable');
      expect(object.author.name).to.equal('APIMatic CLI');
      const files = (await service.readSnapshot(repository, commit))._unsafeUnwrap();
      expect([...files.keys()]).to.have.members(['README.md', 'src/index.ts']);
      expect(text(files.get('src/index.ts'))).to.equal('export {};');
    });

    it('chains the next snapshot onto the last and moves the ref', async () => {
      const repository = await project();
      const first = (
        await service.recordPristine(repository, generated({ 'README.md': '# v1' }), TYPESCRIPT)
      )._unsafeUnwrap();

      const second = (
        await service.recordPristine(repository, generated({ 'README.md': '# v2' }), TYPESCRIPT)
      )._unsafeUnwrap();

      expect((await commitOf(repository, second.toString())).parent).to.deep.equal([first.toString()]);
      expect((await service.pristineTip(repository))?.isEqual(second)).to.be.true;
      expect(text((await service.readSnapshot(repository, first))._unsafeUnwrap().get('README.md'))).to.equal('# v1');
    });

    it('refuses an SDK directory inside one that already has snapshots, and the reverse', async () => {
      const outer = await project();
      (await service.recordPristine(outer, generated({ 'README.md': '# outer' }), TYPESCRIPT))._unsafeUnwrap();
      const inner = (await service.findRepository(outer.sdkDirectory().join('typescript')))!;

      const refused = await service.recordPristine(inner, generated({ 'README.md': '# inner' }), TYPESCRIPT);

      expect(refused._unsafeUnwrapErr().kind).to.equal('nestedSdkDirectory');
      const other = await project(path.join('other', 'typescript', 'nested'));
      (await service.recordPristine(other, generated({ 'README.md': '# nested' }), TYPESCRIPT))._unsafeUnwrap();
      const parent = (await service.findRepository(
        new DirectoryPath(path.join(root, 'project', 'other', 'typescript'))
      ))!;
      expect((await service.recordPristine(parent, generated({}), TYPESCRIPT))._unsafeUnwrapErr().kind).to.equal(
        'nestedSdkDirectory'
      );
    });

    it('refuses any SDK directory below a repository whose root is one', async () => {
      const sdk = new DirectoryPath(path.join(root, 'sdk'));
      fs.mkdirSync(sdk.toString(), { recursive: true });
      const repository = (await service.initRepository(sdk))._unsafeUnwrap();
      (await service.recordPristine(repository, generated({ 'README.md': '# root' }), TYPESCRIPT))._unsafeUnwrap();
      expect(await read(repository, 'refs/apimatic/pristine')).to.be.a('string');
      const below = (await service.findRepository(sdk.join('typescript')))!;

      expect((await service.recordPristine(below, generated({}), TYPESCRIPT))._unsafeUnwrapErr().kind).to.equal(
        'nestedSdkDirectory'
      );
    });
  });

  describe('savePrevious', () => {
    it('keeps the directory as it is, without its own .git, and replaces the last one', async () => {
      const sdk = new DirectoryPath(path.join(root, 'sdk', 'typescript'));
      write(sdk, 'README.md', '# edited');
      write(sdk, path.join('.apimatic', 'generation.json'), '{}');
      const repository = (await service.initRepository(sdk))._unsafeUnwrap();

      const first = (await service.savePrevious(repository))._unsafeUnwrap();
      write(sdk, 'README.md', '# edited again');
      const second = (await service.savePrevious(repository))._unsafeUnwrap();

      const kept = (await service.readSnapshot(repository, second))._unsafeUnwrap();
      expect([...kept.keys()]).to.have.members(['README.md', '.apimatic/generation.json']);
      expect(text(kept.get('README.md'))).to.equal('# edited again');
      expect(await read(repository, 'refs/apimatic/previous')).to.equal(second.toString());
      expect((await commitOf(repository, second.toString())).parent).to.be.empty;
      expect(text((await service.readSnapshot(repository, first))._unsafeUnwrap().get('README.md'))).to.equal(
        '# edited'
      );
    });
  });

  describe('readSnapshot', () => {
    it('reports a commit the repository does not hold', async () => {
      const repository = await project();

      const missing = await service.readSnapshot(repository, CommitId.create('0'.repeat(40))!);

      expect(missing._unsafeUnwrapErr().kind).to.equal('snapshotMissing');
    });
  });

  describe('the generation record', () => {
    it('is absent until written, then reads back what was written', async () => {
      const repository = await project();
      const sdk = repository.sdkDirectory();
      expect(await service.readRecord(sdk)).to.be.undefined;
      const pristine = (
        await service.recordPristine(repository, generated({ 'README.md': '# v1' }), TYPESCRIPT)
      )._unsafeUnwrap();
      const record = GenerationRecord.written(TYPESCRIPT, pristine, new Date('2026-10-20T10:00:00Z'), '2.3.0', [
        'src/index.ts'
      ]);

      const file = await service.writeRecord(sdk, record);

      expect(file.toString()).to.equal(path.join(sdk.toString(), '.apimatic', 'generation.json'));
      const read = (await service.readRecord(sdk))!;
      expect(read.pristineCommit().isEqual(pristine)).to.be.true;
      expect(read.conflictedPaths()).to.deep.equal(['src/index.ts']);
      expect(read.isFor(TYPESCRIPT)).to.be.true;
      expect(read.toJson()).to.equal(record.toJson());
    });

    it('reads as absent when the file cannot be understood', async () => {
      const repository = await project();
      write(repository.sdkDirectory(), path.join('.apimatic', 'generation.json'), '{"schemaVersion": 2}');

      expect(await service.readRecord(repository.sdkDirectory())).to.be.undefined;
    });
  });
});
