import { log } from '@clack/prompts';
import { Result } from 'neverthrow';
import { ServiceError } from '../../infrastructure/service-error.js';
import { PublishingInfo } from '../../types/publish-api/publishing-info.js';
import { PublishType } from '../../types/publish-api/publishing-profile-item.js';
import { SemVersion } from '../../types/publish/version.js';
import { Language } from '../../types/sdk/generate.js';
import { withSpinner } from '../prompt.js';
import { PublishingProfile } from '../../types/publish/publishing-profile.js';

export class SdkPublishPrompts {
  public publishSdk(fn: Promise<Result<PublishingInfo, ServiceError>>) {
    return withSpinner('Publishing SDK', 'Publishing initiated.', 'SDK Publishing failed.', fn);
  }

  public sdkPublishingServiceError(serviceError: ServiceError) {
    log.error(serviceError.errorMessage);
  }

  public dryRunNotice(publishingProfile: PublishingProfile, language: Language, version: SemVersion, publishType: PublishType[]): void {
    const targets = publishType.map((t) => (t === PublishType.PackagePublishing ? 'Package' : 'Source Code')).join(' + ');
    log.info(
      `You can publish this SDK by removing the --dry-run flag. It will be published for the following:\n\n  Profile:   ${publishingProfile}\n  Language:  ${language}\n  Version:   ${version}\n  Targets:   ${targets}`
    );
  }
}
