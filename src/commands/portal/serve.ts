import { Command, Flags } from "@oclif/core";
import { PortalServeAction } from "../../actions/portal/serve.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FlagsProvider } from "../../types/flags-provider.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { intro, outro } from "../../prompts/format.js";

const DEFAULT_WORKING_DIRECTORY = "./";

export default class PortalServe extends Command {
  static description = "Generate and deploy a Docs as Code portal with hot reload.";

  static flags = {
    port: Flags.integer({
      char: "p",
      description: "[default: 3000] port to serve the portal."
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

  static examples = [
    "apimatic portal serve",
    'apimatic portal serve --input="./" --destination="./portal" --port=3000 --open --no-reload'
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
    const portalServeAction = new PortalServeAction(this.getConfigDir(), commandMetadata, authKey, port);
    const result = await portalServeAction.servePortal(buildDirectory, portalDirectory, open, noReload);
    outro(result);
  }

  private getConfigDir(): DirectoryPath {
    return new DirectoryPath(this.config.configDir);
  }
}
