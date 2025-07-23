import { Command, Flags } from "@oclif/core";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { PortalCopilotPrompts } from "../../prompts/portal/copilot.js";
import { FlagsProvider } from "../../types/flags-provider.js";
import { CopilotConfigAction } from "../../actions/portal/copilotConfigAction.js";

const DEFAULT_WORKING_DIRECTORY = "./";

export default class PortalCopilotEnable extends Command {
  static description = "Enable API Copilot for the portal with specified configuration";

  static flags = {
    ...FlagsProvider.folder,
    "welcome-message": Flags.string({
      char: "m",
      default: "Hello! I'm your API assistant. How can I help you today?",
      description: "welcome message for the API copilot"
    }),
    enable : Flags.boolean({
      default: true,
      allowNo: true,
      description: "enables copilot configuration in the build.json file. If false, the copilot will be disabled."
    }),
    llm: Flags.string({
      options: ["open_ai", "gemini-pro"],
      default: "open_ai",
      description: "LLM provider to use for the copilot"
    }),
    ...FlagsProvider["auth-key"]
  };

  static examples = [
    `$ apimatic portal:copilot --folder="./portal/" --welcome-message="Welcome to our API!" --llm="gemini-pro"
API Copilot has been enabled successfully.
`,
    `$ apimatic portal:copilot --folder="./portal/"
API Copilot has been enabled with default settings.
`
  ];

  private readonly prompts = new PortalCopilotPrompts();

  async run(): Promise<void> {
    const {
      flags: { folder, "auth-key": authKey, enable, 'welcome-message': welcomeMessage }
    } = await this.parse(PortalCopilotEnable);

    const workingDirectory = new DirectoryPath(folder ?? DEFAULT_WORKING_DIRECTORY);
    const buildDirectory = folder ? new DirectoryPath(folder, "build") : workingDirectory.join("build");
    const copilotConfigAction = new CopilotConfigAction(new DirectoryPath(this.config.configDir), authKey);
    const result = await copilotConfigAction.execute(buildDirectory, welcomeMessage, enable);
    result.map((message) => this.prompts.logError(message));
  }
}
