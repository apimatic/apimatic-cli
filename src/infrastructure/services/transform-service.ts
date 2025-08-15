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
  ApiError,
  Environment
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

    private createApiClient = (authorizationHeader: string): Client => {
    if (envInfo.getBaseUrl()) {
      return this.createTestingApiClient(authorizationHeader);
    }
    return this.createProductionApiClient(authorizationHeader);
  };

  readonly createProductionApiClient = (authorizationHeader: string): Client => {
    return new Client({
      customHeaderAuthenticationCredentials: {
        Authorization: authorizationHeader
      },
      userAgent: envInfo.getUserAgent(),
      timeout: this.TIMEOUT,
      environment: Environment.Production
    });
  };

  readonly createTestingApiClient = (authorizationHeader: string): Client => {
    return new Client({
      customHeaderAuthenticationCredentials: {
        Authorization: authorizationHeader
      },
      userAgent: envInfo.getUserAgent(),
      timeout: this.TIMEOUT,
      environment: Environment.Testing,
      customUrl: envInfo.getBaseUrl()
    });
  };

  private readonly handleTransformationErrors = async (error: unknown): Promise<string> => {
    if (error instanceof ApiError) {
      const apiError = error as ApiError;
      if (apiError.statusCode === 400) {
        return "Your API Definition is invalid. Please use the APIMatic VS Code Extension to fix the errors and try again.";
      } else if (apiError.statusCode === 401) {
        const message = JSON.parse(apiError.body as string).message;
        return `${message} Please run the 'auth:login' command and try again or reach out to our team at support@apimatic.io.`;
      }
      return `Error ${apiError.statusCode}: An error occurred during the transformation. Please try again or contact support@apimatic.io for assistance.`;
    } else {
      return "An unexpected error occurred while validating your API Definition. Please try again later. If the problem persists, please reach out to our team at support@apimatic.io";
    }
  };
}
