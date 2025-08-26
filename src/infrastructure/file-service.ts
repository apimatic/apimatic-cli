import fs from "fs";
import fsExtra from "fs-extra";
import * as path from "path";
import { FilePath } from "../types/file/filePath.js";
import { DirectoryPath } from "../types/file/directoryPath.js";
import { pipeline } from "stream";
import { promisify } from "util";
import { DirectoryNode } from "../types/file/directoryNode.js";

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

  public async directoryEmpty(dir: DirectoryPath): Promise<boolean> {
    try {
      const files = await fsExtra.readdir(dir.toString());
      return files.length === 0;
    } catch (error) {
      return error instanceof Error && "code" in error && error.code === "ENOENT";
    }
  }

  public async cleanDirectory(dir: DirectoryPath): Promise<void> {
    await fsExtra.ensureDir(dir.toString());
    await fsExtra.emptyDir(dir.toString()); // removes everything inside, keeps the dir
  }

  public async createDirectoryIfNotExists(dir: DirectoryPath): Promise<void> {
    await fsExtra.ensureDir(dir.toString());
  }

  public async copyDirectory(source: DirectoryPath, destination: DirectoryPath) {
    await fsExtra.copy(source.toString(), destination.toString());
  }

  public async copyDirectoryContents(source: DirectoryPath, destination: DirectoryPath) {
    const entries = await fsExtra.readdir(source.toString());
    await Promise.all(
      entries.map(async (entry) => {
        const srcEntry = path.join(source.toString(), entry);
        const destEntry = path.join(destination.toString(), entry);
        await fsExtra.copy(srcEntry, destEntry);
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

  public async getStream(filePath: FilePath) {
    return fs.createReadStream(filePath.toString());
  }

  public async getContents(filePath: FilePath): Promise<string> {
    return await fsExtra.readFile(filePath.toString(), "utf-8");
  }

  public async writeFile(filePath: FilePath, stream: NodeJS.ReadableStream) {
    const writeStream = fs.createWriteStream(filePath.toString());
    await streamPipeline(stream, writeStream);
  }

  public async writeContents(filePath: FilePath, contents: string) {
    await fsExtra.writeFile(filePath.toString(), contents, "utf-8");
  }

  public async copy(source: FilePath, destination: FilePath) {
    await fsExtra.copyFile(source.toString(), destination.toString());
  }

  public removeQuotes(path: string): string {
    const quotes = ['"', "'"];

    for (const quote of quotes) {
      if (path.startsWith(quote) && path.endsWith(quote) && path.length > 1) {
        return this.removeQuotes(path.slice(1, -1)); // Recursive call
      }
    }
    return path;
  }

  public convertDirectoryStructureToJson(
    directoryPath: string,
    descriptions: { [key: string]: string },
    parentPath = ""
  ): { [key: string]: DirectoryNode | string | null | undefined } {
    const directoryStructure: { [key: string]: DirectoryNode | string | null | undefined } = {};

    const items = fs.readdirSync(directoryPath);
    items.forEach((item) => {
      if (item === ".git") return; // Skip .git directory

      const itemPath = path.join(directoryPath, item);
      const relativePath = path.join(parentPath, item);
      const stats = fs.statSync(itemPath);

      if (stats.isDirectory()) {
        const subdirectoryStructure = this.convertDirectoryStructureToJson(itemPath, descriptions, relativePath);

        const folderName = descriptions[path.normalize(relativePath)]
          ? `${item} : ${descriptions[path.normalize(relativePath)]}`
          : item;

        directoryStructure[folderName] = subdirectoryStructure;
      } else {
        directoryStructure[
          descriptions[path.normalize(relativePath)] ? `${item} : ${descriptions[path.normalize(relativePath)]}` : item
        ] = null;
      }
    });

    return directoryStructure;
  }
}

const streamPipeline = promisify(pipeline);
