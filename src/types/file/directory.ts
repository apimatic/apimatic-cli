import { DirectoryPath } from './directoryPath.js';
import { FileName } from './fileName.js';
import { FilePath } from './filePath.js';
import { File } from './file.js';
import fsExtra from "fs-extra";
import * as path from "path";

export class Directory {
  public readonly directoryPath: DirectoryPath;
  public readonly items: (FileName | Directory)[];


  private constructor(directoryPath: DirectoryPath, filePaths: (File | Directory)[]) {
    this.directoryPath = directoryPath;
    this.items = filePaths;
  }

  public static async parseFromDirectoryPath(directoryPath: DirectoryPath): Promise<Directory> {
    const contents = await this.readDirectoryContents(directoryPath);
    return new Directory(directoryPath, contents);
  }

  private static async readDirectoryContents(dir: DirectoryPath): Promise<(Directory | File)[]> {
    try {
      const entries = await fsExtra.readdir(dir.toString());
      const results = await Promise.all(
        entries.map(async (entry) => {
          const fullPath = path.join(dir.toString(), entry);
          const stat = await fsExtra.stat(fullPath);
          return stat.isDirectory() ? await this.parseFromDirectoryPath(new DirectoryPath(fullPath)) : new File(new FilePath(dir, new FileName(entry)));
        })
      );
      return results;
    } catch {
      return [];
    }
  }
}
