import { Command, Flags } from "@oclif/core";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FlagsProvider } from "../../types/flags-provider.js";
import { CopilotAction } from "../../actions/portal/copilot.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { format, intro, outro } from "../../prompts/format.js";

export default class PortalCopilot extends Command {
  static summary = "Configure API Copilot for your API Documentation portal";

  static description =
    `Displays available API Copilots associated with your account and allows you to select which one to integrate with your portal. Each APIMatic account includes one Copilot by default. The selected Copilot will be added to your ${format.var("APIMATIC-BUILD.json")} file`;

  static flags = {
    ...FlagsProvider.input,
    disable: Flags.boolean({
      default: false,
      description: "marks the API Copilot as disabled in the configuration"
    }),
    ...FlagsProvider.force,
    ...FlagsProvider.authKey
  };

  static cmdTxt = format.cmd("apimatic", "portal", "copilot");
  static examples = [
    `${this.cmdTxt} ${format.flag("input", './')}`,
    `${this.cmdTxt} ${format.flag("input", './')} ${format.flag("disable")}`
  ];

  async run(): Promise<void> {
    const {
      flags: { input, "auth-key": authKey, disable, force }
    } = await this.parse(PortalCopilot);

    const commandMetadata: CommandMetadata = {
      commandName: PortalCopilot.id,
      shell: this.config.shell
    };

    intro("Configure API Copilot");
    const buildDirectory = DirectoryPath.createInput(input).join("src");
    const copilotConfigAction = new CopilotAction(new DirectoryPath(this.config.configDir), commandMetadata, authKey);
    const result = await copilotConfigAction.execute(buildDirectory, force, !disable);
    outro(result);
  }
}
