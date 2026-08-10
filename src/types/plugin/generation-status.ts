/**
 * Context plugin generation reports its own status vocabulary, which does not match the
 * shared `Status` enum in `@apimatic/sdk`: there is no `SubscriptionError` (entitlement is
 * a 403 on the generate call instead), completion is a status rather than a redirect, and
 * the three in-flight values below have no equivalent.
 */
export enum PluginGenerationStatus {
  Queued = 'Queued',
  ExecutionStarted = 'ExecutionStarted',
  GeneratingArtifacts = 'GeneratingArtifacts',
  Completed = 'Completed',
  Failed = 'Failed',
  ValidationError = 'ValidationError',
  Unknown = 'Unknown'
}

export enum DeferralReason {
  TargetsV3 = 'TargetsV3',
  NoPluginGenerator = 'NoPluginGenerator'
}

/** A language named in the config that this generator skipped; generation still succeeds. */
export interface DeferredLanguage {
  language: string;
  reason: DeferralReason | string;
}

export interface PluginGenerationStatusResponse {
  status: PluginGenerationStatus;
  errors?: Record<string, string[]>;
  deferred?: DeferredLanguage[];
}

export interface PluginGenerationInitiatedResponse {
  id: string;
}

export interface GeneratedPluginResult {
  plugin: NodeJS.ReadableStream;
  deferred: DeferredLanguage[];
}

const IN_FLIGHT: ReadonlySet<PluginGenerationStatus> = new Set([
  PluginGenerationStatus.Queued,
  PluginGenerationStatus.ExecutionStarted,
  PluginGenerationStatus.GeneratingArtifacts
]);

export function isInFlight(status: PluginGenerationStatus): boolean {
  return IN_FLIGHT.has(status);
}
