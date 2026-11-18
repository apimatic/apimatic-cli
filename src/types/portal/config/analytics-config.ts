import { err, ok, Result } from 'neverthrow';
import { isJsonObject } from '../../../utils/json-utils.js';
import { allOf, namespace, nonEmptyString, optional, Parsed, required, unknownKeys } from './fields.js';

/** From a GTM environment's own snippet, so a staging build can still be checked in GTM. */
export interface GoogleTagManagerEnvironment {
  auth: string;
  preview: string;
}

export interface GoogleTagManagerSetting {
  containerId: string;
  environment: GoogleTagManagerEnvironment | null;
}

export interface GoogleAnalyticsSetting {
  measurementId: string;
}

export interface GoogleConsentModeSetting {
  /** What Google's tags take a reader's answer to be until a consent tool gives one. */
  default: 'denied';
}

/** Public values: they sit in every page's scripts. */
export interface PortalAnalytics {
  googleTagManager: GoogleTagManagerSetting | null;
  googleAnalytics: GoogleAnalyticsSetting | null;
  googleConsentMode: GoogleConsentModeSetting | null;
  keepQueryParams: string[];
  /** Off in a build made with `--no-analytics`, whose scripts are handed no event. */
  eventFeed: 'on' | 'off';
}

const KNOWN = ['googleTagManager', 'googleAnalytics', 'googleConsentMode', 'keepQueryParams'];

export class AnalyticsConfig {
  private constructor(
    private readonly googleTagManager: GoogleTagManagerSetting | null,
    private readonly googleAnalytics: GoogleAnalyticsSetting | null,
    private readonly googleConsentMode: GoogleConsentModeSetting | null,
    private readonly keepQueryParams: string[],
    private readonly eventFeed: 'on' | 'off'
  ) {}

  public static readonly defaults = new AnalyticsConfig(null, null, null, [], 'on');

  public static parse(value: unknown, path: string): Parsed<AnalyticsConfig> {
    return namespace(value, path).andThen((data) =>
      allOf(
        unknownKeys(data, KNOWN, path),
        Result.combineWithAllErrors([
          optional(data.googleTagManager, (vendor) => googleTagManager(vendor, `${path}.googleTagManager`)),
          optional(data.googleAnalytics, (vendor) => googleAnalytics(vendor, `${path}.googleAnalytics`)),
          optional(data.googleConsentMode, (mode) => googleConsentMode(mode, `${path}.googleConsentMode`)),
          keptQueryParams(data.keepQueryParams, `${path}.keepQueryParams`)
        ])
      ).map(([gtm, ga, consent, keep]) => new AnalyticsConfig(gtm, ga, consent, keep, 'on'))
    );
  }

  /** `portal generate` and `portal serve` warn when this is true: the customer has a GA4 stream setting to turn off. */
  public usesGoogleAnalytics(): boolean {
    return this.googleAnalytics !== null;
  }

  public identity(): PortalAnalytics {
    return {
      googleTagManager: this.googleTagManager,
      googleAnalytics: this.googleAnalytics,
      googleConsentMode: this.googleConsentMode,
      keepQueryParams: this.keepQueryParams,
      eventFeed: this.eventFeed
    };
  }

  /**
   * For a staging build: no tag and no event for a script; an address keeps the same names. The consent default
   * stays, since a script the build keeps may load a Google tag of its own, which has to start as denied there too.
   */
  public withoutAnalytics(): AnalyticsConfig {
    return new AnalyticsConfig(null, null, this.googleConsentMode, this.keepQueryParams, 'off');
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

function environment(value: unknown, path: string): Parsed<GoogleTagManagerEnvironment> {
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

// An object with one key, so a key added later (a wait, regions) changes no config written today.
function googleConsentMode(value: unknown, path: string): Parsed<GoogleConsentModeSetting> {
  if (!isJsonObject(value)) {
    return err([`'${path}' must be a JSON object with 'default'.`]);
  }
  return allOf(
    unknownKeys(value, ['default'], path),
    Result.combineWithAllErrors([required(value.default, `${path}.default`, denied)])
  ).map(([given]) => ({ default: given }));
}

function denied(value: unknown, path: string): Parsed<'denied'> {
  return value === 'denied' ? ok('denied') : err([`'${path}' must be 'denied'.`]);
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
