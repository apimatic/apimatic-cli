const BLANK_LINE = /\n[ \t]*\n/;

const LEADING_BLANK_LINES = /^(?:[ \t]*\n)+/;

// Every other block opens with a marker, after at most three spaces: a heading, quote, list,
// table, HTML or fence. Four spaces or a tab open indented code.
const OPENS_ANOTHER_BLOCK = /^(?: {4}|\t| {0,3}(?:#|>|[-*+][ \t]|\d+[.)][ \t]|\||<|```|~~~))/;

// A paragraph underlined this way is a heading.
const SETEXT_UNDERLINE = /^[ \t]*(?:=+|-+)[ \t]*$/m;

/**
 * The only specification's `info.description`, which the SDKs page shows around its cards: its
 * first paragraph above them, as the page's introduction, and the rest below.
 */
export class SpecDescription {
  private constructor(private readonly markdown: string) {}

  public static create(text: unknown): SpecDescription | null {
    if (typeof text !== 'string') {
      return null;
    }
    // Only blank lines are dropped from the start: the first line's indentation says what block it opens.
    const markdown = text.replace(/\r\n?/g, '\n').replace(LEADING_BLANK_LINES, '').trimEnd();
    return markdown.length > 0 ? new SpecDescription(markdown) : null;
  }

  /** The first block, when it is a plain paragraph; null when the description opens with anything else. */
  public lead(): string | null {
    const [first] = this.markdown.split(BLANK_LINE);
    return OPENS_ANOTHER_BLOCK.test(first) || SETEXT_UNDERLINE.test(first) ? null : first.trim();
  }

  /** Everything after the lead, or the whole description when it has none. */
  public rest(): string {
    if (this.lead() === null) {
      return this.markdown;
    }
    const blank = BLANK_LINE.exec(this.markdown);
    return blank === null ? '' : this.markdown.slice(blank.index + blank[0].length).trim();
  }
}
