import * as fs from "fs-extra";
import * as path from "path";
import { getMessageInRedColor, getNonHiddenItemsFromDirectory } from "../../utils/utils";

export class DirectoryValidator {
  constructor(private readonly error: (message: string) => void) {}

  validateSourceDirectory(sourceDir: string) {
    if (!fs.pathExistsSync(sourceDir)) {
      this.error(getMessageInRedColor(`The specified source directory does not exist: ${sourceDir}`));
    }
  }

  async validateGeneratedPortalDestinationDirectory(destinationDir: string, portalDir: string) {
    if (!fs.pathExistsSync(destinationDir) && destinationDir != "./api-portal") {
      this.error(getMessageInRedColor(`The specified destination directory does not exist: ${destinationDir}`));
    }

    if (destinationDir == "./api-portal") {
      await fs.ensureDir(portalDir);
    }
  }

  validatePortalSourceDirectory(sourceDir: string) {
    const sourceDirItems = getNonHiddenItemsFromDirectory(sourceDir);
    if (sourceDirItems.length == 0) {
      this.error(getMessageInRedColor("The source directory is empty. Please check the source path and try again."));
    }
    if (!sourceDirItems.includes("spec")) {
      this.error(
        getMessageInRedColor("The spec directory is missing. Please specify a valid spec file in the spec directory.")
      );
    }
    if (!sourceDirItems.some((item) => item.startsWith("APIMATIC-BUILD"))) {
      this.error(
        getMessageInRedColor(
          "APIMatic Build file is missing, portal cannot be generated. Please specify a valid APIMatic build file and try again."
        )
      );
    }
  }

  validatePortalSourceSpecDirectory(sourceDir: string) {
    const specFolderItems = getNonHiddenItemsFromDirectory(path.join(sourceDir, "spec"));
    if (specFolderItems.length == 0) {
      this.error(
        getMessageInRedColor("The spec directory is empty. Please specify a valid spec file in the spec directory.")
      );
    }
    if (specFolderItems.length == 1 && specFolderItems.some((item) => item.toLowerCase().startsWith("apimatic-meta"))) {
      this.error(
        getMessageInRedColor(
          "The spec directory is missing a spec file. Please specify a valid spec file in the spec directory."
        )
      );
    }
  }

  validateGeneratedPortalDestinationDirectoryIsEmpty(destinationDir: string) {
    const portalDirItems = getNonHiddenItemsFromDirectory(destinationDir);
    if (portalDirItems.length > 0 && destinationDir != "./api-portal") {
      this.error(
        getMessageInRedColor(
          "The specified destination directory is not empty. Please check the destination path and try again."
        )
      );
    }
  }
}
