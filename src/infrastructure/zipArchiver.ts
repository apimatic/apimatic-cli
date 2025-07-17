import fs from "fs";
import archiver from "archiver";
import { DirectoryPath } from "../models/directoryPath.js";
import { FilePath } from "../models/filePath.js";

export class ZipArchiver {
  public async archive(sourceDir: DirectoryPath, outputZipPath: FilePath): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(outputZipPath.toString());
      const archive = archiver("zip", { zlib: { level: 9 } });

      output.on("close", () => resolve());
      archive.on("error", (err) => reject(err));

      archive.pipe(output);
      archive.directory(sourceDir.toString(), false); // false: don't nest under folder
      archive.finalize();
    });
  }
}
