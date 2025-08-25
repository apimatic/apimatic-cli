import { PortalNewTocPrompts } from "../../../prompts/portal/toc/new-toc.js";
import { getMessageInRedColor } from "../../../utils/utils.js";
import { TocStructureGenerator } from "../../../application/portal/toc/toc-structure-generator.js";
import { TocEndpoint, TocGroup, TocModel } from "../../../types/toc/toc.js";
import { DirectoryPath } from "../../../types/file/directoryPath.js";
import { BuildContext } from "../../../types/build-context.js";
import { CommandMetadata } from "../../../types/common/command-metadata.js";
import { ActionResult } from "../../action-result.js";
import { TocContext } from "../../../types/toc-context.js";
import { SpecContext } from "../../../types/spec-context.js";
import { FileService } from "../../../infrastructure/file-service.js";

export class PortalNewTocAction {
  private readonly prompts: PortalNewTocPrompts = new PortalNewTocPrompts();
  private readonly tocGenerator: TocStructureGenerator = new TocStructureGenerator();
  private readonly fileService = new FileService();

  constructor(private readonly configDirectory: DirectoryPath, private readonly commandMetadata: CommandMetadata) {
  }

  public async execute(
    buildDirectory: DirectoryPath,
    tocDirectory?: DirectoryPath,
    force: boolean = false,
    expandEndpoints: boolean = false,
    expandModels: boolean = false
  ): Promise<ActionResult> {
      const tocDir = tocDirectory ?? buildDirectory.join("content");
      const tocContext = new TocContext(tocDir);      
      const specDirectory = buildDirectory.join("spec");
      const specContext = new SpecContext(specDirectory);

      if (!force && (await tocContext.exists()) && !(await this.prompts.overwriteToc(tocContext.tocPath))) {
        this.prompts.tocFileAlreadyExists();
        return ActionResult.cancelled();
      }

      let endpointGroups = new Map<string, TocEndpoint[]>();
      let models: TocModel[] = [];
      if (expandEndpoints || expandModels) {
        if (!await specContext.validate()) {
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
  
      const buildContext = new BuildContext(buildDirectory);
      if(!await buildContext.contentDirectoryExists()) {
        this.prompts.contentDirectoryNotFound();
      }

      const result = await buildContext.extractContentGroups();

      let contentGroups: TocGroup[] = [];

      if (result.isErr()) {
        this.prompts.contentGroupsExtractionFailed(result.error);
      } else {
        contentGroups = result.value;
      }

      const toc = this.tocGenerator.createTocStructure(
        endpointGroups,
        models,
        expandEndpoints,
        expandModels,
        contentGroups
      );
      const yamlString = this.tocGenerator.transformToYaml(toc);
      await tocContext.save(yamlString);

      this.prompts.displayOutroMessage(tocPath);

      return ActionResult.success();
  }

}
