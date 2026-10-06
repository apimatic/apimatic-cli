export interface BuildConfigData {
  generateVersionedPortal?: object;
  versionsPath?: string;
}

// Immutable wrapper around the parsed APIMATIC-BUILD.json. Since version 2 the portal is
// configured by `src/apimatic.json` and built locally, so this file only describes SDK and
// plugin generation.
export class BuildConfig {
  private constructor(private readonly data: BuildConfigData) {}

  public static parse(json: string): BuildConfig {
    return new BuildConfig(JSON.parse(json) as BuildConfigData);
  }

  public isVersioned(): boolean {
    return this.data.generateVersionedPortal != null;
  }

  /** Directory holding the versioned builds, relative to the source directory. Defaults to "versioned_docs". */
  public versionsPath(): string {
    return this.data.versionsPath ?? 'versioned_docs';
  }
}
