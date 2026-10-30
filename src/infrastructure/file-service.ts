import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import fsExtra from 'fs-extra';
import * as path from 'node:path';
import { pipeline } from 'node:stream';
import { promisify } from 'node:util';
import { err, ok, Result } from 'neverthrow';
import { FilePath } from '../types/file/filePath.js';
import { DirectoryPath } from '../types/file/directoryPath.js';
import { Directory, DirectoryItem } from '../types/file/directory.js';
import { FileName } from '../types/file/fileName.js';
import { errorMessage } from '../utils/error-utils.js';

/** `stat` follows a link, so a link to nothing fails as though the entry were not there. */
function isDanglingLink(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

interface DirectoryEntries {
  fileNames: FileName[];
  subDirectories: DirectoryPath[];
}

/** Each folder's entries by its path, read once for the files of one call. */
type Listings = Map<string, Promise<DirectoryEntries>>;

function spelling<T>(name: string, entries: T[], nameOf: (entry: T) => string): T | undefined {
  return (
    entries.find((entry) => nameOf(entry) === name) ??
    entries.find((entry) => nameOf(entry).toLowerCase() === name.toLowerCase())
  );
}

export class FileService {
  public async fileExists(file: FilePath): Promise<boolean> {
    try {
      const stat = await fsExtra.stat(file.toString());
      return stat.isFile();
    } catch {
      return false;
    }
  }

  public async directoryExists(dir: DirectoryPath): Promise<boolean> {
    try {
      const stat = await fsExtra.stat(dir.toString());
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  public directoryExistsSync(dir: DirectoryPath): boolean {
    try {
      const stat = fsExtra.statSync(dir.toString());
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Hidden entries do not count: scaffolding into a directory that holds only a `.git` is
   * the normal way to start a project, so the prompts say "apart from hidden files".
   */
  public async directoryEmpty(dir: DirectoryPath): Promise<boolean> {
    try {
      const files = await fsExtra.readdir(dir.toString());
      return files.filter((file) => !file.startsWith('.')).length === 0;
    } catch (error) {
      return error instanceof Error && 'code' in error && error.code === 'ENOENT';
    }
  }

  /** Whether `cleanDirectoryExcluding` would remove anything from `dir`, hidden entries included; none when it is not there. */
  public async hasEntriesExcluding(dir: DirectoryPath, excludeNames: FileName[]): Promise<boolean> {
    try {
      const entries = await fsExtra.readdir(dir.toString());
      return entries.some((entry) => !excludeNames.some((exclude) => exclude.toString() === entry));
    } catch (error) {
      return !(error instanceof Error && 'code' in error && error.code === 'ENOENT');
    }
  }

  public async findSymlinks(dir: DirectoryPath): Promise<Result<FilePath[], string>> {
    try {
      return ok(await this.symlinksUnder(dir));
    } catch (error) {
      return err(errorMessage(error));
    }
  }

  private async symlinksUnder(dir: DirectoryPath): Promise<FilePath[]> {
    const symlinks: FilePath[] = [];
    for (const name of await fsExtra.readdir(dir.toString())) {
      const entry = new FilePath(dir, new FileName(name));
      const stat = await fsExtra.lstat(entry.toString());
      if (stat.isSymbolicLink()) {
        symlinks.push(entry);
      } else if (stat.isDirectory()) {
        symlinks.push(...(await this.symlinksUnder(dir.join(name))));
      }
    }
    return symlinks;
  }

  public async cleanDirectory(dir: DirectoryPath): Promise<void> {
    await fsExtra.ensureDir(dir.toString());
    await fsExtra.emptyDir(dir.toString()); // removes everything inside, keeps the dir
  }

  public async cleanDirectoryExcluding(dir: DirectoryPath, excludeNames: FileName[]): Promise<void> {
    await fsExtra.ensureDir(dir.toString());
    const entries = await fsExtra.readdir(dir.toString());

    await Promise.all(
      entries
        .filter((entry) => !excludeNames.find((exclude) => exclude.toString() === entry))
        .map(async (entry) => {
          return fsExtra.remove(dir.join(entry).toString());
        })
    );
  }

  public async createDirectoryIfNotExists(dir: DirectoryPath): Promise<void> {
    await fsExtra.ensureDir(dir.toString());
  }

  /**
   * The whole tree beneath `directoryPath`. A link to nothing is left out rather than failing
   * the walk, which is what a glob over the same tree would do with it. Any other failure
   * still throws: a file that cannot be examined is a file the caller would otherwise never
   * hear about, and a missing specification is worse than a failed build.
   */
  public async getDirectory(directoryPath: DirectoryPath): Promise<Directory> {
    const entries = await fsExtra.readdir(directoryPath.toString());
    const results = await Promise.all(
      entries.map(async (entry): Promise<DirectoryItem | undefined> => {
        const fullPath = path.join(directoryPath.toString(), entry);
        let stat: fsExtra.Stats;
        try {
          stat = await fsExtra.stat(fullPath);
        } catch (error) {
          if (isDanglingLink(error)) {
            return undefined;
          }
          throw error;
        }
        return stat.isDirectory()
          ? await this.getDirectory(new DirectoryPath(fullPath))
          : { fileName: new FileName(entry) };
      })
    );
    return new Directory(
      directoryPath,
      results.filter((item): item is DirectoryItem => item !== undefined)
    );
  }

  /**
   * The names of the files directly inside `dir`. `getDirectory` walks the whole tree and
   * stats every entry, which is wasted work when only the top level is wanted, and throws on
   * an entry it cannot stat -- out of callers that have no way to report it.
   */
  public async getFileNames(dir: DirectoryPath): Promise<FileName[]> {
    return (await this.listEntries(dir)).fileNames;
  }

  public async getSubDirectoriesPaths(dir: DirectoryPath): Promise<DirectoryPath[]> {
    return (await this.listEntries(dir)).subDirectories;
  }

  // By code point first: Windows and macOS open `logo.png` for `Logo.PNG`, where a web server would not.
  public async spelledOnDisk(root: DirectoryPath, file: FilePath): Promise<FilePath | null> {
    const [found] = await this.spellingsOnDisk(root, [file]);
    return found;
  }

  /** As `spelledOnDisk` for each of `files`, listing each folder once: a split specification runs to thousands. */
  public async spellingsOnDisk(root: DirectoryPath, files: FilePath[]): Promise<(FilePath | null)[]> {
    const listings: Listings = new Map();
    return await Promise.all(
      files.map(async (file) => {
        const directory = await this.spelledDirectory(root, file.directory(), listings);
        if (directory === null) {
          return null;
        }
        const { fileNames } = await this.listOnce(directory, listings);
        const match = spelling(file.name().toString(), fileNames, (candidate) => candidate.toString());
        return match === undefined ? null : new FilePath(directory, match);
      })
    );
  }

  /** `directory` as each folder below `root` is spelt on disk; null when one is not there, or it is not below `root`. */
  public async directorySpelledOnDisk(root: DirectoryPath, directory: DirectoryPath): Promise<DirectoryPath | null> {
    return await this.spelledDirectory(root, directory, new Map());
  }

  private async spelledDirectory(
    root: DirectoryPath,
    directory: DirectoryPath,
    listings: Listings
  ): Promise<DirectoryPath | null> {
    if (!root.contains(directory)) {
      return null;
    }
    const relative = path.relative(root.toString(), directory.toString());
    let found = root;
    for (const name of relative === '' ? [] : relative.split(path.sep)) {
      const { subDirectories } = await this.listOnce(found, listings);
      const match = spelling(name, subDirectories, (subDirectory) => path.basename(subDirectory.toString()));
      if (match === undefined) {
        return null;
      }
      found = match;
    }
    return found;
  }

  private listOnce(dir: DirectoryPath, listings: Listings): Promise<DirectoryEntries> {
    const listing = listings.get(dir.toString()) ?? this.listEntries(dir);
    listings.set(dir.toString(), listing);
    return listing;
  }

  // The direct children of `dir`, split into files and directories; both empty when it cannot
  // be read. A symlink counts as what it points at: skipping it silently drops an entry the
  // user did put there.
  private async listEntries(dir: DirectoryPath): Promise<DirectoryEntries> {
    const fileNames: FileName[] = [];
    const subDirectories: DirectoryPath[] = [];
    try {
      for (const entry of await fsExtra.readdir(dir.toString(), { withFileTypes: true })) {
        const isDirectory = entry.isSymbolicLink()
          ? (await fsExtra.stat(dir.join(entry.name).toString()).catch(() => null))?.isDirectory() ?? false
          : entry.isDirectory();
        if (isDirectory) {
          subDirectories.push(dir.join(entry.name));
        } else {
          fileNames.push(new FileName(entry.name));
        }
      }
    } catch {
      // Unreadable: reported as empty, the caller has nothing to do about it.
    }
    return { fileNames, subDirectories };
  }

  public async copyDirectoryContents(source: DirectoryPath, destination: DirectoryPath) {
    await this.forEachEntry(source, destination, (from, to) => fsExtra.copy(from, to));
  }

  /** Copies what links point to, so relative ones still resolve. `excluding` ignores case, as Windows and macOS do. */
  public async copyDirectoryContentsFollowingLinks(
    source: DirectoryPath,
    destination: DirectoryPath,
    excluding: readonly FileName[] = []
  ) {
    await this.forEachEntry(
      source,
      destination,
      (from, to) => fsExtra.copy(from, to, { dereference: true }),
      excluding
    );
  }

  public async moveDirectoryContents(source: DirectoryPath, destination: DirectoryPath) {
    await this.forEachEntry(source, destination, (from, to) => fsExtra.move(from, to, { overwrite: true }));
  }

  private async forEachEntry(
    source: DirectoryPath,
    destination: DirectoryPath,
    operation: (from: string, to: string) => Promise<void>,
    excluding: readonly FileName[] = []
  ) {
    const entries = await fsExtra.readdir(source.toString());
    // Settled rather than raced, so no entry is still being written when the caller cleans up after a failure.
    const outcomes = await Promise.allSettled(
      entries
        .filter((entry) => !excluding.some((name) => name.is(entry)))
        .map((entry) => operation(path.join(source.toString(), entry), path.join(destination.toString(), entry)))
    );
    const failure = outcomes.find((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected');
    if (failure) {
      throw failure.reason;
    }
  }

  public async deleteFile(filePath: FilePath): Promise<void> {
    const exists = await this.fileExists(filePath);
    if (exists) {
      await fsExtra.remove(filePath.toString());
    }
  }

  public async deleteDirectory(dirPath: DirectoryPath): Promise<void> {
    const exists = await this.directoryExists(dirPath);
    if (exists) {
      await fsExtra.remove(dirPath.toString());
    }
  }

  public async getStream(filePath: FilePath) {
    return fs.createReadStream(filePath.toString());
  }

  public async getContents(filePath: FilePath): Promise<string> {
    return await fsExtra.readFile(filePath.toString(), 'utf-8');
  }

  public async writeFile(filePath: FilePath, stream: NodeJS.ReadableStream) {
    const writeStream = fs.createWriteStream(filePath.toString());
    await streamPipeline(stream, writeStream);
  }

  public async ensurePathExists(filePath: FilePath) {
    await fsExtra.ensureFile(filePath.toString());
  }

  public async writeContents(filePath: FilePath, contents: string) {
    await fsExtra.writeFile(filePath.toString(), contents, 'utf-8');
  }

  public async getBytes(filePath: FilePath): Promise<Uint8Array> {
    return new Uint8Array(await fsExtra.readFile(filePath.toString()));
  }

  /** The bytes as they are, with the directories above the file made as needed. */
  public async writeBytes(filePath: FilePath, content: Uint8Array): Promise<void> {
    await fsExtra.ensureDir(filePath.directory().toString());
    await fsExtra.writeFile(filePath.toString(), content);
  }

  /** Owner-only, as git's own sample hooks are; git runs a hook only when it is executable. */
  public async makeExecutable(filePath: FilePath): Promise<void> {
    await fsExtra.chmod(filePath.toString(), 0o700);
  }

  /** Removes `directory` and then each parent while it is empty, stopping below `within`, which stays whatever it holds. */
  public async removeEmptyDirectories(directory: DirectoryPath, within: DirectoryPath): Promise<void> {
    for (let current = directory; within.isAncestorOf(current); current = current.join('..')) {
      try {
        await fsExtra.rmdir(current.toString());
      } catch {
        return;
      }
    }
  }

  /**
   * Writes beside the target and renames over it, so a fault mid-write leaves the target as it
   * was rather than half-written. The temporary file goes on a failure for the same reason: a
   * write that did not happen must leave nothing behind.
   */
  public async replaceContents(filePath: FilePath, contents: string): Promise<void> {
    const target = filePath.toString();
    await fsExtra.ensureDir(path.dirname(target));
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      await fsExtra.writeFile(temporary, contents, 'utf-8');
      await fsExtra.rename(temporary, target);
    } catch (error) {
      await fsExtra.remove(temporary).catch(() => undefined);
      throw error;
    }
  }

  /** Renamed over, so a watcher never reads it half-written, and skipped when unchanged, so nothing reloads. */
  public async replaceContentsIfChanged(filePath: FilePath, contents: string): Promise<boolean> {
    const current = (await this.fileExists(filePath)) ? await this.getContents(filePath) : null;
    if (current === contents) {
      return false;
    }
    await this.replaceContents(filePath, contents);
    return true;
  }

  public async copy(source: FilePath, destination: FilePath) {
    await fsExtra.copyFile(source.toString(), destination.toString());
  }

  /** Skipped when the destination has the source's size and time, to the millisecond a copy keeps. */
  public async copyIfChanged(source: FilePath, destination: FilePath): Promise<boolean> {
    const [from, to] = await Promise.all([
      fsExtra.stat(source.toString()),
      fsExtra.stat(destination.toString()).catch(() => undefined)
    ]);
    if (to !== undefined && to.size === from.size && Math.trunc(to.mtimeMs) === Math.trunc(from.mtimeMs)) {
      return false;
    }
    await fsExtra.copy(source.toString(), destination.toString(), { preserveTimestamps: true });
    return true;
  }

  public async isZipFile(filePath: FilePath): Promise<boolean> {
    try {
      const buffer = await fsExtra.readFile(filePath.toString());
      return (
        buffer.length >= 4 &&
        buffer[0] === 0x50 && // P
        buffer[1] === 0x4b && // K
        buffer[2] === 0x03 && // \x03
        buffer[3] === 0x04
      ); // \x04
    } catch {
      return false;
    }
  }
}

const streamPipeline = promisify(pipeline);
