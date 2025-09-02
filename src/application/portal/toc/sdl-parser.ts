import { PortalService } from "../../../infrastructure/services/portal-service.js";
import { TocEndpoint, TocModel } from "../../../types/toc/toc.js";
import { Result } from "../../../types/common/result.js";
import { err, ok, Result as ResultEx } from "neverthrow";
import { Sdl, SdlEndpoint, SdlModel } from "../../../types/sdl/sdl.js";
import { DirectoryPath } from "../../../types/file/directoryPath.js";
import { withDirPath } from "../../../infrastructure/tmp-extensions.js";
import { FileService } from "../../../infrastructure/file-service.js";
import { CommandMetadata } from "../../../types/common/command-metadata.js";
import { TempContext } from "../../../types/temp-context.js";
import { SpecContext } from "../../../types/spec-context.js";

export class SdlParser {
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
    const specContext = new SpecContext(specDirectoryPath);

    const sdl: Sdl = sdlResult.value!;
    const endpointGroups = specContext.extractEndpointGroupsForToc(sdl);
    const models = this.extractModelsForToc(sdl);

    return Result.success({ endpointGroups, models });
  }

  public async getEndpointGroupsFromSdl(sdl: Sdl): Promise<Map<string, SdlEndpoint[]>> {
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
