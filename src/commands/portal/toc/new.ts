import { Command, Config, Flags } from "@oclif/core";
import { PortalNewTocAction } from "../../../actions/portal/toc/new-toc.js";
import { TelemetryService } from "../../../infrastructure/services/telemetry-service.js";
import { TocCreationFailedEvent } from "../../../types/events/toc-creation-failed.js";
import { DirectoryPath } from "../../../types/file/directoryPath.js";
import { FlagsProvider } from "../../../types/flags-provider.js";

const DEFAULT_WORKING_DIRECTORY = "./";

export default class PortalTocNew extends Command {
  static summary =
    "Generate a Table of Contents (TOC) file for your API documentation portal";

  static description = `This command generates a new Table of Contents (TOC) file used in the
generation of your API documentation portal.

The output is a YAML file with the .yml extension.

To learn more about the TOC file and APIMatic build directory structure, visit:
https://docs.apimatic.io/platform-api/#/http/guides/generating-on-prem-api-portal/overview-generating-api-portal`;

  static flags = {
    ...FlagsProvider.destination("src/content", `'toc.yml'`),
    ...FlagsProvider.input,
    ...FlagsProvider.force,
    "expand-endpoints": Flags.boolean({
      default: false,
      description:
        "include individual entries for each endpoint in the generated 'toc.yml'. Requires a valid API specification in the working directory."
    }),
    "expand-models": Flags.boolean({
      default: false,
      description:
        "include individual entries for each model in the generated 'toc.yml'. Requires a valid API specification in the working directory."
    })
  };

  static examples = [
    `apimatic portal:toc:new --destination="./src/content/"`,
    `apimatic portal:toc:new --input="./"`,
    `apimatic portal:toc:new --input="./" --destination="./src/content/"`
  ];

  constructor(argv: string[], config: Config) {
    super(argv, config);
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(PortalTocNew);
    const telemetryService = new TelemetryService(this.config.configDir);
    const portalNewTocAction = new PortalNewTocAction();

    const workingDirectory = new DirectoryPath(flags.input ?? DEFAULT_WORKING_DIRECTORY);
    const buildDirectory = flags.input ? new DirectoryPath(flags.input, "src") : workingDirectory.join("src");

    let tocDirectory: DirectoryPath | undefined;

    if (flags.destination) {
      tocDirectory = new DirectoryPath(flags.destination);
    }

    const result = await portalNewTocAction.createToc(
      buildDirectory,
      this.config.configDir,
      tocDirectory,
      flags.force,
      flags["expand-endpoints"],
      flags["expand-models"]
    );

    //TODO: Add a mapper for automatically mapping events to logger and telemetry service.
    if (result.isFailed()) {
      telemetryService.trackEvent(new TocCreationFailedEvent(result.error!, PortalTocNew.id, flags));
      this.error(result.error!);
    }
  }
}
