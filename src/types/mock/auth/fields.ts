import { Difference, Where } from '../matching/difference.js';
import { RequestModel, valuesOf } from '../matching/request-model.js';
import { checkValue, describeValues } from '../matching/value-check.js';

/**
 * The parameters of an OAuth2 request read by name as no, one or more values: the query of an
 * authorization request, the form of a token request, or the headers of either. Each check yields
 * the one difference a rejection lists, or nothing.
 */
export class Fields {
  private readonly where: Where;
  private readonly lookup: (name: string) => readonly string[];

  private constructor(where: Where, lookup: (name: string) => readonly string[]) {
    this.where = where;
    this.lookup = lookup;
  }

  /**
   * RFC 6749 sections 3.1 and 3.2: "Parameters sent without a value MUST be treated as if they were
   * omitted from the request", so a name sent only empty reads as absent everywhere at once: an
   * empty scope grants every declared scope, and an empty client_secret beside a Basic header is no
   * second credential. Headers are not parameters and keep theirs.
   */
  public static query(request: RequestModel): Fields {
    return new Fields('query', (name) => request.queryValues(name).filter((value) => value.length > 0));
  }

  public static form(request: RequestModel): Fields {
    return new Fields('form', (name) => valuesOf(request.form(), name).filter((value) => value.length > 0));
  }

  public static headers(request: RequestModel): Fields {
    return new Fields('header', (name) => request.header(name));
  }

  public values(name: string): readonly string[] {
    return this.lookup(name);
  }

  /** The value sent exactly once under the name; empty when it is absent or repeated. */
  public text(name: string): string {
    const sent = this.lookup(name);
    return sent.length === 1 ? sent[0] : '';
  }

  /** The value must be exactly this one: a stub rule's own check, in a stub rule's own words. */
  public expect(name: string, expected: string): Difference[] {
    return checkValue(this.where, name, { kind: 'exact', value: expected }, this.lookup(name));
  }

  /** The value, sent once, must satisfy a test no stub rule can spell; the description is the report's expected side. */
  public expectThat(name: string, description: string, accepts: (value: string) => boolean): Difference[] {
    const sent = this.lookup(name);
    return sent.length === 1 && accepts(sent[0]) ? [] : [this.wrong(name, description)];
  }

  public wrong(name: string, expected: string, actual: string = describeValues(this.lookup(name))): Difference {
    return new Difference(this.where, name, expected, actual);
  }
}
