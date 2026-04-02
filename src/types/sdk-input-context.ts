import { FileService } from "../infrastructure/file-service.js";
import { DirectoryPath } from "./file/directoryPath.js";
import { Language } from "./sdk/generate.js";

export class SdkInputContext {
  private readonly fileService = new FileService();

  constructor(
    private readonly sdkDirectoryInput: string | undefined,
    private readonly workingDirectory: DirectoryPath,
    private readonly language: Language,
    private readonly version?: string
  ) {  }
  
  public getSdkInputDirectory(): DirectoryPath {
    if (this.sdkDirectoryInput){
      return new DirectoryPath(this.sdkDirectoryInput);
    }

    const sdkDirectory = this.workingDirectory.join("sdk");

    if (this.version) {
      return sdkDirectory.join(this.version).join(this.language);
    }

    return sdkDirectory.join(this.language);
  }

  public async exists() {
    return !(await this.fileService.directoryEmpty(this.getSdkInputDirectory()));
  }
}
