/**
 * The statuses `/portal-artifacts` reports. Modelled in full, for the reason the plugin's own
 * vocabulary is: a status this CLI does not name is indistinguishable from one it does, and the
 * polling loop decides whether to wait, stop or fail on exactly this value.
 *
 * Two differences from `PluginGenerationStatus`, both worth knowing when reading the poll:
 *
 * - `SubscriptionError` is reported here. A run refused for the endpoint itself is a 403 on the
 *   initiate call, but a run refused for *what it asked for* — a language or a context plugin the
 *   subscription does not carry — is decided inside the orchestrator and comes back as a status.
 * - `Completed` is sent on the wire. The plugin's status endpoint redirects to the download when a
 *   run finishes; this one answers 200 with the status, so nothing has to read a 302 as success.
 */
export enum PortalArtifactsGenerationStatus {
  Queued = 'Queued',
  ExecutionStarted = 'ExecutionStarted',
  GeneratingArtifacts = 'GeneratingArtifacts',
  Completed = 'Completed',
  Failed = 'Failed',
  ValidationError = 'ValidationError',
  SubscriptionError = 'SubscriptionError',
  Unknown = 'Unknown'
}

export interface PortalArtifactsStatusResponse {
  status: PortalArtifactsGenerationStatus;
  errors?: Record<string, string[]>;
}

export interface PortalArtifactsInitiatedResponse {
  id: string;
}
