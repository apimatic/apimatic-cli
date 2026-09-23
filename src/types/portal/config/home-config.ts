import { Result } from 'neverthrow';
import { allOf, namespace, optional, Parsed, unknownKeys } from './fields.js';
import { Link } from './link.js';

const KNOWN = ['cta'];

/** `portal.home`: what the home page offers beyond its own content. */
export class HomeConfig {
  private constructor(private readonly cta: Link | null) {}

  public static readonly defaults = new HomeConfig(null);

  public static parse(value: unknown, path: string): Parsed<HomeConfig> {
    return namespace(value, path).andThen((data) =>
      allOf(
        unknownKeys(data, KNOWN, path),
        Result.combineWithAllErrors([optional(data.cta, (cta) => Link.parse(cta, `${path}.cta`))])
      ).map(([cta]) => new HomeConfig(cta))
    );
  }

  /** The button under the home page's title, or null when there is none. */
  public callToAction(): Link | null {
    return this.cta;
  }

  public toJSON(): { cta?: ReturnType<Link['toJSON']> } {
    return this.cta === null ? {} : { cta: this.cta.toJSON() };
  }
}
