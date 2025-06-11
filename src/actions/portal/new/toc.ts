import * as path from "path";
import * as fs from "fs-extra";
import { PortalNewTocPrompts } from "../../../prompts/portal/new/toc";
import { Result } from "../../../types/common/result";
import { getMessageInRedColor } from "../../../utils/utils";

const DEFAULT_TOC_FILENAME = "toc.yml";
const APIMATIC_BUILD_FILE = "APIMATIC-BUILD.json";

export class PortalNewTocAction {
  private readonly prompts: PortalNewTocPrompts;

  constructor() {
    this.prompts = new PortalNewTocPrompts();
  }

  async createToc(workingDirectory: string, destination?: string, force: boolean = false): Promise<Result<string, string>> {    

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

      //Check individual endpoints and models flag
      //Transform to SDL if spec is found in the working directory
      //Generate Yaml for endpoints and models

      //Check the existance of content directory
      //Parse all the markdown files in the content directory and generate yaml

      //Add fixed items in yaml e.g. getting-started, sdk-infra
       
      //Write the Yaml file
      await fs.writeFile(tocPath, "# Table of Contents\n", "utf8");

      this.prompts.displayTocCreationSuccessMessage();
      this.prompts.displayOutroMessage(tocPath);
      return Result.success(tocPath);
    } catch (error) {
      this.prompts.displayTocCreationErrorMessage();
      this.prompts.logError(
        getMessageInRedColor(`An error occurred while creating the toc file: \n${error}`)
      );
      return Result.failure(`Failed to create toc file: ${error}`);
    }
  }

  private async getDestinationPath(workingDirectory: string, providedDestination?: string): Promise<string> {
    if (providedDestination === undefined) {
      const inferredDestination = this.getContentFolderPath(workingDirectory);
      await fs.ensureDir(inferredDestination);
      return inferredDestination;
    }
    return providedDestination;
  }

  private async validatePath(destinationPath: string): Promise<Result<string, string>> {
    if (!(await fs.pathExists(destinationPath))) {
      return Result.failure(
        getMessageInRedColor(`Destination path ${destinationPath} does not exist.`)
      );
    }

    return Result.success("Path validated successfully.");
  }

  private async checkExistingToc(tocPath: string, force: boolean): Promise<boolean> {
    if (fs.existsSync(tocPath) && !force) {
      return await this.prompts.overwriteExistingTocPrompt();
    }
    return true;
  }

  private getContentFolderPath(workingDirectory: string): string {
    const buildFilePath = path.join(workingDirectory, APIMATIC_BUILD_FILE);
    const defaultContentFolder = path.join(workingDirectory, "content");

    if (!fs.existsSync(buildFilePath)) {
      return defaultContentFolder;
    }

    try {
      const buildFileContent = fs.readFileSync(buildFilePath, 'utf8');
      const buildConfig = JSON.parse(buildFileContent);
      
      if (buildConfig.generatePortal?.contentFolder) {
        return path.join(workingDirectory, buildConfig.generatePortal.contentFolder, "content");
      }
    } catch (error) {
      return defaultContentFolder;
    }

    return defaultContentFolder;
  }
} 