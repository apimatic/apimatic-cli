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
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { getValidFormat } from "../../controllers/api/transform.js";
import { TransformContext } from "../../types/transform-context.js";

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
  private readonly commandMetadata: CommandMetadata;
  private readonly authKey: string | null;

  constructor(configDir: DirectoryPath, commandMetadata: CommandMetadata, authKey: string | null = null) {
    this.configDir = configDir;
    this.commandMetadata = commandMetadata;
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
      // TODO: Render the message here: validationResult.error!
      return ActionResult.failed();
    }

    this.prompts.displayApiTransformationMessage();

    const parsedFormat = getValidFormat(format);

    const destinationFileExt: string = DestinationFormats[parsedFormat as keyof typeof DestinationFormats];
    const destinationFilePrefix = file ? getFileNameFromPath(file.toString()) : getFileNameFromPath(url || "");

    const destinationFileName = new FileName(`${destinationFilePrefix}_${parsedFormat}.${destinationFileExt}`);
    const destinationFilePath = new FilePath(destination, destinationFileName);

    if ((await fsExtra.pathExists(destinationFilePath.toString())) && !force) {
      // TODO: Render the error message here
      // return ActionResult.error(
      //   `Can't download transformed file to path ${destinationFilePath.toString()}, because it already exists`
      // );
      // return ActionResult.failed();
    }

    if (!(await fsExtra.pathExists(destination.toString()))) {
      await fsExtra.ensureDir(destination.toString());
    }

    const transformContext = new TransformContext(destination, destinationFileName);

    return await withDirPath(async (tempDirectory) => {
      let result: Result<TransformationResultData, string>;

      if (file) {
        result = await this.transformationService.transformViaFile({
          file,
          format: parsedFormat,
          configDir: this.configDir,
          commandMetadata: this.commandMetadata,
          authKey: this.authKey
        });
      } else {
        result = await this.transformationService.transformViaUrl({
          url: url!,
          format: parsedFormat,
          configDir: this.configDir,
          commandMetadata: this.commandMetadata,
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

        // TODO: Render the error message here
        //return ActionResult.error(result.error || "An unknown error occurred");
        return ActionResult.failed();
      }

      await transformContext.save(tempTransformedFilePath);
      this.prompts.displayApiTransformationSuccessMessage();
      this.validatePrompts.displayValidationMessages(result.value!.apiValidationSummary);

      return ActionResult.success();
    });
  };
}
