import { RelativeFilePath } from '../../src/types/file/relativeFilePath.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Buffer } from 'node:buffer';
import { expect } from 'chai';
import { Result } from 'neverthrow';
import sinon from 'sinon';
import { FileService } from '../../src/infrastructure/file-service.js';
import { GitService } from '../../src/infrastructure/git-service.js';
import { DirectoryPath } from '../../src/types/file/directoryPath.js';
import { CodeGenerationVersion, Language, Stability } from '../../src/types/sdk/generate.js';
import { SdkGeneration } from '../../src/types/sdk/generation-record.js';
import { GENERATED_MARKER, YOURS_MARKER } from '../../src/types/sdk/conflict-markers.js';
import { ConflictSide, MergePlan } from '../../src/types/sdk/merge-plan.js';
import { SdkRepositoryContext } from '../../src/types/sdk-repository-context.js';
import { WriteProblem } from '../../src/types/sdk/repository-state.js';
import { SdkPath } from '../../src/types/sdk/sdk-path.js';
import { SnapshotRef } from '../../src/types/sdk/snapshot-ref.js';
import { recordPristine } from '../helpers/snapshots.js';

/** The ref a run keeps the directory under before writing, for the SDK every test here generates. */
const PREVIOUS_REF = SnapshotRef.previous(SdkPath.fromGit('sdk/typescript')!);

const TYPESCRIPT: SdkGeneration = {
  language: Language.TYPESCRIPT,
  codegenVersion: CodeGenerationVersion.V4,
  stability: Stability.STABLE
};

type Files = Record<string, string | Buffer>;

const BINARY = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x1a]);

// Long enough that a helper added at the end leaves the file mostly itself, as a real model is.
const MODEL_FIELDS = [
  '  /** Unique identifier of the book. */',
  '  id: string;',
  '  /** Title of the book. */',
  '  title: string;',
  '  /** Full name of the author. */',
  '  author: string;',
  '  /** Year of first publication. */',
  '  year?: number;',
  '  /** Stock status. */',
  '  status?: "available" | "sold_out";'
];
const MODEL_V1 = ['export type Book = {', ...MODEL_FIELDS, '  /** Price in USD. */', '  price: number;', '};', ''].join(
  '\n'
);
const MODEL_V2 = [
  'export type Book = {',
  ...MODEL_FIELDS,
  '  /** Retail price in US dollars. */',
  '  price: number;',
  '  isbn?: string;',
  '};',
  ''
].join('\n');
const HELPER = '\nexport function formatPrice(book: Book): string {\n  return `$${book.price.toFixed(2)}`;\n}\n';
const MODEL_V1_WITH_HELPER = MODEL_V1 + HELPER;

/** A run over real repositories: `base` was generated last time, `disk` is the SDK directory now, `generated` is the fresh output. */
type Run = {
  plan: MergePlan;
  written: Result<void, WriteProblem>;
  repository: SdkRepositoryContext;
  read: (relative: string) => string | undefined;
  bytes: (relative: string) => Buffer;
  exists: (relative: string) => boolean;
  paths: () => string[];
};

const counts = (plan: MergePlan) =>
  Object.fromEntries(Object.entries(plan.files).map(([kind, paths]) => [kind, paths.length]));

const rel = (value: string) => RelativeFilePath.fromGit(value)!;

describe('SdkRepositoryContext: the merge', () => {
  let root: string;
  let counter = 0;
  const git = new GitService();

  const write = (directory: DirectoryPath, files: Files) => {
    for (const [relative, contents] of Object.entries(files)) {
      const target = path.join(directory.toString(), relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, contents);
    }
  };

  /**
   * `favour` settles the conflicts for that side, as the first question's answer does. `beforeWrite` runs once the
   * plan is made and before it lands, for a test that breaks the write; the write must succeed without it.
   */
  const run = async (
    base: Files,
    disk: Files,
    generated: Files,
    { favour, beforeWrite }: { favour?: ConflictSide; beforeWrite?: () => void } = {}
  ): Promise<Run> => {
    const project = new DirectoryPath(path.join(root, `project-${counter++}`));
    const sdk = project.join('sdk', 'typescript');
    fs.mkdirSync(sdk.toString(), { recursive: true });
    (await git.init(project))._unsafeUnwrap();
    const repository = SdkRepositoryContext.create(project, sdk)!;
    const baseDirectory = new DirectoryPath(path.join(root, `base-${counter}`));
    const generatedDirectory = new DirectoryPath(path.join(root, `generated-${counter}`));
    fs.mkdirSync(baseDirectory.toString());
    fs.mkdirSync(generatedDirectory.toString());
    write(baseDirectory, base);
    write(sdk, disk);
    write(generatedDirectory, generated);
    const baseCommit = (await recordPristine(project, sdk, baseDirectory, TYPESCRIPT))._unsafeUnwrap();
    const regeneration = (await repository.regenerate(baseCommit, generatedDirectory))._unsafeUnwrap();
    expect(regeneration.generated.isEqual((await repository.snapshotGenerated(generatedDirectory))._unsafeUnwrap())).to
      .be.true;
    const plan = favour === undefined ? regeneration.merge.plan : regeneration.merge.plan.taking(favour);
    beforeWrite?.();
    const written = await repository.write(baseCommit, plan, generatedDirectory);
    if (beforeWrite === undefined) {
      written._unsafeUnwrap();
    }
    expect((await git.resolveRef(project, PREVIOUS_REF))._unsafeUnwrap()).to.not.be.undefined;

    const at = (relative: string) => path.join(sdk.toString(), relative);
    const list = (directory: string): string[] =>
      fs
        .readdirSync(directory, { withFileTypes: true })
        .flatMap((entry) =>
          entry.isDirectory()
            ? list(path.join(directory, entry.name))
            : [path.relative(sdk.toString(), path.join(directory, entry.name)).split(path.sep).join('/')]
        );
    return {
      plan,
      written,
      repository,
      read: (relative) => (fs.existsSync(at(relative)) ? fs.readFileSync(at(relative), 'utf-8') : undefined),
      bytes: (relative) => fs.readFileSync(at(relative)),
      exists: (relative) => fs.existsSync(at(relative)),
      paths: () =>
        list(sdk.toString())
          .filter((relative) => !relative.startsWith('.git/'))
          .sort()
    };
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-repository-merge-'));
  });

  afterEach(() => {
    sinon.restore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('files the base holds, where git decides the lines', () => {
    it('merges your edit with the generator’s change when they touch different lines', async () => {
      const { plan, read } = await run(
        { 'book.ts': MODEL_V1 },
        { 'book.ts': MODEL_V1_WITH_HELPER },
        { 'book.ts': MODEL_V2 }
      );

      expect(read('book.ts')).to.equal(MODEL_V2 + HELPER);
      expect(plan.files.merged).to.have.length(1);
      expect(plan.hasConflicts()).to.be.false;
    });

    it('marks the lines you and the generator both changed, with the CLI’s labels, and keeps the rest merged', async () => {
      const yours = MODEL_V1.replace('Price in USD.', 'Price in USD, VAT included.');

      const { plan, read } = await run({ 'book.ts': MODEL_V1 }, { 'book.ts': yours }, { 'book.ts': MODEL_V2 });

      expect(read('book.ts')).to.equal(
        [
          'export type Book = {',
          ...MODEL_FIELDS,
          '<<<<<<< Your changes',
          '  /** Price in USD, VAT included. */',
          '=======',
          '  /** Retail price in US dollars. */',
          '>>>>>>> Generated by APIMatic',
          '  price: number;',
          '  isbn?: string;',
          '};',
          ''
        ].join('\n')
      );
      expect(plan.conflicts).to.deep.equal([{ path: rel('book.ts'), kind: 'bothChanged' }]);
    });
  });

  describe('files the base does not hold', () => {
    it('adds a file the generator produced for the first time, and never touches one that is yours alone', async () => {
      const { plan, read } = await run(
        { 'a.ts': 'a\n' },
        { 'a.ts': 'a\n', 'custom/format.ts': 'mine\n' },
        { 'a.ts': 'a\n', 'delete-book.ts': 'new\n' }
      );

      expect(read('delete-book.ts')).to.equal('new\n');
      expect(read('custom/format.ts')).to.equal('mine\n');
      expect(plan.files.added).to.have.length(1);
      expect(plan.writes.map((write) => write.path.toString())).to.deep.equal(['delete-book.ts']);
    });

    it('marks a path you and the generator both added with different content, and accepts one with the same', async () => {
      const differ = await run(
        { 'a.ts': 'a\n' },
        { 'a.ts': 'a\n', 'retry.ts': 'yours\n' },
        { 'a.ts': 'a\n', 'retry.ts': 'generated\n' }
      );
      const same = await run(
        { 'a.ts': 'a\n' },
        { 'a.ts': 'a\n', 'retry.ts': 'same\n' },
        { 'a.ts': 'a\n', 'retry.ts': 'same\n' }
      );

      expect(differ.read('retry.ts')).to.equal(
        ['<<<<<<< Your changes', 'yours', '=======', 'generated', '>>>>>>> Generated by APIMatic', ''].join('\n')
      );
      expect(differ.plan.conflicts).to.deep.equal([{ path: rel('retry.ts'), kind: 'bothAdded' }]);
      expect(same.plan.writes).to.be.empty;
      expect(same.plan.hasConflicts()).to.be.false;
    });
  });

  describe('renames', () => {
    it('follows a file you moved and merges the generator’s change into it where it is now', async () => {
      const { plan, read, exists } = await run(
        { 'models/book.ts': MODEL_V1, 'b.ts': 'b\n' },
        { 'models/catalog/book.ts': MODEL_V1_WITH_HELPER, 'b.ts': 'b\n' },
        { 'models/book.ts': MODEL_V2, 'b.ts': 'b\n' }
      );

      expect(read('models/catalog/book.ts')).to.equal(MODEL_V2 + HELPER);
      expect(exists('models/book.ts')).to.be.false;
      expect(plan.hasConflicts()).to.be.false;
    });

    it('labels the markers in a file you moved with the sides, where git names the old path too', async () => {
      const { plan, read } = await run(
        { 'models/book.ts': MODEL_V1, 'b.ts': 'b\n' },
        { 'models/catalog/book.ts': MODEL_V1.replace('Price in USD.', 'Price in USD, VAT included.'), 'b.ts': 'b\n' },
        { 'models/book.ts': MODEL_V2, 'b.ts': 'b\n' }
      );

      const content = read('models/catalog/book.ts')!;
      expect(content).to.contain(`${YOURS_MARKER}\n`).and.to.contain(`${GENERATED_MARKER}\n`);
      expect(content).to.not.match(/^[<>]{7} [0-9a-f]{40}/m);
      expect(plan.conflicts.map((conflict) => conflict.kind)).to.deep.equal(['bothChanged']);
    });

    it('carries your edit to a file the generator renamed, and removes the old name', async () => {
      const { plan, read, exists } = await run(
        { 'models/book.ts': MODEL_V1, 'b.ts': 'b\n' },
        { 'models/book.ts': MODEL_V1_WITH_HELPER, 'b.ts': 'b\n' },
        { 'models/book-model.ts': MODEL_V2, 'b.ts': 'b\n' }
      );

      expect(read('models/book-model.ts')).to.equal(MODEL_V2 + HELPER);
      expect(exists('models/book.ts')).to.be.false;
      expect(plan.hasConflicts()).to.be.false;
    });
  });

  describe('how the plan lands on disk', () => {
    it('renames a file whose name changed only in case, on a filesystem that ignores case too', async () => {
      const { paths, read } = await run(
        { 'models/user.ts': 'user\n', 'b.ts': 'b\n' },
        { 'models/user.ts': 'user\n', 'b.ts': 'b\n' },
        { 'models/User.ts': 'user\n', 'b.ts': 'b\n' }
      );

      expect(paths()).to.deep.equal(['b.ts', 'models/User.ts']);
      expect(read('models/User.ts')).to.equal('user\n');
    });

    it('renames a directory whose name changed only in case', async () => {
      const { paths } = await run(
        { 'Models/a.ts': 'a\n', 'Models/b.ts': 'b\n', 'c.ts': 'c\n' },
        { 'Models/a.ts': 'a\n', 'Models/b.ts': 'b\n', 'c.ts': 'c\n' },
        { 'models/a.ts': 'a\n', 'models/b.ts': 'b\n', 'c.ts': 'c\n' }
      );

      expect(paths()).to.deep.equal(['c.ts', 'models/a.ts', 'models/b.ts']);
    });

    it('lets a file become a directory and a directory become a file', async () => {
      const { paths, read } = await run(
        { docs: 'docs\n', 'api/index.md': 'api\n' },
        { docs: 'docs\n', 'api/index.md': 'api\n' },
        { 'docs/index.md': 'docs\n', api: 'api\n' }
      );

      expect(paths()).to.deep.equal(['api', 'docs/index.md']);
      expect(read('docs/index.md')).to.equal('docs\n');
      expect(read('api')).to.equal('api\n');
    });

    it('removes the directories a removed file leaves empty, and no other', async () => {
      const { exists } = await run(
        { 'models/old/deep/a.ts': 'a\n', 'models/keep.ts': 'k\n' },
        { 'models/old/deep/a.ts': 'a\n', 'models/keep.ts': 'k\n' },
        { 'models/keep.ts': 'k\n' }
      );

      expect(exists('models/old')).to.be.false;
      expect(exists('models/keep.ts')).to.be.true;
    });
  });

  describe('settled for a side, as the first question’s answer is', () => {
    it('settles each overlapping hunk for that side and merges the rest, with the file’s own line ending', async () => {
      const base = 'a\r\nb\r\nc\r\nd\r\ne\r\nf\r\ng\r\n';
      const yours = 'A\r\nb\r\nc\r\nd\r\ne\r\nf\r\ng yours\r\n';
      const generated = 'a\nb\nc\nD\ne\nf\ng generated\n';
      const expected = {
        generated: 'A\r\nb\r\nc\r\nD\r\ne\r\nf\r\ng generated\r\n',
        yours: 'A\r\nb\r\nc\r\nD\r\ne\r\nf\r\ng yours\r\n'
      };
      for (const favour of ['generated', 'yours'] as const) {
        const { plan, read } = await run({ 'a.ts': base }, { 'a.ts': yours }, { 'a.ts': generated }, { favour });

        expect(read('a.ts'), favour).to.equal(expected[favour]);
        expect(plan.hasConflicts(), favour).to.be.false;
        expect(plan.files.merged.map(String), favour).to.deep.equal(['a.ts']);
      }
    });

    it('keeps an edited file the generator stopped producing, for the generator’s side too', async () => {
      const { plan, read } = await run(
        { 'models/book.ts': MODEL_V1, 'helper.ts': 'helper\n' },
        { 'models/book.ts': MODEL_V1_WITH_HELPER, 'helper.ts': 'helper, edited\n' },
        { 'models/book.ts': MODEL_V2 },
        { favour: 'generated' }
      );

      expect(read('helper.ts')).to.equal('helper, edited\n');
      expect(read('models/book.ts')).to.equal(MODEL_V2 + HELPER);
      expect(plan.files.kept.map(String)).to.deep.equal(['helper.ts']);
      expect(plan.hasConflicts()).to.be.false;
    });

    it('keeps a file you added inside a directory the generator renamed, for either side', async () => {
      for (const favour of ['generated', 'yours'] as const) {
        const { paths, read } = await run(
          { 'models/book.ts': MODEL_V1, 'b.ts': 'b\n' },
          { 'models/book.ts': MODEL_V1, 'models/custom.ts': 'custom\n', 'b.ts': 'b\n' },
          { 'model/book.ts': MODEL_V2, 'b.ts': 'b\n' },
          { favour }
        );

        const custom = paths().find((relative) => relative.endsWith('custom.ts'));
        expect(custom, favour).to.not.be.undefined;
        expect(read(custom!)).to.equal('custom\n');
        expect(read('model/book.ts')).to.equal(MODEL_V2);
      }
    });
  });

  describe('a write that fails partway', () => {
    const BEFORE: Files = { 'a.ts': '1\r\n', 'b.ts': '1\n', 'c.ts': '1\n' };
    const AFTER: Files = { 'a.ts': '2\n', 'b.ts': '2\n', 'd.ts': 'new\n' };

    /** Makes every write of a file named `name` fail, and of `a.ts` too when it is being put back to `1`. */
    const breaking =
      (name: string, andRestoringA = false) =>
      () => {
        const real = FileService.prototype.writeBytes;
        sinon.stub(FileService.prototype, 'writeBytes').callsFake(function (this: FileService, file, content) {
          const target = file.toString();
          const restoringA = andRestoringA && target.endsWith('a.ts') && Buffer.from(content).toString() === '1\r\n';
          return target.endsWith(name) || restoringA
            ? Promise.reject(new Error(`EACCES: permission denied, open '${target}'`))
            : real.call(this, file, content);
        });
      };

    it('names the file, puts back what it had changed byte for byte, and leaves the directory as it was', async () => {
      const { written, read, paths } = await run(BEFORE, BEFORE, AFTER, { beforeWrite: breaking('b.ts') });

      const problem = written._unsafeUnwrapErr();
      if (!('kind' in problem)) {
        return expect.fail('the write should have stopped at a file');
      }
      expect(problem.file.name().toString()).to.equal('b.ts');
      expect(problem.operation).to.equal('write');
      expect(problem.reason).to.contain('EACCES');
      expect(problem.undo).to.deep.equal({ kind: 'done' });
      expect(paths()).to.deep.equal(['a.ts', 'b.ts', 'c.ts']);
      expect([read('a.ts'), read('b.ts'), read('c.ts')]).to.deep.equal(['1\r\n', '1\n', '1\n']);
    });

    it('says what could not be put back, and which snapshot to restore from', async () => {
      const { written, read } = await run(BEFORE, BEFORE, AFTER, { beforeWrite: breaking('b.ts', true) });

      const problem = written._unsafeUnwrapErr();
      if (!('kind' in problem) || problem.undo.kind !== 'failed') {
        return expect.fail('the undo should have failed');
      }
      expect(problem.undo.reason).to.contain('a.ts');
      expect(problem.undo.previous.toString()).to.equal(PREVIOUS_REF.toString());
      expect(read('a.ts')).to.equal('2\r\n');
      expect(read('c.ts')).to.equal('1\n');
    });
  });

  describe('content rules', () => {
    it('reads a line ending alone as no change, writes a merged file with the ending it has on disk, and leaves an untouched CRLF file as it is', async () => {
      const { plan, read } = await run(
        { 'a.ts': 'one\ntwo\n', 'b.ts': 'b\n' },
        { 'a.ts': 'one\r\ntwo\r\nthree\r\n', 'b.ts': 'b\r\n' },
        { 'a.ts': 'zero\none\ntwo\n', 'b.ts': 'b\n' }
      );

      expect(read('a.ts')).to.equal('zero\r\none\r\ntwo\r\nthree\r\n');
      expect(read('b.ts')).to.equal('b\r\n');
      expect(plan.files.merged).to.have.length(1);
      expect(plan.hasConflicts()).to.be.false;
    });

    it('keeps the generator’s CRLF in a file it changes, gives a new file the generator’s ending, and keeps LF where you chose it', async () => {
      const { read } = await run(
        { 'a.cs': 'one\r\ntwo\r\n', 'b.cs': 'one\r\ntwo\r\n', 'c.cs': 'c\r\n' },
        { 'a.cs': 'one\r\ntwo\r\n', 'b.cs': 'mine\none\ntwo\n', 'c.cs': 'c\r\n' },
        { 'a.cs': 'one\r\ntwo\r\nthree\r\n', 'b.cs': 'one\r\ntwo\r\nthree\r\n', 'c.cs': 'c\r\n', 'd.cs': 'new\r\n' }
      );

      expect(read('a.cs')).to.equal('one\r\ntwo\r\nthree\r\n');
      expect(read('b.cs')).to.equal('mine\none\ntwo\nthree\n');
      expect(read('d.cs')).to.equal('new\r\n');
    });

    it('labels the markers of a CRLF file on CRLF lines', async () => {
      const { read } = await run(
        { 'a.cs': 'one\r\ntwo\r\n' },
        { 'a.cs': 'one\r\nmine\r\n' },
        { 'a.cs': 'one\r\ntheirs\r\n' }
      );

      expect(read('a.cs')).to.equal(`one\r\n${YOURS_MARKER}\r\nmine\r\n=======\r\ntheirs\r\n${GENERATED_MARKER}\r\n`);
    });

    it('replaces an unedited binary and keeps an edited one, as a conflict when the generator changed it too', async () => {
      const changed = Buffer.concat([BINARY, Buffer.from([1])]);
      const edited = Buffer.concat([BINARY, Buffer.from([2])]);

      const replaced = await run({ 'logo.png': BINARY }, { 'logo.png': BINARY }, { 'logo.png': changed });
      const both = await run({ 'logo.png': BINARY }, { 'logo.png': edited }, { 'logo.png': changed });

      expect(replaced.bytes('logo.png')).to.deep.equal(changed);
      expect(replaced.plan.files.updated).to.have.length(1);
      expect(both.bytes('logo.png')).to.deep.equal(edited);
      expect(both.plan.conflicts).to.deep.equal([{ path: rel('logo.png'), kind: 'binary' }]);
    });
  });

  describe('two spec versions in a row, as a generator ships them', () => {
    const v1: Files = {
      'src/models/book.ts': MODEL_V1,
      'src/sdk/authors.ts': 'export class Authors {}\n',
      'docs/models/book.md': '# Book\n\nprice\n'
    };
    const v2: Files = {
      'src/models/book.ts': MODEL_V2,
      'src/sdk/authors.ts': 'export class Authors {}\n',
      'src/funcs/delete-book.ts': 'export function deleteBook() {}\n',
      'docs/models/book.md': '# Book\n\nprice\nisbn\n'
    };

    it('keeps a helper, a new file and a custom file through the v2 spec, and writes back a deleted docs page as a conflict', async () => {
      const { plan, read, paths } = await run(
        v1,
        {
          'src/models/book.ts': MODEL_V1_WITH_HELPER,
          'src/sdk/authors.ts': 'export class Authors {}\n',
          'src/custom/format.ts': 'mine\n'
        },
        v2
      );

      expect(paths()).to.deep.equal([
        'docs/models/book.md',
        'src/custom/format.ts',
        'src/funcs/delete-book.ts',
        'src/models/book.ts',
        'src/sdk/authors.ts'
      ]);
      expect(read('src/models/book.ts')).to.equal(MODEL_V2 + HELPER);
      expect(plan.conflicts).to.deep.equal([{ path: rel('docs/models/book.md'), kind: 'deletedByYou' }]);
      expect(counts(plan)).to.deep.equal({ added: 1, updated: 0, merged: 1, removed: 0, kept: 1 });
    });

    it('keeps an edited file the v3 spec drops, and removes nothing else it did not produce', async () => {
      const v3: Files = { 'src/models/book.ts': MODEL_V2, 'docs/models/book.md': '# Book\n\nprice\nisbn\n' };

      const { plan, read, exists } = await run(
        v1,
        {
          'src/models/book.ts': MODEL_V1,
          'src/sdk/authors.ts': 'export class Authors { getMany() {} }\n',
          'docs/models/book.md': '# Book\n\nprice\n'
        },
        v3
      );

      expect(exists('src/sdk/authors.ts')).to.be.true;
      expect(read('src/models/book.ts')).to.equal(MODEL_V2);
      expect(plan.conflicts).to.deep.equal([{ path: rel('src/sdk/authors.ts'), kind: 'noLongerGenerated' }]);
      expect(plan.files.updated).to.have.length(2);
    });
  });
});
