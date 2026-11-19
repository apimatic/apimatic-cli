import { FilePath } from '../file/filePath.js';
import { HtmlPiece } from './page.js';

// Renaming the page keeps all of it, so a few pieces say enough.
const SHOWN = 3;
// Enough to find a piece by, where its line can run to a whole paragraph.
const SHOWN_LENGTH = 60;

/** The HTML a `.md` page holds, which the build leaves out: a `.md` page is Markdown without HTML or components. */
export class LeftOutHtml {
  constructor(public readonly page: FilePath, private readonly pieces: HtmlPiece[]) {}

  public shown(): HtmlPiece[] {
    return this.distinct()
      .slice(0, SHOWN)
      .map(({ line, text }) => ({
        line,
        text: text.length > SHOWN_LENGTH ? `${text.slice(0, SHOWN_LENGTH - 1)}…` : text
      }));
  }

  public unshown(): number {
    return Math.max(this.distinct().length - SHOWN, 0);
  }

  // By what is written, not where, or every edit above a piece would give the notice again.
  public addsNothingTo(earlier: LeftOutHtml): boolean {
    return (
      this.page.isEqual(earlier.page) &&
      this.pieces.every(({ text }) => earlier.pieces.some((piece) => piece.text === text))
    );
  }

  private distinct(): HtmlPiece[] {
    return this.pieces.filter((piece, index) => this.pieces.findIndex(({ text }) => text === piece.text) === index);
  }
}
