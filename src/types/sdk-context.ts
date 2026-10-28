import { err, ok, Result } from 'neverthrow';
import { FileService } from '../infrastructure/file-service.js';
import { GitService } from '../infrastructure/git-service.js';
import { canonical } from '../infrastructure/tmp-extensions.js';
import { ZipService } from '../infrastructure/zip-service.js';
import { DirectoryPath } from './file/directoryPath.js';
import { FilePath } from './file/filePath.js';
import { FileProblem } from './file/file-problem.js';
import { RelativeDirectoryPath } from './file/relativeDirectoryPath.js';
import { NO_PATHS, RelativePaths } from './file/relative-paths.js';
import { GIT_DIRECTORY } from './git/git-directory.js';
import { GitVersion } from './git/git-version.js';
import { RECORD_DIRECTORY } from './sdk/generation-record.js';
import { SdkGeneration } from './sdk/sdk-generation.js';
import { destinationFor, Inspected, SdkDestination, Unresolved } from './sdk/sdk-destination.js';
import { SdkPath } from './sdk/sdk-path.js';
import { InspectionProblem, RepositoryProblem } from './sdk/repository-state.js';
import { fileFailed } from './sdk-repository/on-disk.js';
import { SdkRepositoryContext } from './sdk-repository-context.js';
import { TempContext } from './temp-context.js';

const KEPT_OUT_OF_ARCHIVE = [RelativeDirectoryPath.fromGit(GIT_DIRECTORY.toString())!, RECORD_DIRECTORY];

/** How the run will write the SDK directory, carrying the repository it writes through where there is one. */
export type Found = SdkDestination<SdkRepositoryContext> | Unresolved<SdkRepositoryContext>;

export class SdkContext {
  private readonly fileService = new FileService();
  private readonly zipService = new ZipService();
  private readonly git = new GitService();

  constructor(private readonly sdkDirectory: DirectoryPath) {}

  public async exists() {
    return !(await this.fileService.directoryEmpty(this.sdkDirectory));
  }

  /** How a run will write the directory, from git and the enclosing repository; nothing is asked here. */
  public async destination(generation: SdkGeneration): Promise<Result<Found, InspectionProblem>> {
    const git = await this.git.version();
    if (git.isErr()) {
      return err(git.error);
    }
    const repository = await this.repositoryState(git.value, generation);
    return repository.map((found) => destinationFor({ git: git.value, repository: found }));
  }

  /** The enclosing repository with its state; none without one, and none asked of a git that cannot merge anyway. */
  private async repositoryState(
    git: GitVersion | undefined,
    generation: SdkGeneration
  ): Promise<Result<Inspected<SdkRepositoryContext>['repository'], InspectionProblem>> {
    if (!git?.isSupported()) {
      return ok(undefined);
    }
    const repository = await this.repository();
    if (repository.isErr()) {
      return err(repository.error);
    }
    if (repository.value === undefined) {
      return ok(undefined);
    }
    const handle = repository.value;
    const state = await handle.inspect(generation);
    return state.map((found) => ({ handle, state: found }));
  }

  /** Makes the SDK directory a repository of its own, creating it when it is not there yet. */
  public async initRepository(): Promise<Result<SdkRepositoryContext, RepositoryProblem>> {
    try {
      await this.fileService.createDirectoryIfNotExists(this.sdkDirectory);
    } catch (error) {
      return err(fileFailed(error));
    }
    const initialised = await this.git.init(this.sdkDirectory);
    return initialised.map(() => SdkRepositoryContext.own(this.sdkDirectory));
  }

  /** Overwrites the directory; a `.git` in it is the developer's, or holds the snapshots, and stays. */
  public async save(tempSdkDirectory: DirectoryPath): Promise<DirectoryPath> {
    await this.fileService.cleanDirectoryExcluding(this.sdkDirectory, [GIT_DIRECTORY]);
    await this.fileService.copyDirectoryContents(tempSdkDirectory, this.sdkDirectory);
    return this.sdkDirectory;
  }

  /** The SDK zipped for upload: everything but `.git`, the CLI's record and, inside a repository, what its ignore rules keep out. */
  public async archive(tempDirectory: DirectoryPath): Promise<Result<FilePath, FileProblem | RepositoryProblem>> {
    const ignored = await this.ignored();
    if (ignored.isErr()) {
      return err(ignored.error);
    }
    return new TempContext(tempDirectory).zipWithout(this.sdkDirectory, {
      files: ignored.value.files,
      directories: [...KEPT_OUT_OF_ARCHIVE, ...ignored.value.directories]
    });
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

  /** The repository enclosing the SDK directory; one whose ignore rules exclude it does not count, since its index and remote are not meant to hold the SDK. */
  private async repository(): Promise<Result<SdkRepositoryContext | undefined, RepositoryProblem>> {
    const { real, existing } = this.realSpelling();
    const found = await this.git.topLevel(existing);
    if (found.isErr()) {
      return err(found.error);
    }
    if (found.value === undefined) {
      return ok(undefined);
    }
    const root = found.value;
    const path = SdkPath.of(root, real);
    if (path === undefined) {
      return err({ reason: `git named ${root} as the repository root, which does not hold ${real}` });
    }
    if (path.isRoot()) {
      return ok(SdkRepositoryContext.create(root, path));
    }
    const ignored = await this.git.isIgnored(root, path);
    if (ignored.isErr()) {
      return err(ignored.error);
    }
    return ok(ignored.value ? undefined : SdkRepositoryContext.create(root, path));
  }

  /**
   * The directory as git spells it (an 8.3 alias expands on Windows), and its nearest existing
   * ancestor, where git can be asked about a directory that is not there yet.
   */
  private realSpelling(): { real: DirectoryPath; existing: DirectoryPath } {
    const missing: string[] = [];
    let existing = this.sdkDirectory;
    while (!this.fileService.directoryExistsSync(existing)) {
      missing.unshift(existing.leafName());
      existing = existing.join('..');
    }
    const existingReal = new DirectoryPath(canonical(existing.toString()));
    return { real: existingReal.join(...missing), existing: existingReal };
  }

  /** What the enclosing repository's ignore rules keep out; nothing without a repository. */
  private async ignored(): Promise<Result<RelativePaths, RepositoryProblem>> {
    const repository = await this.repository();
    if (repository.isErr()) {
      return err(repository.error);
    }
    return repository.value === undefined ? ok(NO_PATHS) : repository.value.ignored();
  }
}
