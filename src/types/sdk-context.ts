import fs from 'node:fs';
import path from 'node:path';
import { err, ok, Result } from 'neverthrow';
import { FileService } from '../infrastructure/file-service.js';
import { GitService } from '../infrastructure/git-service.js';
import { canonical } from '../infrastructure/tmp-extensions.js';
import { ZipService } from '../infrastructure/zip-service.js';
import { errorMessage } from '../utils/error-utils.js';
import { DirectoryPath } from './file/directoryPath.js';
import { FilePath } from './file/filePath.js';
import { FileName } from './file/fileName.js';
import { FileProblem } from './file/file-problem.js';
import { Language } from './sdk/generate.js';
import { SdkRepositoryContext, SdkRepositoryProblem } from './sdk-repository-context.js';

export type SdkSaveProblem = FileProblem & { sdkDirectory: DirectoryPath };

const GIT_DIRECTORY = '.git';

/**
 * The directory spelt as git will spell it, and its nearest ancestor that exists, which is where
 * git can be asked about it: the SDK directory of a first run is not there yet, and on Windows
 * the one the caller holds may be an 8.3 alias where git answers with the long name.
 */
function realSpelling(directory: DirectoryPath): { real: DirectoryPath; existing: DirectoryPath } {
  let existing = directory.toString();
  const missing: string[] = [];
  while (!fs.existsSync(existing)) {
    missing.unshift(path.basename(existing));
    existing = path.dirname(existing);
  }
  const existingReal = new DirectoryPath(canonical(existing));
  return { real: existingReal.join(...missing), existing: existingReal };
}

export class SdkContext {
  private readonly fileService = new FileService();
  private readonly zipService = new ZipService();
  private readonly git = new GitService();
  private readonly sdkDirectory: DirectoryPath;

  constructor(private readonly language: Language, sdkDirectory: DirectoryPath, version?: string) {
    this.sdkDirectory = version ? sdkDirectory.join(version).join(language) : sdkDirectory.join(language);
  }

  private get zipPath(): FilePath {
    return new FilePath(this.sdkDirectory, new FileName(`${this.language}.zip`));
  }

  /** The language directory the SDK is written into, and read back from on the next run. */
  public directory(): DirectoryPath {
    return this.sdkDirectory;
  }

  public async exists() {
    return !(await this.fileService.directoryEmpty(this.sdkDirectory));
  }

  /** The repository enclosing the SDK directory, which need not exist yet, or none when nothing does. */
  public async repository(): Promise<SdkRepositoryContext | undefined> {
    const { real, existing } = realSpelling(this.sdkDirectory);
    const root = await this.git.topLevel(existing);
    return root === undefined
      ? undefined
      : SdkRepositoryContext.create(new DirectoryPath(canonical(root.toString())), real);
  }

  /** Makes the SDK directory a repository of its own, creating it when it is not there yet. */
  public async initRepository(): Promise<Result<SdkRepositoryContext, SdkRepositoryProblem>> {
    try {
      await this.fileService.createDirectoryIfNotExists(this.sdkDirectory);
      await this.git.init(this.sdkDirectory);
      const repository = SdkRepositoryContext.create(this.sdkDirectory, this.sdkDirectory);
      return repository === undefined
        ? err({ kind: 'gitFailed', reason: 'the repository could not be opened' })
        : ok(repository);
    } catch (error) {
      return err({ kind: 'gitFailed', reason: errorMessage(error) });
    }
  }

  /** Overwrites the directory; a `.git` in it is the developer's, or holds the snapshots, and stays. */
  public async save(tempSdkDirectory: DirectoryPath, zipSdk: boolean): Promise<Result<DirectoryPath, SdkSaveProblem>> {
    await this.fileService.cleanDirectoryExcluding(this.sdkDirectory, [new FileName(GIT_DIRECTORY)]);
    if (!zipSdk) {
      await this.fileService.copyDirectoryContents(tempSdkDirectory, this.sdkDirectory);
      return ok(this.sdkDirectory);
    }
    const archived = await this.zipService.archive(tempSdkDirectory, this.zipPath);
    return archived
      .map(() => this.sdkDirectory)
      .mapErr((reason): SdkSaveProblem => ({ kind: 'zipFailed', reason, sdkDirectory: this.sdkDirectory }));
  }

  public async loadSdkInTempDirectory(
    tempDirectory: DirectoryPath,
    tempSdk: FilePath
  ): Promise<Result<DirectoryPath, FileProblem>> {
    const tempSdkDirectory = tempDirectory.join('sdk-original');
    await this.fileService.createDirectoryIfNotExists(tempSdkDirectory);
    const unpacked = await this.zipService.unArchive(tempSdk, tempSdkDirectory);
    return unpacked.map(() => tempSdkDirectory).mapErr((reason): FileProblem => ({ kind: 'unzipFailed', reason }));
  }
}
