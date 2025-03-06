import * as fs from "fs-extra";
import * as path from "path";
import { getMessageInRedColor, getNonHiddenItemsFromDirectory } from "../../utils/utils";

export class DirectoryValidator {
  constructor(private readonly error: (message: string) => void) {}

  validateSourceDirectory(sourceDir: string) {
    if (!fs.pathExistsSync(sourceDir)) {
      this.error(getMessageInRedColor(`The specified source directory does not exist: ${sourceDir}. Please provide a valid source directory to continue.`));
    }
  }

  async validateGeneratedPortalDestinationDirectory(destinationDir: string, portalDir: string) {
    if (!fs.pathExistsSync(destinationDir) && destinationDir != "./api-portal") {
      this.error(getMessageInRedColor(`The specified destination directory does not exist: ${destinationDir}. Please provide a valid destination directory to continue.`));
    }

    if (destinationDir == "./api-portal") {
      await fs.ensureDir(portalDir);
    }
  }

  validatePortalSourceDirectory(sourceDir: string) {
    const sourceDirItems = getNonHiddenItemsFromDirectory(sourceDir);
    if (sourceDirItems.length == 0) {
      this.error(getMessageInRedColor("The source directory is empty. Please ensure that the provided path points to a directory containing a valid build input."));
    }
    if (!sourceDirItems.includes("spec")) {
      this.error(
        getMessageInRedColor("The provided build directory is missing a ‘spec’ directory. Please create a ‘spec’ directory containing a valid API Definition file to continue.")
      );
    }
    if (!sourceDirItems.some((item) => item.startsWith("APIMATIC-BUILD"))) {
      this.error(
        getMessageInRedColor(
          "The provided directory is missing an APIMATIC-BUILD.json file. Please add a valid build file to continue."
        )
      );
    }
  }

  validatePortalSourceSpecDirectory(sourceDir: string) {
    const specFolderItems = getNonHiddenItemsFromDirectory(path.join(sourceDir, "spec"));
    if (specFolderItems.length == 0) {
      this.error(
        getMessageInRedColor("The provided build directory is missing an API Definition file. Please add a valid API Definition file to the ‘spec’ directory to continue.")
      );
    }
    if (specFolderItems.length == 1 && specFolderItems.some((item) => item.toLowerCase().startsWith("apimatic-meta"))) {
      this.error(
        getMessageInRedColor(
          "The provided build directory is missing an API Definition file. Please add a valid API Definition file to the ‘spec’ directory to continue."
        )
      );
    }
  }

  validateGeneratedPortalDestinationDirectoryIsEmpty(destinationDir: string) {
    const portalDirItems = getNonHiddenItemsFromDirectory(destinationDir);
    if (portalDirItems.length > 0 && destinationDir != "./api-portal") {
      this.error(
        getMessageInRedColor(
          "The destination directory is not empty. Please specify an empty destination directory or empty the provided directory."
        )
      );
    }
  }
}
