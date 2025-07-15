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
        "The source directory is empty. Please ensure that the directory contains a valid build input."
      );
    }
    if (!sourceDirItems.some((item) => item.startsWith("APIMATIC-BUILD.json"))) {
      return Result.failure(
        "The source directory is missing the 'APIMATIC-BUILD.json' file. Please add a valid build config file to continue."
      );
    }
    if (!sourceDirItems.includes("spec")) {
      return Result.failure(
        "The source directory is missing a 'spec' directory. Please create a 'spec' directory containing a valid API Definition file to continue."
      );
    }

    return Result.success(`Source directory ${sourceDir} is valid.`);
  }

  public async validateDestinationDirectory(destinationDirectoryPath: string): Promise<Result<string, string>> {
    if (destinationDirectoryPath == this.GENERATED_PORTAL_DIRECTORY_PATH) {
      await fsExtra.ensureDir(destinationDirectoryPath);
    }

    if (!fsExtra.pathExistsSync(destinationDirectoryPath)) {
      return Result.failure(
        `The destination directory does not exist: ${destinationDirectoryPath}. Please provide a valid destination directory to continue.`
      );
    }

    const portalDirectoryItems = this.getDirectoryItems(destinationDirectoryPath);
    if (portalDirectoryItems.length > 0 && !destinationDirectoryPath.endsWith("generated_portal")) {
      return Result.failure(
        "The destination directory is not empty. Please specify an empty destination directory or clear the contents of the provided directory."
      );
    }

    return Result.success(`Destination directory ${destinationDirectoryPath} is valid.`);
  }

  public validateSpecDirectory(sourceDirectoryPath: string): Result<string, string> {
    const specDirectoryPath = path.join(sourceDirectoryPath, "spec");
    const specDirectoryItems = this.getDirectoryItems(specDirectoryPath);

    if (specDirectoryItems.length == 0) {
      return Result.failure(
        "The 'spec' directory is missing an API Definition file. Please add a valid API Definition file to the 'spec' directory to continue."
      );
    }

    if (
      specDirectoryItems.length == 1 &&
      specDirectoryItems.some((item) => item.toLowerCase().includes("apimatic-meta"))
    ) {
      return Result.failure(
        "The 'spec' directory is missing an API Definition file. Please add a valid API Definition file to the 'spec' directory to continue."
      );
    }

    return Result.success(`Spec directory ${specDirectoryPath} is valid.`);
  }

  private getDirectoryItems(directoryPath: string): string[] {
    return readdirSync(directoryPath).filter((item) => !item.startsWith("."));
  }
}
