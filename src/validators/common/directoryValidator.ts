import * as path from "path";
import fsExtra from "fs-extra";
import { readdirSync } from "fs";
import { Result } from "../../types/common/result.js";

export class DirectoryValidator {
  private readonly GENERATED_PORTAL_DIRECTORY_PATH = "./generated_portal";

  public validateSourceDirectory(sourceDir: string): Result<string, string> {
    if (!fsExtra.pathExistsSync(sourceDir)) {
      return Result.failure(
        `The specified source directory does not exist: ${sourceDir}. Please provide a valid source directory to continue.`
      );
    }

    const sourceDirItems = this.getDirectoryItems(sourceDir);
    if (sourceDirItems.length == 0) {
      return Result.failure(
        "The source directory is empty. Please ensure that the provided path points to a directory containing a valid build input."
      );
    }
    if (!sourceDirItems.includes("spec")) {
      return Result.failure(
        "The provided build directory is missing a 'spec' directory. Please create a 'spec' directory containing a valid API Definition file to continue."
      );
    }
    if (!sourceDirItems.some((item) => item.includes("APIMATIC-BUILD"))) {
      // Are we planning on this?
      return Result.failure(
        "The provided directory is missing an APIMATIC-BUILD.json file. Please add a valid build file to continue."
      );
    }

    return Result.success(`Source directory ${sourceDir} is valid.`);
  }

  public async validateDestinationDirectory(
    destinationDir: string,
    portalDir: string
  ): Promise<Result<string, string>> {
    if (!fsExtra.pathExistsSync(destinationDir) && destinationDir != this.GENERATED_PORTAL_DIRECTORY_PATH) {
      return Result.failure(
        `The specified destination directory does not exist: ${destinationDir}. Please provide a valid destination directory to continue.`
      );
    }

    if (destinationDir == this.GENERATED_PORTAL_DIRECTORY_PATH) {
      await fsExtra.ensureDir(portalDir);
    }

    const portalDirectoryItems = this.getDirectoryItems(destinationDir);
    if (portalDirectoryItems.length > 0) {
      return Result.failure(
        "The destination directory is not empty. Please specify an empty destination directory or empty the provided directory."
      );
    }

    return Result.success(`Destination directory ${destinationDir} is valid.`);
  }

  public validateSpecDirectory(sourceDir: string) : Result<string, string>{
    const specDirectoryPath = path.join(sourceDir, "spec");
    const specDirectoryItems = this.getDirectoryItems(specDirectoryPath);
    if (specDirectoryItems.length == 0) {
      return Result.failure(
        "The provided build directory is missing an API Definition file. Please add a valid API Definition file to the 'spec' directory to continue."
      );
    }
    if (specDirectoryItems.length == 1 && specDirectoryItems.some((item) => item.toLowerCase().includes("apimatic-meta"))) {
      return Result.failure(
        "The provided build directory is missing an API Definition file. Please add a valid API Definition file to the 'spec' directory to continue."
      );
    }

    return Result.success(`Spec directory ${specDirectoryPath} is valid.`);
  }

  private getDirectoryItems(directoryPath: string): string[] {
    return readdirSync(directoryPath).filter((item) => !item.startsWith("."));
  }
}
