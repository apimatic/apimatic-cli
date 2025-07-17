import fsExtra from "fs-extra";
import { readdirSync } from "fs";
import { Result } from "../../types/common/result.js";

export class DirectoryValidator {
  public validateSourceDirectory(sourceDir: string): Result<string, string> {
    if (!fsExtra.pathExistsSync(sourceDir)) {
      return Result.failure(
        `The specified source directory does not exist: ${sourceDir}. Please provide a valid source directory to continue.`
      );
    }

    const sourceDirItems = this.getDirectoryItems(sourceDir);
    if (sourceDirItems.length == 0) {
      return Result.failure(
        "The source directory is empty. Please ensure that the directory contains a valid build input."
      );
    }
    if (!sourceDirItems.some((item) => item.endsWith("APIMATIC-BUILD.json"))) {
      return Result.failure(
        "The source directory is missing the 'APIMATIC-BUILD.json' file. Please add a valid build config file to continue."
      );
    }

    return Result.success(`Source directory ${sourceDir} is valid.`);
  }

  private getDirectoryItems(directoryPath: string): string[] {
    return readdirSync(directoryPath).filter((item) => !item.startsWith("."));
  }
}
