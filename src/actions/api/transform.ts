import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../action-result.js";
import { ApiTransformPrompts } from "../../prompts/api/transform.js";
import { withDirPath } from "../../infrastructure/tmp-extensions.js";
import { TransformationService } from "../../infrastructure/services/transform-service.js";
import { ApiValidationSummary, ExportFormats } from "@apimatic/sdk";
import { ApiValidatePrompts } from "../../prompts/api/validate.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { TransformContext } from "../../types/transform-context.js";
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

  public readonly execute = async (
    resourcePath: ResourceInput,
    format: ExportFormats,
    destination: DirectoryPath,
    force: boolean
  ): Promise<ActionResult> => {
    return await withDirPath(async (tempDirectory) => {
      const specFileResult = await resolveSpecFilePath(tempDirectory, resourcePath.path.toString());
      if (specFileResult.isErr()) {
        this.prompts.InvalidFilePathProvided();
        return ActionResult.failed();
      }
      const transformContext = new TransformContext(destination, format, specFileResult.value);

      if (!force && (await transformContext.exists()) && !(await this.prompts.overwriteApi(destination))) {
        this.prompts.transformedApiDirectoryNotEmpty();
        return ActionResult.cancelled();
      }

      const result = await this.prompts.transformApi(
        this.transformationService.transformViaFile({
          file: specFileResult.value,
          format: format,
          configDir: this.configDir,
          commandMetadata: this.commandMetadata,
          authKey: this.authKey
        })
      );

      if (result.isErr()) {
        this.prompts.logTransformationError(result.error);
        return ActionResult.failed();
      }

      await transformContext.saveStream(result.value.stream as NodeJS.ReadableStream);
      this.validatePrompts.displayValidationMessages(result.value.apiValidationSummary);
      return ActionResult.success();
    });
  };
}
