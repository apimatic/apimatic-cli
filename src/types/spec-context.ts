import { err, ok, Result } from "neverthrow";
import { FileService } from "../infrastructure/file-service.js";
import { DirectoryPath } from "./file/directoryPath.js";
import { TocEndpoint, TocModel } from "./toc/toc.js";
import { Sdl, SdlEndpoint, SdlModel } from "./sdl/sdl.js";
import { withDirPath } from "../infrastructure/tmp-extensions.js";
import { TempContext } from "./temp-context.js";
import { PortalService } from "../infrastructure/services/portal-service.js";
import { CommandMetadata } from "./common/command-metadata.js";

export type EndpointGroup = Map<string, TocEndpoint[]>;
export type SdlTocComponents = { endpointGroups: EndpointGroup; models: TocModel[] };

export class SpecContext {
  private readonly fileService = new FileService();
  private readonly portalService = new PortalService();
  private readonly specDirectory: DirectoryPath;

  constructor(specDirectory: DirectoryPath) {
    this.specDirectory = specDirectory;
  }


  public async validate(): Promise<boolean> {
    return !(await this.fileService.directoryEmpty(this.specDirectory));
  }

  public async extractSdlComponents(
    configDirectory: DirectoryPath,
    commandMetadata: CommandMetadata
  ): Promise<Result<SdlTocComponents, string>> {
    return await withDirPath(async (tempDirectory) => {
      const tempContext = new TempContext(tempDirectory);
      const specZipPath = await tempContext.zip(this.specDirectory);

      const specFileStream = await this.fileService.getStream(specZipPath);
      let result: Result<Sdl, string>;

      try {
        result = await this.portalService.generateSdl(specFileStream, configDirectory, commandMetadata);

        if (result.isErr()) {
          return err(result.error);
        }

        const sdl: Sdl = result._unsafeUnwrap();
        const endpointGroups = this.extractEndpointGroupsForToc(sdl);
        const models = this.extractModelsForToc(sdl);
        const sdlTocComponents: SdlTocComponents = { endpointGroups, models };

        return ok(sdlTocComponents);
      } finally {
        specFileStream.close();
      }
    });
  }

  public extractEndpointGroupsForToc(sdl: Sdl): Map<string, TocEndpoint[]> {
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
