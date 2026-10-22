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
import { SdkGeneration } from './sdk/generation-record.js';
import { destinationFor, SdkDestination, Unresolved } from './sdk/sdk-destination.js';
import { NestedSdkDirectory, SdkRepositoryContext, SdkRepositoryProblem } from './sdk-repository-context.js';

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

  constructor(language: Language, sdkDirectory: DirectoryPath, version?: string) {
    this.sdkDirectory = version ? sdkDirectory.join(version).join(language) : sdkDirectory.join(language);
  }

  /** The language directory the SDK is written into, and read back from on the next run. */
  public directory(): DirectoryPath {
    return this.sdkDirectory;
  }

  public async exists() {
    return !(await this.fileService.directoryEmpty(this.sdkDirectory));
  }

  /**
   * How a run will write the directory, from what git and the enclosing repository say about
   * it; `unresolved` when the last run's markers are still in the files. Nothing is asked here.
   */
  public async destination(
    generation: SdkGeneration
  ): Promise<Result<SdkDestination | Unresolved, NestedSdkDirectory | SdkRepositoryProblem>> {
    const version = await this.git.version();
    if (version === undefined || !version.isSupported()) {
      return ok({ kind: 'overwrite', found: version });
    }
    const repository = await this.repository();
    if (repository === undefined) {
      return ok({ kind: 'record', repository, because: { kind: 'noRepository' } });
    }
    const state = await repository.inspect(generation, await repository.remote());
    return state.map((found) => destinationFor(repository, found));
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
  public async save(tempSdkDirectory: DirectoryPath): Promise<DirectoryPath> {
    await this.fileService.cleanDirectoryExcluding(this.sdkDirectory, [new FileName(GIT_DIRECTORY)]);
    await this.fileService.copyDirectoryContents(tempSdkDirectory, this.sdkDirectory);
    return this.sdkDirectory;
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
