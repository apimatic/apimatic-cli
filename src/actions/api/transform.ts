import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../action-result.js";
import { ApiTransformPrompts } from "../../prompts/api/transform.js";
import { withDirPath } from "../../infrastructure/tmp-extensions.js";
import { TransformationService } from "../../infrastructure/services/transform-service.js";
import { ApiValidationSummary, ExportFormats } from "@apimatic/sdk";
import { ApiValidatePrompts } from "../../prompts/api/validate.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { TransformContext } from "../../types/transform-context.js";
import { TransformationFormats } from "../../types/api/transform.js";
import { resolveSpecFilePath, ResourceInput } from "../../types/file/resource-input.js";

export interface TransformationResultData {
  stream: NodeJS.ReadableStream;
  apiValidationSummary: ApiValidationSummary;
}

export class TransformAction {
  private readonly prompts: ApiTransformPrompts = new ApiTransformPrompts();
  private readonly validatePrompts: ApiValidatePrompts = new ApiValidatePrompts();
  private readonly transformationService: TransformationService = new TransformationService();
  private readonly configDir: DirectoryPath;
  private readonly commandMetadata: CommandMetadata;
  private readonly authKey: string | null;

  constructor(configDir: DirectoryPath, commandMetadata: CommandMetadata, authKey: string | null = null) {
    this.configDir = configDir;
    this.commandMetadata = commandMetadata;
    this.authKey = authKey;
  }

  private readonly getValidFormat = (format: string) => {
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
    resourcePath: ResourceInput
  ): Promise<ActionResult> => {
    const parsedFormat = this.getValidFormat(format);

    return await withDirPath(async (tempDirectory) => {
      const specFile = await resolveSpecFilePath(tempDirectory, resourcePath.path.toString());
      const transformContext = new TransformContext(destination, parsedFormat, specFile.filePath!);

      if (!force && (await transformContext.exists()) && !(await this.prompts.overwriteApi(destination))) {
        this.prompts.transformedApiDirectoryNotEmpty();
        return ActionResult.cancelled();
      }

      const result = await this.prompts.transformApi(
        this.transformationService.transformViaFile({
          file: specFile.filePath!,
          format: parsedFormat,
          configDir: this.configDir,
          commandMetadata: this.commandMetadata,
          authKey: this.authKey
        })
      );

      if (result.isErr()) {
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
