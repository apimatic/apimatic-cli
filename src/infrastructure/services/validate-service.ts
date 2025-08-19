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
import { ApiValidatePrompts } from "../../prompts/api/validate.js";

export interface ValidationParams {
  file?: string;
  url?: string;
  configDir: DirectoryPath;
  authKey?: string | null;
}

export class ValidationService {
  private readonly prompts: ApiValidatePrompts = new ApiValidatePrompts();

  async validate({ file, url, configDir, authKey }: ValidationParams): Promise<Result<void, string>> {
    const authInfo: AuthInfo | null = await getAuthInfo(configDir.toString());
    const authorizationHeader = this.createAuthorizationHeader(authInfo, authKey ?? null);
    const client = apiClientFactory.createApiClient(authorizationHeader);
    const controller = new ApiValidationExternalApisController(client);

    try {
      let validation: ApiResponse<ApiValidationSummary>;
      if (file) {
        const fileStatus = fsExtra.statSync(file);
        if (fileStatus.isDirectory()) {
          return Result.failure("The provided path is a directory. Please provide a valid specification file.");
        } else {
          const fileDescriptor = new FileWrapper(fsExtra.createReadStream(file));
          validation = await controller.validateApiViaFile(ContentType.EnumMultipartformdata, fileDescriptor);
        }
      } else if (url) {
        validation = await controller.validateApiViaUrl(url);
      } else {
        return Result.failure("Please provide a specification file or URL");
      }

      const validationSummary = validation.result;
      this.prompts.displayValidationMessages(validationSummary);

      return validationSummary.success
        ? Result.success(undefined)
        : Result.failure("Specification file provided is invalid");
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
        return "An unexpected error occurred while generating the SDK, please try again later. If the problem persists, please reach out to our team at support@apimatic.io";
      }

      return `Error ${apiError.statusCode}: An error occurred during validation.`;
    }

    return "Unexpected error occurred while validating API specification.";
  }
}
