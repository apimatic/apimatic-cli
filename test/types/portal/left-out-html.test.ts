import { expect } from 'chai';
import { DirectoryPath } from '../../../src/types/file/directoryPath';
import { FileName } from '../../../src/types/file/fileName';
import { FilePath } from '../../../src/types/file/filePath';
import { LeftOutHtml } from '../../../src/types/portal/left-out-html';

describe('LeftOutHtml', () => {
  const content = new DirectoryPath('src', 'content');
  const index = new FilePath(content, new FileName('index.md'));
  const intro = new FilePath(content.join('guides'), new FileName('intro.md'));
  const piece = (line: number, text: string) => ({ line, text });

  it('shows each piece once, where the page first has it, up to three, and counts the rest', () => {
    const html = new LeftOutHtml(index, [
      piece(5, '<br>'),
      piece(9, '<br>'),
      piece(12, '<details>'),
      piece(20, '<span>'),
      piece(24, '<br>'),
      piece(30, '<kbd>'),
      piece(33, '<i>')
    ]);

    expect(html.shown()).to.deep.equal([piece(5, '<br>'), piece(12, '<details>'), piece(20, '<span>')]);
    expect(html.unshown()).to.equal(2);
  });

  it('cuts a long piece short', () => {
    const html = new LeftOutHtml(index, [piece(5, `<p align="center">${'word '.repeat(20)}</p>`), piece(9, '<br>')]);

    expect(html.shown()).to.deep.equal([piece(5, `<p align="center">${'word '.repeat(8)}w…`), piece(9, '<br>')]);
  });

  it('leaves nothing unshown on a page with three pieces or fewer', () => {
    expect(new LeftOutHtml(index, [piece(5, '<br>'), piece(9, '<br>')]).unshown()).to.equal(0);
  });

  it('adds nothing to the same page holding the same pieces, wherever they now are', () => {
    const before = new LeftOutHtml(index, [piece(5, '<br>'), piece(9, '<details>')]);

    expect(new LeftOutHtml(index, [piece(7, '<br>'), piece(12, '<br>')]).addsNothingTo(before)).to.be.true;
    expect(new LeftOutHtml(index, [piece(7, '<br>'), piece(14, '<kbd>')]).addsNothingTo(before)).to.be.false;
    expect(new LeftOutHtml(intro, [piece(5, '<br>')]).addsNothingTo(before)).to.be.false;
  });
});
