import { Command, Config, Flags } from "@oclif/core";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { GenerateAction } from "../../actions/portal/generate.js";
import { PortalGeneratePrompts } from "../../prompts/portal/generate.js";
import { FlagsProvider } from "../../types/flags-provider.js";

const DEFAULT_WORKING_DIRECTORY = "./";

export class PortalGenerate extends Command {
  static description =
    "Generate and download a static API Documentation portal. Requires an input directory containing API specifications, a config file and optionally, markdown guides. For details, refer to the [documentation](https://docs.apimatic.io/platform-api/#/http/guides/generating-on-prem-api-portal/build-file-reference)";

  static flags = {
    ...FlagsProvider.folder,
    ...FlagsProvider.destination,
    ...FlagsProvider.force,
    zip: Flags.boolean({
      default: false,
      description: "download the generated portal as a .zip archive"
    }),
    ...FlagsProvider["auth-key"]
  };

  static examples = [`$ apimatic portal:generate`, `$ apimatic portal:generate --folder="./" --destination="./portal"`];

  private readonly prompts: PortalGeneratePrompts;

  constructor(argv: string[], config: Config) {
    super(argv, config);
    this.prompts = new PortalGeneratePrompts();
  }

  async run(): Promise<void> {
    const {
      flags: { folder, destination, force, zip: zipPortal, "auth-key": authKey }
    } = await this.parse(PortalGenerate);

    const workingDirectory = new DirectoryPath(folder ?? DEFAULT_WORKING_DIRECTORY);
    const buildDirectory = folder ? new DirectoryPath(folder, "build") : workingDirectory.join("build");
    const portalDirectory = destination ? new DirectoryPath(destination) : workingDirectory.join("portal");

    const action = new GenerateAction(this.getConfigDir(), authKey);
    const result = await action.execute(buildDirectory, portalDirectory, force, zipPortal);
    result.mapAll(
      () => this.prompts.displayOutroMessage(portalDirectory.toString()),
      (message) => this.prompts.logError(message)
    );
  }

  private getConfigDir = () => {
    return new DirectoryPath(this.config.configDir);
  };
}
