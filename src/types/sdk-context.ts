import fs from 'node:fs';
import path from 'node:path';
import { err, ok, okAsync, Result, ResultAsync } from 'neverthrow';
import { FileService } from '../infrastructure/file-service.js';
import { GitService } from '../infrastructure/git-service.js';
import { canonical } from '../infrastructure/tmp-extensions.js';
import { ZipService } from '../infrastructure/zip-service.js';
import { errorMessage } from '../utils/error-utils.js';
import { DirectoryPath } from './file/directoryPath.js';
import { FilePath } from './file/filePath.js';
import { FileName } from './file/fileName.js';
import { FileProblem } from './file/file-problem.js';
import { RelativeFilePath } from './file/relativeFilePath.js';
import { SdkGeneration } from './sdk/generation-record.js';
import { destinationFor, SdkDestination, Unresolved } from './sdk/sdk-destination.js';
import { RECORD_DIRECTORY } from './sdk/generation-record-file.js';
import { gitFailed, InspectionProblem, SdkRepositoryProblem } from './sdk/repository-state.js';
import { SdkRepositoryContext } from './sdk-repository-context.js';
import { TempContext } from './temp-context.js';

const GIT_DIRECTORY = '.git';

/**
 * The directory as git spells it (an 8.3 alias expands on Windows), and its nearest existing
 * ancestor, where git can be asked about a directory that is not there yet.
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

  constructor(private readonly sdkDirectory: DirectoryPath) {}

  public async exists() {
    return !(await this.fileService.directoryEmpty(this.sdkDirectory));
  }

  /** How a run will write the directory, from git and the enclosing repository; nothing is asked here. */
  public async destination(generation: SdkGeneration): Promise<Result<SdkDestination | Unresolved, InspectionProblem>> {
    const version = await this.git.version();
    if (version.isErr()) {
      return err(gitFailed(version.error));
    }
    if (!version.value?.isSupported()) {
      return ok({ kind: 'overwrite', found: version.value });
    }
    const repository = await this.repository();
    if (repository.isErr()) {
      return err(repository.error);
    }
    if (repository.value === undefined) {
      return ok({ kind: 'noRepository' });
    }
    const remote = await repository.value.remote();
    if (remote.isErr()) {
      return err(remote.error);
    }
    const found = repository.value;
    return (await found.inspect(generation, remote.value)).map((state) => destinationFor(found, state));
  }

  /** The repository enclosing the SDK directory; one whose ignore rules exclude it does not count, since its index and remote are not meant to hold the SDK. */
  public repository(): ResultAsync<SdkRepositoryContext | undefined, SdkRepositoryProblem> {
    const { real, existing } = realSpelling(this.sdkDirectory);
    return this.git
      .topLevel(existing)
      .andThen((found) => {
        if (found === undefined) {
          return okAsync(undefined);
        }
        const root = new DirectoryPath(canonical(found.toString()));
        const enclosed = root.isEqual(real) ? okAsync(true) : this.git.isIgnored(root, real).map((ignored) => !ignored);
        return enclosed.map((yes) => (yes ? SdkRepositoryContext.create(root, real) : undefined));
      })
      .mapErr(gitFailed);
  }

  /** Makes the SDK directory a repository of its own, creating it when it is not there yet. */
  public initRepository(): ResultAsync<SdkRepositoryContext, SdkRepositoryProblem> {
    const sdk = this.sdkDirectory;
    return ResultAsync.fromPromise(
      this.fileService.createDirectoryIfNotExists(sdk),
      (error): SdkRepositoryProblem => ({ kind: 'fileFailed', reason: errorMessage(error) })
    )
      .andThen(() => this.git.init(sdk).mapErr(gitFailed))
      .map(() => SdkRepositoryContext.own(sdk));
  }

  /** Overwrites the directory; a `.git` in it is the developer's, or holds the snapshots, and stays. */
  public async save(tempSdkDirectory: DirectoryPath): Promise<DirectoryPath> {
    await this.fileService.cleanDirectoryExcluding(this.sdkDirectory, [new FileName(GIT_DIRECTORY)]);
    await this.fileService.copyDirectoryContents(tempSdkDirectory, this.sdkDirectory);
    return this.sdkDirectory;
  }

  /** The SDK zipped for upload: the files git would commit, never `.git` or the CLI's record; without a repository, every file but those. */
  public async archive(tempDirectory: DirectoryPath): Promise<Result<FilePath, FileProblem>> {
    const files = await this.repository().andThen((repository) =>
      repository === undefined
        ? ResultAsync.fromPromise(
            this.everyFile(),
            (error): SdkRepositoryProblem => ({ kind: 'fileFailed', reason: errorMessage(error) })
          )
        : repository.filesToShare()
    );
    if (files.isErr()) {
      return err({ kind: 'zipFailed', reason: files.error.reason });
    }
    return new TempContext(tempDirectory).zip(this.sdkDirectory, files.value);
  }

  private async everyFile(below = ''): Promise<RelativeFilePath[]> {
    const directory = this.sdkDirectory.resolve(below);
    const entries = await fs.promises.readdir(directory.toString(), { withFileTypes: true });
    const files = await Promise.all(
      entries.map(async (entry): Promise<RelativeFilePath[]> => {
        const relative = below === '' ? entry.name : `${below}/${entry.name}`;
        if (below === '' && (entry.name === GIT_DIRECTORY || entry.name === RECORD_DIRECTORY)) {
          return [];
        }
        return entry.isDirectory() ? this.everyFile(relative) : [RelativeFilePath.fromGit(relative)];
      })
    );
    return files.flat();
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
