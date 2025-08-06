import fs from "fs";
import archiver from "archiver";
import extract from "extract-zip";
import { DirectoryPath } from "../types/file/directoryPath.js";
import { FilePath } from "../types/file/filePath.js";

const MAX_FILES = 10000;
const MAX_SIZE = 1000000000; // 1 GB

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
    // await extract(sourceFile.toString(), { dir: destinationDirectory.toString() });
    let fileCount = 0;
    let totalSize = 0;

    await extract(sourceFile.toString(), {
      dir: destinationDirectory.toString(),
      onEntry: function (entry) {
        fileCount++;
        if (fileCount > MAX_FILES) {
          throw "Reached max. number of files";
        }

        // The uncompressedSize comes from the zip headers, so it might not be trustworthy.
        // Alternatively, calculate the size from the readStream.
        let entrySize = entry.uncompressedSize;
        totalSize += entrySize;
        if (totalSize > MAX_SIZE) {
          throw "Reached max. size";
        }

        // if (entry.compressedSize > 0) {
        //   let compressionRatio = entrySize / entry.compressedSize;
        //   if (compressionRatio > THRESHOLD_RATIO) {
        //     throw "Reached max. compression ratio";
        //   }
        // }
      }
    });
  }
}
