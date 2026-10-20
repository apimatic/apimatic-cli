import fs from 'fs';
import os from 'os';
import path from 'path';
import { Buffer } from 'node:buffer';
import { expect } from 'chai';
import { MergePlan } from '../../src/application/sdk-merge/merge-plan.js';
import { GitService } from '../../src/infrastructure/git-service.js';
import { MergeService } from '../../src/infrastructure/merge-service.js';
import { PristineStoreService } from '../../src/infrastructure/pristine-store-service.js';
import { DirectoryPath } from '../../src/types/file/directoryPath.js';
import { CodeGenerationVersion, Language, Stability } from '../../src/types/sdk/generate.js';
import { SdkGeneration } from '../../src/types/sdk/generation-record.js';

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
  read: (relative: string) => string | undefined;
  bytes: (relative: string) => Buffer;
  exists: (relative: string) => boolean;
  paths: () => string[];
};

describe('MergeService', () => {
  let root: string;
  let counter = 0;
  const git = new GitService();
  const store = new PristineStoreService();
  const service = new MergeService();

  const write = (directory: DirectoryPath, files: Files) => {
    for (const [relative, contents] of Object.entries(files)) {
      const target = path.join(directory.toString(), relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, contents);
    }
  };

  const run = async (base: Files, disk: Files, generated: Files): Promise<Run> => {
    const project = new DirectoryPath(path.join(root, `project-${counter++}`));
    const sdk = project.join('sdk', 'typescript');
    fs.mkdirSync(sdk.toString(), { recursive: true });
    await git.init(project);
    const repository = (await store.findRepository(sdk))!;
    const baseDirectory = new DirectoryPath(path.join(root, `base-${counter}`));
    const generatedDirectory = new DirectoryPath(path.join(root, `generated-${counter}`));
    fs.mkdirSync(baseDirectory.toString());
    fs.mkdirSync(generatedDirectory.toString());
    write(baseDirectory, base);
    write(sdk, disk);
    write(generatedDirectory, generated);
    const baseCommit = (
      await store.recordPristine(
        repository,
        (await store.snapshotGenerated(repository, baseDirectory))._unsafeUnwrap(),
        TYPESCRIPT
      )
    )._unsafeUnwrap();
    const diskTree = (await store.snapshotDisk(repository, baseCommit))._unsafeUnwrap();
    const generatedTree = (await store.snapshotGenerated(repository, generatedDirectory))._unsafeUnwrap();

    const { plan } = (await service.merge(repository, baseCommit, diskTree, generatedTree))._unsafeUnwrap();
    (await service.apply(repository, plan))._unsafeUnwrap();

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
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-service-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('files the base holds', () => {
    it('writes the new version of a file you never edited', async () => {
      const { plan, read } = await run({ 'a.ts': 'v1\n' }, { 'a.ts': 'v1\n' }, { 'a.ts': 'v2\n' });

      expect(read('a.ts')).to.equal('v2\n');
      expect(plan.counts.updated).to.equal(1);
      expect(plan.hasConflicts()).to.be.false;
    });

    it('keeps your edit when the generator left the file alone', async () => {
      const { plan, read } = await run({ 'a.ts': 'v1\n' }, { 'a.ts': 'v1 edited\n' }, { 'a.ts': 'v1\n' });

      expect(read('a.ts')).to.equal('v1 edited\n');
      expect(plan.writes).to.be.empty;
      expect(plan.counts.kept).to.equal(1);
    });

    it('does nothing when neither side changed, or when you already made the generator’s change', async () => {
      const same = await run({ 'a.ts': 'v1\n' }, { 'a.ts': 'v1\n' }, { 'a.ts': 'v1\n' });
      const ahead = await run({ 'a.ts': 'v1\n' }, { 'a.ts': 'v2\n' }, { 'a.ts': 'v2\n' });

      expect(same.plan.writes).to.be.empty;
      expect(same.plan.counts.unchanged).to.equal(1);
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
      expect(plan.counts.merged).to.equal(1);
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
      expect(plan.conflicts).to.deep.equal([{ path: 'book.ts', kind: 'bothChanged' }]);
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
      expect(plan.conflicts).to.deep.equal([{ path: 'a.ts', kind: 'deletedByYou' }]);
    });

    it('removes a file the generator stopped producing when you never edited it', async () => {
      const { plan, exists } = await run(
        { 'authors.ts': 'v1\n', 'b.ts': 'b\n' },
        { 'authors.ts': 'v1\n', 'b.ts': 'b\n' },
        { 'b.ts': 'b\n' }
      );

      expect(exists('authors.ts')).to.be.false;
      expect(plan.deletes).to.deep.equal(['authors.ts']);
      expect(plan.counts.removed).to.equal(1);
    });

    it('keeps a file the generator stopped producing when you edited it, as a conflict', async () => {
      const { plan, read } = await run(
        { 'authors.ts': 'v1\n', 'b.ts': 'b\n' },
        { 'authors.ts': 'v1 + getMany\n', 'b.ts': 'b\n' },
        { 'b.ts': 'b\n' }
      );

      expect(read('authors.ts')).to.equal('v1 + getMany\n');
      expect(plan.conflicts).to.deep.equal([{ path: 'authors.ts', kind: 'noLongerGenerated' }]);
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
      expect(plan.counts.added).to.equal(1);
      expect(plan.writes.map((write) => write.path)).to.deep.equal(['delete-book.ts']);
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
      expect(differ.plan.conflicts).to.deep.equal([{ path: 'retry.ts', kind: 'bothAdded' }]);
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
      expect(plan.renames).to.deep.equal([{ from: 'models/book.ts', to: 'models/catalog/book.ts', by: 'you' }]);
      expect(plan.hasConflicts()).to.be.false;
    });

    it('carries your edit to a file the generator renamed, and removes the old name', async () => {
      const { plan, read, exists } = await run(
        { 'models/book.ts': MODEL_V1, 'b.ts': 'b\n' },
        { 'models/book.ts': MODEL_V1_WITH_HELPER, 'b.ts': 'b\n' },
        { 'models/book-model.ts': MODEL_V2, 'b.ts': 'b\n' }
      );

      expect(read('models/book-model.ts')).to.equal(MODEL_V2 + HELPER);
      expect(exists('models/book.ts')).to.be.false;
      expect(plan.renames).to.deep.equal([{ from: 'models/book.ts', to: 'models/book-model.ts', by: 'generator' }]);
      expect(plan.hasConflicts()).to.be.false;
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
      expect(plan.counts.merged).to.equal(1);
      expect(plan.hasConflicts()).to.be.false;
    });

    it('replaces an unedited binary and keeps an edited one, as a conflict when the generator changed it too', async () => {
      const changed = Buffer.concat([BINARY, Buffer.from([1])]);
      const edited = Buffer.concat([BINARY, Buffer.from([2])]);

      const replaced = await run({ 'logo.png': BINARY }, { 'logo.png': BINARY }, { 'logo.png': changed });
      const both = await run({ 'logo.png': BINARY }, { 'logo.png': edited }, { 'logo.png': changed });

      expect(replaced.bytes('logo.png')).to.deep.equal(changed);
      expect(replaced.plan.counts.updated).to.equal(1);
      expect(both.bytes('logo.png')).to.deep.equal(edited);
      expect(both.plan.conflicts).to.deep.equal([{ path: 'logo.png', kind: 'binary' }]);
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
      expect(plan.conflicts).to.deep.equal([{ path: 'docs/models/book.md', kind: 'deletedByYou' }]);
      expect(plan.counts).to.deep.equal({ added: 1, updated: 0, merged: 1, removed: 0, kept: 0, unchanged: 1 });
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
      expect(plan.conflicts).to.deep.equal([{ path: 'src/sdk/authors.ts', kind: 'noLongerGenerated' }]);
      expect(plan.counts.updated).to.equal(2);
    });
  });
});
