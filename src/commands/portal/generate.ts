import * as path from "path";
import * as fs from "fs-extra";
import { Command, Flags } from "@oclif/core";
import { GenerateFlags, PortalPaths } from "../../types/portal/generate";
import { getMessageInRedColor } from "../../utils/utils";
import { PortalGeneratePrompts } from "../../prompts/portal/generate";
import { PortalGenerateAction } from "../../actions/portal/generate";
import { Result } from "../../types/common/result";
import { Errors } from "@oclif/core";

const DEFAULT_FOLDER = "./";
const DEFAULT_DESTINATION = path.resolve("./");
const GENERATED_PORTAL_ARTIFACTS_FOLDER = "generated_portal";
const GENERATED_PORTAL_ARTIFACTS_ZIP = ".generated_portal.zip";

export default class PortalGenerate extends Command {
  static description =
    "Generate and download a static API Documentation portal. Requires an input directory containing API specifications, a config file and optionally, markdown guides. For details, refer to the [documentation](https://docs.apimatic.io/platform-api/#/http/guides/generating-on-prem-api-portal/build-file-reference)";

  static flags = {
    folder: Flags.string({
      parse: async (input: string) => path.resolve(input),
      default: DEFAULT_FOLDER,
      description: "path to the input directory containing API specifications and config files"
    }),
    destination: Flags.string({
      parse: async (input: string) => path.resolve(input),
      default: DEFAULT_DESTINATION,
      description: "path to the downloaded portal"
    }),
    force: Flags.boolean({
      char: "f",
      default: false,
      description: "overwrite if a portal exists in the destination"
    }),
    zip: Flags.boolean({
      default: false,
      description: "download the generated portal as a .zip archive"
    }),
    "auth-key": Flags.string({
      default: "",
      description: "override current authentication state with an authentication key"
    })
  };

  static examples = [
    `$ apimatic portal:generate --folder="./portal/" --destination="D:/"
Your portal has been generated at D:/
`
  ];

  private readonly prompts: PortalGeneratePrompts;

  constructor(argv: string[], config: any) {
    super(argv, config);
    this.prompts = new PortalGeneratePrompts();
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(PortalGenerate);
    const paths = await this.getPortalPaths(flags as GenerateFlags);
    const portalGenerateAction = new PortalGenerateAction();

    try {
      await this.checkExistingPortal(paths, flags as GenerateFlags);
      const validationResult = await this.validatePaths(paths);
      if (!validationResult.isSuccess) {
        this.error(validationResult.error!);
      }

      const generatePortalResult = await portalGenerateAction.generatePortal(
        paths,
        flags as GenerateFlags,
        this.config.configDir
      );

      if (!generatePortalResult.isSuccess) {
        this.prompts.logError(getMessageInRedColor(`An error occurred while generating the portal: \n${generatePortalResult.error!}`));
      }
    } 
    catch (error: any) {
      if (error instanceof Errors.CLIError) {
        throw error;
      }
      // Handle unexpected errors
      this.error(
        getMessageInRedColor(
          `An unexpected error occurred while generating the portal, please try again later. If the issue persists, reach out to our team at support@apimatic.io for assistance.`
        )
      );
    }
  }

  private async getPortalPaths(flags: GenerateFlags): Promise<PortalPaths> {
    return {
      sourceFolderPath: flags.folder,
      destinationFolderPath: flags.destination,
      generatedPortalArtifactsFolderPath: path.join(flags.destination, GENERATED_PORTAL_ARTIFACTS_FOLDER),
      generatedPortalArtifactsZipFilePath: path.join(flags.destination, GENERATED_PORTAL_ARTIFACTS_ZIP)
    };
  }

  private async validatePaths(paths: PortalPaths): Promise<Result<string, string>> {
    if (!(await fs.pathExists(paths.sourceFolderPath))) {
      return Result.failure(getMessageInRedColor(`Portal build input folder ${paths.sourceFolderPath} does not exist.`));
    }
    if (!(await fs.pathExists(path.dirname(paths.generatedPortalArtifactsFolderPath)))) {
      return Result.failure(
        getMessageInRedColor(
          `Destination path ${path.dirname(paths.generatedPortalArtifactsFolderPath)} does not exist.`
        )
      );
    }

    return Result.success("Paths validated successfully.");
  }

  private async checkExistingPortal(paths: PortalPaths, flags: GenerateFlags): Promise<void> {
    if (fs.existsSync(paths.generatedPortalArtifactsFolderPath) && !flags.force && !flags.zip) {
      if (!(await this.prompts.overwriteExistingPortalArtifactsPrompt())) {
        process.exit(1);
      }
    } else if (fs.existsSync(paths.generatedPortalArtifactsZipFilePath) && !flags.force && flags.zip) {
      if (!(await this.prompts.existingDestinationPortalZipPrompt())) {
        process.exit(1);
      }
    }
  }
}