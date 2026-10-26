import { FilePath } from '../file/filePath.js';
import { CodeSampleCatalogs } from './code-samples.js';

/**
 * What one `/portal-artifacts` run delivered, unpacked and read but not yet placed. The samples
 * and the SDK docs are in memory because the build merges or includes them; the SDKs and the
 * plugin are still files, because placing them is copying them.
 *
 * The paths point inside the directory the caller handed to `generate`, so they live exactly as
 * long as that directory does.
 */
export class PortalArtifacts {
  public constructor(
    public readonly codeSampleCatalogs: CodeSampleCatalogs,
    /** Keyed by the language name the server delivered, which is what it is placed under. */
    public readonly sdks: ReadonlyMap<string, FilePath>,
    /** Each language's getting-started Markdown, keyed as `sdks` is. */
    public readonly sdkDocs: ReadonlyMap<string, string>,
    public readonly plugin: FilePath | undefined
  ) {}

  /** A run that was never made: a portal declaring no languages and no plugin has nothing to ask for. */
  public static none(): PortalArtifacts {
    return new PortalArtifacts(new CodeSampleCatalogs([]), new Map(), new Map(), undefined);
  }
}
