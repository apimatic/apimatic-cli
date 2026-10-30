import { RelativeFilePath } from '../file/relativeFilePath.js';
import { BlobId } from './blob-id.js';
import { TreeId } from './tree-id.js';

/** One line of `diff-tree --raw`: how `path` differs between two trees, and the blob it holds in the second. */
export type Change =
  | { status: 'D'; path: RelativeFilePath }
  | { status: 'A' | 'M' | 'T'; path: RelativeFilePath; blob: BlobId }
  | { status: 'R' | 'C'; path: RelativeFilePath; from: RelativeFilePath; blob: BlobId };

/** The stage each side of a conflicted path is kept at, as git numbers them. */
export const STAGE = { base: 1, ours: 2, theirs: 3 } as const;

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

/** What a merge message reports: a conflict of one of the shapes the CLI knows, another shape, or no conflict at all. */
export type MergeMessageKind =
  | 'contents'
  | 'addAdd'
  | 'modifyDelete'
  | 'renameDelete'
  | 'binary'
  | 'otherConflict'
  | 'informational';

/** One of git's messages about the merge, such as `CONFLICT (modify/delete)` for a path. */
export type MergeMessage = { paths: RelativeFilePath[]; kind: MergeMessageKind; message: string };

/** What `git merge-tree --write-tree` reports: the merged tree, the stages of every conflicted path, and its messages. */
export type MergeTreeOutput = { tree: TreeId; stages: StageEntry[]; messages: MergeMessage[] };

const CONFLICT_PREFIX = 'CONFLICT (';

const CONFLICT_KINDS: Readonly<Record<string, MergeMessageKind>> = {
  'CONFLICT (contents)': 'contents',
  'CONFLICT (binary)': 'binary',
  'CONFLICT (modify/delete)': 'modifyDelete',
  'CONFLICT (rename/delete)': 'renameDelete'
};

// Git files an add/add conflict under `contents`; only the message says so.
function messageKind(type: string, message: string): MergeMessageKind {
  if (message.startsWith('CONFLICT (add/add)')) {
    return 'addAdd';
  }
  if (!type.startsWith(CONFLICT_PREFIX)) {
    return 'informational';
  }
  return CONFLICT_KINDS[type] ?? 'otherConflict';
}

/**
 * The NUL-separated fields of `merge-tree --write-tree -z`: the tree, a stage entry per conflicted
 * path, a blank, then each message as a count, that many paths, its type and its text; none where a field cannot be read.
 */
export function parseMergeTree(fields: readonly string[]): MergeTreeOutput | undefined {
  const tree = TreeId.fromGit(fields[0].trim());
  if (tree === undefined) {
    return undefined;
  }
  const stagesEnd = fields.indexOf('', 1);
  const stages: StageEntry[] = [];
  for (const field of fields.slice(1, stagesEnd === -1 ? undefined : stagesEnd)) {
    const entry = parseStageEntry(field);
    if (entry === undefined) {
      return undefined;
    }
    stages.push(entry);
  }
  const messages: MergeMessage[] = [];
  for (let index = stagesEnd === -1 ? fields.length : stagesEnd + 1; index < fields.length && fields[index] !== ''; ) {
    const count = Number(fields[index]);
    const paths: RelativeFilePath[] = [];
    for (const field of fields.slice(index + 1, index + 1 + count)) {
      const path = RelativeFilePath.fromGit(field);
      if (path === undefined) {
        return undefined;
      }
      paths.push(path);
    }
    const type = fields[index + 1 + count];
    const message = fields[index + 2 + count].trim();
    messages.push({ paths, kind: messageKind(type, message), message });
    index += 3 + count;
  }
  return { tree, stages, messages };
}
