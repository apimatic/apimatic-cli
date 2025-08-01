import { Command, Flags } from "@oclif/core";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { PortalCopilotPrompts } from "../../prompts/portal/copilot.js";
import { FlagsProvider } from "../../types/flags-provider.js";
import { CopilotAction } from "../../actions/portal/copilot.js";

const DEFAULT_WORKING_DIRECTORY = "./";

export default class PortalCopilotEnable extends Command {

  static summary = "Configure API Copilot for your API Documentation portal";

  static description = "Displays available API Copilots associated with your account and allows you to select which one to integrate with your portal. Each APIMatic account includes one Copilot by default. The selected Copilot will be added to your APIMATIC-BUILD.json file";

  static flags = {
    ...FlagsProvider.input,
    "welcome-message": Flags.string({
      char: "m",
      default: "",
      description: "welcome message for the API copilot"
    }),
    disable : Flags.boolean({
      default: false,
      description: "marks the API Copilot as disabled in the configuration"
    }),
    ...FlagsProvider.authKey
  };

  static examples = [
    `apimatic portal:copilot --input="./" --welcome-message="Welcome to our API!"`,
    `apimatic portal:copilot --input="./"`
  ];

  private readonly prompts = new PortalCopilotPrompts();

  async run(): Promise<void> {
    const {
      flags: { input, "auth-key": authKey, disable, 'welcome-message': welcomeMessage}
    } = await this.parse(PortalCopilotEnable);

    const workingDirectory = new DirectoryPath(input ?? DEFAULT_WORKING_DIRECTORY);
    const buildDirectory = input ? new DirectoryPath(input, "src") : workingDirectory.join("src");
    const copilotConfigAction = new CopilotAction(new DirectoryPath(this.config.configDir), authKey);
    const result = await copilotConfigAction.execute(buildDirectory, welcomeMessage, !disable);
    result.map((message) => this.prompts.logError(message));
  }
}
