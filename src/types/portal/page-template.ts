import Mustache from 'mustache';
import { err, ok, Result } from 'neverthrow';
import { errorMessage } from '../../utils/error-utils.js';
import { FileName } from '../file/fileName.js';

export type PageRecord = Readonly<Record<string, string>>;

/** A page's values: strings for its placeholders, and lists of records for its sections. */
export type PageValues = Readonly<Record<string, string | readonly PageRecord[]>>;

const KEY = /^[A-Za-z][A-Za-z0-9_]*$/;

/** The tags a page may use besides comments: placeholders, sections and inverted sections. */
const TAG_TYPES = ['name', '#', '^'];

// The values are MDX source, which reads its own braces and tags, so nothing is escaped.
const RENDER_OPTIONS = { escape: (value: unknown) => String(value) };

/** Refuses a tag MDX would misread; inside a section, tags are checked per item, so an empty list checks none. */
export class PageTemplate {
  constructor(private readonly fileName: FileName, private readonly text: string) {}

  public render(values: PageValues): Result<string, string> {
    let tokens: Mustache.TemplateSpans;
    try {
      tokens = Mustache.parse(this.text);
    } catch (error) {
      return err(`${this.fileName}: ${errorMessage(error)}`);
    }
    const problem = this.problemIn(tokens, [values]);
    return problem === undefined ? ok(Mustache.render(this.text, values, {}, RENDER_OPTIONS)) : err(problem);
  }

  /** `scopes` runs from the page's own values to the innermost section's item, as mustache looks names up. */
  private problemIn(tokens: Mustache.TemplateSpans, scopes: readonly PageValues[]): string | undefined {
    for (const token of tokens) {
      const problem = this.problemWith(token, scopes);
      if (problem !== undefined) {
        return problem;
      }
    }
    return undefined;
  }

  private problemWith(token: Mustache.TemplateSpans[number], scopes: readonly PageValues[]): string | undefined {
    const [type, key, start, end] = token;
    if (type === 'text' || type === '!') {
      return undefined;
    }
    const tag = this.text.slice(start, end);
    if (!TAG_TYPES.includes(type) || !KEY.test(key)) {
      // Most likely a JSX object, `{{ ... }}`, which a space between the braces keeps out of the tags.
      return (
        `${this.fileName}: '${tag}' is not a placeholder. A placeholder is {{key}} and a section ` +
        `{{#key}}...{{/key}}; write a JSX object as '{ { ... } }'.`
      );
    }
    const value = [...scopes].reverse().find((scope) => Object.hasOwn(scope, key))?.[key];
    if (value === undefined) {
      return `${this.fileName}: '${tag}' names a value the page is not given.`;
    }
    if (type === 'name') {
      return typeof value === 'string'
        ? undefined
        : `${this.fileName}: '${tag}' names a list, which is written as a section, {{#${key}}}...{{/${key}}}.`;
    }
    // A section over a list is read once per item; any other section in the scopes it stands in.
    const inner = token[4] as Mustache.TemplateSpans;
    const itemScopes = type === '#' && typeof value !== 'string' ? value.map((item) => [...scopes, item]) : [scopes];
    return itemScopes.map((itemScope) => this.problemIn(inner, itemScope)).find((problem) => problem !== undefined);
  }
}
