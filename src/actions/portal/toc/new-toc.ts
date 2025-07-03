import * as path from "path";
import fsExtra from "fs-extra";
import { PortalNewTocPrompts } from "../../../prompts/portal/toc/new-toc.js";
import { Result } from "../../../types/common/result.js";
import { getMessageInRedColor } from "../../../utils/utils.js";
import { SdlParser } from "../../../application/portal/toc/sdl-parser.js";
import { TocStructureGenerator } from "../../../application/portal/toc/toc-structure-generator.js";
import { TocContentParser } from "../../../application/portal/toc/toc-content-parser.js";
import { TocEndpoint, TocGroup, TocModel } from "../../../types/toc/toc.js";
import { PortalService } from "../../../infrastructure/services/portal-service.js";

const DEFAULT_TOC_FILENAME = "toc.yml";
const APIMATIC_BUILD_FILENAME = "APIMATIC-BUILD.json";

export class PortalNewTocAction {
  private readonly prompts: PortalNewTocPrompts;
  private readonly sdlParser: SdlParser;
  private readonly tocGenerator: TocStructureGenerator;
  private readonly contentParser: TocContentParser;

  constructor() {
    this.prompts = new PortalNewTocPrompts();
    this.sdlParser = new SdlParser(new PortalService());
    this.tocGenerator = new TocStructureGenerator();
    this.contentParser = new TocContentParser();
  }

  async createToc(
    workingDirectory: string,
    configDir: string,
    destination?: string,
    force: boolean = false,
    expandEndpoints: boolean = false,
    expandModels: boolean = false
  ): Promise<Result<string, string>> {
    try {
      const tocDir = await this.getDestinationPath(workingDirectory, destination);
      const tocPath = path.join(tocDir, DEFAULT_TOC_FILENAME);
      const tocCheckResult = await this.handleExistingToc(tocPath, force);
      if (!tocCheckResult.isSuccess()) {
        return tocCheckResult;
      }

      const { endpointGroups, models } = await this.extractSdlComponents(
        workingDirectory,
        configDir,
        expandEndpoints,
        expandModels
      );

      const contentGroups = await this.extractContentGroups(workingDirectory);

      const toc = this.tocGenerator.createTocStructure(
        endpointGroups,
        models,
        expandEndpoints,
        expandModels,
        contentGroups
      );
      const yamlString = this.tocGenerator.transformToYaml(toc);
      await this.writeToc(tocPath, yamlString, "utf8");

      this.prompts.displayOutroMessage(tocPath);
      return Result.success(tocPath);
    } catch (error) {
      this.prompts.logError(getMessageInRedColor(`${error}`));
      return Result.failure(`❌ An unexpected error occurred while generating the TOC file.`);
    }
  }

  private async writeToc(path: string, content: string, encoding: string) {
    await fsExtra.ensureFile(path);
    await fsExtra.writeFile(path, content, encoding);
  }

  private async handleExistingToc(tocPath: string, force: boolean): Promise<Result<string, string>> {
    const shouldContinue = await this.checkExistingToc(tocPath, force);
    if (!shouldContinue) {
      return Result.cancelled("Operation was cancelled by the user.");
    }
    return Result.success("TOC check passed.");
  }

  private async extractSdlComponents(
    workingDirectory: string,
    configDir: string,
    expandEndpoints: boolean,
    expandModels: boolean
  ): Promise<{ endpointGroups: Map<string, TocEndpoint[]>; models: TocModel[] }> {
    if (!expandEndpoints && !expandModels) {
      return { endpointGroups: new Map(), models: [] };
    }

    this.prompts.startProgressIndicatorWithMessage("Extracting endpoints and/or models from the API specification...");
    const specFolderPath = await this.getSpecFolderPath(workingDirectory);

    if (!(await fsExtra.pathExists(specFolderPath))) {
      this.prompts.stopProgressIndicatorWithMessage(`⚠️ Could not find the specification folder at: ${specFolderPath}`);
      this.prompts.displayInfo("Falling back to default TOC structure without expanded endpoints or models...");
      return { endpointGroups: new Map(), models: [] };
    }

    const sdlResult = await this.sdlParser.getTocComponentsFromSdl(specFolderPath, workingDirectory, configDir);

    if (!sdlResult.isSuccess()) {
      this.prompts.stopProgressIndicatorWithMessage(`⚠️ ${sdlResult.error!}`);
      this.prompts.displayInfo("Falling back to default TOC structure without expanded endpoints or models...");
      return { endpointGroups: new Map(), models: [] };
    }

    this.prompts.stopProgressIndicatorWithMessage(
      "✅ Successfully extracted endpoints and/or models from the specification."
    );
    return sdlResult.value!;
  }

  private async extractContentGroups(workingDirectory: string): Promise<TocGroup[]> {
    const contentFolderPath = await this.getContentFolderPath(workingDirectory);

    if (!(await fsExtra.pathExists(contentFolderPath))) {
      this.prompts.displayInfo(`⚠️ Could not locate the content folder at: ${contentFolderPath}`);
      this.prompts.displayInfo("Skipping custom content addition in TOC...");
      return [];
    }

    return await this.contentParser.parseContentFolder(contentFolderPath, contentFolderPath);
  }

  private async getDestinationPath(workingDirectory: string, providedDestination?: string): Promise<string> {
    if (providedDestination === undefined) {
      const inferredDestination = await this.getContentFolderPath(workingDirectory);
      return inferredDestination;
    }
    return providedDestination;
  }

  private async checkExistingToc(tocPath: string, force: boolean): Promise<boolean> {
    if ((await fsExtra.pathExists(tocPath)) && !force) {
      return await this.prompts.overwriteExistingTocPrompt();
    }
    return true;
  }

  private async getContentFolderPath(workingDirectory: string): Promise<string> {
    const buildFilePath = path.join(workingDirectory, APIMATIC_BUILD_FILENAME);
    const defaultContentFolder = path.join(workingDirectory, "content");

    if (!(await fsExtra.pathExists(buildFilePath))) {
      return defaultContentFolder;
    }

    try {
      const buildConfig = await fsExtra.readJson(buildFilePath, "utf8");

      if (buildConfig.generatePortal?.contentFolder == null) {
        return defaultContentFolder;
      }
      return path.join(workingDirectory, buildConfig.generatePortal.contentFolder, "content");
    } catch {
      return defaultContentFolder;
    }
  }

  private async getSpecFolderPath(workingDirectory: string): Promise<string> {
    const buildFilePath = path.join(workingDirectory, APIMATIC_BUILD_FILENAME);
    const defaultSpecFolder = path.join(workingDirectory, "spec");

    if (!(await fsExtra.pathExists(buildFilePath))) {
      return defaultSpecFolder;
    }

    try {
      const buildConfig = await fsExtra.readJson(buildFilePath, "utf8");

      if (buildConfig.generatePortal?.apiSpecPath == null) {
        return defaultSpecFolder;
      }
      return path.join(workingDirectory, buildConfig.generatePortal.apiSpecPath);
    } catch {
      return defaultSpecFolder;
    }
  }
}
