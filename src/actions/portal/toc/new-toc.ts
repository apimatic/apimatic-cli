import { Result, ok, err } from "neverthrow";
import { PortalNewTocPrompts } from "../../../prompts/portal/toc/new-toc.js";
import { TocStructureGenerator } from "../../../application/portal/toc/toc-structure-generator.js";
import { TocEndpoint, TocGroup, TocModel } from "../../../types/toc/toc.js";
import { DirectoryPath } from "../../../types/file/directoryPath.js";
import { CommandMetadata } from "../../../types/common/command-metadata.js";
import { ActionResult } from "../../action-result.js";
import { TocContext } from "../../../types/toc-context.js";
import { SpecContext } from "../../../types/spec-context.js";
import { FileService } from "../../../infrastructure/file-service.js";
import { FilePath } from "../../../types/file/filePath.js";

class ContentContext {
  private readonly fileService = new FileService();

  constructor(private readonly contentDirectory: DirectoryPath) {}

  public async exists(): Promise<boolean> {
    return this.fileService.directoryExists(this.contentDirectory);
  }

  public async extractContentGroups(): Promise<Result<TocGroup[], string>> {
    try {
      const directory = await this.fileService.getDirectory(this.contentDirectory);
      const groups = await directory.parseContentFolder(this.contentDirectory);
      return ok(groups);
    } catch (error) {
      return err(`Failed to extract content groups: ${(error as Error).message}`);
    }
  }
}

type SdlComponents = {
  endpointGroups: Map<string, TocEndpoint[]>;
  models: TocModel[];
};

export class PortalNewTocAction {
  private readonly prompts: PortalNewTocPrompts = new PortalNewTocPrompts();
  private readonly tocGenerator: TocStructureGenerator = new TocStructureGenerator();

  constructor(private readonly configDirectory: DirectoryPath, private readonly commandMetadata: CommandMetadata) {}

  public async execute(
    buildDirectory: DirectoryPath,
    tocDirectory?: DirectoryPath,
    force: boolean = false,
    expandEndpoints: boolean = false,
    expandModels: boolean = false
  ): Promise<ActionResult> {
    const tocDir = tocDirectory ?? buildDirectory.join("content");
    const tocContext = new TocContext(tocDir);

    if (!force && (await tocContext.exists()) && !(await this.prompts.overwriteToc(tocContext.tocPath))) {
      this.prompts.tocFileAlreadyExists();
      return ActionResult.cancelled();
    }

    const sdlResult = await this.extractSdlComponents(buildDirectory, expandEndpoints, expandModels);
    if (sdlResult.isErr()) {
      this.prompts.logError(sdlResult.error);
      return ActionResult.failed();
    }

    const contentResult = await this.extractContentGroups(buildDirectory);
    if (contentResult.isErr()) {
      this.prompts.logError(contentResult.error);
      return ActionResult.failed();
    }

    const tocResult = await 
    this.prompts.generateTOC(
      this.generateToc(
        tocContext,
        sdlResult.value.endpointGroups,
        sdlResult.value.models,
        expandEndpoints,
        expandModels,
        contentResult.value
      )
    );

    if (tocResult.isErr()) {
      this.prompts.logError(tocResult.error);
      return ActionResult.failed();
    }
    return ActionResult.success();
  }

  private async extractSdlComponents(
    buildDirectory: DirectoryPath,
    expandEndpoints: boolean,
    expandModels: boolean
  ): Promise<Result<SdlComponents, string>> {
    if (!expandEndpoints && !expandModels) {
      return ok({ endpointGroups: new Map(), models: [] });
    }

    const specDirectory = buildDirectory.join("spec");
    const specContext = new SpecContext(specDirectory);

    const isValid = await specContext.validate();
    if (!isValid) {
      this.prompts.specNotFound();
      this.prompts.fallingBackToDefault();
      return ok({ endpointGroups: new Map(), models: [] });
    }

    try {
      const extractionPromise = specContext.extractSdlComponents(this.configDirectory, this.commandMetadata);

      const response = await this.prompts.extractSdlComponents(extractionPromise);

      if (response.isErr()) {
        this.prompts.sdlComponentsExtractionFailed();
        this.prompts.fallingBackToDefault();
        return ok({ endpointGroups: new Map(), models: [] });
      }

      return ok(response.value);
    } catch {
      this.prompts.sdlComponentsExtractionFailed();
      this.prompts.fallingBackToDefault();
      return ok({ endpointGroups: new Map(), models: [] });
    }
  }

  private async extractContentGroups(buildDirectory: DirectoryPath): Promise<Result<TocGroup[], string>> {
    const contentDirectory = buildDirectory.join("content");
    const contentContext = new ContentContext(contentDirectory);

    const exists = await contentContext.exists();
    if (!exists) {
      this.prompts.contentDirectoryNotFound(contentDirectory);
      return ok([]);
    }

    const contentGroupsResult = await contentContext.extractContentGroups();
    if (contentGroupsResult.isErr()) {
      this.prompts.contentGroupsExtractionFailed();
      return ok([]);
    }

    return contentGroupsResult;
  }

  private async generateToc(
    tocContext: TocContext,
    endpointGroups: Map<string, TocEndpoint[]>,
    models: TocModel[],
    expandEndpoints: boolean,
    expandModels: boolean,
    contentGroups: TocGroup[]
  ): Promise<Result<FilePath, string>> {
    try {
      const toc = this.tocGenerator.createTocStructure(
        endpointGroups,
        models,
        expandEndpoints,
        expandModels,
        contentGroups
      );

      const yamlString = this.tocGenerator.transformToYaml(toc);
      const tocFilePath = await tocContext.save(yamlString);

      return ok(tocFilePath);
    } catch (error) {
      return err(`Failed to generate TOC: ${(error as Error).message}`);
    }
  }
}
