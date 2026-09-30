import { err, ok } from 'neverthrow';
import { isWebAddress, Parsed } from './fields.js';

/** One spelling of the path everywhere: Vite's base, the router's prefix, the host's folder and canonical links. */
const SEGMENT = /^[A-Za-z0-9._~-]+$/;

/** Where the portal is hosted: an origin, and the path it is served under there. */
export class SiteAddress {
  private constructor(
    private readonly origin: string,
    /** `''` at the root of the host, otherwise `/docs` or deeper, with no trailing slash. */
    private readonly basePath: string
  ) {}

  public static parse(value: unknown, path: string): Parsed<SiteAddress> {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!isWebAddress(text)) {
      return err([
        `'${path}' must be the address the portal is hosted at, for example 'https://docs.example.com' or 'https://example.com/docs'.`
      ]);
    }
    // Checked as written: the URL parser reads `\` as `/` and drops an empty query or fragment.
    const character = ['?', '#', '\\'].find((candidate) => text.includes(candidate));
    if (character !== undefined) {
      return err([
        `'${path}' cannot contain '${character}'. Give the address the portal is hosted at, for example 'https://example.com/docs'.`
      ]);
    }
    const pathStart = text.indexOf('/', text.indexOf('//') + 2);
    const basePath = pathStart === -1 ? '' : text.slice(pathStart).replace(/\/$/, '');
    const segments = basePath.split('/').slice(1);
    if (segments.includes('')) {
      return err([`'${path}' has an empty part ('//') in its path.`]);
    }
    const invalid = segments.find((segment) => !SEGMENT.test(segment) || segment === '.' || segment === '..');
    if (invalid !== undefined) {
      return err([
        `'${path}' has '${invalid}' in its path. Each part between '/'s can use only letters, digits, '.', '_', '~' and '-', and cannot be '.' or '..'.`
      ]);
    }
    return ok(new SiteAddress(new URL(text).origin, basePath));
  }

  /** Where the portal is served, in the form Vite's `base` takes: `/`, or `/docs/`. */
  public path(): string {
    return `${this.basePath}/`;
  }

  public hasPath(): boolean {
    return this.basePath !== '';
  }

  /** A portal-relative path's address on the host: `/sitemap.xml` is `https://example.com/docs/sitemap.xml`. */
  public addressOf(portalPath: string): string {
    return `${this}${portalPath}`;
  }

  /** The site address, with no trailing slash. */
  public toString(): string {
    return `${this.origin}${this.basePath}`;
  }
}
