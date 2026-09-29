import { withoutTrailingSlashes } from '../../../utils/string-utils.js';

/**
 * The path a portal is mounted under: empty at the root of its host, otherwise leading-slashed
 * with no trailing slash, so prefixing it onto a site-relative address never doubles a slash.
 */
export class BasePath {
  private constructor(private readonly path: string) {}

  public static readonly root = new BasePath('');

  /** From the pathname of an already-parsed address, which is where the trailing slash comes from. */
  public static of(pathname: string): BasePath {
    const trimmed = withoutTrailingSlashes(pathname);
    return trimmed.length === 0 ? BasePath.root : new BasePath(trimmed);
  }

  public isRoot(): boolean {
    return this.path.length === 0;
  }

  public isEqual(other: BasePath): boolean {
    return this.path === other.path;
  }

  public toString(): string {
    return this.path;
  }
}
