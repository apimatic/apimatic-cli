import * as path from "path";
import * as fs from "fs-extra";

import { Command, Flags } from "@oclif/core";
import {
  Client,
  DocsPortalManagementController,
  PortalGenerationForbiddenResponseError,
  PortalGenerationValidationErrorResponseError,
  UnauthorizedResponseError,
  ApiError
} from "@apimatic/sdk";

import { SDKClient } from "../../client-utils/sdk-client";
import { GeneratePortalParams } from "../../types/portal/generate";
import { downloadDocsPortal } from "../../controllers/portal/generate";
import {
  validateAndZipPortalSource,
  getGeneratedFilesPaths,
  deleteFile,
  extractZipFile,
  parseStreamBodyToJson,
  zipDirectory
} from "../../utils/utils";
import { PortalGeneratePrompts } from "../../prompts/portal/generate";

interface GenerateFlags {
  folder: string;
  destination: string;
  force: boolean;
  zip: boolean;
  "auth-key": string;
}

interface PortalPaths {
  sourceFolderPath: string;
  destinationFolderPath: string;
  portalFolderPath: string;
  zippedPortalPath: string;
  zippedBuildFilePath: string;
}

export default class PortalGenerate extends Command {
  static description =
    "Generate and download a static API Documentation portal. Requires an input directory containing API specifications, a config file and optionally, markdown guides. For details, refer to the [documentation](https://docs.apimatic.io/platform-api/#/http/guides/generating-on-prem-api-portal/build-file-reference)";

  static flags = {
    folder: Flags.string({
      parse: async (input) => path.resolve(input),
      default: "./",
      description: "path to the input directory containing API specifications and config files"
    }),
    destination: Flags.string({
      parse: async (input) => path.resolve(input),
      default: path.resolve("./"),
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
      portalFolderPath: path.join(flags.destination, "generated_portal"),
      zippedPortalPath: path.join(flags.destination, ".generated_portal.zip"),
      zippedBuildFilePath: await zipDirectory(flags.folder, flags.destination)
    };
  }

  private async validatePaths(paths: PortalPaths): Promise<void> {
    if (!(await fs.pathExists(paths.sourceFolderPath))) {
      throw new Error(`Portal build folder ${paths.sourceFolderPath} does not exist.`);
    }
    if (!(await fs.pathExists(path.dirname(paths.portalFolderPath)))) {
      throw new Error(`Destination path ${path.dirname(paths.portalFolderPath)} does not exist.`);
    }
  }

  private async checkExistingPortal(paths: PortalPaths, flags: GenerateFlags): Promise<void> {
    if (fs.existsSync(paths.portalFolderPath) && !flags.force && !flags.zip) {
      await this.prompts.existingDestinationPortalFolderPrompt();
    } else if (fs.existsSync(paths.zippedPortalPath) && !flags.force && flags.zip) {
      await this.prompts.existingDestinationPortalZipPrompt();
    }
  }

  private async handleApiError(
    error: unknown,
    paths: PortalPaths,
    zip: boolean
  ): Promise<never> {
    if (error instanceof PortalGenerationValidationErrorResponseError) {
      // 400
      const validationError = error as PortalGenerationValidationErrorResponseError;
      const body = await parseStreamBodyToJson(validationError.body as NodeJS.ReadableStream);
      const key = Object.keys(body.errors)[0];
      const message = body.errors[key][0];
      this.error(body.title + "\n" + message);
    } else if (error instanceof UnauthorizedResponseError) {
      // 401
      const unauthorizedError = error as UnauthorizedResponseError;
      const body = await parseStreamBodyToJson(unauthorizedError.body as NodeJS.ReadableStream);
      this.error(body.message);
    } else if (error instanceof PortalGenerationForbiddenResponseError) {
      // 403
      const forbiddenError = error as PortalGenerationForbiddenResponseError;
      const body = await parseStreamBodyToJson(forbiddenError.body as NodeJS.ReadableStream);
      const message = body.errors[Object.keys(body.errors)[0]][0];
      this.error(body.title + " " + body.detail + ":\n" + message);
    } else if (error instanceof ApiError && error.statusCode === 422) {
      // 422
      const data = error.body as NodeJS.ReadableStream;
      // Create a write stream and pipe the response data to it
      const writeStream = fs.createWriteStream(paths.zippedPortalPath);
      await new Promise((resolve, reject) => {
        data.pipe(writeStream).on("finish", resolve).on("error", reject);
      });
      await deleteFile(paths.zippedBuildFilePath);

      if (!zip) {
        // Extract the zip file if zip flag is false
        await extractZipFile(paths.zippedPortalPath, paths.portalFolderPath);
        // Clean up the zip file after extraction
        await deleteFile(paths.zippedPortalPath);
      }

      this.error(
        "An error occurred during portal generation due to an issue with the input. An error report has been written at the destination path: " +
          paths.destinationFolderPath
      );
    } else {
      this.error(error instanceof Error ? error.message : String(error));
    }
  }

  private async generatePortal(paths: PortalPaths, flags: GenerateFlags, configDir: string): Promise<string> {
    const client: Client = await SDKClient.getInstance().getClient(flags["auth-key"] ?? null, configDir);
    const docsPortalController = new DocsPortalManagementController(client);

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
      docsPortalController,
      overrideAuthKey: flags["auth-key"] ?? null,
      zip: flags.zip
    };

    this.prompts.displayPortalGenerationMessage();
    const generatedPortalPath = await downloadDocsPortal(generatePortalParams, configDir);
    this.prompts.displayPortalGenerationSuccessMessage();
    this.prompts.displayOutroMessage(generatedPortalPath);

    return generatedPortalPath;
  }

  async run() {
    const { flags } = await this.parse(PortalGenerate);
    const paths = await this.getPortalPaths(flags as GenerateFlags);
    try {
      await this.validatePaths(paths);
      await this.checkExistingPortal(paths, flags as GenerateFlags);
      await this.generatePortal(paths, flags as GenerateFlags, this.config.configDir);
    } catch (error) {
      this.prompts.displayPortalGenerationErrorMessage();
      await this.handleApiError(error, paths, (flags as GenerateFlags).zip);
    }
  }
}
