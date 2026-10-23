import { RelativeFilePath } from '../file/relativeFilePath.js';
import { TreeId } from './tree-id.js';

/** One line of `diff-tree --raw`: how `path` differs between two trees, and the blob it holds in the second. */
export type Change = {
  status: 'A' | 'M' | 'D' | 'T' | 'R' | 'C';
  path: RelativeFilePath;
  /** The path in the first tree, for a rename or copy. */
  from?: RelativeFilePath;
  /** The blob in the second tree; absent for a deletion. */
  blob?: string;
};

/** One conflicted path's version on one side: stage 1 is the base, 2 ours, 3 theirs. */
export type StageEntry = { mode: string; oid: string; stage: 1 | 2 | 3; path: RelativeFilePath };

/** One of git's informational messages, such as `CONFLICT (modify/delete)` for a path. */
export type MergeMessage = { paths: RelativeFilePath[]; type: string; message: string };

/** What `git merge-tree --write-tree` reports: the merged tree, the stages of every conflicted path, and its messages. */
export type MergeTreeOutput = { tree: TreeId; stages: StageEntry[]; messages: MergeMessage[] };
