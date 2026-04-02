import fs from "fs";
import yazl from "yazl";
import extract from "extract-zip";
import { DirectoryPath } from "../types/file/directoryPath.js";
import { FilePath } from "../types/file/filePath.js";

export class ZipService {
  public async archive(sourceDir: DirectoryPath, outputZipPath: FilePath): Promise<void> {
    return new Promise((resolve, reject) => {
      const zipfile = new yazl.ZipFile();

      const addDirectory = (dir: DirectoryPath, relativePrefix: string) => {
        for (const entry of fs.readdirSync(dir.toString(), { withFileTypes: true })) {
          const fullPath = dir.join(entry.name);
          // Always use forward slashes as metadataPath — zip format requires it
          const metadataPath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            addDirectory(fullPath, metadataPath);
          } else {
            zipfile.addFile(fullPath.toString(), metadataPath);
          }
        }
      };

      try { addDirectory(sourceDir, ""); } catch (err) { return reject(err); }

      zipfile.end();
      const output = fs.createWriteStream(outputZipPath.toString());
      zipfile.outputStream.pipe(output);
      output.on("close", resolve);
      output.on("error", reject);
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
