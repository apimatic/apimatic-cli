import { PortalNewTocPrompts } from "../../../prompts/portal/toc/new-toc.js";
import { TocStructureGenerator } from "../../../application/portal/toc/toc-structure-generator.js";
import { TocEndpoint, TocGroup, TocModel } from "../../../types/toc/toc.js";
import { DirectoryPath } from "../../../types/file/directoryPath.js";
import { CommandMetadata } from "../../../types/common/command-metadata.js";
import { ActionResult } from "../../action-result.js";
import { TocContext } from "../../../types/toc-context.js";
import { SpecContext } from "../../../types/spec-context.js";
import { FileService } from "../../../infrastructure/file-service.js";

class ContentContext {
  private readonly fileService = new FileService();

  constructor(private readonly contentDirectory: DirectoryPath) {}

  public async exists() {
    return this.fileService.directoryExists(this.contentDirectory);
  }

  public async extractContentGroups(): Promise<TocGroup[]> {
    const directory = await this.fileService.getDirectory(this.contentDirectory);
    return await directory.parseContentFolder(this.contentDirectory);
  }
}

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

    const specDirectory = buildDirectory.join("spec");
    const specContext = new SpecContext(specDirectory);

    if (expandEndpoints || expandModels) {
      if (!(await specContext.validate())) {
        this.prompts.specNotFound();
      } else {
        const response = await this.prompts.extractSdlComponents(
          specContext.extractSdlComponents(this.configDirectory, this.commandMetadata)
        );
        if (response.isErr()) {
          this.prompts.sdlComponentsExtractionFailed();
        }
      }
    }

    const contentDirectory = buildDirectory.join("content");
    const contentContext = new ContentContext(contentDirectory);
    if (!(await contentContext.exists())) {
      this.prompts.contentDirectoryNotFound(contentDirectory);
      return ActionResult.failed();
    }

    const contentGroups = await contentContext.extractContentGroups();
    //   this.prompts.contentGroupsExtractionFailed(result.error);

    let models: TocModel[] = [];

    let endpointGroups = new Map<string, TocEndpoint[]>();


    const toc = this.tocGenerator.createTocStructure(
      endpointGroups,
      models,
      expandEndpoints,
      expandModels,
      contentGroups
    );
    const yamlString = this.tocGenerator.transformToYaml(toc);
    const tocFilePath = await tocContext.save(yamlString);
    this.prompts.displayOutroMessage(tocFilePath);

    return ActionResult.success();
  }
}
