import { Command, Flags } from '@oclif/core';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FlagsProvider } from '../../types/flags-provider.js';
import { PublishAction } from '../../actions/sdk/publish.js';
import { Language } from '../../types/sdk/generate.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { format, intro, outro } from '../../prompts/format.js';
import { TelemetryService } from '../../infrastructure/services/telemetry-service.js';
import { PublishType } from '../../types/sdk/publish.js';
import { SdkPublishCompletedEvent } from '../../types/events/sdk-publish-completed.js';
import { SdkPublishInitiatedEvent } from '../../types/events/sdk-publish-initiated.js';
import { SdkPublishFailedEvent } from '../../types/events/sdk-publish-failed.js';

export default class SdkPublish extends Command {
  static readonly summary = 'Publish an SDK for your API';

  static readonly description = `Generate and publish SDKs to package registries.
    Supports interactive mode for guided publishing and non-interactive mode for CI/CD flows.`;

  static readonly cmdTxt = format.cmd('apimatic', 'sdk', 'publish');

  static flags = {
    interactive: Flags.boolean({
      char: 'i',
      default: false,
      description: 'Launch interactive mode for sequentially getting profile, language and publish-type information.'
    }),
    profile: Flags.string({
      char: 'p',
      description: 'Publishing profile id.'
    }),
    version: Flags.string({
      char: 'v',
      description: 'Package version.'
    }),
    destination: Flags.string({
      char: 'd',
      description: 'Directory where the SDK will be generated for publishing.'
    }),
    language: Flags.string({
      char: 'l',
      description: 'Single language for which the SDK will be generated and published.',
      options: Object.values(Language).map((l) => l.valueOf())
    }),
    ...FlagsProvider.force,
    ...FlagsProvider.input,
    'publish-type': Flags.string({
      description: 'Type of publishing (source, package).',
      options: Object.values(PublishType).map((t) => t.valueOf())
    }),
    'dry-run': Flags.boolean({
      default: false,
      description: 'Generate SDK with publishing profile for review. Skips the publishing step.'
    })
  };

  static examples = [
    `${SdkPublish.cmdTxt} ${format.flag('interactive')}`,
    `${SdkPublish.cmdTxt} ${format.flag('profile', 'prof-123')} ${format.flag('language', 'typescript')} ${format.flag(
      'version',
      '1.0.0'
    )}`,
    `${SdkPublish.cmdTxt} ${format.flag('profile', 'prof-123')} ${format.flag('language', 'java')} ${format.flag(
      'version',
      '2.0.0'
    )} ${format.flag('publish-type', PublishType.SourceCodePublishing)}`,
    `${SdkPublish.cmdTxt} ${format.flag('profile', 'prof-123')} ${format.flag('language', 'python')} ${format.flag(
      'version',
      '1.0.0'
    )} ${format.flag('publish-type', PublishType.PackagePublishing)} ${format.flag('dry-run')}`
  ];

  async run() {
    const telemetryService = new TelemetryService(this.getConfigDir());
    const {
      flags: {
        interactive,
        profile,
        version,
        destination,
        language,
        force,
        input,
        'publish-type': publishType,
        'dry-run': dryRun
      }
    } = await this.parse(SdkPublish);
    const commandMetadata: CommandMetadata = {
      commandName: SdkPublish.id,
      shell: this.config.shell
    };

    const workingDirectory = DirectoryPath.createInput(input);
    const buildDirectory = input ? new DirectoryPath(input, 'src') : workingDirectory.join('src');
    const sdkDirectory = destination ? new DirectoryPath(destination) : DirectoryPath.default.join('sdk');

    await telemetryService.trackEvent(new SdkPublishInitiatedEvent(), commandMetadata.shell);

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
      profile,
      version
    );
    outro(result);

    await result.mapAll(
      async () => await telemetryService.trackEvent(new SdkPublishCompletedEvent(), commandMetadata.shell),
      async () =>
        await telemetryService.trackEvent(
          new SdkPublishFailedEvent('error', SdkPublish.id, {
            interactive,
            profile,
            version,
            destination,
            language,
            force,
            input,
            'publish-type': publishType,
            'dry-run': dryRun
          }),
          commandMetadata.shell
        ),
      () => new Promise(() => {})
    );
  }

  private readonly getConfigDir = () => {
    return new DirectoryPath(this.config.configDir);
  };
}
