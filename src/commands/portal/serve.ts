import { Command, Config, Flags } from "@oclif/core";
import { PortalServePrompts } from "../../prompts/portal/serve.js";
import { ServeFlags, ServePaths } from "../../types/portal/serve.js";
import { PortalServeAction } from "../../actions/portal/serve.js";
import { getMessageInRedColor } from "../../utils/utils.js";
import { ServeHandler } from "../../application/portal/serve/serve-handler.js";
import { PortalService } from "../../infrastructure/services/portal-service.js";
import { GenerateAction } from "../../actions/portal/generate.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FlagsProvider } from "../../types/flags-provider.js";

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

  private readonly prompts: PortalServePrompts;

  constructor(argv: string[], config: Config) {
    super(argv, config);
    this.prompts = new PortalServePrompts();
  }

  static examples = [
    "apimatic portal:serve",
    'apimatic portal:serve --input="./" --destination="./portal" --port=3000 --open --no-reload'
  ];

  public async run() {
    const { flags } = await this.parse(PortalServe);
    const portalServePrompts = new PortalServePrompts();
    const portalServeAction = new PortalServeAction(portalServePrompts, new ServeHandler(), new PortalService());

    const workingDirectory = new DirectoryPath(flags.input ?? DEFAULT_WORKING_DIRECTORY);
    const buildDirectory = flags.input ? new DirectoryPath(flags.input, "src") : workingDirectory.join("src");
    const portalDirectory = flags.destination ? new DirectoryPath(flags.destination) : workingDirectory.join("portal");

    const generatePortalAction = new GenerateAction(new DirectoryPath(this.config.configDir), flags["auth-key"]);

    const serveFlags: ServeFlags = {
      input: buildDirectory.toString(),
      destination: portalDirectory.toString(),
      "auth-key": flags["auth-key"],
      port: flags.port,
      open: flags.open,
      "no-reload": flags["no-reload"]
    };

    const servePaths: ServePaths = {
      sourceDirectoryPath: buildDirectory.toString(),
      destinationDirectoryPath: portalDirectory.toString()
    };

    const servePortalResult = await portalServeAction.servePortal(serveFlags, servePaths, PortalServe.id, generatePortalAction.execute);
    //TODO: Convert below statements to result.mapAll after changing servePortalResult to ActionResult.
    if (servePortalResult.isFailed()) {
      portalServePrompts.logError(getMessageInRedColor(servePortalResult.error!));
    }

    if (servePortalResult.isCancelled()) {
      portalServePrompts.logError(getMessageInRedColor(servePortalResult.value!));
    }

    if (servePortalResult.isSuccess()) {
      this.prompts.displayOutroMessage(buildDirectory.toString(), portalDirectory.toString(), servePortalResult.value!, flags["no-reload"]);
    }
  }
}
