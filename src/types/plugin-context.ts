import { FileService } from '../infrastructure/file-service.js';
import { ZipService } from '../infrastructure/zip-service.js';
import { DirectoryPath } from './file/directoryPath.js';
import { FileName } from './file/fileName.js';
import { FilePath } from './file/filePath.js';

export class PluginContext {
  private readonly fileService = new FileService();
  private readonly zipService = new ZipService();

  constructor(private readonly pluginDirectory: DirectoryPath) {}

  private get zipPath(): FilePath {
    return new FilePath(this.pluginDirectory, new FileName('plugin.zip'));
  }

  public async exists(): Promise<boolean> {
    return !(await this.fileService.directoryEmpty(this.pluginDirectory));
  }

  public async save(tempPluginFilePath: FilePath, zipPlugin: boolean): Promise<void> {
    await this.fileService.cleanDirectory(this.pluginDirectory);
    if (zipPlugin) {
      await this.fileService.copy(tempPluginFilePath, this.zipPath);
    } else {
      await this.zipService.unArchive(tempPluginFilePath, this.pluginDirectory);
    }
  }
}
