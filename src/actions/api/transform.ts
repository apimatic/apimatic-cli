import * as path from "path";
import fsExtra from "fs-extra";

import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../action-result.js";
import { ApiTransformPrompts } from "../../prompts/api/transform.js";
import { DestinationFormats } from "../../types/api/transform.js";
import { getFileNameFromPath } from "../../utils/utils.js";

import { withDirPath } from "../../infrastructure/tmp-extensions.js";
import { TransformationService } from "../../infrastructure/services/transform-service.js";

export class TransformAction {
  private readonly prompts: ApiTransformPrompts = new ApiTransformPrompts();
  private readonly transformationService: TransformationService = new TransformationService();
  private readonly configDir: DirectoryPath;
  private readonly authKey: string | null;

  constructor(configDir: DirectoryPath, authKey: string | null = null) {
    this.configDir = configDir;
    this.authKey = authKey;
  }

  public readonly execute = async (
    format: string,
    destination: DirectoryPath,
    force: boolean,
    file?: string,
    url?: string
  ): Promise<ActionResult> => {
    const fileName = file ? getFileNameFromPath(file) : getFileNameFromPath(url || "");
    const destinationFormat: string = DestinationFormats[format as keyof typeof DestinationFormats];
    const destinationFilePath: string = path.join(
      destination.toString(),
      `${fileName}_${format}.${destinationFormat}`.toLowerCase()
    );

    if (fsExtra.existsSync(destinationFilePath) && !force) {
      return ActionResult.error(
        `Can't download transformed file to path ${destinationFilePath}, because it already exists`
      );
    }

    if (file && !(await fsExtra.pathExists(file))) {
      return ActionResult.error(`Spec file: ${file} does not exist`);
    }
    if (!(await fsExtra.pathExists(destination.toString()))) {
      return ActionResult.error(`Destination path: ${destination} does not exist`);
    }

    return await withDirPath(async (tempDirectory) => {
      this.prompts.displayApiTransformationMessage();

      const fileName = file ? getFileNameFromPath(file) : getFileNameFromPath(url || "");
      const destinationFormat: string = DestinationFormats[format as keyof typeof DestinationFormats];
      const destinationFilePath = path.join(
        destination.toString(),
        `${fileName}_${format}.${destinationFormat}`.toLowerCase()
      );

      // Step 3: Ensure destination is valid
      if (fsExtra.existsSync(destinationFilePath) && !force) {
        return ActionResult.error(
          `Can't download transformed file to path ${destinationFilePath}, because it already exists`
        );
      }

      // Step 4: Call TransformationService (it handles client + controller)

      const result = await this.transformationService.transformAndDownload({
        file,
        url,
        format,
        tempDirectory,
        destinationFilePath,
        configDir: this.configDir,
        authKey: this.authKey
      });

      if (!result.isSuccess()) {
        this.prompts.displayApiTransformationFailureMessage();
        return ActionResult.error(result.error || "An unknown error occurred"); //To test
      }

      this.prompts.displayApiTransformationSuccessMessage(destinationFilePath);
      return ActionResult.success();
    });
  };
}
