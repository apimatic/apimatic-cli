import { err, ok, Result } from 'neverthrow';
import { isJsonObject } from '../../../utils/json-utils.js';
import { allOf, namespace, nonEmptyString, optional, Parsed, required, unknownKeys } from './fields.js';

export interface GoogleTagManagerSetting {
  containerId: string;
  /** From the environment's own snippet, so a staging build can still be checked in GTM. */
  environment: { auth: string; preview: string } | null;
}

export interface GoogleAnalyticsSetting {
  measurementId: string;
}

/** Public values: they sit in every page's scripts. */
export interface PortalAnalytics {
  googleTagManager: GoogleTagManagerSetting | null;
  googleAnalytics: GoogleAnalyticsSetting | null;
  keepQueryParams: string[];
}

export interface AnalyticsBlock {
  googleTagManager?: { containerId: string; environment?: { auth: string; preview: string } };
  googleAnalytics?: GoogleAnalyticsSetting;
  keepQueryParams?: string[];
}

const KNOWN = ['googleTagManager', 'googleAnalytics', 'keepQueryParams'];

export class AnalyticsConfig {
  private constructor(
    private readonly googleTagManager: GoogleTagManagerSetting | null,
    private readonly googleAnalytics: GoogleAnalyticsSetting | null,
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
      ).map(([gtm, ga, keep]) => new AnalyticsConfig(gtm, ga, keep))
    );
  }

  /** `portal generate` warns when this is true: the customer has a GA4 stream setting to turn off. */
  public usesGoogleAnalytics(): boolean {
    return this.googleAnalytics !== null;
  }

  public identity(): PortalAnalytics {
    return {
      googleTagManager: this.googleTagManager,
      googleAnalytics: this.googleAnalytics,
      keepQueryParams: this.keepQueryParams
    };
  }

  /** For a staging build: neither vendor tag loads, while a reported address still keeps the same names. */
  public withoutVendors(): AnalyticsConfig {
    return new AnalyticsConfig(null, null, this.keepQueryParams);
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
      ...(this.googleAnalytics === null ? {} : { googleAnalytics: this.googleAnalytics }),
      ...(this.keepQueryParams.length === 0 ? {} : { keepQueryParams: this.keepQueryParams })
    };
    return Object.keys(block).length === 0 ? null : block;
  }
}

// Each ID is required and nothing more: its format is the vendor's to check, since a wrong value fails there, not here.
function googleTagManager(value: unknown, path: string): Parsed<GoogleTagManagerSetting> {
  if (!isJsonObject(value)) {
    return err([`'${path}' must be a JSON object with 'containerId'.`]);
  }
  return allOf(
    unknownKeys(value, ['containerId', 'environment'], path),
    Result.combineWithAllErrors([
      required(value.containerId, `${path}.containerId`, nonEmptyString),
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
    Result.combineWithAllErrors([
      required(value.auth, `${path}.auth`, nonEmptyString),
      required(value.preview, `${path}.preview`, nonEmptyString)
    ])
  ).map(([auth, preview]) => ({ auth, preview }));
}

function googleAnalytics(value: unknown, path: string): Parsed<GoogleAnalyticsSetting> {
  if (!isJsonObject(value)) {
    return err([`'${path}' must be a JSON object with 'measurementId'.`]);
  }
  return allOf(
    unknownKeys(value, ['measurementId'], path),
    Result.combineWithAllErrors([required(value.measurementId, `${path}.measurementId`, nonEmptyString)])
  ).map(([measurementId]) => ({ measurementId }));
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
