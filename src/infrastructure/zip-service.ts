import fs from "fs";
import archiver from "archiver";
import extract from "extract-zip";
import { DirectoryPath } from "../types/file/directoryPath.js";
import { FilePath } from "../types/file/filePath.js";

export class ZipService {
  public async archive(sourceDir: DirectoryPath, outputZipPath: FilePath, nestUnder: string | false = false): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(outputZipPath.toString());
      const archive = archiver("zip");

      output.on("close", () => resolve());
      archive.on("error", (err) => reject(err));

      archive.pipe(output);
      archive.directory(sourceDir.toString(), nestUnder);
      archive.finalize();
    });
  }

  public async unArchive(sourceFile: FilePath, destinationDirectory: DirectoryPath): Promise<void> {
    const MAX_FILES = 100_000;
    const MAX_SIZE = 1_000_000_000; // 1 GB
    let fileCount = 0;
    let totalSize = 0;

    await extract(sourceFile.toString(), {
      dir: destinationDirectory.toString(),
      onEntry: function (entry) {
        fileCount++;
        if (fileCount > MAX_FILES) {
          throw new Error("Reached max. file count");
        }
        // The uncompressedSize comes from the zip headers, so it might not be trustworthy.
        // Alternatively, calculate the size from the readStream.
        let entrySize = entry.uncompressedSize;
        totalSize += entrySize;
        if (totalSize > MAX_SIZE) {
          throw new Error("Reached max. size");
        }
      }
    });
  }
}
