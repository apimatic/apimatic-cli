import { Result } from 'neverthrow';
import { FileService } from '../infrastructure/file-service.js';
import { ZipService } from '../infrastructure/zip-service.js';
import { DirectoryPath } from './file/directoryPath.js';
import { FilePath } from './file/filePath.js';
import { FileName } from './file/fileName.js';
import { FileProblem } from './file/file-problem.js';
import { randomUUID } from 'node:crypto';

export class TempContext {
  private readonly fileService = new FileService();
  private readonly zipService = new ZipService();

  constructor(private readonly tempDirectory: DirectoryPath) {}

  private get getTempFileName(): FilePath {
    const uuid = randomUUID();
    return new FilePath(this.tempDirectory, new FileName(`${uuid}`));
  }

  public async zip(directory: DirectoryPath): Promise<Result<FilePath, FileProblem>> {
    const tempFile = this.getTempFileName;
    const archived = await this.zipService.archive(directory, tempFile);
    return archived.map(() => tempFile).mapErr((reason): FileProblem => ({ kind: 'zipFailed', reason }));
  }

  public async save(portalStream: NodeJS.ReadableStream): Promise<FilePath> {
    const tempFile = this.getTempFileName;
    await this.fileService.writeFile(tempFile, portalStream);
    return tempFile;
  }
}
