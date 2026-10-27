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

  constructor(private readonly sdkDirectory: DirectoryPath) {}

  public async exists() {
    return !(await this.fileService.directoryEmpty(this.sdkDirectory));
  }

  /**
   * How a run will write the directory, from what git and the enclosing repository say about
   * it; `unresolved` when the last run's markers are still in the files. Nothing is asked here.
   */
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
      return ok({ kind: 'record', repository: undefined, because: { kind: 'noRepository' } });
    }
    const remote = await repository.value.remote();
    if (remote.isErr()) {
      return err(remote.error);
    }
    const found = repository.value;
    return (await found.inspect(generation, remote.value)).map((state) => destinationFor(found, state));
  }

  /**
   * The repository enclosing the SDK directory, which need not exist yet, or none when nothing
   * does. A repository whose ignore rules exclude the directory does not count: its index and
   * its remote are not meant to hold the SDK, so the directory gets a repository of its own.
   */
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
      .andThen(() => {
        const repository = SdkRepositoryContext.create(sdk, sdk);
        return repository === undefined
          ? err<SdkRepositoryContext, SdkRepositoryProblem>({
              kind: 'gitFailed',
              reason: 'the repository could not be opened'
            })
          : ok(repository);
      });
  }

  /** Overwrites the directory; a `.git` in it is the developer's, or holds the snapshots, and stays. */
  public async save(tempSdkDirectory: DirectoryPath): Promise<DirectoryPath> {
    await this.fileService.cleanDirectoryExcluding(this.sdkDirectory, [new FileName(GIT_DIRECTORY)]);
    await this.fileService.copyDirectoryContents(tempSdkDirectory, this.sdkDirectory);
    return this.sdkDirectory;
  }

  /**
   * The SDK zipped for upload, in `tempDirectory`: the files git would commit, so the SDK's own
   * `.gitignore` keeps a `node_modules` or `dist` out, and never `.git` or the CLI's record.
   * Without a repository, every file but those.
   */
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
