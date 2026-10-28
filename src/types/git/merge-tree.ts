import { RelativeFilePath } from '../file/relativeFilePath.js';
import { TreeId } from './tree-id.js';

/** One line of `diff-tree --raw`: how `path` differs between two trees, and the blob it holds in the second. */
export type Change =
  | { status: 'D'; path: RelativeFilePath }
  | { status: 'A' | 'M' | 'T'; path: RelativeFilePath; blob: string }
  | { status: 'R' | 'C'; path: RelativeFilePath; from: RelativeFilePath; blob: string };

/** Which side each stage of a conflicted path holds, as git numbers them. */
export const STAGE = { base: 1, yours: 2, generated: 3 } as const;

/** One conflicted path's version on one side. */
export type StageEntry = { mode: string; oid: string; stage: 1 | 2 | 3; path: RelativeFilePath };

/** `mode oid stage<TAB>path`, as `ls-files -u` and `merge-tree -z` both print a stage entry. */
export function parseStageEntry(entry: string): StageEntry {
  const tab = entry.indexOf('\t');
  const [mode, oid, stage] = entry.slice(0, tab).split(' ');
  return { mode, oid, stage: Number(stage) as StageEntry['stage'], path: RelativeFilePath.fromGit(entry.slice(tab + 1)) };
}

/** One of git's informational messages, such as `CONFLICT (modify/delete)` for a path. */
export type MergeMessage = { paths: RelativeFilePath[]; type: string; message: string };

/** What `git merge-tree --write-tree` reports: the merged tree, the stages of every conflicted path, and its messages. */
export type MergeTreeOutput = { tree: TreeId; stages: StageEntry[]; messages: MergeMessage[] };
