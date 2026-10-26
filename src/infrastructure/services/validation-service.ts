import { ReadStream } from 'node:fs';
import fsExtra from 'fs-extra';
import {
  ApiResponse,
  ApiValidationV2ExternalApisController,
  ValidateApiResult,
  ContentType,
  FileWrapper,
  ApiError
} from '@apimatic/sdk';

import { DirectoryPath } from '../../types/file/directoryPath.js';
import { AuthInfo, getAuthInfo } from '../../client-utils/auth-manager.js';
import { apiClientFactory } from './api-client-factory.js';
import { err, ok, Result } from 'neverthrow';
import { FilePath } from '../../types/file/filePath.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { ServiceError } from '../service-error.js';

export interface ValidateViaFileParams {
  file: FilePath;
  commandMetadata: CommandMetadata;
  authKey?: string | null;
}

/** `rejected`: the service refused the document itself (400), so the spec is invalid rather than unchecked. */
export type ValidationFailure = { kind: 'rejected' | 'unavailable'; message: string };

export class ValidationService {
  constructor(private readonly configDir: DirectoryPath) {}

  async validateViaFile({
    file,
    commandMetadata,
    authKey
  }: ValidateViaFileParams): Promise<Result<ValidateApiResult, ValidationFailure>> {
    const authInfo: AuthInfo | null = await getAuthInfo(this.configDir.toString());
    const authorizationHeader = this.createAuthorizationHeader(authInfo, authKey ?? null);
    const client = apiClientFactory.createApiClient(authorizationHeader, commandMetadata.shell);
    const controller = new ApiValidationV2ExternalApisController(client);

    let fileStream: ReadStream | undefined;
    try {
      fileStream = fsExtra.createReadStream(file.toString());
      const validation: ApiResponse<ValidateApiResult> = await controller.validateApiViaFileV2(
        ContentType.EnumMultipartformdata,
        new FileWrapper(fileStream)
      );
      return ok(validation.result);
    } catch (error) {
      return err(await this.handleValidationErrors(error));
    } finally {
      fileStream?.close();
    }
  }

  private createAuthorizationHeader(authInfo: AuthInfo | null, overrideAuthKey: string | null): string {
    const key = overrideAuthKey || authInfo?.authKey;
    return `X-Auth-Key ${key ?? ''}`;
  }

  private async handleValidationErrors(error: unknown): Promise<ValidationFailure> {
    if (error instanceof ApiError && error.statusCode === 400) {
      return { kind: 'rejected', message: 'Your API Definition is invalid. Please fix the issues and try again.' };
    }
    return { kind: 'unavailable', message: this.unavailableMessage(error) };
  }

  private unavailableMessage(error: unknown): string {
    if (error instanceof ApiError) {
      const apiError = error as ApiError;

      switch (apiError.statusCode) {
        case 401:
          return ServiceError.unauthorizedWithHint(null).errorMessage;
        case 403:
          return 'You do not have permission to perform this action.';
        case 500:
          return 'An unexpected error occurred validating the API specification, please try again later. If the problem persists, please reach out to our team at support@apimatic.io';
        default:
          return `Error ${apiError.statusCode}: An error occurred during validation.`;
      }
    }

    return 'Unexpected error occurred while validating API specification.';
  }
}
