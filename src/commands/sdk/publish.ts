import { Command, Flags } from '@oclif/core';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FlagsProvider } from '../../types/flags-provider.js';
import { PublishAction } from '../../actions/sdk/publish.js';
import { Language } from '../../types/sdk/generate.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { format, intro, outro } from '../../prompts/format.js';
import { PublishType } from '../../types/sdk/publish.js';
import { TelemetryService } from '../../infrastructure/services/telemetry-service.js';
import { SdkPublishValidationFailedEvent } from '../../types/events/sdk-publish-validation-failed.js';

export default class SdkPublish extends Command {
  static readonly summary = 'Generate and publish an SDK to a package registry or source repository';

  static readonly description = `Generate and publish an SDK using your API spec and a publishing profile. Requires an input directory containing the API specification. Supports interactive mode for guided publishing and non-interactive mode for CI/CD automation.`;

  static readonly cmdTxt = format.cmd('apimatic', 'sdk', 'publish');

  static flags = {
    'profile-id': Flags.string({
      char: 'p',
      description: 'Id of the publishing profile to use.'
    }),
    version: Flags.string({
      char: 'v',
      description: 'Semantic version of the SDK to be generated and published.'
    }),
    ...FlagsProvider.destination('sdk', 'sdk'),
    language: Flags.string({
      char: 'l',
      description: 'Language to generate and publish the SDK for.',
      options: Object.values(Language).filter((l) => l !== Language.GO).map((l) => l.valueOf())
    }),
    ...FlagsProvider.force,
    ...FlagsProvider.input,
    'publish-type': Flags.string({
      description:
        "Publishing target: 'package' for a package registry, 'sourcecode' for a git repository, or 'both' for both publishing options.",
      options: Object.values(PublishType).map((t) => t.valueOf())
    }),
    'dry-run': Flags.boolean({
      default: false,
      description:
        'Generate the SDK without publishing. Useful for reviewing generated SDK before publishing. Not applicable to interactive mode.'
    })
  };

  static examples = [
    `${SdkPublish.cmdTxt}`,
    `${SdkPublish.cmdTxt} ${format.flag('profile-id', 'prof-123')} ${format.flag('language', 'typescript')} ${format.flag(
      'version',
      '1.0.0'
    )} ${format.flag('publish-type', PublishType.Both)}`,
    `${SdkPublish.cmdTxt} ${format.flag('profile-id', 'prof-123')} ${format.flag('language', 'java')} ${format.flag(
      'version',
      '2.0.0'
    )} ${format.flag('publish-type', PublishType.SourceCodePublishing)}`,
    `${SdkPublish.cmdTxt} ${format.flag('profile-id', 'prof-123')} ${format.flag('language', 'python')} ${format.flag(
      'version',
      '1.0.0'
    )} ${format.flag('publish-type', PublishType.PackagePublishing)} ${format.flag('dry-run')}`
  ];

  async run() {
    const {
      flags: {
        'profile-id': profileId,
        version,
        destination,
        language,
        force,
        input,
        'publish-type': publishType,
        'dry-run': dryRun
      }
    } = await this.parse(SdkPublish);

    const interactive = !profileId && !language && !version && !publishType;
    const commandMetadata: CommandMetadata = {
      commandName: SdkPublish.id,
      shell: this.config.shell
    };

    const workingDirectory = DirectoryPath.createInput(input);
    const buildDirectory = input ? new DirectoryPath(input, 'src') : workingDirectory.join('src');
    const sdkDirectory = destination ? new DirectoryPath(destination) : workingDirectory.join('sdk');

    const telemetryService = new TelemetryService(this.getConfigDir());
    const onPublishSdkError = interactive
      ? (errorMessage: string) =>
          telemetryService.trackEvent(
            new SdkPublishValidationFailedEvent(errorMessage, SdkPublish.id, { interactive: true }),
            commandMetadata.shell
          )
      : (errorMessage: string) =>
          telemetryService.trackEvent(
            new SdkPublishValidationFailedEvent(errorMessage, SdkPublish.id, {
              'profile-id': profileId,
              version,
              language,
              ...(force && { force }),
              'publish-type': publishType
            }),
            commandMetadata.shell
          );

    intro('SDK Publish');
    const action = new PublishAction(this.getConfigDir(), commandMetadata);
    const result = await action.execute(
      buildDirectory,
      sdkDirectory,
      language as Language,
      publishType as PublishType,
      interactive,
      force,
      dryRun,
      profileId,
      version,
      onPublishSdkError
    );
    outro(result);
  }

  private readonly getConfigDir = () => {
    return new DirectoryPath(this.config.configDir);
  };
}
