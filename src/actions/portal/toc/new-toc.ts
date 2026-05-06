import { PortalNewTocPrompts } from '../../../prompts/portal/toc/new-toc.js';
import { TocStructureGenerator } from '../../../application/portal/toc/toc-structure-generator.js';
import { TocGroup } from '../../../types/toc/toc.js';
import { DirectoryPath } from '../../../types/file/directoryPath.js';
import { CommandMetadata } from '../../../types/common/command-metadata.js';
import { ActionResult } from '../../action-result.js';
import { TocContext } from '../../../types/toc-context.js';
import { FileService } from '../../../infrastructure/file-service.js';
import { BuildContext } from '../../../types/build-context.js';
import {
  extractCallbacksForToc,
  extractContainerModelsForToc,
  extractEndpointGroupsForToc,
  extractInputModelsForToc,
  extractModelsForToc,
  extractWebhooksForToc,
  SdlTocComponents
} from '../../../types/sdl/sdl.js';
import { withDirPath } from '../../../infrastructure/tmp-extensions.js';
import { TempContext } from '../../../types/temp-context.js';
import { PortalService } from '../../../infrastructure/services/portal-service.js';

export class ContentContext {
  private readonly fileService = new FileService();

  constructor(private readonly contentDirectory: DirectoryPath) {}

  public async exists(): Promise<boolean> {
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
  private readonly fileService = new FileService();
  private readonly portalService = new PortalService();

  constructor(private readonly configDirectory: DirectoryPath, private readonly commandMetadata: CommandMetadata) {}

  public async execute(
    buildDirectory: DirectoryPath,
    tocDirectory?: DirectoryPath,
    force: boolean = false,
    expandEndpoints: boolean = false,
    expandModels: boolean = false,
    expandWebhooks: boolean = false,
    expandCallbacks: boolean = false
  ): Promise<ActionResult> {
    // Validate build directory
    const buildContext = new BuildContext(buildDirectory);
    if (!(await buildContext.validate())) {
      this.prompts.invalidBuildDirectory(buildDirectory);
      return ActionResult.failed();
    }
    const buildConfig = await buildContext.getBuildFileContents();
    const contentDirectory = buildDirectory.join(buildConfig.generatePortal?.contentFolder ?? 'content');

    const tocDir = tocDirectory ?? contentDirectory;
    const tocContext = new TocContext(tocDir);

    if (!force && (await tocContext.exists()) && !(await this.prompts.overwriteToc(tocContext.tocPath))) {
      this.prompts.tocFileAlreadyExists();
      return ActionResult.cancelled();
    }

    const sdlTocComponents: SdlTocComponents = await (async () => {
      const defaultComponents = {
        endpointGroups: new Map(),
        models: [],
        containerModels: [],
        inputModels : [],
        webhookGroups: new Map(),
        callbackGroups: new Map()
      };

      const specDirectory = buildDirectory.join('spec');

      if (!(await this.fileService.directoryExists(specDirectory))) {
        this.prompts.fallingBackToDefault();
        return defaultComponents;
      }

      return await withDirPath(async (tempDirectory) => {
        const tempContext = new TempContext(tempDirectory);
        const specZipPath = await tempContext.zip(specDirectory);
        const specFileStream = await this.fileService.getStream(specZipPath);
        const result = await this.prompts.extractComponents(
          this.portalService.generateSdl(specFileStream, this.configDirectory, this.commandMetadata),
          expandEndpoints,
          expandModels,
          expandWebhooks,
          expandCallbacks
        );
        specFileStream.close();
        if (result.isErr()) {
          this.prompts.fallingBackToDefault();
          return defaultComponents;
        }

        return {
          endpointGroups: extractEndpointGroupsForToc(result.value),
          models: extractModelsForToc(result.value),
          containerModels : extractContainerModelsForToc(result.value),
          inputModels : extractInputModelsForToc(result.value),
          webhookGroups: extractWebhooksForToc(result.value),
          callbackGroups: extractCallbacksForToc(result.value)
        };
      });
    })();
    const contentContext = new ContentContext(contentDirectory);
    const contentExists = await contentContext.exists();

    let contentGroups: TocGroup[];
    if (!contentExists) {
      this.prompts.contentDirectoryNotFound(contentDirectory);
      contentGroups = [];
    } else {
      contentGroups = await contentContext.extractContentGroups();
    }

    const toc = this.tocGenerator.createTocStructure(
      { data: sdlTocComponents.endpointGroups, expand: expandEndpoints },
      { modelsData: sdlTocComponents.models,
         containerModelsData: sdlTocComponents.containerModels,
          inputModelsData: sdlTocComponents.inputModels, expand: expandModels 
      },
      { data: sdlTocComponents.webhookGroups, expand: expandWebhooks },
      { data: sdlTocComponents.callbackGroups, expand: expandCallbacks },
      contentGroups
    );
    const yamlString = this.tocGenerator.transformToYaml(toc);
    const tocFilePath = await tocContext.save(yamlString);

    this.prompts.tocCreated(tocFilePath);

    return ActionResult.success();
  }
}
