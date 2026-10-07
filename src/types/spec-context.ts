import { ok, Result } from 'neverthrow';
import { FileService } from '../infrastructure/file-service.js';
import { DirectoryPath } from './file/directoryPath.js';
import { FilePath } from './file/filePath.js';
import { FileName } from './file/fileName.js';
import { FileProblem } from './file/file-problem.js';
import { ZipService } from '../infrastructure/zip-service.js';

const META_FILE_NAME = new FileName('APIMATIC-META.json');

export class SpecContext {
  private readonly fileService = new FileService();
  private readonly zipService = new ZipService();
  private readonly specDirectory: DirectoryPath;

  constructor(specDirectory: DirectoryPath) {
    this.specDirectory = specDirectory;
  }

  public async validate(): Promise<boolean> {
    return !(await this.fileService.directoryEmpty(this.specDirectory));
  }

  public async hasMeta(): Promise<boolean> {
    return await this.fileService.fileExists(new FilePath(this.specDirectory, META_FILE_NAME));
  }

  /** Zips a copy of this directory into `into`, with `meta` as its APIMATIC-META.json when given. */
  public async archive(
    into: DirectoryPath,
    meta: NodeJS.ReadableStream | null
  ): Promise<Result<FilePath, FileProblem>> {
    const staged = into.join('spec');
    await this.fileService.copyDirectoryContents(this.specDirectory, staged);
    if (meta !== null) {
      await new SpecContext(staged).save(meta, META_FILE_NAME);
    }
    const zip = new FilePath(into, new FileName('spec.zip'));
    const archived = await this.zipService.archive(staged, zip);
    return archived.map(() => zip).mapErr((reason): FileProblem => ({ kind: 'zipFailed', reason }));
  }

  /** Adds a specification to this directory, unpacking it when it is a split-spec archive. */
  public async install(specPath: FilePath): Promise<Result<void, FileProblem>> {
    await this.fileService.createDirectoryIfNotExists(this.specDirectory);
    if (await this.fileService.isZipFile(specPath)) {
      const unpacked = await this.zipService.unArchive(specPath, this.specDirectory);
      return unpacked.mapErr((reason): FileProblem => ({ kind: 'unzipFailed', reason }));
    }
    await this.fileService.copy(specPath, specPath.replaceDirectory(this.specDirectory));
    return ok(undefined);
  }

  public async save(stream: NodeJS.ReadableStream, fileName: FileName): Promise<FilePath> {
    const filePath = new FilePath(this.specDirectory, fileName);
    await this.fileService.writeFile(filePath, stream);
    return filePath;
  }
}
