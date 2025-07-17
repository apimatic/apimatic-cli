import * as fs from 'fs-extra';
import { FilePath } from "../models/filePath.js";
import { DirectoryPath } from "../models/directoryPath.js";
import { pipeline } from 'stream';
import { promisify } from 'util';


export class FileService {
  public async fileExists(file: FilePath): Promise<boolean> {
    try {
      const stat = await fs.stat(file.toString());
      return stat.isFile();
    } catch {
      return false;
    }
  }

  public async directoryExists(dir: DirectoryPath): Promise<boolean> {
    try {
      const stat = await fs.stat(dir.toString());
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  public async deleteDirectory(dir: DirectoryPath): Promise<void> {
    const dirPath = dir.toString();
    const exists = await this.directoryExists(dir);
    if (exists) {
      await fs.rm(dirPath, { recursive: true, force: true });
    }
  }

  public async deleteFile(filePath: FilePath): Promise<void> {
    const exists = await this.fileExists(filePath);
    if (exists) {
      await fs.remove(filePath.toString());
    }
  }

  public async getStream(filePath: FilePath) {
    return fs.createReadStream(filePath.toString());
  }

  public async writeFile(filePath: FilePath, stream: NodeJS.ReadableStream) {
    const writeStream  = fs.createWriteStream(filePath.toString());
    await streamPipeline(stream, writeStream );
  }
}

const streamPipeline = promisify(pipeline);
