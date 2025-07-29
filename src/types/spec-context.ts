import { FileService } from "../infrastructure/file-service.js";
import { DirectoryPath } from "./file/directoryPath.js";

export class SpecContext {
  private readonly fileService = new FileService();
  private readonly specDirectory: DirectoryPath;

  constructor(specDirectory: DirectoryPath) {
    this.specDirectory = specDirectory;
  }

  public async validate(): Promise<boolean> {
    // TODO: add more checks here
    if (!(await this.fileService.directoryExists(this.specDirectory))) return false;

    return true;
  }
}

