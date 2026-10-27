import { RelativeFilePath } from '../../src/types/file/relativeFilePath.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Buffer } from 'node:buffer';
import { expect } from 'chai';
import { Result } from 'neverthrow';
import sinon from 'sinon';
import { GitService } from '../../src/infrastructure/git-service.js';
import { SdkContext } from '../../src/types/sdk-context.js';
import { DirectoryPath } from '../../src/types/file/directoryPath.js';
import { CodeGenerationVersion, Language, Stability } from '../../src/types/sdk/generate.js';
import { SdkGeneration } from '../../src/types/sdk/generation-record.js';
import { GENERATED_MARKER, YOURS_MARKER } from '../../src/types/sdk/conflict-markers.js';
import { ConflictSide, MergePlan } from '../../src/types/sdk/merge-plan.js';
import { SdkRepositoryContext, SdkRepositoryProblem } from '../../src/types/sdk-repository-context.js';

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
  written: Result<void, SdkRepositoryProblem>;
  repository: SdkRepositoryContext;
  read: (relative: string) => string | undefined;
  bytes: (relative: string) => Buffer;
  exists: (relative: string) => boolean;
  paths: () => string[];
};

const counts = (plan: MergePlan) =>
  Object.fromEntries(Object.entries(plan.files).map(([kind, paths]) => [kind, paths.length]));

const rel = (value: string) => RelativeFilePath.fromGit(value);

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
    await git.init(project);
    const repository = (await new SdkContext(sdk).repository())!;
    const baseDirectory = new DirectoryPath(path.join(root, `base-${counter}`));
    const generatedDirectory = new DirectoryPath(path.join(root, `generated-${counter}`));
    fs.mkdirSync(baseDirectory.toString());
    fs.mkdirSync(generatedDirectory.toString());
    write(baseDirectory, base);
    write(sdk, disk);
    write(generatedDirectory, generated);
    const baseCommit = (
      await repository.recordPristine((await repository.snapshotGenerated(baseDirectory))._unsafeUnwrap(), TYPESCRIPT)
    )._unsafeUnwrap();
    const regeneration = (await repository.regenerate(baseCommit, generatedDirectory, favour))._unsafeUnwrap();
    expect(regeneration.generated.isEqual((await repository.snapshotGenerated(generatedDirectory))._unsafeUnwrap())).to
      .be.true;
    const plan = favour === undefined ? regeneration.merge.plan : regeneration.merge.plan.taking(favour);
    beforeWrite?.();
    const written = await repository.write(baseCommit, plan);
    if (beforeWrite === undefined) {
      written._unsafeUnwrap();
    }
    expect(await git.resolveRef(project, repository.previousRef())).to.not.be.undefined;

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

  describe('files the base holds', () => {
    it('writes the new version of a file you never edited', async () => {
      const { plan, read } = await run({ 'a.ts': 'v1\n' }, { 'a.ts': 'v1\n' }, { 'a.ts': 'v2\n' });

      expect(read('a.ts')).to.equal('v2\n');
      expect(plan.files.updated).to.have.length(1);
      expect(plan.hasConflicts()).to.be.false;
    });

    it('keeps your edit when the generator left the file alone', async () => {
      const { plan, read } = await run({ 'a.ts': 'v1\n' }, { 'a.ts': 'v1 edited\n' }, { 'a.ts': 'v1\n' });

      expect(read('a.ts')).to.equal('v1 edited\n');
      expect(plan.writes).to.be.empty;
      expect(plan.files.kept).to.have.length(1);
    });

    it('does nothing when neither side changed, or when you already made the generator’s change', async () => {
      const same = await run({ 'a.ts': 'v1\n' }, { 'a.ts': 'v1\n' }, { 'a.ts': 'v1\n' });
      const ahead = await run({ 'a.ts': 'v1\n' }, { 'a.ts': 'v2\n' }, { 'a.ts': 'v2\n' });

      expect(same.plan.writes).to.be.empty;
      expect(same.plan.files.unchanged).to.have.length(1);
      expect(ahead.plan.writes).to.be.empty;
      expect(ahead.plan.hasConflicts()).to.be.false;
    });

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

    it('leaves a file you deleted deleted while the generator does not change it', async () => {
      const { plan, exists } = await run(
        { 'a.ts': 'v1\n', 'b.ts': 'b\n' },
        { 'b.ts': 'b\n' },
        { 'a.ts': 'v1\n', 'b.ts': 'b\n' }
      );

      expect(exists('a.ts')).to.be.false;
      expect(plan.writes).to.be.empty;
      expect(plan.hasConflicts()).to.be.false;
    });

    it('writes back a file you deleted once the generator changes it, as a conflict', async () => {
      const { plan, read } = await run(
        { 'a.ts': 'v1\n', 'b.ts': 'b\n' },
        { 'b.ts': 'b\n' },
        { 'a.ts': 'v2\n', 'b.ts': 'b\n' }
      );

      expect(read('a.ts')).to.equal('v2\n');
      expect(plan.conflicts).to.deep.equal([{ path: rel('a.ts'), kind: 'deletedByYou' }]);
    });

    it('removes a file the generator stopped producing when you never edited it', async () => {
      const { plan, exists } = await run(
        { 'authors.ts': 'v1\n', 'b.ts': 'b\n' },
        { 'authors.ts': 'v1\n', 'b.ts': 'b\n' },
        { 'b.ts': 'b\n' }
      );

      expect(exists('authors.ts')).to.be.false;
      expect(plan.deletes).to.deep.equal(['authors.ts'].map(rel));
      expect(plan.files.removed).to.have.length(1);
    });

    it('keeps a file the generator stopped producing when you edited it, as a conflict', async () => {
      const { plan, read } = await run(
        { 'authors.ts': 'v1\n', 'b.ts': 'b\n' },
        { 'authors.ts': 'v1 + getMany\n', 'b.ts': 'b\n' },
        { 'b.ts': 'b\n' }
      );

      expect(read('authors.ts')).to.equal('v1 + getMany\n');
      expect(plan.conflicts).to.deep.equal([{ path: rel('authors.ts'), kind: 'noLongerGenerated' }]);
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
      expect(plan.renames).to.deep.equal([
        { from: rel('models/book.ts'), to: rel('models/catalog/book.ts'), by: 'you' }
      ]);
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
      expect(plan.renames).to.deep.equal([
        { from: rel('models/book.ts'), to: rel('models/book-model.ts'), by: 'generator' }
      ]);
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
    const BEFORE: Files = { 'a.ts': '1\n', 'b.ts': '1\n', 'c.ts': '1\n' };
    const AFTER: Files = { 'a.ts': '2\n', 'b.ts': '2\n', 'd.ts': 'new\n' };

    /** Makes every write of a file named `name` fail, and of `a.ts` too when it is being put back to `1`. */
    const breaking = (name: string, andRestoringA = false) => () => {
      const real = fs.promises.writeFile;
      sinon.stub(fs.promises, 'writeFile').callsFake((file, data, ...rest) => {
        const target = String(file);
        const text = typeof data === 'string' ? data : Buffer.from(data as Uint8Array).toString();
        const restoringA = andRestoringA && target.endsWith('a.ts') && text === '1\n';
        return target.endsWith(name) || restoringA
          ? Promise.reject(new Error(`EACCES: permission denied, open '${target}'`))
          : real.call(fs.promises, file, data, ...rest);
      });
    };

    it('names the file, puts back what it had changed, and leaves the directory as it was', async () => {
      const { written, read, paths } = await run(BEFORE, BEFORE, AFTER, { beforeWrite: breaking('b.ts') });

      const problem = written._unsafeUnwrapErr();
      expect(problem.kind).to.equal('notApplied');
      if (problem.kind !== 'notApplied') {
        return;
      }
      expect(problem.file.name().toString()).to.equal('b.ts');
      expect(problem.operation).to.equal('write');
      expect(problem.reason).to.contain('EACCES');
      expect(problem.undo).to.deep.equal({ kind: 'done' });
      expect(paths()).to.deep.equal(['a.ts', 'b.ts', 'c.ts']);
      expect([read('a.ts'), read('b.ts'), read('c.ts')]).to.deep.equal(['1\n', '1\n', '1\n']);
    });

    it('says what could not be put back, and which snapshot to restore from', async () => {
      const { written, read, repository } = await run(BEFORE, BEFORE, AFTER, { beforeWrite: breaking('b.ts', true) });

      const problem = written._unsafeUnwrapErr();
      expect(problem.kind).to.equal('notApplied');
      if (problem.kind !== 'notApplied' || problem.undo.kind !== 'failed') {
        expect.fail('the undo should have failed');
      }
      expect(problem.undo.reason).to.contain('a.ts');
      expect(problem.undo.previous.isEqual(repository.previousRef())).to.be.true;
      expect(read('a.ts')).to.equal('2\n');
      expect(read('c.ts')).to.equal('1\n');
    });
  });

  describe('content rules', () => {
    it('reads a line ending alone as no change, writes a merged file with LF, and leaves an untouched CRLF file as it is', async () => {
      const { plan, read } = await run(
        { 'a.ts': 'one\ntwo\n', 'b.ts': 'b\n' },
        { 'a.ts': 'one\r\ntwo\r\nthree\r\n', 'b.ts': 'b\r\n' },
        { 'a.ts': 'zero\none\ntwo\n', 'b.ts': 'b\n' }
      );

      expect(read('a.ts')).to.equal('zero\none\ntwo\nthree\n');
      expect(read('b.ts')).to.equal('b\r\n');
      expect(plan.files.merged).to.have.length(1);
      expect(plan.hasConflicts()).to.be.false;
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

  describe('the Bookstore lab, replayed', () => {
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
      expect(counts(plan)).to.deep.equal({ added: 1, updated: 0, merged: 1, removed: 0, kept: 1, unchanged: 1 });
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
