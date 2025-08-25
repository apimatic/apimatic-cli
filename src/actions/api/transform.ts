import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../action-result.js";
import { ApiTransformPrompts } from "../../prompts/api/transform.js";
import { FileService } from "../../infrastructure/file-service.js";
import { validateFileInputParams } from "../../infrastructure/api-utils.js";
import { withDirPath } from "../../infrastructure/tmp-extensions.js";
import { TransformationService } from "../../infrastructure/services/transform-service.js";
import { FilePath } from "../../types/file/filePath.js";
import { Result } from "neverthrow";
import { ApiValidationSummary, ExportFormats } from "@apimatic/sdk";
import { ApiValidatePrompts } from "../../prompts/api/validate.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { TransformContext } from "../../types/transform-context.js";
import { UrlPath } from "../../types/file/urlPath.js";
import { TransformationFormats } from "../../types/api/transform.js";

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

  private getValidFormat = (format: string) => {
    const key = Object.keys(TransformationFormats).find((value) => value === format) as
      | keyof typeof TransformationFormats
      | undefined;
    if (key) {
      const transformationFormat = TransformationFormats[key] as keyof typeof ExportFormats;
      return ExportFormats[transformationFormat];
    } else {
      const formats = Object.keys(TransformationFormats).join("|");
      throw new Error(`Please provide a valid platform, e.g. ${formats}`);
    }
  };

  public readonly execute = async (
    format: string,
    destination: DirectoryPath,
    force: boolean,
    file?: FilePath,
    url?: UrlPath
  ): Promise<ActionResult> => {
    const validationResult = await validateFileInputParams(file, url); // remove fsextras do smth

    if (!validationResult.isSuccess()) {
      this.validatePrompts.displayValidationFailureMessage();
      return ActionResult.failed();
    }

    const parsedFormat = this.getValidFormat(format);
    const transformContext = new TransformContext(destination, parsedFormat, file, url);

    if (!force && (await transformContext.exists()) && !(await this.prompts.overwriteApi(destination))) {
      this.prompts.transformedApiDirectoryNotEmpty();
      return ActionResult.cancelled();
    }

    let result: Result<TransformationResultData, string>; //ternary

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

    return await withDirPath(async (tempDirectory) => {
      if (result.isErr()) {
        //TODO: implement service error logic
        this.prompts.logError(result.error);
        return ActionResult.failed();
      }
      await transformContext.writeToTempDirectory(tempDirectory, result.value.stream as NodeJS.ReadableStream);
      await transformContext.save(tempDirectory);
      this.validatePrompts.displayValidationMessages(result.value.apiValidationSummary);
      return ActionResult.success();
    });
  };
}
