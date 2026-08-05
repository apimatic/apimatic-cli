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
import { ServiceError } from "../service-error.js";
import { discardStreamBody } from "../../utils/utils.js";

export interface TransformViaFileParams {
  file: FilePath;
  format: ExportFormats;
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

  public async transformViaFile({
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
      return err(this.handleTransformationErrors(error));
    }
  }

  private createAuthorizationHeader(authInfo: AuthInfo | null, overrideAuthKey: string | null): string {
    const key = overrideAuthKey || authInfo?.authKey;
    return `X-Auth-Key ${key ?? ""}`;
  }

  private readonly createOriginQueryParameter = (commandName: string): Record<string, string> => {
    return {
      origin: `APIMATIC CLI ${commandName}`
    };
  };

  private parseApiMessage(body: unknown): string | null {
    if (typeof body !== "string") return null;
    try {
      return (JSON.parse(body) as { message?: string })?.message ?? null;
    } catch {
      return null;
    }
  }

  private readonly handleTransformationErrors = (error: unknown): string => {
    if (!(error instanceof ApiError)) {
      return "An unexpected error occurred while validating your API Definition. Please try again later. If the problem persists, please reach out to our team at support@apimatic.io";
    }

    // `downloadTransformedFile` is a stream endpoint, so its error body is an
    // undrained response that would keep the event loop alive. Discarding it
    // first is safe: a string body (from `transformViaFile`) has no `destroy`
    // and is left intact for `parseApiMessage` below.
    discardStreamBody(error.body);

    switch (error.statusCode) {
      case 400:
        return "Your API Definition is invalid. Please use the APIMatic VS Code Extension to fix the errors and try again.";
      case 401:
        return ServiceError.unauthorizedWithHint(this.parseApiMessage(error.body)).errorMessage;
      default:
        return `Error ${error.statusCode}: An error occurred during the transformation. Please try again or contact support@apimatic.io for assistance.`;
    }
  };
}
