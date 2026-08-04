/**
 * An APIMatic async generation endpoint whose progress is tracked by polling
 * `{basePath}/{requestId}/status`.
 *
 * Every instance shares the same request shape and the same terminal-state
 * handling — see `GenerationStatusPoller`. To make a new generation flow
 * pollable, add a `static readonly` instance here; no other code needs to
 * change.
 */
export class GenerationStatusEndpoint {
  public static readonly Portal = new GenerationStatusEndpoint("/portal/v2");
  public static readonly Sdk = new GenerationStatusEndpoint("/sdk");
  public static readonly V4Sdk = new GenerationStatusEndpoint("/sdk/v2");

  private readonly basePath: string;

  private constructor(basePath: string) {
    this.basePath = basePath;
  }

  /** Sole escape hatch — unwrapped when the request path is built. */
  public toString(): string {
    return this.basePath;
  }
}
