import { Command, Flags } from '@oclif/core';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FlagsProvider } from '../../types/flags-provider.js';
import { Language } from '../../types/sdk/generate.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { format, intro, outro } from '../../prompts/format.js';
import { PublishType } from '../../types/publish-api/publishing-profile-item.js';
import { TelemetryService } from '../../infrastructure/services/telemetry-service.js';
import { SdkPublishValidationFailedEvent } from '../../types/events/sdk-publish-validation-failed.js';
import { SdkPublishInteractiveAction } from '../../actions/sdk/publish/interactive.js';
import { SdkPublishNonInteractiveAction } from '../../actions/sdk/publish/non-interactive.js';

export default class SdkPublish extends Command {
  static readonly summary = 'Generate and publish an SDK to a package registry and/or source repository';

  static readonly description = `Generate and publish an SDK using a publishing profile configured in the APIMatic App. Requires an input directory containing the API specification. Run without flags for a step-by-step interactive experience, or pass all required flags for CI/CD automation.`;

  static readonly cmdTxt = format.cmd('apimatic', 'sdk', 'publish');

  static flags = {
    'profile-id': Flags.string({
      char: 'p',
      description: 'Id of the publishing profile to use.'
    }),
    version: Flags.string({
      char: 'v',
      description: 'Semantic version of the SDK to publish (e.g. 1.0.0).'
    }),
    ...FlagsProvider.destination('sdk', 'sdk'),
    language: Flags.string({
      char: 'l',
      description: 'Language of the SDK to generate and publish.',
      options: Object.values(Language)
        .filter((l) => l !== Language.GO)
        .map((l) => l.valueOf())
    }),
    ...FlagsProvider.force,
    ...FlagsProvider.input,
    'publish-type': Flags.string({
      description:
        "One or more publishing targets: 'package' for a package registry, 'sourcecode' for a git repository.",
      options: [PublishType.PackagePublishing, PublishType.SourceCodePublishing],
      multiple: true,
      multipleNonGreedy: true
    }),
    'dry-run': Flags.boolean({
      default: false,
      description: 'Generate the SDK locally for review without publishing.'
    })
  };

  static examples = [
    `${SdkPublish.cmdTxt}`,
    `${SdkPublish.cmdTxt} ${format.flag('profile-id', 'a1b2c3d4e5f6a1b2c3d4e5f6')} ${format.flag(
      'language',
      'typescript'
    )} ${format.flag('version', '1.0.0')} ${format.flag('publish-type', PublishType.PackagePublishing)} ${format.flag(
      'publish-type',
      PublishType.SourceCodePublishing
    )}`,
    `${SdkPublish.cmdTxt} ${format.flag('profile-id', 'b2c3d4e5f6a1b2c3d4e5f6a1')} ${format.flag('language', 'java')} ${format.flag(
      'version',
      '2.0.0'
    )} ${format.flag('publish-type', PublishType.SourceCodePublishing)}`,
    `${SdkPublish.cmdTxt} ${format.flag('profile-id', 'c3d4e5f6a1b2c3d4e5f6a1b2')} ${format.flag('language', 'python')} ${format.flag(
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

    const publishTypes = [...new Set(publishType)] as PublishType[];
    const interactive = this.argv.length === 0;
    const commandMetadata: CommandMetadata = {
      commandName: SdkPublish.id,
      shell: this.config.shell
    };

    const workingDirectory = DirectoryPath.createInput(input);
    const buildDirectory = input ? new DirectoryPath(input, 'src') : workingDirectory.join('src');
    const sdkDirectory = destination ? new DirectoryPath(destination) : workingDirectory.join('sdk');

    const configDir = this.getConfigDir();
    const telemetryService = new TelemetryService(configDir);
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
              'publish-type': publishTypes
            }),
            commandMetadata.shell
          );

    intro('Publish SDK');
    const result = interactive
      ? await new SdkPublishInteractiveAction(configDir, commandMetadata).execute(
          workingDirectory,
          onPublishSdkError
        )
      : await new SdkPublishNonInteractiveAction(configDir, commandMetadata).execute(
          buildDirectory,
          sdkDirectory,
          language as Language,
          publishTypes,
          force,
          dryRun,
          onPublishSdkError,
          profileId,
          version,
        );
    outro(result);
  }

  private readonly getConfigDir = () => {
    return new DirectoryPath(this.config.configDir);
  };
}
