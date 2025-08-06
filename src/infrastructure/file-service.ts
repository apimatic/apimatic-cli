import fs from "fs";
import fsExtra from "fs-extra";
import { FilePath } from "../types/file/filePath.js";
import { DirectoryPath } from "../types/file/directoryPath.js";
import { pipeline } from "stream";
import { promisify } from "util";

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

  public async deleteFile(filePath: FilePath): Promise<void> {
    const exists = await this.fileExists(filePath);
    if (exists) {
      await fsExtra.remove(filePath.toString());
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
}

const streamPipeline = promisify(pipeline);
