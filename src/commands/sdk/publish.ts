import { Command, Flags } from "@oclif/core";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FlagsProvider } from "../../types/flags-provider.js";
import { PublishAction } from "../../actions/sdk/publish.js";
import { Language } from "../../types/sdk/generate.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { format, intro, outro } from "../../prompts/format.js";

export enum PublishType {
  SOURCE = "source",
  PACKAGE = "package"
}

export default class SdkPublish extends Command {
  static readonly summary = "Publish an SDK for your API";

  static readonly description = `Generate and publish Software Development Kits (SDKs) to package registries.
    Supports interactive mode for guided publishing and non-interactive mode for CI/CD flows.`;

  static readonly cmdTxt = format.cmd("apimatic", "sdk", "publish");

  static flags = {
    interactive: Flags.boolean({
      char: "i",
      default: false,
      description: "Launch interactive mode for sequentially getting profile, language and publish-type information.",
    }),
    profile: Flags.string({
      required: false,
      char: "p",
      description: "Publishing profile id."
    }),
    version: Flags.string({
      char: "v",
      description: "Package version."
    }),
    output: Flags.string({
      char: "o",
      description: "Directory where the SDK will be generated."
    }),
    language: Flags.string({
      char: "l",
      description: "Single language for which the SDK will be generated and published.",
      options: Object.values(Language).map((l) => l.valueOf())
    }),
    ...FlagsProvider.force,
    "publish-type": Flags.string({
      description: "Type of publishing (source, package).",
      multiple: true
    }),
    "dry-run": Flags.boolean({
      default: false,
      description: "Generate SDK with publishing profile for review. Skips the publishing step."
    }),
    ...FlagsProvider.authKey
  };

  static examples = [
    `${SdkPublish.cmdTxt} ${format.flag("interactive")}`,
    `${SdkPublish.cmdTxt} ${format.flag("profile", "prof-123")} ${format.flag("language", "typescript")} ${format.flag("version", "1.0.0")} ${format.flag("publish-type", "source")}`,
    `${SdkPublish.cmdTxt} ${format.flag("profile", "prof-123")} ${format.flag("language", "java")} ${format.flag("version", "2.0.0")} ${format.flag("publish-type", "source")} ${format.flag("publish-type", "package")}`,
    `${SdkPublish.cmdTxt} ${format.flag("profile", "prof-123")} ${format.flag("language", "python")} ${format.flag("version", "1.0.0")} ${format.flag("publish-type", "package")} ${format.flag("dry-run")}`
  ];

  async run() {
    const {
      flags: { interactive, profile, version, output, language, force, "publish-type": publishType, "dry-run": dryRun, "auth-key": authKey }
    } = await this.parse(SdkPublish);

    const commandMetadata: CommandMetadata = {
      commandName: SdkPublish.id,
      shell: this.config.shell
    };

    const action = new PublishAction(this.getConfigDir(), commandMetadata, authKey);

    if (interactive) {
      const sdkDirectory = output ? new DirectoryPath(output) : DirectoryPath.default.join("sdk");

      intro("Publish SDK (Interactive)");
      const result = await action.executeInteractive(sdkDirectory, force);
      outro(result);
    } else {
      const missingFlags: string[] = [];
      if (!profile) missingFlags.push("--profile (-p)");
      if (!version) missingFlags.push("--version (-v)");
      if (!language) missingFlags.push("--language (-l)");
      if (!publishType || publishType.length === 0) missingFlags.push("--publish-type");

      if (missingFlags.length > 0) {
        this.error(`Missing required flags: ${missingFlags.join(", ")}`);
      }

      const parsedPublishTypes = this.parsePublishTypes(publishType!);
      const sdkDirectory = output ? new DirectoryPath(output) : DirectoryPath.default.join("sdk", language!);

      intro("Publish SDK");
      const result = await action.executeNonInteractive(
        sdkDirectory,
        profile!,
        language! as Language,
        version!,
        parsedPublishTypes,
        force,
        dryRun
      );
      outro(result);
    }
  }

  private readonly getConfigDir = () => {
    return new DirectoryPath(this.config.configDir);
  };

  private readonly parsePublishTypes = (publishTypes: string[]): PublishType[] => {
    const result: PublishType[] = [];
    for (const pt of publishTypes) {
      for (const part of pt.split(",")) {
        const trimmed = part.trim();
        if (Object.values(PublishType).includes(trimmed as PublishType)) {
          result.push(trimmed as PublishType);
        }
      }
    }
    return [...new Set(result)];
  };
}
