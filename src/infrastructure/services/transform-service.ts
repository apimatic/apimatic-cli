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
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { apiClientFactory } from "./api-client-factory.js";
import { FilePath } from "../../types/file/filePath.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { err, ok, Result} from "neverthrow";
import { UrlPath } from "../../types/file/urlPath.js";


export interface TransformViaUrlParams {
  url: UrlPath;
  format: string;
  configDir: DirectoryPath;
  commandMetadata: CommandMetadata;
  authKey?: string | null;
}

export interface TransformViaFileParams {
  file: FilePath;
  format: string;
  configDir: DirectoryPath;
  commandMetadata: CommandMetadata;
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
    commandMetadata,
    authKey
  }: TransformViaUrlParams): Promise<Result<TransformationResultData, string>> {
    const authInfo: AuthInfo | null = await getAuthInfo(configDir.toString());
    const authorizationHeader = this.createAuthorizationHeader(authInfo, authKey ?? null);
    const client = apiClientFactory.createApiClient(authorizationHeader, commandMetadata.shell);
    const transformationController = new TransformationController(client);

    try {
      //TODO: Update spec to include origin query parameter.
      const generation: ApiResponse<Transformation> = await transformationController.transformViaUrl({
        url: url.toString(),
        exportFormat: format as ExportFormats
      });

      const { id, apiValidationSummary } = generation.result;
      const { result }: TransformationData = await transformationController.downloadTransformedFile(id);

      return ok({
        stream: result as NodeJS.ReadableStream,
        apiValidationSummary
      });
    } catch (error) {
      return err(await this.handleTransformationErrors(error));
    }
  }

  async transformViaFile({
    file,
    format,
    configDir,
    commandMetadata,
    authKey
  }: TransformViaFileParams): Promise<Result<TransformationResultData, string>> {
    const authInfo: AuthInfo | null = await getAuthInfo(configDir.toString());
    const authorizationHeader = this.createAuthorizationHeader(authInfo, authKey ?? null);
    const client = apiClientFactory.createApiClient(authorizationHeader, commandMetadata.shell);
    const transformationController = new TransformationController(client);

    try {
      const fileStream = fsExtra.createReadStream(file.toString());
      const fileWrapper = new FileWrapper(fileStream);
      const generation: ApiResponse<Transformation> = await transformationController.transformViaFile(
        this.CONTENT_TYPE,
        fileWrapper,
        format as ExportFormats,
        this.createOriginQueryParameter(commandMetadata.commandName)
      );

      const { id, apiValidationSummary } = generation.result;
      const { result }: TransformationData = await transformationController.downloadTransformedFile(id);

      return ok({
        stream: result as NodeJS.ReadableStream,
        apiValidationSummary
      });
    } catch (error) {
      return err(await this.handleTransformationErrors(error));
    }
  }

  private createAuthorizationHeader(authInfo: AuthInfo | null, overrideAuthKey: string | null): string {
    const key = overrideAuthKey || authInfo?.authKey;
    return `X-Auth-Key ${key ?? ""}`;
  }

  private createOriginQueryParameter = (commandName: string): Record<string, string> => {
    return {
      origin: `APIMATIC CLI ${commandName}`
    };
  };

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
