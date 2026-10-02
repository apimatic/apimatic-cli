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

type Resolution<P extends ResolveProblem> = Promise<Result<ResourceContext, P>>;

export class ResourceContext {
  private constructor(private readonly input: ResourceInput, private readonly resolvedFile: FilePath) {}

  public static resolveTo(
    input: FilePath | UrlPath,
    tempDirectory: DirectoryPath
  ): Resolution<DownloadProblem | FileProblem>;
  public static resolveTo(input: ResourceInput, tempDirectory: DirectoryPath): Resolution<ResolveProblem>;
  public static async resolveTo(input: ResourceInput, tempDirectory: DirectoryPath): Resolution<ResolveProblem> {
    if (input instanceof ProjectContext) {
      return (await input.specZip(tempDirectory)).map((zip) => new ResourceContext(input, zip));
    }
    const fileService = new FileService();
    await fileService.createDirectoryIfNotExists(tempDirectory);
    if (input instanceof UrlPath) {
      const downloaded = await new FileDownloadService().downloadFile(input);
      if (downloaded.isErr()) {
        return err({ kind: 'downloadFailed', url: input, error: downloaded.error });
      }
      const file = new FilePath(tempDirectory, downloaded.value.filename);
      await fileService.writeFile(file, downloaded.value.stream);
      return ok(new ResourceContext(input, file));
    }
    const copy = input.replaceDirectory(tempDirectory);
    try {
      await fileService.copy(input, copy);
    } catch {
      return err({ kind: 'fileUnreadable', file: input });
    }
    return ok(new ResourceContext(input, copy));
  }

  public kind(): ResourceKind {
    if (this.input instanceof ProjectContext) {
      return 'project';
    }
    return this.input instanceof UrlPath ? 'url' : 'file';
  }

  public file(): FilePath {
    return this.resolvedFile;
  }
}
