import { err, ok, Result } from 'neverthrow';
import { isJsonObject } from '../../../utils/json-utils.js';
import { UrlPath } from '../../file/urlPath.js';
import { allOf, httpsAddress, oneOf, Parsed, required, unknownKeys } from './fields.js';
import { StaticAsset } from './static-asset.js';

const KNOWN = ['src', 'category'];

export const SCRIPT_CATEGORIES = ['necessary', 'functional', 'analytics', 'marketing'] as const;

const ADDRESS_EXAMPLE = 'https://cdn.example.com/widget.js';

const FILE_EXAMPLE = 'static/analytics.js';

export interface PortalScript {
  /** An https address, or the portal-relative path of a file in the static directory. */
  src: string;
}

/** A script of the customer's own, which the portal loads on every page. */
export class Script {
  private constructor(
    private readonly source: UrlPath | StaticAsset,
    private readonly category: (typeof SCRIPT_CATEGORIES)[number]
  ) {}

  public static parseList(value: unknown, path: string): Parsed<Script[]> {
    if (value === undefined) {
      return ok([]);
    }
    if (!Array.isArray(value)) {
      return err([`'${path}' must be a list of scripts.`]);
    }
    return Result.combineWithAllErrors(value.map((script, index) => Script.parse(script, `${path}[${index}]`))).mapErr(
      (errors) => errors.flat()
    );
  }

  /** The file it names in the static directory; none for an address. */
  public staticFiles(): StaticAsset[] {
    return this.source instanceof StaticAsset ? [this.source] : [];
  }

  /** Whether a portal built with `--no-analytics` still loads it. */
  public loadsWithoutAnalytics(): boolean {
    return this.category === 'necessary' || this.category === 'functional';
  }

  public identity(): PortalScript {
    return { src: this.source instanceof StaticAsset ? this.source.portalPath() : this.source.toString() };
  }

  private static parse(value: unknown, path: string): Parsed<Script> {
    if (!isJsonObject(value)) {
      return err([`'${path}' must be a JSON object with 'src' and 'category'.`]);
    }
    return allOf(
      unknownKeys(value, KNOWN, path),
      Result.combineWithAllErrors([
        required(value.src, `${path}.src`, Script.parseSource),
        // Never assumed: `--no-analytics` drops a script by its category, and a guess would drop one nobody meant to.
        required(value.category, `${path}.category`, (category, at) => oneOf(category, at, SCRIPT_CATEGORIES))
      ])
    ).map(([source, category]) => new Script(source, category));
  }

  // An address by its scheme, so an http one is told to be https rather than taken for a file.
  private static parseSource(value: unknown, path: string): Parsed<UrlPath | StaticAsset> {
    if (typeof value === 'string' && /^https?:/i.test(value.trim())) {
      return httpsAddress(value, path, ADDRESS_EXAMPLE);
    }
    return StaticAsset.parse(value, path).mapErr(() => [
      `'${path}' must be an address starting with 'https://', or a path relative to 'src' inside the 'static' directory, for example '${FILE_EXAMPLE}'.`
    ]);
  }
}
