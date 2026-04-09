import { log } from '@clack/prompts';
import { Result } from 'neverthrow';
import { format as f } from '../../prompts/format.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { ServiceError } from '../../infrastructure/service-error.js';
import { PublishingInfo } from '../../types/publish-api/publishing-info.js';
import { withSpinner } from '../prompt.js';

export class SdkPublishPrompts {
  public directoryCannotBeSame(directory: DirectoryPath) {
    const message = `The ${f.var('src')} and ${f.var('sdk')} directories must be different. Current value: ${f.path(
      directory
    )}`;
    log.error(message);
  }

  public srcDirectoryEmpty(directory: DirectoryPath) {
    const message = `The ${f.var('src')} directory is either empty or invalid: ${f.path(directory)}`;
    log.error(message);
  }

  public publishSdk(fn: Promise<Result<PublishingInfo, ServiceError>>) {
    return withSpinner('Publishing SDK', 'Publishing initiated.', 'SDK Publishing failed.', fn);
  }

  public sdkPublishingServiceError(serviceError: ServiceError) {
    log.error(serviceError.errorMessage);
  }
}
