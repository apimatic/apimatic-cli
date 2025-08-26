import { Command, Flags } from "@oclif/core";
import { PortalServeAction } from "../../actions/portal/serve.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FlagsProvider } from "../../types/flags-provider.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { format, intro, outro } from "../../prompts/format.js";

const DEFAULT_WORKING_DIRECTORY = "./";

export default class PortalServe extends Command {
  static summary = "Generate and serve an API Documentation Portal with hot reload.";

  static description =
    "Requires an input directory with API specifications, a config file, and optionally markdown guides. Supports disabling hot reload and opening the portal in the default browser.";

  static flags = {
    port: Flags.integer({
      char: "p",
      description: "Port to serve the portal.",
      default: 3000,
      helpValue: "3000"
    }),
    ...FlagsProvider.input,
    ...FlagsProvider.destination("portal", "portal"),
    open: Flags.boolean({
      char: "o",
      description: "Open the portal in the default browser.",
      default: false
    }),
    "no-reload": Flags.boolean({
      description: "Disable hot reload.",
      default: false
    }),
    ...FlagsProvider.authKey
  };

  static cmdTxt = format.cmd("apimatic", "portal", "serve");
  static examples = [
    this.cmdTxt,
    `${this.cmdTxt} ${format.flag("input", '"./"')} ` +
      `${format.flag("destination", '"./portal"')} ` +
      `${format.flag("port", "3000")} ` +
      `${format.flag("open")} ` +
      `${format.flag("no-reload")}`
  ];

  public async run() {
    const {
      flags: { input, destination, port, open, "no-reload": noReload, "auth-key": authKey }
    } = await this.parse(PortalServe);

    const workingDirectory = new DirectoryPath(input ?? DEFAULT_WORKING_DIRECTORY);
    const buildDirectory = input ? new DirectoryPath(input, "src") : workingDirectory.join("src");
    const portalDirectory = destination ? new DirectoryPath(destination) : workingDirectory.join("portal");
    const commandMetadata: CommandMetadata = {
      commandName: PortalServe.id,
      shell: this.config.shell
    };

    intro("Portal Serve");
    const portalServeAction = new PortalServeAction(this.getConfigDir(), commandMetadata, authKey);
    const result = await portalServeAction.execute(buildDirectory, portalDirectory, port, open, noReload);
    outro(result);
  }

  private getConfigDir(): DirectoryPath {
    return new DirectoryPath(this.config.configDir);
  }
}
