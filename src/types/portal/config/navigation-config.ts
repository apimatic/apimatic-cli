import { err, ok, Result } from 'neverthrow';
import { allOf, namespace, oneOf, Parsed, unknownKeys } from './fields.js';
import { Link } from './link.js';

export const LAYOUTS = ['docs', 'notebook', 'notebook-navbar', 'glass'] as const;

export type Layout = (typeof LAYOUTS)[number];

const KNOWN = ['layout', 'links'];

export class NavigationConfig {
  private constructor(private readonly layout: Layout, private readonly links: Link[]) {}

  public static readonly defaults = new NavigationConfig('notebook-navbar', []);

  public static parse(value: unknown, path: string): Parsed<NavigationConfig> {
    return namespace(value, path).andThen((data) =>
      allOf(
        unknownKeys(data, KNOWN, path),
        Result.combineWithAllErrors([
          oneOf(data.layout, `${path}.layout`, LAYOUTS, NavigationConfig.defaults.layout),
          NavigationConfig.parseLinks(data.links, `${path}.links`)
        ])
      ).map(([layout, links]) => new NavigationConfig(layout, links))
    );
  }

  public layoutName(): Layout {
    return this.layout;
  }

  public headerLinks(): Link[] {
    return [...this.links];
  }

  public toJSON(): { layout: Layout; links: ReturnType<Link['toJSON']>[] } {
    return { layout: this.layout, links: this.links.map((link) => link.toJSON()) };
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
