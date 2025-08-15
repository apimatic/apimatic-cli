import {
  ApiValidationSummary,
  FileWrapper,
  ApiValidationExternalApisController,
  ContentType,
  ApiError
} from "@apimatic/sdk";
import { ReadStream } from "fs";
import { Result } from "../../types/common/result.js";
import { AuthInfo, getAuthInfo } from "../../client-utils/auth-manager.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { createApiClient, createAuthorizationHeader } from "../api-client-utils.js";

export class ValidationService {
  private readonly TIMEOUT = 0;

  public async validateSpec(
    specFileStream: ReadStream,
    configDir: DirectoryPath
  ): Promise<Result<ApiValidationSummary, string>> {
    const file = new FileWrapper(specFileStream);
    const authInfo: AuthInfo | null = await getAuthInfo(configDir.toString());
    const authorizationHeader = createAuthorizationHeader(authInfo, null);
    const client = createApiClient(authorizationHeader, this.TIMEOUT);
    const validationController = new ApiValidationExternalApisController(client);

    try {
      const response = await validationController.validateApiViaFile(ContentType.EnumMultipartformdata, file);
      return Result.success(response.result as ApiValidationSummary);
    } catch (error) {
      return Result.failure(await this.handleSpecValidationErrors(error));
    }
  }

  private handleSpecValidationErrors = async (error: unknown): Promise<string> => {
    if (error instanceof ApiError) {
      const apiError = error as ApiError;
      if (apiError.statusCode === 400) {
        return "Your API Definition is invalid. Please use the APIMatic VS Code Extension to fix the errors and try again.";
      } else if (apiError.statusCode === 401) {
        const message = JSON.parse(apiError.body as string).message;
        return `${message} Please run the 'auth:login' command and try again or reach out to our team at support@apimatic.io.`;
      } else {
        const message = JSON.parse(apiError.body as string).message;
        return message;
      }
    } else {
      return "An unexpected error occurred while validating your API Definition. Please try again later. If the problem persists, please reach out to our team at support@apimatic.io";
    }
  };
}
