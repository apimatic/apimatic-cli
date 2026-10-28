import fs from 'node:fs';
import path from 'node:path';
import { err, ok, Result } from 'neverthrow';
import { FileService } from '../infrastructure/file-service.js';
import { GitService } from '../infrastructure/git-service.js';
import { canonical } from '../infrastructure/tmp-extensions.js';
import { ZipService } from '../infrastructure/zip-service.js';
import { DirectoryPath } from './file/directoryPath.js';
import { FilePath } from './file/filePath.js';
import { FileName } from './file/fileName.js';
import { FileProblem } from './file/file-problem.js';
import { RelativeFilePath } from './file/relativeFilePath.js';
import { SdkGeneration } from './sdk/generation-record.js';
import { destinationFor, SdkDestination, Unresolved } from './sdk/sdk-destination.js';
import { RECORD_DIRECTORY } from './sdk/generation-record-file.js';
import { fileFailed, gitFailed, InspectionProblem, SdkRepositoryProblem } from './sdk/repository-state.js';
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

  /** Makes the SDK directory a repository of its own, creating it when it is not there yet. */
  public async initRepository(): Promise<Result<SdkRepositoryContext, SdkRepositoryProblem>> {
    const sdk = this.sdkDirectory;
    try {
      await this.fileService.createDirectoryIfNotExists(sdk);
    } catch (error) {
      return err(fileFailed(error));
    }
    const initialised = await this.git.init(sdk);
    return initialised.map(() => SdkRepositoryContext.own(sdk)).mapErr(gitFailed);
  }

  /** Overwrites the directory; a `.git` in it is the developer's, or holds the snapshots, and stays. */
  public async save(tempSdkDirectory: DirectoryPath): Promise<DirectoryPath> {
    await this.fileService.cleanDirectoryExcluding(this.sdkDirectory, [new FileName(GIT_DIRECTORY)]);
    await this.fileService.copyDirectoryContents(tempSdkDirectory, this.sdkDirectory);
    return this.sdkDirectory;
  }

  /** The SDK zipped for upload: the files git would commit, never `.git` or the CLI's record; without a repository, every file but those. */
  public async archive(tempDirectory: DirectoryPath): Promise<Result<FilePath, FileProblem>> {
    const files = await this.filesToArchive();
    if (files.isErr()) {
      return err({ kind: 'zipFailed', reason: files.error.reason });
    }
    return new TempContext(tempDirectory).zip(this.sdkDirectory, files.value);
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
  private async repository(): Promise<Result<SdkRepositoryContext | undefined, SdkRepositoryProblem>> {
    const { real, existing } = realSpelling(this.sdkDirectory);
    const found = await this.git.topLevel(existing);
    if (found.isErr()) {
      return err(gitFailed(found.error));
    }
    if (found.value === undefined) {
      return ok(undefined);
    }
    const root = new DirectoryPath(canonical(found.value.toString()));
    if (root.isEqual(real)) {
      return ok(SdkRepositoryContext.create(root, real));
    }
    const ignored = await this.git.isIgnored(root, real);
    if (ignored.isErr()) {
      return err(gitFailed(ignored.error));
    }
    return ok(ignored.value ? undefined : SdkRepositoryContext.create(root, real));
  }

  private async filesToArchive(): Promise<Result<RelativeFilePath[], SdkRepositoryProblem>> {
    const repository = await this.repository();
    if (repository.isErr()) {
      return err(repository.error);
    }
    if (repository.value !== undefined) {
      return repository.value.filesToShare();
    }
    try {
      return ok(await this.everyFile());
    } catch (error) {
      return err(fileFailed(error));
    }
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
}
