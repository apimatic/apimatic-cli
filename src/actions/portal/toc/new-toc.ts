import { ok } from "neverthrow";
import { PortalNewTocPrompts } from "../../../prompts/portal/toc/new-toc.js";
import { TocStructureGenerator } from "../../../application/portal/toc/toc-structure-generator.js";
import { TocGroup } from "../../../types/toc/toc.js";
import { DirectoryPath } from "../../../types/file/directoryPath.js";
import { CommandMetadata } from "../../../types/common/command-metadata.js";
import { ActionResult } from "../../action-result.js";
import { TocContext } from "../../../types/toc-context.js";
import { FileService } from "../../../infrastructure/file-service.js";
import { BuildContext } from "../../../types/build-context.js";
import {
  extractCallbacksForToc,
  extractEndpointGroupsForToc,
  extractModelsForToc,
  extractWebhooksForToc,
  Sdl,
  SdlTocComponents
} from "../../../types/sdl/sdl.js";
import { withDirPath } from "../../../infrastructure/tmp-extensions.js";
import { TempContext } from "../../../types/temp-context.js";
import { PortalService } from "../../../infrastructure/services/portal-service.js";

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
    const contentDirectory = buildDirectory.join(buildConfig.generatePortal?.contentFolder ?? "content");

    const tocDir = tocDirectory ?? contentDirectory;
    const tocContext = new TocContext(tocDir);

    if (!force && (await tocContext.exists()) && !(await this.prompts.overwriteToc(tocContext.tocPath))) {
      this.prompts.tocFileAlreadyExists();
      return ActionResult.cancelled();
    }

    const sdlTocComponents = await tryExtractingSdlTocComponents(
      buildDirectory,
      expandEndpoints,
      expandModels,
      expandWebhooks,
      expandCallbacks,
      this.fileService,
      this.prompts,
      this.portalService,
      this.configDirectory,
      this.commandMetadata
    );

    if (!sdlTocComponents) {
      return ActionResult.failed();
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

async function tryExtractingSdlTocComponents(
  buildDirectory: DirectoryPath,
  expandEndpoints: boolean,
  expandModels: boolean,
  expandWebhooks: boolean,
  expandCallbacks: boolean,
  fileService: FileService,
  prompts: PortalNewTocPrompts,
  portalService: PortalService,
  configDirectory: DirectoryPath,
  commandMetadata: CommandMetadata
): Promise<SdlTocComponents | false> {
  let sdlComponents: SdlTocComponents = {
    endpointGroups: new Map(),
    models: [],
    webhookGroups: new Map(),
    callbackGroups: new Map()
  };

  if (!(expandEndpoints || expandModels || expandWebhooks || expandCallbacks)) {
    return sdlComponents;
  }

  const specDirectory = buildDirectory.join("spec");

  if (!(await fileService.directoryExists(specDirectory))) {
    prompts.fallingBackToDefault();
    return sdlComponents;
  }

  const sdlResult = await withDirPath(async (tempDirectory) => {
    const tempContext = new TempContext(tempDirectory);
    const specZipPath = await tempContext.zip(specDirectory);
    const specFileStream = await fileService.getStream(specZipPath);
    const result = await prompts.extractComponents(
      portalService.generateSdl(specFileStream, configDirectory, commandMetadata),
      expandEndpoints,
      expandModels,
      expandWebhooks,
      expandCallbacks
    );
    specFileStream.close();
    if (result.isErr()) {
      prompts.fallingBackToDefault();
      return ok(sdlComponents);
    }

    const sdl = result.value;
    const endpointGroups = expandEndpoints ? extractEndpointGroupsForToc(sdl) : new Map();
    const models = expandModels ? extractModelsForToc(sdl) : [];
    const webhookGroups = expandWebhooks ? extractWebhooksForToc(sdl) : new Map();
    const callbackGroups = expandCallbacks ? extractCallbacksForToc(sdl) : new Map();

    return ok({ endpointGroups, models, webhookGroups, callbackGroups });
  });

  if (sdlResult.isErr()) {
    prompts.logError(sdlResult.error);
    return false;
  }

  return sdlResult.value;
}
