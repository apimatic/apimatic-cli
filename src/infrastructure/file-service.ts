import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import fsExtra from 'fs-extra';
import * as path from 'node:path';
import { pipeline } from 'node:stream';
import { promisify } from 'node:util';
import { FilePath } from '../types/file/filePath.js';
import { DirectoryPath } from '../types/file/directoryPath.js';
import { Directory, DirectoryItem } from '../types/file/directory.js';
import { FileName } from '../types/file/fileName.js';
import { sleep } from './timer-extensions.js';

/** `stat` follows a link, so a link to nothing fails as though the entry were not there. */
function isDanglingLink(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

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

  public fileExistsSync(file: FilePath): boolean {
    try {
      const stat = fsExtra.statSync(file.toString());
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
    const names = path.relative(root.toString(), file.toString()).split(path.sep);
    const fileName = names.pop() ?? '';
    let directory = root;
    for (const name of names) {
      const { subDirectories } = await this.listEntries(directory);
      const match = spelling(name, subDirectories, (subDirectory) => path.basename(subDirectory.toString()));
      if (match === undefined) {
        return null;
      }
      directory = match;
    }
    const { fileNames } = await this.listEntries(directory);
    const match = spelling(fileName, fileNames, (candidate) => candidate.toString());
    return match === undefined ? null : new FilePath(directory, match);
  }

  // The direct children of `dir`, split into files and directories; both empty when it cannot
  // be read. A symlink counts as what it points at: skipping it silently drops an entry the
  // user did put there.
  private async listEntries(dir: DirectoryPath): Promise<{ fileNames: FileName[]; subDirectories: DirectoryPath[] }> {
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

  public async moveDirectoryContents(source: DirectoryPath, destination: DirectoryPath) {
    await this.forEachEntry(source, destination, (from, to) => fsExtra.move(from, to, { overwrite: true }));
  }

  private async forEachEntry(
    source: DirectoryPath,
    destination: DirectoryPath,
    operation: (from: string, to: string) => Promise<void>
  ) {
    const entries = await fsExtra.readdir(source.toString());
    await Promise.all(
      entries.map((entry) => operation(path.join(source.toString(), entry), path.join(destination.toString(), entry)))
    );
  }

  public async copyDirectoryExcluding(
    source: DirectoryPath,
    destination: DirectoryPath,
    excludeNames: FileName[]
  ): Promise<void> {
    await this.createDirectoryIfNotExists(destination);

    const entries = await fsExtra.readdir(source.toString());

    await Promise.all(
      entries
        .filter((entry) => !excludeNames.find((exclude) => exclude.toString() === entry))
        .map(async (entry) => {
          const sourcePath = path.join(source.toString(), entry);
          const destPath = path.join(destination.toString(), entry);
          const stat = await fsExtra.stat(sourcePath);

          if (stat.isDirectory()) {
            return this.copyDirectoryExcluding(
              new DirectoryPath(sourcePath),
              new DirectoryPath(destPath),
              excludeNames
            );
          }

          return fsExtra.copyFile(sourcePath, destPath);
        })
    );
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

  public async pollDeleteDirectory(dirPath: DirectoryPath, onDeleteFailurePersists: () => void): Promise<void> {
    const timeoutMs = 5 * 60 * 1000;
    const deadline = Date.now() + timeoutMs;
    const deleteFailurePersistsMaxDelay = Date.now() + 5 * 1000;
    let actionPerformed = false;
    while (
      Date.now() < deadline &&
      (await this.deleteDirectory(dirPath)
        .then(() => false)
        .catch(() => true))
    ) {
      if (!actionPerformed && Date.now() > deleteFailurePersistsMaxDelay) {
        onDeleteFailurePersists();
        actionPerformed = true;
      }
      await sleep(500);
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

  /**
   * Copies unless the destination has the source's size and time of change, which the copy keeps,
   * so a watcher of the destination hears of nothing that did not change. Whole milliseconds are
   * compared, since that is all a copied time keeps.
   */
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

  public async copyToDir(source: FilePath, destination: DirectoryPath) {
    await fsExtra.copyFile(source.toString(), source.replaceDirectory(destination).toString());
  }

  public async readFile(filePath: FilePath): Promise<string> {
    return await fsExtra.readFile(filePath.toString(), 'utf-8');
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

  public async hasContent(file: FilePath, content: string): Promise<boolean> {
    return (await this.fileExists(file)) && (await this.readFile(file)).includes(content);
  }

  public async getAvailableDirectoryPath(currentPath: DirectoryPath): Promise<DirectoryPath> {
    if (!(await this.directoryExists(currentPath))) return currentPath;

    const dir = path.dirname(currentPath.toString());
    let baseName = path.basename(currentPath.toString());

    // Strip existing " (n)" suffix using string methods
    if (baseName.endsWith(')')) {
      const open = baseName.lastIndexOf('(');
      if (open !== -1 && baseName[open - 1] === ' ') {
        const inner = baseName.slice(open + 1, -1);
        if (inner.length > 0 && !isNaN(Number(inner))) {
          baseName = baseName.slice(0, open - 1);
        }
      }
    }

    let counter = 1;
    let newPath: string;

    do {
      newPath = path.join(dir, `${baseName} (${counter++})`);
    } while (await this.directoryExists(new DirectoryPath(newPath)));

    return new DirectoryPath(newPath);
  }
}

const streamPipeline = promisify(pipeline);
