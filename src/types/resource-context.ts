import { err, ok, Result } from 'neverthrow';
import { UrlPath } from './file/urlPath.js';
import { FilePath } from './file/filePath.js';
import { DirectoryPath } from './file/directoryPath.js';
import { FileDownloadService } from '../infrastructure/services/file-download-service.js';
import { FileService } from '../infrastructure/file-service.js';
import { ResourceInput } from './file/resource-input.js';
import { ServiceError } from '../infrastructure/service-error.js';
import { ProjectContext, SpecZipProblem } from './project-context.js';

export type ResourceKind = 'file' | 'url' | 'project';

export type DownloadProblem = { kind: 'downloadFailed'; url: UrlPath; error: ServiceError };

export type FileProblem = { kind: 'fileUnreadable'; file: FilePath };

export type ResolveProblem = SpecZipProblem | DownloadProblem | FileProblem;

export class ResourceContext<I extends ResourceInput = ResourceInput> {
  private readonly fileDownloadService = new FileDownloadService();
  private readonly fileService = new FileService();
  private resolved: Promise<Result<FilePath, ResolveProblem>> | undefined;

  private constructor(private readonly input: I, private readonly tempDirectory: DirectoryPath) {}

  public static resolveTo<I extends ResourceInput>(input: I, tempDirectory: DirectoryPath): ResourceContext<I> {
    return new ResourceContext(input, tempDirectory);
  }

  public kind(): ResourceKind {
    if (this.input instanceof ProjectContext) {
      return 'project';
    }
    return this.input instanceof UrlPath ? 'url' : 'file';
  }

  public resolveTo(this: ResourceContext<FilePath | UrlPath>): Promise<Result<FilePath, DownloadProblem | FileProblem>>;
  public resolveTo(): Promise<Result<FilePath, ResolveProblem>>;
  public resolveTo(): Promise<Result<FilePath, ResolveProblem>> {
    this.resolved ??= this.resolve();
    return this.resolved;
  }

  private async resolve(): Promise<Result<FilePath, ResolveProblem>> {
    const input: ResourceInput = this.input;
    if (input instanceof ProjectContext) {
      return await input.specZip(this.tempDirectory);
    }
    await this.fileService.createDirectoryIfNotExists(this.tempDirectory);
    if (input instanceof UrlPath) {
      const downloaded = await this.fileDownloadService.downloadFile(input);
      if (downloaded.isErr()) {
        return err({ kind: 'downloadFailed', url: input, error: downloaded.error });
      }
      const file = new FilePath(this.tempDirectory, downloaded.value.filename);
      await this.fileService.writeFile(file, downloaded.value.stream);
      return ok(file);
    }
    const copy = input.replaceDirectory(this.tempDirectory);
    try {
      await this.fileService.copy(input, copy);
    } catch {
      return err({ kind: 'fileUnreadable', file: input });
    }
    return ok(copy);
  }
}
