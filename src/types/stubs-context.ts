import { FileService } from '../infrastructure/file-service.js';
import { DirectoryPath } from './file/directoryPath.js';
import { FileName } from './file/fileName.js';

// A stubs directory that is a repository keeps its history; nothing else outlives a new set.
const KEPT = [new FileName('.git')];

export class StubsContext {
  private readonly fileService = new FileService();

  constructor(private readonly stubsDirectory: DirectoryPath) {}

  public async exists(): Promise<boolean> {
    return await this.fileService.hasEntriesExcluding(this.stubsDirectory, KEPT);
  }

  /** Never a merge: `mock serve` loads every file here, so one left from the last set would repeat a stub name. */
  public async replaceWith(stubFiles: DirectoryPath): Promise<void> {
    await this.fileService.cleanDirectoryExcluding(this.stubsDirectory, KEPT);
    await this.fileService.copyDirectoryContents(stubFiles, this.stubsDirectory);
  }
}
