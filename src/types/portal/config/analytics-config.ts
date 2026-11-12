import { err, ok, Result } from 'neverthrow';
import { isJsonObject } from '../../../utils/json-utils.js';
import { allOf, namespace, optional, Parsed, unknownKeys } from './fields.js';

export interface GoogleTagManagerSetting {
  containerId: string;
  /** From the environment's own snippet, so a staging build can still be checked in GTM. */
  environment: { auth: string; preview: string } | null;
}

/** Public values: they sit in every page's scripts. */
export interface PortalAnalytics {
  googleTagManager: GoogleTagManagerSetting | null;
  /** `debugMode` is set by the CLI under `portal serve`. */
  googleAnalytics: { measurementId: string; debugMode: boolean } | null;
  keepQueryParams: string[];
}

export interface AnalyticsBlock {
  googleTagManager?: { containerId: string; environment?: { auth: string; preview: string } };
  googleAnalytics?: { measurementId: string };
  keepQueryParams?: string[];
}

const KNOWN = ['googleTagManager', 'googleAnalytics', 'keepQueryParams'];

/** Names the OAuth standard puts in an answer: never kept, whatever the customer lists. */
const OAUTH_ANSWER = new Set([
  'code',
  'state',
  'access_token',
  'id_token',
  'token_type',
  'expires_in',
  'error',
  'session_state',
  'iss'
]);

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

  public identity(): PortalAnalytics {
    return {
      googleTagManager: this.googleTagManager,
      googleAnalytics: this.measurementId === null ? null : { measurementId: this.measurementId, debugMode: false },
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
      required(value.containerId, `${path}.containerId`, /^\s*GTM-[A-Z0-9]+\s*$/, "must look like 'GTM-ABC123'"),
      optional(value.environment, (given) => environment(given, `${path}.environment`))
    ])
  ).map(([containerId, environment]) => ({ containerId: containerId.trim(), environment }));
}

function environment(value: unknown, path: string): Parsed<{ auth: string; preview: string }> {
  if (!isJsonObject(value)) {
    return err([`'${path}' must be a JSON object with 'auth' and 'preview'.`]);
  }
  return allOf(
    unknownKeys(value, ['auth', 'preview'], path),
    Result.combineWithAllErrors([
      required(
        value.auth,
        `${path}.auth`,
        /^[A-Za-z0-9_-]+$/,
        "must be the gtm_auth value from the environment's snippet, with no spaces"
      ),
      required(value.preview, `${path}.preview`, /^env-\d+$/, "must look like 'env-3'")
    ])
  ).map(([auth, preview]) => ({ auth, preview }));
}

function googleAnalytics(value: unknown, path: string): Parsed<string> {
  if (!isJsonObject(value)) {
    return err([`'${path}' must be a JSON object with 'measurementId'.`]);
  }
  return allOf(
    unknownKeys(value, ['measurementId'], path),
    Result.combineWithAllErrors([
      required(value.measurementId, `${path}.measurementId`, /^\s*G-[A-Z0-9]+\s*$/, "must look like 'G-ABC123'")
    ])
  ).map(([measurementId]) => measurementId.trim());
}

/** A value pasted from the vendor's console: present, and shaped as the vendor writes it. */
function required(given: unknown, path: string, shape: RegExp, otherwise: string): Parsed<string> {
  if (given === undefined) {
    return err([`'${path}' is required.`]);
  }
  return typeof given === 'string' && shape.test(given) ? ok(given) : err([`'${path}' ${otherwise}.`]);
}

/** Names a reported address keeps; an OAuth answer's names are refused, whatever the customer lists. */
function keptQueryParams(value: unknown, path: string): Parsed<string[]> {
  if (value === undefined) {
    return ok([]);
  }
  if (!Array.isArray(value)) {
    return err([`'${path}' must be a list of query parameter names.`]);
  }
  return Result.combineWithAllErrors(
    value.map((name, index): Parsed<string> => {
      if (typeof name !== 'string' || !/^[A-Za-z0-9_.-]+$/.test(name)) {
        return err([`'${path}[${index}]' must be a query parameter name, for example 'campaign_id'.`]);
      }
      return OAUTH_ANSWER.has(name)
        ? err([`'${path}[${index}]' must not be '${name}': the portal never reports an OAuth answer.`])
        : ok(name);
    })
  ).mapErr((errors) => errors.flat());
}
