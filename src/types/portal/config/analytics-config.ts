import { err, ok, Result } from 'neverthrow';
import { isJsonObject } from '../../../utils/json-utils.js';
import { allOf, namespace, nonEmptyString, optional, Parsed, unknownKeys } from './fields.js';

export interface GoogleTagManagerSetting {
  containerId: string;
  /** From the environment's own snippet, so a staging build can still be checked in GTM. */
  environment: { auth: string; preview: string } | null;
}

/** Public values: they sit in every page's scripts. */
export interface PortalAnalytics {
  googleTagManager: GoogleTagManagerSetting | null;
  googleAnalytics: { measurementId: string } | null;
  keepQueryParams: string[];
}

export interface AnalyticsBlock {
  googleTagManager?: { containerId: string; environment?: { auth: string; preview: string } };
  googleAnalytics?: { measurementId: string };
  keepQueryParams?: string[];
}

const KNOWN = ['googleTagManager', 'googleAnalytics', 'keepQueryParams'];

export class AnalyticsConfig {
  private constructor(
    private readonly googleTagManager: GoogleTagManagerSetting | null,
    private readonly measurementId: string | null,
    private readonly keepQueryParams: string[]
  ) {}

  public static readonly defaults = new AnalyticsConfig(null, null, []);

  public static parse(value: unknown, path: string): Parsed<AnalyticsConfig> {
    return namespace(value, path).andThen((data) =>
      allOf(
        unknownKeys(data, KNOWN, path),
        Result.combineWithAllErrors([
          optional(data.googleTagManager, (vendor) => googleTagManager(vendor, `${path}.googleTagManager`)),
          optional(data.googleAnalytics, (vendor) => googleAnalytics(vendor, `${path}.googleAnalytics`)),
          keptQueryParams(data.keepQueryParams, `${path}.keepQueryParams`)
        ])
      ).map(([gtm, measurementId, keep]) => new AnalyticsConfig(gtm, measurementId, keep))
    );
  }

  /** `portal generate` warns when this is true: the customer has a GA4 stream setting to turn off. */
  public usesGoogleAnalytics(): boolean {
    return this.measurementId !== null;
  }

  public identity(enableAnalytics: boolean): PortalAnalytics {
    return {
      googleTagManager: enableAnalytics ? this.googleTagManager : null,
      googleAnalytics: enableAnalytics && this.measurementId !== null ? { measurementId: this.measurementId } : null,
      keepQueryParams: this.keepQueryParams
    };
  }

  /** Null with nothing set, so the block quickstart writes has no `analytics`. */
  public toJSON(): AnalyticsBlock | null {
    const gtm = this.googleTagManager;
    const block: AnalyticsBlock = {
      ...(gtm === null
        ? {}
        : {
            googleTagManager: {
              containerId: gtm.containerId,
              ...(gtm.environment === null ? {} : { environment: gtm.environment })
            }
          }),
      ...(this.measurementId === null ? {} : { googleAnalytics: { measurementId: this.measurementId } }),
      ...(this.keepQueryParams.length === 0 ? {} : { keepQueryParams: this.keepQueryParams })
    };
    return Object.keys(block).length === 0 ? null : block;
  }
}

function googleTagManager(value: unknown, path: string): Parsed<GoogleTagManagerSetting> {
  if (!isJsonObject(value)) {
    return err([`'${path}' must be a JSON object with 'containerId'.`]);
  }
  return allOf(
    unknownKeys(value, ['containerId', 'environment'], path),
    Result.combineWithAllErrors([
      required(value.containerId, `${path}.containerId`),
      optional(value.environment, (given) => environment(given, `${path}.environment`))
    ])
  ).map(([containerId, environment]) => ({ containerId, environment }));
}

function environment(value: unknown, path: string): Parsed<{ auth: string; preview: string }> {
  if (!isJsonObject(value)) {
    return err([`'${path}' must be a JSON object with 'auth' and 'preview'.`]);
  }
  return allOf(
    unknownKeys(value, ['auth', 'preview'], path),
    Result.combineWithAllErrors([required(value.auth, `${path}.auth`), required(value.preview, `${path}.preview`)])
  ).map(([auth, preview]) => ({ auth, preview }));
}

function googleAnalytics(value: unknown, path: string): Parsed<string> {
  if (!isJsonObject(value)) {
    return err([`'${path}' must be a JSON object with 'measurementId'.`]);
  }
  return allOf(
    unknownKeys(value, ['measurementId'], path),
    Result.combineWithAllErrors([required(value.measurementId, `${path}.measurementId`)])
  ).map(([measurementId]) => measurementId);
}

/** Present and a non-empty string; its format is the vendor's to check, since a wrong value fails there, not here. */
function required(given: unknown, path: string): Parsed<string> {
  return given === undefined ? err([`'${path}' is required.`]) : nonEmptyString(given, path);
}

/** Names a reported address keeps, beyond the campaign names it always keeps. */
function keptQueryParams(value: unknown, path: string): Parsed<string[]> {
  if (value === undefined) {
    return ok([]);
  }
  if (!Array.isArray(value)) {
    return err([`'${path}' must be a list of query parameter names.`]);
  }
  return Result.combineWithAllErrors(value.map((name, index) => nonEmptyString(name, `${path}[${index}]`))).mapErr(
    (errors) => errors.flat()
  );
}
