import { Command, Flags } from "@oclif/core";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { PortalCopilotPrompts } from "../../prompts/portal/copilot.js";
import { FlagsProvider } from "../../types/flags-provider.js";
import { CopilotConfigAction } from "../../actions/portal/copilotConfigAction.js";

const DEFAULT_WORKING_DIRECTORY = "./";

export default class PortalCopilotEnable extends Command {
  static description = "adds the API Copilot configuration in APIMATIC-BUILD.json";

  static flags = {
    ...FlagsProvider.folder,
    "welcome-message": Flags.string({
      char: "m",
      default: "Hello! I'm your API assistant. How can I help you today?",
      description: "welcome message for the API copilot"
    }),
    disable : Flags.boolean({
      default: false,
      description: "marks the API Copilot as disabled in the configuration"
    }),
    ...FlagsProvider["auth-key"]
  };

  static examples = [
    `$ apimatic portal:copilot --folder="./portal/" --welcome-message="Welcome to our API!"`,
    `$ apimatic portal:copilot --folder="./portal/"`
  ];

  private readonly prompts = new PortalCopilotPrompts();

  async run(): Promise<void> {
    const {
      flags: { folder, "auth-key": authKey, disable, 'welcome-message': welcomeMessage }
    } = await this.parse(PortalCopilotEnable);

    const workingDirectory = new DirectoryPath(folder ?? DEFAULT_WORKING_DIRECTORY);
    const buildDirectory = folder ? new DirectoryPath(folder, "build") : workingDirectory.join("build");
    const copilotConfigAction = new CopilotConfigAction(new DirectoryPath(this.config.configDir), authKey);
    const result = await copilotConfigAction.execute(buildDirectory, welcomeMessage, !disable);
    result.map((message) => this.prompts.logError(message));
  }
}
