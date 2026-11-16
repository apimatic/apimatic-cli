import { err, ok, Result } from 'neverthrow';
import { isJsonObject } from '../../../utils/json-utils.js';
import { UrlPath } from '../../file/urlPath.js';
import { allOf, httpsAddress, Parsed, required, unknownKeys } from './fields.js';

const KNOWN = ['src'];

const EXAMPLE = 'https://cdn.example.com/widget.js';

export interface PortalScript {
  src: string;
}

/** A script of the customer's own, which the portal loads on every page. */
export class Script {
  private constructor(private readonly address: UrlPath) {}

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

  public identity(): PortalScript {
    return { src: this.address.toString() };
  }

  private static parse(value: unknown, path: string): Parsed<Script> {
    if (!isJsonObject(value)) {
      return err([`'${path}' must be a JSON object with 'src'.`]);
    }
    return allOf(
      unknownKeys(value, KNOWN, path),
      Result.combineWithAllErrors([
        required(value.src, `${path}.src`, (src, srcPath) => httpsAddress(src, srcPath, EXAMPLE))
      ])
    ).map(([address]) => new Script(address));
  }
}
