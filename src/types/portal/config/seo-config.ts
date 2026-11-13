import { Result } from 'neverthrow';
import { allOf, namespace, nonEmptyString, optional, Parsed, unknownKeys } from './fields.js';

export interface PortalSeo {
  /** The content value of Google's site verification meta tag, for Search Console. */
  googleSiteVerification: string | null;
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
          optional(data.googleSiteVerification, (given) => nonEmptyString(given, `${path}.googleSiteVerification`))
        ])
      ).map(([googleSiteVerification]) => new SeoConfig(googleSiteVerification))
    );
  }

  public identity(): PortalSeo {
    return { googleSiteVerification: this.googleSiteVerification };
  }
}
