import { TextEncoder } from 'node:util';
import { expect } from 'chai';
import { parseMergeTreeOutput } from '../../../src/application/sdk-merge/merge-tree-output.js';

const TREE = '26ea736f3f455ff2dc2d7465e0c628536e5d5d52';
const BASE = 'de980441c3ab03a8c07dda1ad27b8a11f39deb1e';
const OURS = '7be73ce3c1b1cdaea86e8168dfee8575175953bf';
const THEIRS = '0c02cccd4ca03aab5fcf3996660d5c0f5020a107';

// As git 2.47 printed it for a content conflict in same.txt and a file deleted on one side.
const output = (...fields: string[]) => new TextEncoder().encode(fields.join('\0'));

describe('parseMergeTreeOutput', () => {
  it('reads the tree, the stages of each conflicted path and the messages', () => {
    const parsed = parseMergeTreeOutput(
      output(
        TREE,
        `100644 ${BASE} 1\tsame.txt`,
        `100644 ${OURS} 2\tsame.txt`,
        `100644 ${THEIRS} 3\tsame.txt`,
        `100644 ${BASE} 1\tgone.txt`,
        `100644 ${THEIRS} 3\tgone.txt`,
        '',
        '1',
        'same.txt',
        'Auto-merging',
        'Auto-merging same.txt\n',
        '1',
        'same.txt',
        'CONFLICT (contents)',
        'CONFLICT (content): Merge conflict in same.txt\n',
        '1',
        'gone.txt',
        'CONFLICT (modify/delete)',
        'CONFLICT (modify/delete): gone.txt deleted in x and modified in y.  Version y of gone.txt left in tree.\n',
        ''
      )
    );

    expect(parsed.tree).to.equal(TREE);
    expect(parsed.stages).to.deep.equal([
      { mode: '100644', oid: BASE, stage: 1, path: 'same.txt' },
      { mode: '100644', oid: OURS, stage: 2, path: 'same.txt' },
      { mode: '100644', oid: THEIRS, stage: 3, path: 'same.txt' },
      { mode: '100644', oid: BASE, stage: 1, path: 'gone.txt' },
      { mode: '100644', oid: THEIRS, stage: 3, path: 'gone.txt' }
    ]);
    expect(parsed.messages.map((message) => [message.paths, message.type])).to.deep.equal([
      [['same.txt'], 'Auto-merging'],
      [['same.txt'], 'CONFLICT (contents)'],
      [['gone.txt'], 'CONFLICT (modify/delete)']
    ]);
    expect(parsed.messages[2].message).to.equal(
      'CONFLICT (modify/delete): gone.txt deleted in x and modified in y.  Version y of gone.txt left in tree.'
    );
  });

  it('reads a clean merge as a tree and nothing else', () => {
    const parsed = parseMergeTreeOutput(output(`${TREE}\n`));

    expect(parsed).to.deep.equal({ tree: TREE, stages: [], messages: [] });
  });
});
