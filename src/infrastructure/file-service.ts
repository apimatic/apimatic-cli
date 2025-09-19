import fs from "fs";
import fsExtra from "fs-extra";
import * as path from "path";
import { pipeline } from "stream";
import { promisify } from "util";
import { FilePath } from "../types/file/filePath.js";
import { DirectoryPath } from "../types/file/directoryPath.js";
import { Directory } from "../types/file/directory.js";
import { FileName } from "../types/file/fileName.js";

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
      return files.filter((file) => !file.startsWith(".")).length === 0;
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

  public async getDirectory(directoryPath: DirectoryPath): Promise<Directory> {
    const entries = await fsExtra.readdir(directoryPath.toString());
    const results = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(directoryPath.toString(), entry);
        const stat = await fsExtra.stat(fullPath);
        return stat.isDirectory() ? await this.getDirectory(new DirectoryPath(fullPath)) : new FileName(entry);
      })
    );
    return new Directory(directoryPath, results);
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

  public getRelativePath(filePath: FilePath, basePath: DirectoryPath): string {
    const filePathStr = filePath.toString();
    const basePathStr = basePath.toString();

    if (filePathStr.startsWith(basePathStr)) {
      const relativePath = filePathStr.substring(basePathStr.length).replace(/^[/\\]/, "");
      return relativePath.replace(/\\/g, "/");
    }

    // Normalize the full path if it doesn't start with basePath
    return filePathStr.replace(/\\/g, "/");
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

  public async ensurePathExists(filePath: FilePath) {
    await fsExtra.ensureFile(filePath.toString());
  }

  public async writeContents(filePath: FilePath, contents: string) {
    await fsExtra.writeFile(filePath.toString(), contents, "utf-8");
  }

  public async copy(source: FilePath, destination: FilePath) {
    await fsExtra.copyFile(source.toString(), destination.toString());
  }

  public async copyToDir(source: FilePath, destination: DirectoryPath) {
    await fsExtra.copyFile(source.toString(), source.replaceDirectory(destination).toString());
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
