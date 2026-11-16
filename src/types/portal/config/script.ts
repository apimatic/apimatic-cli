import { err, ok, Result } from 'neverthrow';
import { isJsonObject } from '../../../utils/json-utils.js';
import { UrlPath } from '../../file/urlPath.js';
import { allOf, httpsAddress, Parsed, required, unknownKeys } from './fields.js';
import { StaticAsset } from './static-asset.js';

const KNOWN = ['src'];

const ADDRESS_EXAMPLE = 'https://cdn.example.com/widget.js';

const FILE_EXAMPLE = 'static/analytics.js';

export interface PortalScript {
  /** An https address, or the portal-relative path of a file in the static directory. */
  src: string;
}

/** A script of the customer's own, which the portal loads on every page. */
export class Script {
  private constructor(private readonly source: UrlPath | StaticAsset) {}

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

  /** The file it names in the static directory, or null for an address. */
  public staticFile(): StaticAsset | null {
    return this.source instanceof StaticAsset ? this.source : null;
  }

  public identity(): PortalScript {
    return { src: this.source instanceof StaticAsset ? this.source.portalPath() : this.source.toString() };
  }

  private static parse(value: unknown, path: string): Parsed<Script> {
    if (!isJsonObject(value)) {
      return err([`'${path}' must be a JSON object with 'src'.`]);
    }
    return allOf(
      unknownKeys(value, KNOWN, path),
      Result.combineWithAllErrors([required(value.src, `${path}.src`, Script.parseSource)])
    ).map(([source]) => new Script(source));
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
