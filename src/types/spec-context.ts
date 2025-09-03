import { FileService } from "../infrastructure/file-service.js";
import { DirectoryPath } from "./file/directoryPath.js";
import { TocEndpoint, TocModel } from "./toc/toc.js";

export type EndpointGroup = Map<string, TocEndpoint[]>;
export type SdlTocComponents = { endpointGroups: EndpointGroup; models: TocModel[] };

export class SpecContext {
  private readonly fileService = new FileService();
  private readonly specDirectory: DirectoryPath;

  constructor(specDirectory: DirectoryPath) {
    this.specDirectory = specDirectory;
  }

  public async validate(): Promise<boolean> {
    return !(await this.fileService.directoryEmpty(this.specDirectory));
  }
}
