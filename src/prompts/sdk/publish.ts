import { log } from '@clack/prompts';
import { Result } from 'neverthrow';
import { ServiceError } from '../../infrastructure/service-error.js';
import { PublishLogItem } from '../../types/publish-api/publish-log.js';
import { PublishingInfo } from '../../types/publish-api/publishing-info.js';
import { PublishType } from '../../types/publish-api/publishing-profile-item.js';
import { SemVersion } from '../../types/publish/version.js';
import { Language } from '../../types/sdk/generate.js';
import { noteWrapped, startCancellableSpinner, withSpinner } from '../prompt.js';
import { format as f } from '../format.js';
import { PublishingProfile } from '../../types/publish/publishing-profile.js';

export type PublishingOutcome = 'succeeded' | 'failed' | 'cancelled';

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

  public publishingRunningNotice(
    profile: PublishingProfile,
    language: Language,
    version: SemVersion,
    publishType: PublishType[]
  ): void {
    const targets = [...publishType]
      .sort((a, b) => (a === PublishType.SourceCodePublishing ? -1 : b === PublishType.SourceCodePublishing ? 1 : 0))
      .map((t) => (t === PublishType.PackagePublishing ? 'Package' : 'Source Code'))
      .join(' + ');
    log.info(
      `Publishing is running for the following:\n\n  Profile:   ${profile}\n  Language:  ${language}\n  Version:   ${version}\n  Targets:   ${targets}`
    );
  }

  public publishingWaitCancelledNotice(): void {
    log.info('Publishing is still running on APIMatic and will continue without the CLI.');
  }

  public postPublishingMessage(publishingLogUrl: string) {
    const message = `To view publishing logs, please visit:
${f.link(publishingLogUrl)}`;
    noteWrapped(message, 'Next Steps');
  }

  public async pollPublishingStatus(
    getSdkPublishingLogFn: () => Promise<Result<PublishLogItem, ServiceError>>
  ): Promise<PublishingOutcome> {
    const TERMINAL_STATES = new Set(['Succeeded', 'Failed', 'Exception', 'InternalError']);
    const POLL_INTERVAL_MS = 10000; // poll after every 10 seconds.

    let cancelled = false;
    let abortWait: (() => void) | undefined;
    const { spin, dispose } = startCancellableSpinner('Waiting for publishing status...', () => {
      cancelled = true;
      // Aborting the pending timer keeps Ctrl+C immediate instead of up to 10 s late.
      abortWait?.();
    });

    try {
      while (!cancelled) {
        const publishingLogResult = await getSdkPublishingLogFn();
        if (cancelled) break;

        if (publishingLogResult.isErr()) {
          spin.stop('Failed to fetch publishing status.', 1);
          return 'failed';
        }

        const { events } = publishingLogResult.value;
        const executionCompleted = events.every((event) => TERMINAL_STATES.has(event.eventType));
        const statusMessage = [...events]
          .sort((a, b) => (a.publishType === 'SourceCode' ? -1 : b.publishType === 'SourceCode' ? 1 : 0))
          .map((event) => {
            const target = event.publishType === 'SourceCode' ? 'Source Code' : 'Package';
            const eventLabels: Record<string, string> = {
              Queued: 'Queued',
              InProgress: 'In Progress',
              Succeeded: 'Published'
            };
            const label = eventLabels[event.eventType] ?? 'Failed';
            return `${target}: [${label}]`;
          })
          .join(' | ');

        if (executionCompleted) {
          const isExecutionSuccessful = events.every((event) => event.eventType === 'Succeeded');
          spin.stop(statusMessage, isExecutionSuccessful ? 0 : 1);
          return isExecutionSuccessful ? 'succeeded' : 'failed';
        }

        spin.message(statusMessage);
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, POLL_INTERVAL_MS);
          abortWait = () => {
            clearTimeout(timer);
            resolve();
          };
        });
        abortWait = undefined;
      }

      // A SIGTERM cancel goes through clack's own handling, which has already printed its
      // cancel line and torn the spinner down.
      if (!spin.isCancelled) {
        spin.stop('Cancelled waiting for publishing status.', 1);
      }
      return 'cancelled';
    } finally {
      dispose();
    }
  }
}
