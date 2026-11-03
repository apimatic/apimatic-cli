import { expect } from 'chai';
import { GENERATED_MARKER, MergedText, Side, YOURS_MARKER } from '../../../src/types/sdk/conflict-markers.js';
import { bytes, markedByGit, SIDES, text } from '../../helpers/merge.js';

const OURS = 'a'.repeat(40);
const THEIRS = 'b'.repeat(40);

const relabelled = (content: string) => text(MergedText.parse(bytes(content)).relabelled());
const settled = (content: string, side: Side) => text(MergedText.parse(bytes(content)).settledFor(side));
/** A block as the CLI labels it. */
const block = (yours: string[], generated: string[]) =>
  [YOURS_MARKER, ...yours, '=======', ...generated, GENERATED_MARKER].join('\n');

describe('MergedText.relabelled', () => {
  it('names the sides where git named its commits, and changes nothing else', () => {
    expect(relabelled(`a\n${markedByGit('B', 'X')}c\n`)).to.equal(
      `a\n${YOURS_MARKER}\nB\n=======\nX\n${GENERATED_MARKER}\nc\n`
    );
  });

  it('returns the same bytes when there is nothing to relabel', () => {
    const content = bytes('<<<<<<< not a sha\nplain\n');

    const parsed = MergedText.parse(content);

    expect(parsed.hasMarkers()).to.be.false;
    expect(parsed.relabelled()).to.equal(content);
  });

  it('reads the labels git writes after a rename, which name the path too, and on CRLF lines', () => {
    expect(
      relabelled(`<<<<<<< ${OURS}:old/path.ts\r\nB\r\n=======\r\nX\r\n>>>>>>> ${THEIRS}:new/path.ts\r\n`)
    ).to.equal(`${YOURS_MARKER}\r\nB\r\n=======\r\nX\r\n${GENERATED_MARKER}\r\n`);
  });

  it('keeps every byte of a file that is not UTF-8, relabelling only the marker lines', () => {
    expect(relabelled(`caf\xe9\n${markedByGit('\xff\xfe', 'X')}`)).to.equal(
      `caf\xe9\n${YOURS_MARKER}\n\xff\xfe\n=======\nX\n${GENERATED_MARKER}\n`
    );
  });

  it('keeps a ======= line outside a block as a line of the file, such as a Markdown heading underline', () => {
    const content = `Title\n=======\n<<<<<<< ${OURS}\nmine\n=======\ntheirs\n=======\n>>>>>>> ${THEIRS}\n`;

    expect(relabelled(content)).to.equal(
      `Title\n=======\n${YOURS_MARKER}\nmine\n=======\ntheirs\n=======\n${GENERATED_MARKER}\n`
    );
    expect(settled(content, 'generated')).to.equal('Title\n=======\ntheirs\n=======\n');
    expect(settled(content, 'yours')).to.equal('Title\n=======\nmine\n');
  });
});

describe('MergedText.settledFor', () => {
  const content = [
    'before',
    block(['mine 1'], ['theirs 1']),
    'between',
    block(['mine 2a', 'mine 2b'], ['theirs 2']),
    'after',
    ''
  ].join('\n');

  it('keeps the side asked for in every block, and every line outside the blocks', () => {
    expect(settled(content, 'generated')).to.equal('before\ntheirs 1\nbetween\ntheirs 2\nafter\n');
    expect(settled(content, 'yours')).to.equal('before\nmine 1\nbetween\nmine 2a\nmine 2b\nafter\n');
  });

  it('reads the labels git writes as well as the CLI’s, so a file settles before or after it is relabelled', () => {
    expect(settled(markedByGit('mine', 'theirs'), 'generated')).to.equal('theirs\n');
  });

  it('reads markers on CRLF lines, keeping the line endings', () => {
    expect(
      settled(`a\r\n${YOURS_MARKER}\r\nmine\r\n=======\r\ntheirs\r\n${GENERATED_MARKER}\r\nb\r\n`, 'yours')
    ).to.equal('a\r\nmine\r\nb\r\n');
  });

  it('settles the markers in a file that is not UTF-8, keeping its other bytes', () => {
    expect(settled(`caf\xe9\n${block(['\xff'], ['\xfe'])}\n`, 'generated')).to.equal('caf\xe9\n\xfe\n');
  });

  it('gives a file without markers back as it is, for either side, whatever its line endings', () => {
    for (const plain of ['no markers\n', 'a\r\nb\r\n', 'a\rb\r', '']) {
      const content = bytes(plain);
      const parsed = MergedText.parse(content);

      expect(parsed.hasMarkers(), JSON.stringify(plain)).to.be.false;
      for (const side of SIDES) {
        expect(parsed.settledFor(side), `${JSON.stringify(plain)} for ${side}`).to.equal(content);
      }
    }
  });

  it('leaves a file whole when a marker line was removed by hand, or a block is opened inside another, for either side', () => {
    const noMiddle = `${YOURS_MARKER}\nmine\ntheirs\n${GENERATED_MARKER}\n`;
    const noEnd = `${YOURS_MARKER}\nmine\n=======\ntheirs\n`;
    const noStart = `mine\n=======\ntheirs\n${GENERATED_MARKER}\n`;
    const openedTwice = `${YOURS_MARKER}\nmine\n${YOURS_MARKER}\nmore\n=======\ntheirs\n${GENERATED_MARKER}\n`;

    for (const damaged of [noMiddle, noEnd, noStart, openedTwice]) {
      const content = bytes(damaged);
      const parsed = MergedText.parse(content);

      expect(parsed.hasMarkers(), damaged).to.be.false;
      expect(parsed.relabelled(), damaged).to.equal(content);
      for (const side of SIDES) {
        expect(parsed.settledFor(side), `${damaged} for ${side}`).to.equal(content);
      }
    }
  });
});
