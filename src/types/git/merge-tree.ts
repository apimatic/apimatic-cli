import { RelativeFilePath } from '../file/relativeFilePath.js';
import { BlobId } from './blob-id.js';
import { TreeId } from './tree-id.js';

/** One line of `diff-tree --raw`: how `path` differs between two trees, and the blob it holds in the second. */
export type Change =
  | { status: 'D'; path: RelativeFilePath }
  | { status: 'A' | 'M' | 'T'; path: RelativeFilePath; blob: BlobId }
  | { status: 'R' | 'C'; path: RelativeFilePath; from: RelativeFilePath; blob: BlobId };

/** Which side each stage of a conflicted path holds, as git numbers them. */
export const STAGE = { base: 1, yours: 2, generated: 3 } as const;

/** One conflicted path's version on one side. */
export type StageEntry = { mode: string; oid: BlobId; stage: 1 | 2 | 3; path: RelativeFilePath };

/** `mode oid stage<TAB>path`, as `ls-files -u` and `merge-tree -z` both print a stage entry; none for what git would never print. */
export function parseStageEntry(entry: string): StageEntry | undefined {
  const tab = entry.indexOf('\t');
  const [mode, sha, stage] = entry.slice(0, tab).split(' ');
  const oid = BlobId.fromGit(sha);
  const path = RelativeFilePath.fromGit(entry.slice(tab + 1));
  return oid === undefined || path === undefined
    ? undefined
    : { mode, oid, stage: Number(stage) as StageEntry['stage'], path };
}

/** One of git's informational messages, such as `CONFLICT (modify/delete)` for a path. */
export type MergeMessage = { paths: RelativeFilePath[]; type: string; message: string };

/** What `git merge-tree --write-tree` reports: the merged tree, the stages of every conflicted path, and its messages. */
export type MergeTreeOutput = { tree: TreeId; stages: StageEntry[]; messages: MergeMessage[] };
