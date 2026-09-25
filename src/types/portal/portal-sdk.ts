import { recordedPublishing } from '../apimatic-config/languages-block.js';
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

  /** The document checked the shapes down to `publishing`; a wrongly shaped field below it reads as not recorded. */
  public static fromEntry(language: Language, entry: unknown): PortalSdk {
    const { repositoryUrl, version, packageConfiguration } = recordedPublishing(entry);
    const releasedVersion = version?.trim() ?? '';
    const listed = releasedVersion.length > 0 ? publishedPackage(language, packageConfiguration) : null;

    return new PortalSdk(
      language,
      repositoryUrl === null ? null : UrlPath.create(repositoryUrl) ?? null,
      listed === null ? null : { version: releasedVersion, package: listed }
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
