import fsExtra from "fs-extra";
import path from "path";
import {
  ApiResponse,
  Client,
  ContentType,
  ExportFormats,
  FileWrapper,
  TransformationController,
  Transformation,
  UnauthorizedResponseError,
  ApiError,
  InternalServerErrorResponseError,
  ProblemDetailsError
} from "@apimatic/sdk";

import { AuthInfo, getAuthInfo } from "../../client-utils/auth-manager.js";
import { envInfo } from "../env-info.js";
import { getMessageInRedColor, writeFileUsingReadableStream  } from "../../utils/utils.js";
import { TransformationData } from "../../types/api/transform.js";
import { Result } from "../../types/common/result.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ApiTransformPrompts } from "../../prompts/api/transform.js";

export interface TransformationParams {
  file?: string;
  url?: string;
  format: string;
  tempDirectory: DirectoryPath;
  destinationFilePath: string;
  configDir: DirectoryPath;
  authKey?: string | null;
}

export class TransformationService {
  private readonly CONTENT_TYPE = ContentType.EnumMultipartformdata;
  private readonly TIMEOUT = 0;
  private readonly prompts: ApiTransformPrompts = new ApiTransformPrompts();

  async transformAndDownload({
    file,
    url,
    format,
    tempDirectory,
    destinationFilePath,
    configDir,
    authKey
  }: TransformationParams): Promise<Result<string, string>> {
    const authInfo: AuthInfo | null = await getAuthInfo(configDir.toString());
    const authorizationHeader = this.createAuthorizationHeader(authInfo, authKey ?? null);
    const client = this.createApiClient(authorizationHeader);
    const transformationController = new TransformationController(client);

    try {
      let generation: ApiResponse<Transformation>;
      if (file) {
        const fileStream = fsExtra.createReadStream(file);
        const fileWrapper = new FileWrapper(fileStream);
        generation = await transformationController.transformViaFile(
          this.CONTENT_TYPE,
          fileWrapper,
          format as ExportFormats
        );
      } else if (url) {
        generation = await transformationController.transformViaUrl({
          url: url,
          exportFormat: format as ExportFormats
        });
      } else {
        return Result.failure("Please provide a specification file or URL");
      }

      const { id } = generation.result;

      const tempTransformedFilePath = path.join(
        tempDirectory.toString(),
        `transformed${path.extname(destinationFilePath)}`
      );
      const { result }: TransformationData = await transformationController.downloadTransformedFile(id);

      if ((result as NodeJS.ReadableStream).readable) {
        await writeFileUsingReadableStream(result as NodeJS.ReadableStream, tempTransformedFilePath);
      } else {
        return Result.failure("Couldn't save transformation file");
      }

      // Step 4: Move to final destination
      await fsExtra.copy(tempTransformedFilePath, destinationFilePath);

      return Result.success(destinationFilePath);
    } catch (error) {
      return Result.failure(await this.handleTransformationErrors(error));
    }
  }

  private createAuthorizationHeader(authInfo: AuthInfo | null, overrideAuthKey: string | null): string {
    const key = overrideAuthKey || authInfo?.authKey;
    return `X-Auth-Key ${key ?? ""}`;
  }

  private createApiClient(authorizationHeader: string): Client {
    return new Client({
      customHeaderAuthenticationCredentials: {
        Authorization: authorizationHeader
      },
      userAgent: envInfo.getUserAgent(),
      timeout: this.TIMEOUT
    });
  }

  private readonly handleTransformationErrors = async (error: unknown): Promise<string> => {
    if (error instanceof UnauthorizedResponseError) {
      //401
      const unAuthError = error as UnauthorizedResponseError;
      return getMessageInRedColor(unAuthError.result?.message ?? "Authorization has been denied for this request.");
    } else if (error instanceof ProblemDetailsError) {
      //400 & 403
      const probDetailsError = error as ProblemDetailsError;
      const message = (probDetailsError.result!.errors as Record<string, string[]>)?.[""]?.[0];
      return getMessageInRedColor(probDetailsError.result!.title + "\n- " + message);
    } else if (error instanceof ApiError && error.statusCode === 422) {
      //422
      return "Validation error occurred during transformation. Please check your API specification.";
    } else if (error instanceof InternalServerErrorResponseError) {
      //500
      const internalServerError = error as InternalServerErrorResponseError;
      const message = internalServerError.result?.message;
      return getMessageInRedColor(
        `${
          message ?? "An unkown error occurred."
        } Please try again later or reach out to our team at support@apimatic.io for help if your problem persists.`
      );
    } else {
      return getMessageInRedColor(
        "An unexpected error occurred while transforming the spec file, please try again later. If the problem persists, please reach out to our team at support@apimatic.io"
      );
    }
  };
}
