import { TextDecoder } from 'node:util';

/** One conflicted path's version on one side: stage 1 is the base, 2 yours, 3 the generator's. */
export type StageEntry = { mode: string; oid: string; stage: 1 | 2 | 3; path: string };

/** One of git's informational messages, such as `CONFLICT (modify/delete)` for a path. */
export type MergeMessage = { paths: string[]; type: string; message: string };

export type MergeTreeOutput = { tree: string; stages: StageEntry[]; messages: MergeMessage[] };

/**
 * Reads what `git merge-tree --write-tree -z` prints: the merged tree's id, then one entry per
 * stage of every conflicted path, then, after an empty entry, the messages git would have shown
 * during a merge, each as a count, that many paths, a type and the text.
 */
export function parseMergeTreeOutput(output: Uint8Array): MergeTreeOutput {
  const fields = new TextDecoder().decode(output).split('\0');
  const tree = fields[0].trim();
  const stages: StageEntry[] = [];
  let index = 1;
  for (; index < fields.length && fields[index] !== ''; index += 1) {
    const [meta, path] = fields[index].split('\t');
    const [mode, oid, stage] = meta.split(' ');
    stages.push({ mode, oid, stage: Number(stage) as StageEntry['stage'], path });
  }
  const messages: MergeMessage[] = [];
  for (index += 1; index < fields.length && fields[index] !== ''; ) {
    const count = Number(fields[index]);
    const paths = fields.slice(index + 1, index + 1 + count);
    const type = fields[index + 1 + count];
    const message = fields[index + 2 + count];
    messages.push({ paths, type, message: message.trim() });
    index += 3 + count;
  }
  return { tree, stages, messages };
}
