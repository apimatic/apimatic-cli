import { Command, Flags } from "@oclif/core";
import { PortalNewTocAction } from "../../../actions/portal/toc/new-toc.js";
import { TelemetryService } from "../../../infrastructure/services/telemetry-service.js";
import { TocCreationFailedEvent } from "../../../types/events/toc-creation-failed.js";
import { DirectoryPath } from "../../../types/file/directoryPath.js";
import { FlagsProvider } from "../../../types/flags-provider.js";
import { CommandMetadata } from "../../../types/common/command-metadata.js";
import { format, intro, outro } from "../../../prompts/format.js";

const DEFAULT_WORKING_DIRECTORY = "./";

export default class PortalTocNew extends Command {
  static summary = "Generate a Table of Contents (TOC) file for your API documentation portal";

  static description = `This command generates a new Table of Contents (TOC) file used in the
generation of your API documentation portal.

The output is a YAML file with the .yml extension.

To learn more about the TOC file and APIMatic build directory structure, visit:
${format.link(
  "https://docs.apimatic.io/platform-api/#/http/guides/generating-on-prem-api-portal/overview-generating-api-portal"
)}`;

  static flags = {
    ...FlagsProvider.destination("src/content", `toc.yml`),
    ...FlagsProvider.input,
    ...FlagsProvider.force,
    "expand-endpoints": Flags.boolean({
      default: false,
      description: `include individual entries for each endpoint in the generated ${format.path(
        "toc.yml"
      )}. Requires a valid API specification in the working directory.`
    }),
    "expand-models": Flags.boolean({
      default: false,
      description: `include individual entries for each model in the generated ${format.path(
        "toc.yml"
      )}. Requires a valid API specification in the working directory.`
    })
  };

  static cmdTxt = format.cmd("apimatic", "portal", "toc", "new");
  static examples = [
    `${this.cmdTxt} ${format.flag("destination", '"./src/content/"')}`,
    `${this.cmdTxt} ${format.flag("input", '"./"')}`,
    `${this.cmdTxt} ${format.flag("input", '"./"')} ${format.flag("destination", '"./src/content/"')}`
  ];

  async run(): Promise<void> {
    const {
      flags: {
        input,
        destination,
        force,
        "expand-endpoints": expandEndpoints,
        "expand-models": expandModels
      }
    } = await this.parse(PortalTocNew);

    const workingDirectory = new DirectoryPath(input ?? DEFAULT_WORKING_DIRECTORY);
    const buildDirectory = input ? new DirectoryPath(input, "src") : workingDirectory.join("src");
    const tocDirectory = destination? new DirectoryPath(destination): undefined;

    const commandMetadata: CommandMetadata = {
      commandName: PortalTocNew.id,
      shell: this.config.shell
    };

    intro("New TOC");
    const action = new PortalNewTocAction(new DirectoryPath(this.config.configDir), commandMetadata);
    const result = await action.execute(
      buildDirectory,
      tocDirectory,
      force,
      expandEndpoints,
      expandModels
    );
    outro(result);

    result.mapAll(
      () => {},
      async () => {
        const telemetryService = new TelemetryService(this.config.configDir);
        await telemetryService.trackEvent(
          // TODO: fix Toc error message
          new TocCreationFailedEvent('error', PortalTocNew.id, {
            input,
            destination,
            force,
            "expand-endpoints": expandEndpoints,
            "expand-models": expandModels
          }),
          commandMetadata.shell
        );
      },
      () => {}
    );
  }

}
