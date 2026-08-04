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
import { discardStreamBody, ServiceError } from "../service-error.js";

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
      return err(await this.handleTransformationErrors(error));
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

  /**
   * A 401 body is not guaranteed to be JSON: a stream endpoint hands back an
   * `IncomingMessage`, an empty body parses to nothing, and an authenticating
   * proxy can answer with an HTML error page. Throwing here would escape the
   * catch in `transformViaFile` — this runs inside the `err(await ...)` it
   * builds — and surface as an unhandled rejection, skipping the outro and the
   * failure telemetry. Fall back to the hint's own default message instead.
   */
  private parseApiMessage(body: unknown): string | null {
    if (typeof body !== "string") return null;
    try {
      return (JSON.parse(body) as { message?: string })?.message ?? null;
    } catch {
      return null;
    }
  }

  private readonly handleTransformationErrors = async (error: unknown): Promise<string> => {
    if (error instanceof ApiError) {
      const apiError = error as ApiError;
      try {
        if (apiError.statusCode === 400) {
          return "Your API Definition is invalid. Please use the APIMatic VS Code Extension to fix the errors and try again.";
        } else if (apiError.statusCode === 401) {
          return ServiceError.unauthorizedWithHint(this.parseApiMessage(apiError.body)).errorMessage;
        }
        return `Error ${apiError.statusCode}: An error occurred during the transformation. Please try again or contact support@apimatic.io for assistance.`;
      } finally {
        // `downloadTransformedFile` is a stream endpoint: its error body is an
        // undrained response that would keep the event loop alive. Released
        // after the message is built, so the 401 branch can still read it.
        discardStreamBody(apiError);
      }
    } else {
      return "An unexpected error occurred while validating your API Definition. Please try again later. If the problem persists, please reach out to our team at support@apimatic.io";
    }
  };
}
