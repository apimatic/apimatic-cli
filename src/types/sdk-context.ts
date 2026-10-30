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

  /** Whether saving over the directory would remove anything: hidden entries such as `.github` count, only `.git` stays. */
  public async exists() {
    return this.fileService.hasEntriesExcluding(this.sdkDirectory, [GIT_DIRECTORY]);
  }

  /**
   * How a run will write the directory, from git and the SDK directory's own repository; nothing is asked here.
   * Git is looked for only when the directory has a repository of its own or `gitInit` will make it one.
   */
  public async destination(generation: SdkGeneration, gitInit: boolean): Promise<Result<Found, InspectionProblem>> {
    if (!gitInit && !(await this.hasOwnGit())) {
      return ok({ kind: 'noRepository' });
    }
    const git = await this.git.version();
    if (git.isErr()) {
      return err(git.error);
    }
    const repository = await this.repositoryState(git.value, generation);
    return repository.map((found) => destinationFor({ git: git.value, repository: found }));
  }

  /** The SDK directory's own repository with its state; none without one, and none asked of a git that cannot merge anyway. */
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

  /** The SDK directory's own repository; one that only encloses it belongs to the developer's project, which the CLI leaves alone. */
  private async repository(): Promise<Result<SdkRepositoryContext | undefined, RepositoryProblem>> {
    if (!(await this.hasOwnGit())) {
      return ok(undefined);
    }
    // Spelt as git spells the root, so an 8.3 alias on Windows still compares equal.
    const real = new DirectoryPath(canonical(this.sdkDirectory.toString()));
    const root = await this.git.topLevel(real);
    return root.map((found) => (found?.isEqual(real) ? SdkRepositoryContext.own(real) : undefined));
  }

  /** What its own repository's ignore rules keep out; nothing without a repository. */
  private async ignored(): Promise<Result<RelativePaths, RepositoryProblem>> {
    const repository = await this.repository();
    if (repository.isErr()) {
      return err(repository.error);
    }
    return repository.value === undefined ? ok(NO_PATHS) : repository.value.ignored();
  }

  /** Whether the directory has a `.git` of its own, a folder or a worktree's file; read from disk, so a directory without one never needs git. */
  private async hasOwnGit(): Promise<boolean> {
    return (
      (await this.fileService.directoryExists(this.sdkDirectory.join(GIT_DIRECTORY.toString()))) ||
      (await this.fileService.fileExists(new FilePath(this.sdkDirectory, GIT_DIRECTORY)))
    );
  }
}
