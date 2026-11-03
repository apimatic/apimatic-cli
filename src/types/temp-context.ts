import { Result } from 'neverthrow';
import { FileService } from '../infrastructure/file-service.js';
import { ZipService } from '../infrastructure/zip-service.js';
import { DirectoryPath } from './file/directoryPath.js';
import { FilePath } from './file/filePath.js';
import { FileName } from './file/fileName.js';
import { FileProblem } from './file/file-problem.js';
import { NO_PATHS, RelativePaths } from './file/relative-paths.js';
import { randomUUID } from 'node:crypto';

export class TempContext {
  private readonly fileService = new FileService();
  private readonly zipService = new ZipService();

  constructor(private readonly tempDirectory: DirectoryPath) {}

  /** A zip of `directory`, leaving out what `excluding` names below it. */
  public async zip(
    directory: DirectoryPath,
    excluding: RelativePaths = NO_PATHS
  ): Promise<Result<FilePath, FileProblem>> {
    const tempFile = freshFileIn(this.tempDirectory);
    const archived = await this.zipService.archive(directory, tempFile, excluding);
    return archived.map(() => tempFile).mapErr((reason): FileProblem => ({ kind: 'zipFailed', reason }));
  }

  /** The archive expanded into a directory of its own below the temp directory. */
  public async unzip(archive: FilePath): Promise<Result<DirectoryPath, FileProblem>> {
    const directory = this.tempDirectory.join(`${archive.name()}-unzipped`);
    await this.fileService.createDirectoryIfNotExists(directory);
    const unpacked = await this.zipService.unArchive(archive, directory);
    return unpacked.map(() => directory).mapErr((reason): FileProblem => ({ kind: 'unzipFailed', reason }));
  }

  public async save(portalStream: NodeJS.ReadableStream): Promise<FilePath> {
    const tempFile = freshFileIn(this.tempDirectory);
    await this.fileService.writeFile(tempFile, portalStream);
    return tempFile;
  }
}

/** A file name nothing else in the directory has. */
function freshFileIn(directory: DirectoryPath): FilePath {
  return new FilePath(directory, new FileName(randomUUID()));
}
