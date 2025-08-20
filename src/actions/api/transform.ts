import fsExtra from "fs-extra";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../action-result.js";
import { ApiTransformPrompts } from "../../prompts/api/transform.js";
import { DestinationFormats } from "../../types/api/transform.js";
import { getFileNameFromPath } from "../../utils/utils.js";
import { FileService } from "../../infrastructure/file-service.js";
import { validateFileInputParams } from "../../infrastructure/api-utils.js";
import { withDirPath } from "../../infrastructure/tmp-extensions.js";
import { TransformationService } from "../../infrastructure/services/transform-service.js";
import { FilePath } from "../../types/file/filePath.js";
import { FileName } from "../../types/file/fileName.js";
import { Result } from "../../types/common/result.js";
import { ApiValidationSummary } from "@apimatic/sdk";
import { ApiValidatePrompts } from "../../prompts/api/validate.js";

export interface TransformationResultData {
  stream: NodeJS.ReadableStream;
  apiValidationSummary: ApiValidationSummary;
}

export class TransformAction {
  private readonly prompts: ApiTransformPrompts = new ApiTransformPrompts();
  private readonly validatePrompts: ApiValidatePrompts = new ApiValidatePrompts();
  private readonly transformationService: TransformationService = new TransformationService();
  private readonly fileService: FileService = new FileService();
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
    const validationResult = await validateFileInputParams(file, url);

    if (!validationResult.isSuccess()) {
      return ActionResult.error(validationResult.error!);
    }

    this.prompts.displayApiTransformationMessage();

    const destinationFileExt: string = DestinationFormats[format as keyof typeof DestinationFormats];
    const destinationFilePrefix = file ? getFileNameFromPath(file.toString()) : getFileNameFromPath(url || "");

    const destinationFileName = `${destinationFilePrefix}_${format}.${destinationFileExt}`;
    const destinationFilePath = new FilePath(destination, new FileName(destinationFileName));

    if ((await fsExtra.pathExists(destinationFilePath.toString())) && !force) {
      return ActionResult.error(
        `Can't download transformed file to path ${destinationFilePath.toString()}, because it already exists`
      );
    }

    if (!(await fsExtra.pathExists(destination.toString()))) {
      await fsExtra.ensureDir(destination.toString());
    }

    return await withDirPath(async (tempDirectory) => {
      let result: Result<TransformationResultData, string>;

      if (file) {
        result = await this.transformationService.transformViaFile({
          file,
          format,
          configDir: this.configDir,
          authKey: this.authKey
        });
      } else {
        result = await this.transformationService.transformViaUrl({
          url: url!,
          format,
          configDir: this.configDir,
          authKey: this.authKey
        });
      }

      const tempTransformedFilePath = new FilePath(tempDirectory, new FileName(`transformed_${destinationFileName}`));
      await this.fileService.writeFile(tempTransformedFilePath, result.value?.stream as NodeJS.ReadableStream);

      if (!result.isSuccess()) {
        this.validatePrompts.displayValidationMessages(
          result.value?.apiValidationSummary || { warnings: [], errors: [], messages: [] }
        );
        this.prompts.displayApiTransformationFailureMessage();
        return ActionResult.error(result.error || "An unknown error occurred");
      }

      this.prompts.displayApiTransformationSuccessMessage();
      this.validatePrompts.displayValidationMessages(
        result.value!.apiValidationSummary
      );

      return ActionResult.success();
    });
  };
}
