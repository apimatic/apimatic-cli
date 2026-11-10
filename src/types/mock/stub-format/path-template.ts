import { err, ok, Result } from 'neverthrow';
import { isAsciiDigit, isAsciiLetter } from '../text/characters.js';

type PathSegment =
  | { readonly kind: 'literal'; readonly text: string }
  | { readonly kind: 'parameter'; readonly name: string };

const NO_LEADING_SLASH = "A path must start with '/'.";
const QUERY_OR_FRAGMENT = "A path carries no query string or fragment; put query parameters under 'query'.";
const EMPTY_SEGMENT =
  "A path has no empty segments ('//'); join a base path that ends in '/' to the operation path with one '/', " +
  'as an SDK does.';

/**
 * A request path as a stub states it: literal segments plus `{name}` segments that match any one
 * segment. Success stubs normally use literal paths (the example's identifiers); error stubs use
 * templates, because a declared error looks the same for every identifier.
 */
export class PathTemplate {
  public static readonly root = new PathTemplate([{ kind: 'literal', text: '' }]);

  private readonly segments: readonly PathSegment[];

  private constructor(segments: readonly PathSegment[]) {
    this.segments = segments;
  }

  /**
   * Every fault of a template, so a stub author sees them all in one run. Only the text before a
   * `?` or `#` is checked as segments, and a template without its leading `/` is checked as if it
   * had one, so neither fault hides the others.
   */
  public static problems(template: string): string[] {
    const marks = [template.indexOf('?'), template.indexOf('#')].filter((index) => index >= 0);
    const end = marks.length === 0 ? -1 : Math.min(...marks);
    const path = end < 0 ? template : template.slice(0, end);
    if (!path.startsWith('/')) {
      return [NO_LEADING_SLASH, ...PathTemplate.problems(`/${template}`)];
    }
    return [
      ...(end < 0 ? [] : [QUERY_OR_FRAGMENT]),
      ...(path.includes('//') ? [EMPTY_SEGMENT] : []),
      ...path.split('/').flatMap(segmentProblems)
    ];
  }

  public static parse(template: string): Result<PathTemplate, string[]> {
    const problems = PathTemplate.problems(template);
    return problems.length > 0 ? err(problems) : ok(new PathTemplate(template.split('/').slice(1).map(segmentOf)));
  }

  /** Whole-path and case-sensitive: exactly as many segments, each accepted by its own. */
  public matches(path: string): boolean {
    const [beforeRoot, ...segments] = path.split('/');
    return (
      beforeRoot === '' &&
      segments.length === this.segments.length &&
      this.segments.every((expected, index) =>
        expected.kind === 'literal' ? segments[index] === expected.text : segments[index].length > 0
      )
    );
  }

  public isLiteral(): boolean {
    return this.segments.every((segment) => segment.kind === 'literal');
  }

  public isEqual(other: PathTemplate): boolean {
    return this.toString() === other.toString();
  }

  public toString(): string {
    return this.segments
      .map((segment) => `/${segment.kind === 'literal' ? segment.text : `{${segment.name}}`}`)
      .join('');
  }
}

/** What is wrong with one segment: nothing, or the one fault its shape has. */
function segmentProblems(segment: string): string[] {
  if (segment.startsWith('{') && segment.endsWith('}') && segment.length >= 2) {
    return isParameterName(segment.slice(1, -1))
      ? []
      : [`'${segment}' is not a valid path parameter; use {name} with letters, digits, '_', '-' or '.'.`];
  }
  if (segment.includes('{') || segment.includes('}')) {
    return [`'${segment}' mixes literal text and braces; a parameter must be a whole segment such as {id}.`];
  }
  if (segment === '.' || segment === '..') {
    return [`'${segment}' is a dot segment; a client resolves it before it sends the path, so it could never match.`];
  }
  if (segment.includes('%') || segment.includes('+')) {
    return [
      `'${segment}' is percent-encoded or holds '+'; write the segment decoded ('a b', not 'a%20b'). ` +
        "The stub format has no spelling for a literal '%' or '+' in a path."
    ];
  }
  return [];
}

function segmentOf(segment: string): PathSegment {
  return segment.startsWith('{')
    ? { kind: 'parameter', name: segment.slice(1, -1) }
    : { kind: 'literal', text: segment };
}

function isParameterName(name: string): boolean {
  return (
    name.length > 0 &&
    Array.from(name).every(
      (character) => isAsciiLetter(character) || isAsciiDigit(character) || '_.-'.includes(character)
    )
  );
}
