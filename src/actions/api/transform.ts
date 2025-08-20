import * as path from "path";
import fsExtra from "fs-extra";

import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../action-result.js";
import { ApiTransformPrompts } from "../../prompts/api/transform.js";
import { DestinationFormats } from "../../types/api/transform.js";
import { getFileNameFromPath } from "../../utils/utils.js";

import { withDirPath } from "../../infrastructure/tmp-extensions.js";
import { TransformationService } from "../../infrastructure/services/transform-service.js";
import { FilePath } from "../../types/file/filePath.js";
import { FileName } from "../../types/file/fileName.js";

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
    file?: FilePath,
    url?: string
  ): Promise<ActionResult> => {
    if (!file && !url) {
      return ActionResult.error("Please provide either a specification file or URL");
    }

    if (file && url) {
      return ActionResult.error("Please provide either a file or URL, not both");
    }

    const destinationFileName = file ? getFileNameFromPath(file.toString()) : getFileNameFromPath(url || "");
    const destinationFormat: string = DestinationFormats[format as keyof typeof DestinationFormats];
    const destinationFilePath: FilePath = new FilePath(
      new DirectoryPath(path.dirname(path.join(destination.toString(), `${destinationFileName}_${format}.${destinationFormat}`.toLowerCase()))),
      new FileName(destinationFileName)
    );

    if ((await fsExtra.pathExists(destinationFilePath.toString())) && !force) {
      return ActionResult.error(
        `Can't download transformed file to path ${destinationFilePath.toString()}, because it already exists`
      );
    }

    if (file && !(await fsExtra.pathExists(file.toString()))) {
      return ActionResult.error(`Spec file: ${file} does not exist`);
    }

    if (!(await fsExtra.pathExists(destination.toString()))) {
      await fsExtra.ensureDir(destination.toString());
    }

    return await withDirPath(async (tempDirectory) => {
      this.prompts.displayApiTransformationMessage();

      let result;

      if (file) {
        result = await this.transformationService.transformViaFileAndDownload({
          file,
          format,
          tempDirectory,
          destinationFilePath,
          configDir: this.configDir,
          authKey: this.authKey
        });
      } else {
        result = await this.transformationService.transformViaUrlAndDownload({
          url: url!,
          format,
          tempDirectory,
          destinationFilePath,
          configDir: this.configDir,
          authKey: this.authKey
        });
      }

      if (!result.isSuccess()) {
        this.prompts.displayApiTransformationFailureMessage();
        return ActionResult.error(result.error || "An unknown error occurred");
      }

      this.prompts.displayApiTransformationSuccessMessage(destinationFilePath.toString());
      return ActionResult.success();
    });
  };
}
