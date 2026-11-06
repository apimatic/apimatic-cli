import { Command, Flags, Interfaces } from '@oclif/core';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FlagsProvider } from '../../types/flags-provider.js';
import { Language, Stability } from '../../types/sdk/generate.js';
import { StabilityChoice } from '../../types/sdk/stability-choice.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { ProjectContext } from '../../types/project-context.js';
import { format, intro, outro } from '../../prompts/format.js';
import { PublishType } from '../../types/publish-api/publishing-profile-item.js';
import { TelemetryService } from '../../infrastructure/services/telemetry-service.js';
import { SdkPublishValidationFailedEvent } from '../../types/events/sdk-publish-validation-failed.js';
import { SdkPublishInteractiveAction } from '../../actions/sdk/publish/interactive.js';
import { SdkPublishNonInteractiveAction } from '../../actions/sdk/publish/non-interactive.js';

export default class SdkPublish extends Command {
  static readonly summary = 'Generate and publish an SDK to a package registry and/or source repository';

  static readonly description = `Generate and publish an SDK using a publishing profile configured in the APIMatic App. Requires an input directory containing the API specification. Run it with no flags, or with only --git-init or --auth-key, for guided mode, or pass flags for CI/CD. When you pass flags, --profile-id, --language, --version, and --publish-type are required.
Your changes to the SDK are merged before it is published, as sdk generate does with git 2.38 or later: with flags, always; in guided mode, add --git-init. Nothing is published while conflicts are left to resolve.`;

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
    ...FlagsProvider.destination('sdk/<language>', 'sdk'),
    language: Flags.string({
      char: 'l',
      description: 'Language of the SDK to generate and publish.',
      options: Object.values(Language).map((l) => l.valueOf())
    }),
    ...FlagsProvider.sdkForce,
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
    }),
    stability: Flags.string({
      description: 'Stability level of the generated SDK. Defaults to the level the language offers.',
      options: Object.values(Stability).map((s) => s.valueOf())
    }),
    'git-init': Flags.boolean({
      default: false,
      description:
        "In guided mode, make the SDK directory a git repository when it isn't one of its own, so your changes to the SDK are kept. With flags, sdk publish always does this."
    }),
    ...FlagsProvider.authKey
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
    `${SdkPublish.cmdTxt} ${format.flag('profile-id', 'b2c3d4e5f6a1b2c3d4e5f6a1')} ${format.flag(
      'language',
      'csharp'
    )} ${format.flag('version', '2.0.0')} ${format.flag('publish-type', PublishType.SourceCodePublishing)}`,
    `${SdkPublish.cmdTxt} ${format.flag('profile-id', 'c3d4e5f6a1b2c3d4e5f6a1b2')} ${format.flag(
      'language',
      'python'
    )} ${format.flag('version', '1.0.0')} ${format.flag('publish-type', PublishType.PackagePublishing)} ${format.flag(
      'dry-run'
    )}`
  ];

  /** Guided mode is asked for by no flags, or only `--git-init` and `--auth-key`. */
  static isGuided(raw: Interfaces.ParserOutput['raw']): boolean {
    return raw.every((token) => token.type === 'flag' && (token.flag === 'git-init' || token.flag === 'auth-key'));
  }

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
        'dry-run': dryRun,
        stability,
        'git-init': gitInit,
        'auth-key': authKey
      },
      raw
    } = await this.parse(SdkPublish);

    const publishTypes = [...new Set(publishType)] as PublishType[];
    const interactive = SdkPublish.isGuided(raw);
    const commandMetadata: CommandMetadata = {
      commandName: SdkPublish.id,
      shell: this.config.shell
    };

    const project = ProjectContext.at(input);

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
              'publish-type': publishTypes,
              stability
            }),
            commandMetadata.shell
          );

    const sdkDirectory = destination === undefined ? undefined : DirectoryPath.fromUserInput(destination);
    intro('Publish SDK');
    const result = interactive
      ? await new SdkPublishInteractiveAction(configDir, commandMetadata, authKey).execute(
          DirectoryPath.createInput(input),
          gitInit,
          onPublishSdkError
        )
      : await new SdkPublishNonInteractiveAction(configDir, commandMetadata, authKey).execute(
          project,
          sdkDirectory,
          language as Language,
          publishTypes,
          force,
          dryRun,
          StabilityChoice.for(language as Language, stability),
          onPublishSdkError,
          profileId,
          version
        );
    outro(result);
  }

  private readonly getConfigDir = () => {
    return new DirectoryPath(this.config.configDir);
  };
}
