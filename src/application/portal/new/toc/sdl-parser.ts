import * as path from "path";
import { PortalService } from "../../../../infrastructure/services/portal-service";
import { validateAndZipPortalSource, deleteFile } from "../../../../utils/utils";
import { TocEndpoint, TocModel } from "../../../../types/toc/toc";
import { Result } from "../../../../types/common/result";
import { Sdl, SdlEndpoint, SdlModel } from "../../../../types/sdl/sdl";

export class SdlParser {
  constructor(private readonly portalService: PortalService) {}

  public async getTocComponentsFromSdl(
    specFolderPath: string,
    workingDirectory: string,
    configDir: string
  ): Promise<Result<{ endpointGroups: Map<string, TocEndpoint[]>; models: TocModel[] }, string>> {
    const sourceSpecInputZipFilePath = await validateAndZipPortalSource(
      specFolderPath,
      path.join(workingDirectory, ".spec_source.zip")
    );

    try {
      const result = await this.portalService.generateSdl(sourceSpecInputZipFilePath, configDir);

      if (!result.isSuccess()) {
        return Result.failure(
          "Failed to extract endpoints/models from the specification. Please validate your spec using APIMatic's interactive VS Code Extension."
        );
      }

      const sdl: Sdl = result.value!;
      const endpointGroups = this.extractEndpointGroupsForToc(sdl);
      const models = this.extractModelsForToc(sdl);

      return Result.success({ endpointGroups, models });
    } finally {
      await deleteFile(sourceSpecInputZipFilePath);
    }
  }

  public async getEndpointGroupsFromSdl(
    specFolderPath: string,
    contentFolderPath: string,
    configDir: string
  ): Promise<Result<Map<string, string[]>, string>> {
    const sourceSpecInputZipFilePath = await validateAndZipPortalSource(
      specFolderPath,
      path.join(contentFolderPath, ".spec_source.zip")
    );

    const sdlResult = await this.portalService.generateSdl(sourceSpecInputZipFilePath, configDir);

    if (!sdlResult.isSuccess()) {
      return Result.failure(
        "Failed to extract endpoints from the specification. Please validate your spec using APIMatic's interactive VS Code Extension."
      );
    }

    const sdl: Sdl = sdlResult.value!;
    const endpointGroups = new Map<string, string[]>();
    for (const endpoint of sdl.Endpoints) {
      if (!endpointGroups.has(endpoint.Group)) {
        endpointGroups.set(endpoint.Group, []);
      }

      endpointGroups.get(endpoint.Group)!.push(endpoint.Name);
    }
    return Result.success(endpointGroups);
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
