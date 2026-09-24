import { err, ok, Result } from 'neverthrow';
import { allOf, namespace, Parsed, unknownKeys } from './fields.js';
import { Link } from './link.js';

const KNOWN = ['links'];

export class NavigationConfig {
  private constructor(private readonly links: Link[]) {}

  public static readonly defaults = new NavigationConfig([]);

  public static parse(value: unknown, path: string): Parsed<NavigationConfig> {
    return namespace(value, path).andThen((data) =>
      allOf(
        unknownKeys(data, KNOWN, path),
        Result.combineWithAllErrors([NavigationConfig.parseLinks(data.links, `${path}.links`)])
      ).map(([links]) => new NavigationConfig(links))
    );
  }

  public headerLinks(): Link[] {
    return [...this.links];
  }

  public toJSON(): { links: ReturnType<Link['toJSON']>[] } {
    return { links: this.links.map((link) => link.toJSON()) };
  }

  private static parseLinks(value: unknown, path: string): Parsed<Link[]> {
    if (value === undefined) {
      return ok([]);
    }
    if (!Array.isArray(value)) {
      return err([`'${path}' must be a list of links.`]);
    }
    return Result.combineWithAllErrors(value.map((link, index) => Link.parse(link, `${path}[${index}]`))).mapErr(
      (errors) => errors.flat()
    );
  }
}
