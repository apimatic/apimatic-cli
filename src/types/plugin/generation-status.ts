/**
 * Context plugin generation reports its own status vocabulary, which does not match the
 * shared `Status` enum in `@apimatic/sdk`: there is no `SubscriptionError` (entitlement is
 * a 403 on the generate call instead), and the in-flight values below have no equivalent.
 * `Completed` is not sent on the wire — as with portal generation, a finished run is a 302
 * to the download endpoint, which `getGenerationStatus` maps onto it.
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

export interface PluginGenerationStatusResponse {
  status: PluginGenerationStatus;
  errors?: Record<string, string[]>;
}

export interface PluginGenerationInitiatedResponse {
  id: string;
}
