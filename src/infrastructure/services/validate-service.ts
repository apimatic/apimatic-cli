import fsExtra from "fs-extra";
import {
  ApiResponse,
  ApiValidationExternalApisController,
  ApiValidationSummary,
  ContentType,
  FileWrapper,
  ApiError
} from "@apimatic/sdk";

import { DirectoryPath } from "../../types/file/directoryPath.js";
import { AuthInfo, getAuthInfo } from "../../client-utils/auth-manager.js";
import { apiClientFactory } from "./api-client-factory.js";
import { Result } from "../../types/common/result.js";
import { FilePath } from "../../types/file/filePath.js";

export interface ValidateViaFileParams {
  file: FilePath;
  configDir: DirectoryPath;
  authKey?: string | null;
}

export interface ValidateViaUrlParams {
  url: string;
  configDir: DirectoryPath;
  authKey?: string | null;
}

export class ValidationService {
  async validateViaFile({ file, configDir, authKey }: ValidateViaFileParams): Promise<Result<ApiValidationSummary, string>> {
    const authInfo: AuthInfo | null = await getAuthInfo(configDir.toString());
    const authorizationHeader = this.createAuthorizationHeader(authInfo, authKey ?? null);
    const client = apiClientFactory.createApiClient(authorizationHeader);
    const controller = new ApiValidationExternalApisController(client);

    try {
      const fileStatus = fsExtra.statSync(file.toString());
      if (fileStatus.isDirectory()) {
        return Result.failure("The provided path is a directory. Please provide a valid specification file.");
      }

      const fileDescriptor = new FileWrapper(fsExtra.createReadStream(file.toString()));
      const validation: ApiResponse<ApiValidationSummary> = await controller.validateApiViaFile(
        ContentType.EnumMultipartformdata, 
        fileDescriptor
      );

      return Result.success(validation.result as ApiValidationSummary);
    } catch (error) {
      return Result.failure(await this.handleValidationErrors(error));
    }
  }

  async validateViaUrl({ url, configDir, authKey }: ValidateViaUrlParams): Promise<Result<ApiValidationSummary, string>> {
    const authInfo: AuthInfo | null = await getAuthInfo(configDir.toString());
    const authorizationHeader = this.createAuthorizationHeader(authInfo, authKey ?? null);
    const client = apiClientFactory.createApiClient(authorizationHeader);
    const controller = new ApiValidationExternalApisController(client);

    try {
      const validation: ApiResponse<ApiValidationSummary> = await controller.validateApiViaUrl(url);
      return Result.success(validation.result as ApiValidationSummary);
    } catch (error) {
      return Result.failure(await this.handleValidationErrors(error));
    }
  }

  private createAuthorizationHeader(authInfo: AuthInfo | null, overrideAuthKey: string | null): string {
    const key = overrideAuthKey || authInfo?.authKey;
    return `X-Auth-Key ${key ?? ""}`;
  }

  private async handleValidationErrors(error: unknown): Promise<string> {
    if (error instanceof ApiError) {
      const apiError = error as ApiError;

      if (apiError.statusCode === 400) {
        return "Your API Definition is invalid. Please check the errors and try again.";
      } else if (apiError.statusCode === 401) {
        return "You are not authorized to perform this action. Please run 'auth:login' or provide a valid auth key.";
      } else if (apiError.statusCode === 403) {
        return "You do not have permission to perform this action.";
      } else if (apiError.statusCode === 500) {
        return "An unexpected error occurred validating the API specification, please try again later. If the problem persists, please reach out to our team at support@apimatic.io";
      }

      return `Error ${apiError.statusCode}: An error occurred during validation.`;
    }

    return "Unexpected error occurred while validating API specification.";
  }
}