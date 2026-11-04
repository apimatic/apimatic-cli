import { Buffer } from 'node:buffer';
import { execa } from 'execa';
import { GitService } from '../../src/infrastructure/git-service.js';
import { DirectoryPath } from '../../src/types/file/directoryPath.js';
import { RelativeFilePath } from '../../src/types/file/relativeFilePath.js';
import { BlobId } from '../../src/types/git/blob-id.js';
import { StageEntry } from '../../src/types/git/merge-tree.js';
import { Side } from '../../src/types/sdk/conflict-markers.js';
import { Conflict, FileWrite, MergeFiles } from '../../src/types/sdk/conflict.js';

export const SIDES: readonly Side[] = ['yours', 'generated'];

export const NO_FILES: MergeFiles = { added: [], updated: [], merged: [], removed: [], kept: [] };

export const rel = (value: string): RelativeFilePath => RelativeFilePath.fromGit(value)!;

/** Text as bytes and back through latin1, one byte per character, so a fixture can hold any byte. */
export const bytes = (text: string): Uint8Array => new Uint8Array(Buffer.from(text, 'latin1'));
export const text = (content: Uint8Array): string => Buffer.from(content).toString('latin1');

/** A blob id that spells a short `name`, for a fixture whose blobs are never read. */
export const blob = (name: string): BlobId => BlobId.fromGit(Buffer.from(name).toString('hex').padEnd(40, '0'))!;

/** A stage entry for `path`, holding a blob of its own. */
export const stage = (path: string, at: StageEntry['stage']): StageEntry => ({
  mode: '100644',
  oid: blob(`${path}${at}`),
  stage: at,
  path: rel(path)
});

/** A file as git marks it when you and the generator changed the same lines, labelled with its two commits. */
export const markedByGit = (yours: string, generated: string): string =>
  `<<<<<<< ${'a'.repeat(40)}\n${yours}\n=======\n${generated}\n>>>>>>> ${'b'.repeat(40)}\n`;

/** The summary's paths as strings, by kind. */
export const named = (files: MergeFiles): Record<string, string[]> =>
  Object.fromEntries(Object.entries(files).map(([kind, paths]) => [kind, paths.map(String)]));

/** How many paths the summary holds, by kind. */
export const counts = (files: MergeFiles): Record<string, number> =>
  Object.fromEntries(Object.entries(files).map(([kind, paths]) => [kind, paths.length]));

/** Each conflict as `[path, kind]`. */
export const kinds = (conflicts: readonly Conflict[]): [string, string][] =>
  conflicts.map((conflict) => [String(conflict.path), conflict.kind]);

/** Each write as `[path, content]`, the content as text. */
export const written = (writes: readonly FileWrite[]): [string, string][] =>
  writes.map((write) => [String(write.path), text(write.content)]);

/** The id of `contents` written into the repository at `root` as a blob. */
export const blobOf = async (root: DirectoryPath, contents: string): Promise<BlobId> => {
  const { stdout } = await execa('git', ['hash-object', '-w', '--stdin'], { cwd: root.toString(), input: contents });
  return BlobId.fromGit(stdout.trim())!;
};

/**
 * Leaves `path` unmerged in the repository's own index, as a merge would: a base, and each side given
 * (`null` for a side that has no file), so a test can put any pair of versions in git's hands.
 */
export async function leftUnmerged(
  root: DirectoryPath,
  path: string,
  { yours = 'yours', generated = 'generated' }: { yours?: string | null; generated?: string | null } = {}
): Promise<void> {
  const versions: readonly (readonly [StageEntry['stage'], string | null])[] = [
    [1, 'base'],
    [2, yours],
    [3, generated]
  ];
  const present = versions.flatMap(([at, contents]) => (contents === null ? [] : [[at, contents] as const]));
  const entries = await Promise.all(
    present.map(
      async ([at, contents]): Promise<StageEntry> => ({
        mode: '100644',
        oid: await blobOf(root, contents),
        stage: at,
        path: rel(path)
      })
    )
  );
  (await new GitService().stageConflicts(root, entries))._unsafeUnwrap();
}
