import { Result } from 'neverthrow';
import { FileService } from '../infrastructure/file-service.js';
import { ZipService } from '../infrastructure/zip-service.js';
import { DirectoryPath } from './file/directoryPath.js';
import { FilePath } from './file/filePath.js';
import { FileProblem } from './file/file-problem.js';
import { GIT_DIRECTORY } from './git/git-directory.js';
import { PluginContents } from './plugin/plugin-contents.js';

export class PluginContext {
  private readonly fileService = new FileService();
  private readonly zipService = new ZipService();

  constructor(private readonly pluginDirectory: DirectoryPath) {}

  public async exists(): Promise<boolean> {
    return !(await this.fileService.directoryEmpty(this.pluginDirectory));
  }

  public async describeContents(): Promise<PluginContents> {
    const directory = await this.fileService.getDirectory(this.pluginDirectory);
    const publishable = directory.excluding([GIT_DIRECTORY]);

    return { fileCount: publishable.countFiles(), directoryCount: publishable.countDirectories() };
  }

  public async isGitInitialized(): Promise<boolean> {
    return await this.fileService.directoryExists(this.pluginDirectory.join(GIT_DIRECTORY.toString()));
  }

  public async save(tempPluginFilePath: FilePath): Promise<Result<void, FileProblem>> {
    // This directory is the user's repository once published: emptying it outright would discard their history.
    await this.fileService.cleanDirectoryExcluding(this.pluginDirectory, [GIT_DIRECTORY]);
    const unpacked = await this.zipService.unArchive(tempPluginFilePath, this.pluginDirectory);
    return unpacked.mapErr((reason): FileProblem => ({ kind: 'unzipFailed', reason }));
  }
}
