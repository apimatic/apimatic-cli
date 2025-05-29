import * as path from "path";
import * as fs from "fs-extra";

import { Command, Flags } from "@oclif/core";
import {
  ProblemDetailsError,
  UnauthorizedResponseError,
  ApiError
} from "@apimatic/sdk";

import { GeneratePortalParams } from "../../types/portal/generate";
import { downloadDocsPortal } from "../../controllers/portal/generate";
import {
  validateAndZipPortalSource,
  getGeneratedFilesPaths,
  deleteFile,
  extractZipFile,
  parseStreamBodyToJson,
  getMessageInRedColor
} from "../../utils/utils";
import { PortalGeneratePrompts } from "../../prompts/portal/generate";

const DEFAULT_FOLDER = "./";
const DEFAULT_DESTINATION = path.resolve("./");
const GENERATED_PORTAL_FOLDER = "generated_portal";
const GENERATED_PORTAL_ZIP = ".generated_portal.zip";

interface GenerateFlags {
  readonly folder: string;
  readonly destination: string;
  readonly force: boolean;
  readonly zip: boolean;
  readonly "auth-key": string;
}

interface PortalPaths {
  readonly sourceFolderPath: string;
  readonly destinationFolderPath: string;
  readonly portalFolderPath: string;
  readonly zippedPortalPath: string;
}

interface ErrorResponse {
  readonly title: string;
  readonly detail?: string;
  readonly errors: Record<string, string[]>;
  readonly message?: string;
}

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

  private async getPortalPaths(flags: GenerateFlags): Promise<PortalPaths> {
    return {
      sourceFolderPath: flags.folder,
      destinationFolderPath: flags.destination,
      portalFolderPath: path.join(flags.destination, GENERATED_PORTAL_FOLDER),
      zippedPortalPath: path.join(flags.destination, GENERATED_PORTAL_ZIP)
    };
  }

  private async validatePaths(paths: PortalPaths): Promise<void> {
    if (!(await fs.pathExists(paths.sourceFolderPath))) {
      this.error(getMessageInRedColor(`Portal build input folder ${paths.sourceFolderPath} does not exist.`));
    }
    if (!(await fs.pathExists(path.dirname(paths.portalFolderPath)))) {
      this.error(getMessageInRedColor(`Destination path ${path.dirname(paths.portalFolderPath)} does not exist.`));
    }
  }

  private async checkExistingPortal(paths: PortalPaths, flags: GenerateFlags): Promise<void> {
    if (fs.existsSync(paths.portalFolderPath) && !flags.force && !flags.zip) {
      await this.prompts.existingDestinationPortalFolderPrompt();
    } else if (fs.existsSync(paths.zippedPortalPath) && !flags.force && flags.zip) {
      await this.prompts.existingDestinationPortalZipPrompt();
    }
  }

  private async parseErrorResponse(error: unknown): Promise<ErrorResponse> {
    if (error instanceof Error && "body" in error) {
      const stream = (error as { body: NodeJS.ReadableStream }).body;
      return await parseStreamBodyToJson(stream);
    }
    throw error;
  }

  private async handleApiError(error: unknown, paths: PortalPaths, zip: boolean): Promise<never> {
    if (error instanceof UnauthorizedResponseError) {
      //401
      const body = await this.parseErrorResponse(error);
      this.error(getMessageInRedColor(body.message ?? "Unauthorized access"));
    } else if (error instanceof ProblemDetailsError) {
      //400 & 403
      const body = await this.parseErrorResponse(error);
      const message = body.errors[Object.keys(body.errors)[0]][0];
      this.error(body.title + " " + (body.detail ?? "") + ":\n" + message);
    } else if (error instanceof ApiError && error.statusCode === 422) {
      //422
      await this.handleValidationError(error, paths, zip);
      this.error(
        getMessageInRedColor(
          "An error occurred during portal generation due to an issue with the input. An error report has been written at the destination path: " +
            paths.destinationFolderPath
        )
      );
    } else {
      this.error(getMessageInRedColor(error instanceof Error ? error.message : String(error)));
    }
  }

  private async handleValidationError(error: ApiError, paths: PortalPaths, zip: boolean): Promise<void> {
    const data = error.body as NodeJS.ReadableStream;
    const writeStream = fs.createWriteStream(paths.zippedPortalPath);

    await new Promise<void>((resolve, reject) => {
      data
        .pipe(writeStream)
        .on("finish", () => resolve())
        .on("error", reject);
    });

    if (!zip) {
      await extractZipFile(paths.zippedPortalPath, paths.portalFolderPath);
      await deleteFile(paths.zippedPortalPath);
    }
  }

  private async generatePortal(paths: PortalPaths, flags: GenerateFlags, configDir: string): Promise<string> {
    const pathsToIgnore = getGeneratedFilesPaths(paths.sourceFolderPath, paths.portalFolderPath);
    const zippedBuildFilePath = await validateAndZipPortalSource(
      paths.sourceFolderPath,
      path.join(paths.sourceFolderPath, ".portal_source.zip"),
      pathsToIgnore
    );

    const generatePortalParams: GeneratePortalParams = {
      zippedBuildFilePath,
      portalFolderPath: paths.portalFolderPath,
      zippedPortalPath: paths.zippedPortalPath,
      overrideAuthKey: flags["auth-key"] ?? null,
      zip: flags.zip
    };

    const generatedPortalPath = await downloadDocsPortal(generatePortalParams, configDir);
    this.prompts.displayPortalGenerationSuccessMessage();
    this.prompts.displayOutroMessage(generatedPortalPath);

    return generatedPortalPath;
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(PortalGenerate);
    const paths = await this.getPortalPaths(flags as GenerateFlags);

    try {
      await this.checkExistingPortal(paths, flags as GenerateFlags);
      this.prompts.displayPortalGenerationMessage();
      await this.validatePaths(paths);
      await this.generatePortal(paths, flags as GenerateFlags, this.config.configDir);
    } catch (error) {
      this.prompts.displayPortalGenerationErrorMessage();
      await this.handleApiError(error, paths, (flags as GenerateFlags).zip);
    }
  }
}
