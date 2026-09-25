import { isJsonObject, JsonObject } from '../../utils/json-utils.js';
import { UrlPath } from '../file/urlPath.js';
import { Language } from '../sdk/generate.js';
import { PublishedPackage, publishedPackage } from './published-package.js';

export interface SdkRelease {
  version: string;
  package: PublishedPackage;
}

/** One SDK language of the portal, with what `apimatic sdk publish` recorded about it. */
export class PortalSdk {
  private constructor(
    public readonly language: Language,
    private readonly repository: UrlPath | null,
    private readonly published: SdkRelease | null
  ) {}

  /**
   * `entry` has passed the document's shape checks, so it and any `publishing` in it are objects.
   * Nothing below that is checked: a field of the wrong shape reads as not recorded.
   */
  public static fromEntry(language: Language, entry: unknown): PortalSdk {
    const publishing = objectAt(entry, 'publishing');
    const repositoryUrl = objectAt(publishing, 'source').repositoryUrl;
    const version = objectAt(publishing, 'package').version;
    const released = typeof version === 'string' && version.trim().length > 0;
    const listed = released ? publishedPackage(language, objectAt(publishing, 'packageConfiguration')) : null;

    return new PortalSdk(
      language,
      typeof repositoryUrl === 'string' ? UrlPath.create(repositoryUrl) ?? null : null,
      released && listed !== null ? { version: version.trim(), package: listed } : null
    );
  }

  public sourceRepository(): UrlPath | null {
    return this.repository;
  }

  /** Null until a release is recorded, or when the configuration does not name the package. */
  public release(): SdkRelease | null {
    return this.published;
  }
}

function objectAt(value: unknown, key: string): JsonObject {
  const found = isJsonObject(value) ? value[key] : undefined;
  return isJsonObject(found) ? found : {};
}
