import { err, ok, Result } from 'neverthrow';
import { FileName } from '../file/fileName.js';

const DOUBLE_BRACES = /\{\{[\s\S]*?\}\}/g;
const PLACEHOLDER = /^\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}$/;

/**
 * One of the pages in `portal-pages/`, whose `{{key}}` placeholders are filled before MDX sees
 * the text. Every double brace is judged: anything but a plain key is refused rather than
 * written through, because MDX would read it as an expression and the page would fail to build,
 * or render the braces as text, far from the template that caused it.
 */
export class PageTemplate {
  constructor(private readonly fileName: FileName, private readonly text: string) {}

  public render(data: Readonly<Record<string, string>>): Result<string, string> {
    let problem: string | undefined;
    const rendered = this.text.replace(DOUBLE_BRACES, (braces) => {
      const key = PLACEHOLDER.exec(braces)?.[1];
      if (key === undefined) {
        // JSX writes an object inside an expression as `{{ ... }}`, which is the likeliest way
        // to meet this, and a space between the braces keeps it out of the placeholders.
        problem ??=
          `${this.fileName}: '${braces}' is not a placeholder. A placeholder is {{key}}; ` +
          `write a JSX object as '{ { ... } }'.`;
      } else if (!Object.hasOwn(data, key)) {
        problem ??= `${this.fileName}: '${braces}' names a value the page is not given.`;
      } else {
        return data[key];
      }
      return braces;
    });
    return problem === undefined ? ok(rendered) : err(problem);
  }
}
