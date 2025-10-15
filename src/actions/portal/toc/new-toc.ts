import { ok } from 'neverthrow';
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
  extractEndpointGroupsForToc,
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

    let sdlTocComponents: SdlTocComponents = {
      endpointGroups: new Map(),
      models: [],
      webhookGroups: new Map(),
      callbackGroups: new Map()
    };

    if (expandEndpoints || expandModels || expandWebhooks || expandCallbacks) {
      const specDirectory = buildDirectory.join('spec');

      if (!(await this.fileService.directoryExists(specDirectory))) {
        this.prompts.fallingBackToDefault();
      } else {
        const sdlResult = await withDirPath(async (tempDirectory) => {
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
            return ok(sdlTocComponents);
          }

          const endpointGroups = expandEndpoints ? extractEndpointGroupsForToc(result.value) : new Map();
          const models = expandModels ? extractModelsForToc(result.value) : [];
          const webhookGroups = expandWebhooks ? extractWebhooksForToc(result.value) : new Map();
          const callbackGroups = expandCallbacks ? extractCallbacksForToc(result.value) : new Map();

          return ok({ endpointGroups, models, webhookGroups, callbackGroups });
        });

        if (sdlResult.isErr()) {
          this.prompts.logError(sdlResult.error);
          return ActionResult.failed();
        }

        sdlTocComponents = sdlResult.value;
      }
    }

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
      sdlTocComponents.endpointGroups,
      sdlTocComponents.models,
      sdlTocComponents.webhookGroups,
      sdlTocComponents.callbackGroups,
      contentGroups
    );
    const yamlString = this.tocGenerator.transformToYaml(toc);
    const tocFilePath = await tocContext.save(yamlString);

    this.prompts.tocCreated(tocFilePath);

    return ActionResult.success();
  }
}
