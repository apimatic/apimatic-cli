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
import { Result } from "neverthrow";
import { ApiValidationSummary } from "@apimatic/sdk";
import { ApiValidatePrompts } from "../../prompts/api/validate.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { getValidFormat } from "../../controllers/api/transform.js";
import { TransformContext } from "../../types/transform-context.js";

const DEFAULT_WORKING_DIRECTORY = "./";

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
      this.validatePrompts.displayValidationFailureMessage();
      return ActionResult.failed();
    }
    const parsedFormat = getValidFormat(format);

    const workingDirectory = new DirectoryPath(destination?.toString() ?? DEFAULT_WORKING_DIRECTORY);
    const transformedApiDirectory = destination
      ? new DirectoryPath(destination.toString(), "TransformedApi")
      : workingDirectory.join("TransformedApi");

    const destinationFileExt: string = DestinationFormats[parsedFormat as keyof typeof DestinationFormats];
    const destinationFilePrefix = file ? getFileNameFromPath(file.toString()) : getFileNameFromPath(url || "");
    const destinationFileName = new FileName(`${destinationFilePrefix}_${parsedFormat}.${destinationFileExt}`);

    const transformContext = new TransformContext(transformedApiDirectory, destinationFileName);

    if (!force && (await transformContext.exists()) && !(await this.prompts.overwriteApi(transformedApiDirectory))) {
      this.prompts.transformedApiDirectoryNotEmpty();
      return ActionResult.cancelled();
    }

    return await withDirPath(async (tempDirectory) => {
      let result: Result<TransformationResultData, string>;

      if (file) {
        result = await this.prompts.transformApi(
             this.transformationService.transformViaFile({
              file,
              format: parsedFormat,
              configDir: this.configDir,
              commandMetadata: this.commandMetadata,
              authKey: this.authKey
            })
        );
      } else {
        result = await this.prompts.transformApi(
          this.transformationService.transformViaUrl({
            url: url!,
            format: parsedFormat,
            configDir: this.configDir,
            commandMetadata: this.commandMetadata,
            authKey: this.authKey
          })
        );
      }

      if (result.isOk()) {
        await this.fileService.writeFile(new FilePath(tempDirectory, destinationFileName), result.value.stream as NodeJS.ReadableStream);
        await transformContext.save(new FilePath(tempDirectory, destinationFileName));
        this.validatePrompts.displayValidationMessages(result.value.apiValidationSummary);
        return ActionResult.success();
      } else {
        this.prompts.logError(result.error);
        return ActionResult.failed();
      }
    });
  };
}
