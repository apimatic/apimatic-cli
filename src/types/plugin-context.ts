import { FileService } from '../infrastructure/file-service.js';
import { ZipService } from '../infrastructure/zip-service.js';
import { DirectoryPath } from './file/directoryPath.js';
import { FileName } from './file/fileName.js';
import { FilePath } from './file/filePath.js';
import { PluginContents } from './plugin/plugin-contents.js';

const GIT_DIRECTORY_NAME = '.git';

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

  /** Counts exclude the repository: `git add .` never stages `.git`, and its objects would dwarf the plugin. */
  public async describeContents(): Promise<PluginContents> {
    const directory = await this.fileService.getDirectory(this.pluginDirectory);
    const publishable = directory.excluding([new FileName(GIT_DIRECTORY_NAME)]);

    return { fileCount: publishable.countFiles(), directoryCount: publishable.countDirectories() };
  }

  public async isGitInitialized(): Promise<boolean> {
    return await this.fileService.directoryExists(this.pluginDirectory.join(GIT_DIRECTORY_NAME));
  }

  public async save(tempPluginFilePath: FilePath, zipPlugin: boolean): Promise<void> {
    // Once published, this directory is the user's repository. Emptying it outright would take
    // `.git` with it, discarding their history, their remote and every tag they have pushed.
    await this.fileService.cleanDirectoryExcluding(this.pluginDirectory, [new FileName(GIT_DIRECTORY_NAME)]);
    if (zipPlugin) {
      await this.fileService.copy(tempPluginFilePath, this.zipPath);
    } else {
      await this.zipService.unArchive(tempPluginFilePath, this.pluginDirectory);
    }
  }
}
