import fs from "fs";
import archiver from "archiver";
import extract from "extract-zip";
import { DirectoryPath } from "../types/file/directoryPath.js";
import { FilePath } from "../types/file/filePath.js";

export class ZipService {
  public async archive(sourceDir: DirectoryPath, outputZipPath: FilePath): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(outputZipPath.toString());
      const archive = archiver("zip");

      output.on("close", () => resolve());
      archive.on("error", (err) => reject(err));

      archive.pipe(output);
      archive.directory(sourceDir.toString(), false); // false: don't nest under folder
      archive.finalize();
    });
  }

  async unArchive(sourceFile: FilePath, destinationDirectory: DirectoryPath): Promise<void> {
    await extract(sourceFile.toString(), { dir: destinationDirectory.toString() });
  }
}
