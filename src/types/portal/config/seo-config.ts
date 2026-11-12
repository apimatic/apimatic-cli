import { err, ok, Result } from 'neverthrow';
import { allOf, namespace, optional, Parsed, unknownKeys } from './fields.js';

export interface PortalSeo {
  /** The content value of Google's site verification meta tag, for Search Console. */
  googleSiteVerification: string | null;
}

export interface SeoBlock {
  googleSiteVerification: string;
}

const KNOWN = ['googleSiteVerification'];

export class SeoConfig {
  private constructor(private readonly googleSiteVerification: string | null) {}

  public static readonly defaults = new SeoConfig(null);

  public static parse(value: unknown, path: string): Parsed<SeoConfig> {
    return namespace(value, path).andThen((data) =>
      allOf(
        unknownKeys(data, KNOWN, path),
        Result.combineWithAllErrors([
          optional(
            data.googleSiteVerification,
            (given): Parsed<string> =>
              typeof given === 'string' && /^[A-Za-z0-9_-]+$/.test(given)
                ? ok(given)
                : err([
                    `'${path}.googleSiteVerification' must be the content value of Google's verification meta tag, with no spaces.`
                  ])
          )
        ])
      ).map(([googleSiteVerification]) => new SeoConfig(googleSiteVerification))
    );
  }

  public identity(): PortalSeo {
    return { googleSiteVerification: this.googleSiteVerification };
  }

  /** Null with nothing set, so the block quickstart writes has no `seo`. */
  public toJSON(): SeoBlock | null {
    return this.googleSiteVerification === null ? null : { googleSiteVerification: this.googleSiteVerification };
  }
}
