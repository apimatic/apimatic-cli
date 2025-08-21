import { Command, Flags } from "@oclif/core";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { GenerateAction } from "../../actions/portal/generate.js";
import { FlagsProvider } from "../../types/flags-provider.js";
import { format, intro, outro } from "../../prompts/format.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";

const DEFAULT_WORKING_DIRECTORY = "./";

export class PortalGenerate extends Command {
  static summary = "Generate an API Documentation portal";

  static description =
    "Generate an API Documentation portal. Requires an input directory containing API specifications, a config file and optionally, markdown guides. For details, refer to the [documentation](https://docs.apimatic.io/platform-api/#/http/guides/generating-on-prem-api-portal/build-file-reference)";

  static flags = {
    ...FlagsProvider.input,
    ...FlagsProvider.destination("portal", "portal"),
    ...FlagsProvider.force,
    zip: Flags.boolean({
      default: false,
      description: "Download the generated portal as a .zip archive"
    }),
    ...FlagsProvider.authKey
  };

  static cmdTxt = format.cmd("apimatic", "portal", "generate");
  static examples = [
    this.cmdTxt,
    `${this.cmdTxt} ${format.flag("input", '"./"')} ${format.flag("destination", '"./portal"')}`
  ];

  async run(): Promise<void> {
    const {
      flags: { input, destination, force, zip: zipPortal, "auth-key": authKey }
    } = await this.parse(PortalGenerate);

    const workingDirectory = new DirectoryPath(input ?? DEFAULT_WORKING_DIRECTORY);
    const buildDirectory = input ? new DirectoryPath(input, "src") : workingDirectory.join("src");
    const portalDirectory = destination ? new DirectoryPath(destination) : workingDirectory.join("portal");
    const commandMetadata: CommandMetadata = {
      commandName: PortalGenerate.id,
      shell: this.config.shell
    };

    intro("Generate Portal");
    const action = new GenerateAction(new DirectoryPath(this.config.configDir), commandMetadata, authKey);
    const result = await action.execute(buildDirectory, portalDirectory, force, zipPortal);
    outro(result);
  }
}
