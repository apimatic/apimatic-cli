import fsExtra from "fs-extra";
import {
  ApiResponse,
  ContentType,
  ExportFormats,
  FileWrapper,
  TransformationController,
  Transformation,
  ApiError,
  ApiValidationSummary
} from "@apimatic/sdk";

import { AuthInfo, getAuthInfo } from "../../client-utils/auth-manager.js";
import { TransformationData } from "../../types/api/transform.js";
import { Result } from "../../types/common/result.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { apiClientFactory } from "./api-client-factory.js";
import { FilePath } from "../../types/file/filePath.js";

export interface TransformViaUrlParams {
  url: string;
  format: string;
  configDir: DirectoryPath;
  authKey?: string | null;
}

export interface TransformViaFileParams {
  file: FilePath;
  format: string;
  configDir: DirectoryPath;
  authKey?: string | null;
}

export interface TransformationResultData {
  stream: NodeJS.ReadableStream;
  apiValidationSummary: ApiValidationSummary;
}

export class TransformationService {
  private readonly CONTENT_TYPE = ContentType.EnumMultipartformdata;

  //TODO: we can remove this endpoint and use the transformViaFile in case url is given. We can download the file within the CLI from the url and pass it to the transformViaFile endpoint
  async transformViaUrl({
    url,
    format,
    configDir,
    authKey
  }: TransformViaUrlParams): Promise<Result<TransformationResultData, string>> {
    const authInfo: AuthInfo | null = await getAuthInfo(configDir.toString());
    const authorizationHeader = this.createAuthorizationHeader(authInfo, authKey ?? null);
    const client = apiClientFactory.createApiClient(authorizationHeader);
    const transformationController = new TransformationController(client);

    try {
      const generation: ApiResponse<Transformation> = await transformationController.transformViaUrl({
        url: url,
        exportFormat: format as ExportFormats
      });

      const { id, apiValidationSummary } = generation.result;
      const { result }: TransformationData = await transformationController.downloadTransformedFile(id);

      return Result.success({
        stream: result as NodeJS.ReadableStream,
        apiValidationSummary
      });
    } catch (error) {
      return Result.failure(await this.handleTransformationErrors(error));
    }
  }

  async transformViaFile({
    file,
    format,
    configDir,
    authKey
  }: TransformViaFileParams): Promise<Result<TransformationResultData, string>> {
    const authInfo: AuthInfo | null = await getAuthInfo(configDir.toString());
    const authorizationHeader = this.createAuthorizationHeader(authInfo, authKey ?? null);
    const client = apiClientFactory.createApiClient(authorizationHeader);
    const transformationController = new TransformationController(client);

    try {
      const fileStream = fsExtra.createReadStream(file.toString());
      const fileWrapper = new FileWrapper(fileStream);
      const generation: ApiResponse<Transformation> = await transformationController.transformViaFile(
        this.CONTENT_TYPE,
        fileWrapper,
        format as ExportFormats
      );

      const { id, apiValidationSummary } = generation.result;
      const { result }: TransformationData = await transformationController.downloadTransformedFile(id);

      return Result.success({
        stream: result as NodeJS.ReadableStream,
        apiValidationSummary
      });
    } catch (error) {
      return Result.failure(await this.handleTransformationErrors(error));
    }
  }

  private createAuthorizationHeader(authInfo: AuthInfo | null, overrideAuthKey: string | null): string {
    const key = overrideAuthKey || authInfo?.authKey;
    return `X-Auth-Key ${key ?? ""}`;
  }

  private readonly handleTransformationErrors = async (error: unknown): Promise<string> => {
    if (error instanceof ApiError) {
      const apiError = error as ApiError;
      if (apiError.statusCode === 400) {
        return "Your API Definition is invalid. Please use the APIMatic VS Code Extension to fix the errors and try again.";
      } else if (apiError.statusCode === 401) {
        const message = JSON.parse(apiError.body as string).message;
        return `${message} You are not authorized to perform this action. Please run 'auth:login' or provide a valid auth key.`;
      }
      return `Error ${apiError.statusCode}: An error occurred during the transformation. Please try again or contact support@apimatic.io for assistance.`;
    } else {
      return "An unexpected error occurred while validating your API Definition. Please try again later. If the problem persists, please reach out to our team at support@apimatic.io";
    }
  };
}
