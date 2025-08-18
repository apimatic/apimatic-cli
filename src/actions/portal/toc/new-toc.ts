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
import { DirectoryPath } from "../../../types/file/directoryPath.js";
import { FilePath } from "../../../types/file/filePath.js";
import { FileName } from "../../../types/file/fileName.js";
import { BuildContext } from "../../../types/build-context.js";

export class PortalNewTocAction {
  private readonly prompts: PortalNewTocPrompts;
  private readonly sdlParser: SdlParser;
  private readonly tocGenerator: TocStructureGenerator;
  private readonly contentParser: TocContentParser;
  private readonly DEFAULT_TOC_FILENAME: string = "toc.yml" as const;
  private readonly APIMATIC_BUILD_FILENAME: string = "APIMATIC-BUILD.json" as const;

  constructor() {
    this.prompts = new PortalNewTocPrompts();
    this.sdlParser = new SdlParser(new PortalService());
    this.tocGenerator = new TocStructureGenerator();
    this.contentParser = new TocContentParser();
  }

  public async createToc(
    buildDirectory: DirectoryPath,
    configDir: string,
    commandName: string,
    shell: string,
    tocDirectory?: DirectoryPath,
    force: boolean = false,
    expandEndpoints: boolean = false,
    expandModels: boolean = false
  ): Promise<Result<string, string>> {
    try {
      const tocDir = await this.getDestinationPath(buildDirectory, tocDirectory);
      const tocPath = new FilePath(tocDir, new FileName(this.DEFAULT_TOC_FILENAME));
      const tocCheckResult = await this.handleExistingToc(tocPath, force);
      if (!tocCheckResult.isSuccess()) {
        return Result.cancelled(tocCheckResult.value!);
      }

      const { endpointGroups, models } = await this.extractSdlComponents(
        buildDirectory,
        configDir,
        commandName,
        shell,
        expandEndpoints,
        expandModels
      );

      const contentGroups = await this.extractContentGroups(buildDirectory);

      const toc = this.tocGenerator.createTocStructure(
        endpointGroups,
        models,
        expandEndpoints,
        expandModels,
        contentGroups
      );
      const yamlString = this.tocGenerator.transformToYaml(toc);
      await this.writeToc(tocPath.toString(), yamlString, "utf8");

      this.prompts.displayOutroMessage(tocPath);
      return Result.success(tocPath.toString());
    } catch (error) {
      this.prompts.logError(getMessageInRedColor(`${(error as Error).message}`));
      return Result.failure(`An unexpected error occurred while generating the TOC file.`);
    }
  }

  private async writeToc(path: string, content: string, encoding: string) {
    await fsExtra.ensureFile(path);
    await fsExtra.writeFile(path, content, encoding);
  }

  private async handleExistingToc(tocPath: FilePath, force: boolean): Promise<Result<string, string>> {
    const shouldContinue = await this.checkExistingToc(tocPath, force);
    if (!shouldContinue) {
      return Result.cancelled("Operation was cancelled by the user.");
    }
    return Result.success("TOC check passed.");
  }

  private async extractSdlComponents(
    buildDirectory: DirectoryPath,
    configDir: string,
    commandName: string,
    shell: string,
    expandEndpoints: boolean,
    expandModels: boolean
  ): Promise<{ endpointGroups: Map<string, TocEndpoint[]>; models: TocModel[] }> {
    if (!expandEndpoints && !expandModels) {
      return { endpointGroups: new Map(), models: [] };
    }

    this.prompts.startProgressIndicatorWithMessage("Extracting endpoints and/or models from the API specification...");
    const specFolderPath = await this.getSpecFolderPath(buildDirectory);

    if (!(await fsExtra.pathExists(specFolderPath))) {
      this.prompts.stopProgressIndicatorWithMessage(`⚠️ Could not find the specification folder at: ${specFolderPath}`);
      this.prompts.displayInfo("Falling back to default TOC structure without expanded endpoints or models...");
      return { endpointGroups: new Map(), models: [] };
    }

    const sdlResult = await this.sdlParser.getTocComponentsFromSdl(specFolderPath, configDir, commandName, shell);

    if (!sdlResult.isSuccess()) {
      this.prompts.stopProgressIndicatorWithMessage(`⚠️ ${sdlResult.error!}`);
      this.prompts.displayInfo("Falling back to default TOC structure without expanded endpoints or models...");
      return { endpointGroups: new Map(), models: [] };
    }

    this.prompts.stopProgressIndicatorWithMessage(
      "Successfully extracted endpoints and/or models from the specification."
    );
    return sdlResult.value!;
  }

  private async extractContentGroups(buildDirectory: DirectoryPath): Promise<TocGroup[]> {
    const contentFolderPath = await this.getContentFolderPath(buildDirectory);

    if (!(await fsExtra.pathExists(contentFolderPath.toString()))) {
      this.prompts.displayInfo(`⚠️ Could not locate the content folder at: ${contentFolderPath}`);
      this.prompts.displayInfo("Skipping custom content addition in TOC...");
      return [];
    }

    return await this.contentParser.parseContentFolder(contentFolderPath.toString(), contentFolderPath.toString());
  }

  private async getDestinationPath(
    buildDirectory: DirectoryPath,
    providedTocDirectory?: DirectoryPath
  ): Promise<DirectoryPath> {
    if (providedTocDirectory === undefined) {
      const inferredDestination = await this.getContentFolderPath(buildDirectory);
      return inferredDestination;
    }
    return providedTocDirectory;
  }

  private async checkExistingToc(tocPath: FilePath, force: boolean): Promise<boolean> {
    if ((await fsExtra.pathExists(tocPath.toString())) && !force) {
      return await this.prompts.overwriteExistingTocPrompt(tocPath);
    }
    return true;
  }

  private async getContentFolderPath(buildDirectory: DirectoryPath): Promise<DirectoryPath> {
    const buildContext = new BuildContext(buildDirectory);
    const defaultContentFolder = buildDirectory.join("content");

    if (!(await buildContext.validate())) {
      return defaultContentFolder;
    }

    try {
      const buildConfig = await buildContext.getBuildFileContents();
      if (buildConfig.generatePortal?.contentFolder == null) {
        return defaultContentFolder;
      }
      return buildDirectory.join(buildConfig.generatePortal.contentFolder).join("content");
    } catch {
      return defaultContentFolder;
    }
  }

  private async getSpecFolderPath(buildDirectory: DirectoryPath): Promise<string> {
    const buildFilePath = path.join(buildDirectory.toString(), this.APIMATIC_BUILD_FILENAME);
    const defaultSpecFolder = path.join(buildDirectory.toString(), "spec");

    if (!(await fsExtra.pathExists(buildFilePath))) {
      return defaultSpecFolder;
    }

    try {
      const buildConfig = await fsExtra.readJson(buildFilePath, "utf8");

      if (buildConfig.generatePortal?.apiSpecPath == null) {
        return defaultSpecFolder;
      }
      return path.join(buildDirectory.toString(), buildConfig.generatePortal.apiSpecPath);
    } catch {
      return defaultSpecFolder;
    }
  }
}
