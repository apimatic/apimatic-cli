import { PortalService } from "../../../infrastructure/services/portal-service.js";
import { TocEndpoint, TocModel } from "../../../types/toc/toc.js";
import { Result } from "../../../types/common/result.js";
import { Sdl, SdlEndpoint, SdlModel } from "../../../types/sdl/sdl.js";
import { DirectoryPath } from "../../../types/file/directoryPath.js";
import { withDirPath } from "../../../infrastructure/tmp-extensions.js";
import { ZipService } from "../../../infrastructure/zip-service.js";
import { FileService } from "../../../infrastructure/file-service.js";
import { CommandMetadata } from "../../../types/common/command-metadata.js";
import { TempContext } from "../../../types/temp-context.js";

export class SdlParser {
  private readonly zipArchiver: ZipService = new ZipService();
  private readonly fileService = new FileService();
  private readonly configDirectory: DirectoryPath;
  private readonly commandMetadata: CommandMetadata;

  constructor(
    private readonly portalService: PortalService,
    configDirectory: DirectoryPath,
    commandMetadata: CommandMetadata
  ) {
    this.configDirectory = configDirectory;
    this.commandMetadata = commandMetadata;
  }

  public async getTocComponentsFromSdl(
    specDirectoryPath: DirectoryPath
  ): Promise<Result<{ endpointGroups: Map<string, TocEndpoint[]>; models: TocModel[] }, string>> {
    const sdlResult = await this.generateSdlFromSpec(specDirectoryPath);

    if (!sdlResult.isSuccess()) {
      return Result.failure(
        "Failed to extract endpoints/models from the specification. Please validate your spec using APIMatic's interactive VS Code Extension and then try again."
      );
    }

    const sdl: Sdl = sdlResult.value!;
    const endpointGroups = this.extractEndpointGroupsForToc(sdl);
    const models = this.extractModelsForToc(sdl);

    return Result.success({ endpointGroups, models });
  }

  public async getEndpointGroupsFromSdl(specFolderPath: DirectoryPath): Promise<Result<Map<string, SdlEndpoint[]>, string>> {
    const sdlResult = await this.generateSdlFromSpec(specFolderPath);

    if (!sdlResult.isSuccess()) {
      return Result.failure(
        "Failed to extract endpoints from the API specification. Please validate your spec using APIMatic's interactive VS Code Extension and then try again."
      );
    }

    const sdl: Sdl = sdlResult.value!;
    const endpointGroups = this.extractEndpointGroupsForRecipe(sdl);

    return Result.success(endpointGroups);
  }

  private async generateSdlFromSpec(specDirectory: DirectoryPath): Promise<Result<Sdl, string>> {
    return await withDirPath(async (tempDirectory) => {
      const tempContext = new TempContext(tempDirectory);
      const specZipPath = await tempContext.zip(specDirectory);

      const specFileStream = await this.fileService.getStream(specZipPath);
      let sdlResult;

      try {
        sdlResult = await this.portalService.generateSdl(specFileStream, this.configDirectory, this.commandMetadata);
      } finally {
        specFileStream.close();
      }

      // Convert neverthrow Result to our custom Result
      const result: Result<Sdl, string> = sdlResult.isOk()
        ? Result.success(sdlResult.value)
        : Result.failure(sdlResult.error);

      if (!result.isSuccess()) {
        return Result.failure(
          "Failed to generate SDL from the API specification. Please validate your spec using APIMatic's interactive VS Code Extension."
        );
      }

      return Result.success(result.value!);
    });
  }

  private extractEndpointGroupsForRecipe(sdl: Sdl): Map<string, SdlEndpoint[]> {
    const endpointGroups = new Map<string, SdlEndpoint[]>();
    for (const endpoint of sdl.Endpoints) {
      if (!endpointGroups.has(endpoint.Group)) {
        endpointGroups.set(endpoint.Group, []);
      }

      endpointGroups.get(endpoint.Group)!.push({
        Name: endpoint.Name,
        Description: endpoint.Description,
        Group: endpoint.Group
      });
    }

    return endpointGroups;
  }

  private extractEndpointGroupsForToc(sdl: Sdl): Map<string, TocEndpoint[]> {
    const endpointGroups = new Map<string, TocEndpoint[]>();

    const endpoints = sdl.Endpoints.map(
      (e: SdlEndpoint): TocEndpoint => ({
        generate: null,
        from: "endpoint",
        endpointName: e.Name,
        endpointGroup: e.Group
      })
    );

    endpoints.forEach((endpoint: TocEndpoint) => {
      const group = endpoint.endpointGroup;
      if (!endpointGroups.has(group)) {
        endpointGroups.set(group, []);
      }
      endpointGroups.get(group)!.push(endpoint);
    });

    return endpointGroups;
  }

  private extractModelsForToc(sdl: Sdl): TocModel[] {
    return sdl.CustomTypes.map(
      (e: SdlModel): TocModel => ({
        generate: null,
        from: "model",
        modelName: e.Name
      })
    );
  }
}
