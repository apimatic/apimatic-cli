import { log, spinner } from '@clack/prompts';
import { Result } from 'neverthrow';
import { ServiceError } from '../../infrastructure/service-error.js';
import { PublishLogItem } from '../../types/publish-api/publish-log.js';
import { PublishingInfo } from '../../types/publish-api/publishing-info.js';
import { PublishType } from '../../types/publish-api/publishing-profile-item.js';
import { SemVersion } from '../../types/publish/version.js';
import { CodeGenerationVersion, CodegenOption, Language } from '../../types/sdk/generate.js';
import { noteWrapped, withSpinner } from '../prompt.js';
import { format as f } from '../format.js';
import { PublishingProfile } from '../../types/publish/publishing-profile.js';

export type PublishingOutcome = 'succeeded' | 'failed' | 'cancelled';

export class SdkPublishPrompts {
  public warnIfStabilityIgnored(codegenOption: CodegenOption, stabilityWasProvided: boolean) {
    if (!stabilityWasProvided || codegenOption.isV4()) {
      return;
    }

    const message =
      `${f.flag('stability')} has no effect with ${f.flag('codegen-version', CodeGenerationVersion.V3)}. ` +
      `The V3 code generator always produces a stable SDK.`;
    log.warn(message);
  }

  public publishSdk(fn: Promise<Result<PublishingInfo, ServiceError>>) {
    return withSpinner('Publishing SDK', 'Publishing initiated.', 'SDK Publishing failed.', fn);
  }

  public sdkPublishingServiceError(serviceError: ServiceError) {
    log.error(serviceError.errorMessage);
  }

  public dryRunNotice(publishingSummary: string): void {
    log.info(
      `You can publish this SDK by removing the --dry-run flag. It will be published for the following:` +
        publishingSummary
    );
  }

  public publishingRunningNotice(publishingSummary: string): void {
    log.info(`Publishing is running for the following:` + publishingSummary);
  }

  public publishingLogsMessage(publishingLogUrl: string) {
    const message = `To track progress and view publishing logs, please visit:
${f.link(publishingLogUrl)}`;
    noteWrapped(message, 'Publishing Logs');
  }

  public async pollPublishingStatus(
    getSdkPublishingLogFn: () => Promise<Result<PublishLogItem, ServiceError>>
  ): Promise<PublishingOutcome> {
    const TERMINAL_STATES = new Set(['Succeeded', 'Failed', 'Exception', 'InternalError']);
    const POLL_INTERVAL_MS = 10000; // poll after every 10 seconds.

    let abortWait: (() => void) | undefined;
    const spin = spinner({
      onCancel: () => {
        abortWait?.();
      },
      cancelMessage: 'Publishing is still running on APIMatic and will continue without the CLI.'
    });

    spin.start('Waiting for publishing status...');

    while (!spin.isCancelled) {
      const publishingLogResult = await getSdkPublishingLogFn();

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

    return 'cancelled';
  }
}

export interface PublishingDetails {
  profile: PublishingProfile;
  language: Language;
  version: SemVersion;
  publishType: PublishType[];
  codegenOption?: CodegenOption;
}

export function formatPublishingDetails({
  profile,
  language,
  version,
  publishType,
  codegenOption
}: PublishingDetails): string {
  const targets = [...publishType]
    .map((t) => (t === PublishType.PackagePublishing ? "Package" : "Source Code"))
    .join(" + ");

  const generator = codegenOption ? `\n  Generator: ${codegenOption}` : "";
  return `\n\n  Profile:   ${profile}\n  Language:  ${language}\n  Version:   ${version}\n  Targets:   ${targets}${generator}`;
}
