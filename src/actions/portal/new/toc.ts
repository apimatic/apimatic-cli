import * as path from "path";
import * as fs from "fs-extra";
import { PortalNewTocPrompts } from "../../../prompts/portal/new/toc";
import { Result } from "../../../types/common/result";
import { getMessageInRedColor } from "../../../utils/utils";
import { SdlParser } from "../../../application/portal/new/toc/sdl-parser";
import { TocStructureGenerator } from "../../../application/portal/new/toc/toc-structure-generator";
import { TocContentParser } from "../../../application/portal/new/toc/toc-content-parser";
import { TocEndpoint, TocModel } from "../../../types/toc/toc";

const DEFAULT_TOC_FILENAME = "toc.yml";
const APIMATIC_BUILD_FILE = "APIMATIC-BUILD.json";

export class PortalNewTocAction {
  private readonly prompts: PortalNewTocPrompts;
  private readonly sdlParser: SdlParser;
  private readonly tocGenerator: TocStructureGenerator;
  private readonly contentParser: TocContentParser;

  constructor() {
    this.prompts = new PortalNewTocPrompts();
    this.sdlParser = new SdlParser();
    this.tocGenerator = new TocStructureGenerator();
    this.contentParser = new TocContentParser();
  }

  async createToc(
    workingDirectory: string,
    configDir: string,
    destination?: string,
    force: boolean = false,
    useIndividualEndpoints: boolean = false,
    useIndividualModels: boolean = false
  ): Promise<Result<string, string>> {
    try {
      const finalDestination = await this.getDestinationPath(workingDirectory, destination);
      const validationResult = await this.validatePath(finalDestination);

      if (validationResult.isFailed()) {
        return Result.failure(validationResult.error!);
      }

      const tocPath = path.join(finalDestination, DEFAULT_TOC_FILENAME);
      const shouldContinue = await this.checkExistingToc(tocPath, force);

      if (!shouldContinue) {
        return Result.cancelled("Operation was cancelled by the user");
      }

      this.prompts.displayTocCreationMessage();

      let endpointGroups = new Map<string, TocEndpoint[]>();
      let models: TocModel[] = [];

      if (useIndividualEndpoints || useIndividualModels) {
        const specFolderPath = await this.getSpecFolderPath(workingDirectory);
        const sdlResult = await this.sdlParser.getTocComponentsFromSdl(
          specFolderPath,
          workingDirectory,
          configDir
        );
        endpointGroups = sdlResult.endpointGroups;
        models = sdlResult.models;
      }

      const contentFolderPath = await this.getContentFolderPath(workingDirectory);
      const contentGroups = await this.contentParser.parseContentFolder(contentFolderPath, contentFolderPath);

      const toc = this.tocGenerator.createTocStructure(
        endpointGroups,
        models,
        useIndividualEndpoints,
        useIndividualModels,
        contentGroups
      );
      const yamlString = this.tocGenerator.transformToYaml(toc);

      await fs.writeFile(tocPath, yamlString, "utf8");

      this.prompts.displayTocCreationSuccessMessage();
      this.prompts.displayOutroMessage(tocPath);
      return Result.success(tocPath);
    } catch (error) {
      this.prompts.displayTocCreationErrorMessage();
      this.prompts.logError(getMessageInRedColor(`An error occurred while creating the toc file: \n${error}`));
      return Result.failure(`Failed to create toc file: ${error}`);
    }
  }

  private async getDestinationPath(workingDirectory: string, providedDestination?: string): Promise<string> {
    if (providedDestination === undefined) {
      const inferredDestination = await this.getContentFolderPath(workingDirectory);
      await fs.ensureDir(inferredDestination);
      return inferredDestination;
    }
    return providedDestination;
  }

  private async validatePath(destinationPath: string): Promise<Result<string, string>> {
    if (!(await fs.pathExists(destinationPath))) {
      return Result.failure(getMessageInRedColor(`Destination path ${destinationPath} does not exist.`));
    }
    return Result.success("Path validated successfully.");
  }

  private async checkExistingToc(tocPath: string, force: boolean): Promise<boolean> {
    if ((await fs.pathExists(tocPath)) && !force) {
      return await this.prompts.overwriteExistingTocPrompt();
    }
    return true;
  }

  private async getContentFolderPath(workingDirectory: string): Promise<string> {
    const buildFilePath = path.join(workingDirectory, APIMATIC_BUILD_FILE);
    const defaultContentFolder = path.join(workingDirectory, "content");

    if (!(await fs.pathExists(buildFilePath))) {
      return defaultContentFolder;
    }

    try {
      const buildFileContent = await fs.readFile(buildFilePath, "utf8");
      const buildConfig = JSON.parse(buildFileContent);

      if (buildConfig.generatePortal?.contentFolder) {
        return path.join(workingDirectory, buildConfig.generatePortal.contentFolder, "content");
      }
    } catch (error) {
      return defaultContentFolder;
    }

    return defaultContentFolder;
  }

  private async getSpecFolderPath(workingDirectory: string): Promise<string> {
    const buildFilePath = path.join(workingDirectory, APIMATIC_BUILD_FILE);
    const defaultSpecFolder = path.join(workingDirectory, "spec");

    if (!(await fs.pathExists(buildFilePath))) {
      return defaultSpecFolder;
    }

    try {
      const buildFileContent = await fs.readFile(buildFilePath, "utf8");
      const buildConfig = JSON.parse(buildFileContent);

      if (buildConfig.generatePortal?.contentFolder) {
        return path.join(workingDirectory, buildConfig.generatePortal.apiSpecPath);
      }
    } catch (error) {
      return defaultSpecFolder;
    }

    return defaultSpecFolder;
  }
}
