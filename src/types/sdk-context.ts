import { FileService } from '../infrastructure/file-service.js';
import { DirectoryPath } from './file/directoryPath.js';

/** The directory an SDK is generated into: the `--destination` itself, or `sdk/<language>` beside the source. */
export class SdkContext {
  private readonly fileService = new FileService();

  constructor(private readonly sdkDirectory: DirectoryPath) {}

  public async exists(): Promise<boolean> {
    return !(await this.fileService.directoryEmpty(this.sdkDirectory));
  }

  /** Replaces whatever the directory holds with the generated SDK. */
  public async save(generated: DirectoryPath): Promise<DirectoryPath> {
    await this.fileService.cleanDirectory(this.sdkDirectory);
    await this.fileService.copyDirectoryContents(generated, this.sdkDirectory);
    return this.sdkDirectory;
  }
}
