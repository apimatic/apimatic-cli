import {
  ContentType,
  DocsPortalManagementController,
  Client,
  UnauthorizedResponseError,
  ProblemDetailsError,
  FileWrapper,
  ApiResponse,
  ApiError,
  TransformationController,
  Transformation,
  ExportFormats,
  InternalServerErrorResponseError,
  CodeGenerationExternalApisController,
  Platforms,
  BadRequestResponseSdkError,
  Accept,
  ApiValidationExternalApisController,
  ApiValidationSummary,
  Environment
} from "@apimatic/sdk";
import { AuthInfo, getAuthInfo } from "../../client-utils/auth-manager.js";
import { Result } from "../../types/common/result.js";
import { getMessageInRedColor, parseStreamBodyToJson } from "../../utils/utils.js";
import { TransformationData } from "../../types/api/transform.js";
import { Sdl } from "../../types/sdl/sdl.js";
import { FilePath } from "../../types/file/filePath.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FileService } from "../file-service.js";
import { envInfo } from "../env-info.js";
import { ReadStream } from "fs";

export class PortalService {
  private readonly CONTENT_TYPE = ContentType.EnumMultipartformdata;
  private readonly TIMEOUT = 0;
  private readonly fileService = new FileService();

  //TODO: Pass stream as parameter instead of file path.
  public async generatePortal(
    buildPath: FilePath,
    configDir: DirectoryPath,
    commandName: string,
    authKey: string | null
  ): Promise<Result<NodeJS.ReadableStream, string | NodeJS.ReadableStream>> {
    const buildFileStream = await this.fileService.getStream(buildPath);
    const file = new FileWrapper(buildFileStream);
    const authInfo: AuthInfo | null = await getAuthInfo(configDir.toString());
    const authorizationHeader = this.createAuthorizationHeader(authInfo, authKey);
    const client = this.createApiClient(authorizationHeader);
    const docsPortalManagementController = new DocsPortalManagementController(client);

    try {
      const response = await docsPortalManagementController.generateOnPremPortalViaBuildInput(
        this.CONTENT_TYPE,
        file,
        this.createOriginQueryParameter(commandName)
      );
      return Result.success(response.result as NodeJS.ReadableStream);
    } catch (error) {
      return Result.failure(await this.handlePortalGenerationErrors(error));
    } finally {
      buildFileStream.close();
    }
  }

  //TODO: Pass stream as parameter instead of file path.
  public async generateSdk(
    specPath: FilePath,
    sdkPlatform: Platforms,
    configDir: DirectoryPath,
    commandName: string,
    authKey: string | null
  ): Promise<Result<NodeJS.ReadableStream, string>> {
    const specFileStream = await this.fileService.getStream(specPath);
    const file = new FileWrapper(specFileStream);
    const authInfo: AuthInfo | null = await getAuthInfo(configDir.toString());
    const authorizationHeader = this.createAuthorizationHeader(authInfo, authKey);
    const client = this.createApiClient(authorizationHeader);
    const sdkGenerationController = new CodeGenerationExternalApisController(client);

    try {
      const response = await sdkGenerationController.generateSdkViaFile(
        Accept.EnumApplicationjson,
        file,
        sdkPlatform,
        this.createOriginQueryParameter(commandName)
      );
      const sdkResponse = await sdkGenerationController.downloadSdk(response.result.id);
      return Result.success(sdkResponse.result as NodeJS.ReadableStream);
    } catch (error) {
      return Result.failure(await this.handleSdkGenerationErrors(error));
    } finally {
      specFileStream.close();
    }
  }

  public async generateSdl(
    specFileStream: ReadStream,
    configDir: string,
    commandName: string
  ): Promise<Result<Sdl, string>> {
    const file = new FileWrapper(specFileStream);
    const authInfo: AuthInfo | null = await getAuthInfo(configDir);
    const authorizationHeader = this.createAuthorizationHeader(authInfo, null);
    const client = this.createApiClient(authorizationHeader);
    const transformationController = new TransformationController(client);

    try {
      const generation: ApiResponse<Transformation> = await transformationController.transformViaFile(
        ContentType.EnumMultipartformdata,
        file,
        ExportFormats.Apimatic,
        this.createOriginQueryParameter(commandName)
      );

      if (!generation.result.success) {
        return this.createGenericErrorResult();
      }

      const transformationId = generation.result.id;
      const { result }: TransformationData = await transformationController.downloadTransformedFile(transformationId);
      if ((result as NodeJS.ReadableStream).readable) {
        return Result.success((await parseStreamBodyToJson(result as NodeJS.ReadableStream)) as Sdl);
      } else {
        return this.createGenericErrorResult();
      }
    } catch {
      return this.createGenericErrorResult();
    }
  }

  public async validateSpec(
    specFileStream: ReadStream,
    configDir: string
  ): Promise<Result<ApiValidationSummary, string>> {
    const file = new FileWrapper(specFileStream);
    const authInfo: AuthInfo | null = await getAuthInfo(configDir);
    const authorizationHeader = this.createAuthorizationHeader(authInfo, null);
    const client = this.createApiClient(authorizationHeader);
    const validationController = new ApiValidationExternalApisController(client);

    try {
      const response = await validationController.validateApiViaFile(ContentType.EnumMultipartformdata, file);
      return Result.success(response.result as ApiValidationSummary);
    } catch (error) {
      return Result.failure(await this.handleSpecValidationErrors(error));
    }
  }

  private createGenericErrorResult() {
    return Result.failure<Sdl, string>("An unexpected error occurred");
  }

  private createAuthorizationHeader = (authInfo: AuthInfo | null, overrideAuthKey: string | null): string => {
    const key = overrideAuthKey || authInfo?.authKey;
    return `X-Auth-Key ${key ?? ""}`;
  };

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

  private createOriginQueryParameter = (commandName: string): Record<string, string> => {
    return {
      origin: `APIMATIC CLI ${commandName}`
    };
  };

  private handlePortalGenerationErrors = async (error: unknown): Promise<string | NodeJS.ReadableStream> => {
    if (error instanceof UnauthorizedResponseError) {
      //401
      const unAuthError = error as UnauthorizedResponseError;
      return getMessageInRedColor(unAuthError.result?.message ?? "Authorization has been denied for this request.");
    } else if (error instanceof ProblemDetailsError) {
      //400 & 403
      const probDetailsError = error as ProblemDetailsError;
      const message = Object.values(probDetailsError.result!.errors as Record<string, string[]>)[0]?.[0] ?? null; 
      return getMessageInRedColor(probDetailsError.result!.title + "\n- " + message);
    } else if (error instanceof ApiError && error.statusCode === 422) {
      //422
      return error.body as NodeJS.ReadableStream;
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
        "An unexpected error occurred while generating the portal, please try again later. If the problem persists, please reach out to our team at support@apimatic.io"
      );
    }
  };

  private parseBadRequestResponse(errorMessage: string | undefined): string {
    // #TODO: Fix server-side error message and simplify this function
    if (!errorMessage) {
      return "Bad request.";
    }
    // Parse the JSON string
    const parsedResult = JSON.parse(errorMessage);

    // Check if it has the expected structure with Errors array
    if (parsedResult.Errors && Array.isArray(parsedResult.Errors) && parsedResult.Errors.length > 0) {
      // Get the first error and clean it up
      const firstError = parsedResult.Errors[0];
      // Split on <br/> and take first part, then strip remaining HTML tags
      const cleanError = firstError.split("<br/>")[0].replace(/<[^<>]*?>/g, "");
      return cleanError;
    } else if (parsedResult.Success === false) {
      return "API definition file validation failed.";
    }
    return errorMessage;
  }

  private handleSdkGenerationErrors = async (error: unknown): Promise<string> => {
    if (error instanceof BadRequestResponseSdkError) {
      //400
      const badRequestError = error as BadRequestResponseSdkError;
      const errorMessage = this.parseBadRequestResponse(badRequestError.result?.message);
      return getMessageInRedColor(errorMessage);
    } else if (error instanceof UnauthorizedResponseError) {
      //401
      const unAuthError = error as UnauthorizedResponseError;
      return getMessageInRedColor(unAuthError.result?.message ?? "Authorization has been denied for this request.");
    } else if (error instanceof ProblemDetailsError) {
      // 403
      const probDetailsError = error as ProblemDetailsError;
      const message = (probDetailsError.result!.errors as Record<string, string[]>)?.[""]?.[0];
      return getMessageInRedColor(probDetailsError.result!.title + "\n- " + message);
    } else {
      return getMessageInRedColor(
        "An unexpected error occurred while generating the SDK, please try again later. If the problem persists, please reach out to our team at support@apimatic.io"
      );
    }
  };

  private handleSpecValidationErrors = async (error: unknown): Promise<string> => {
    if (error instanceof ApiError) {
      const apiError = error as ApiError;
      return `${apiError.statusCode} ${apiError.message}`;
    } else {
      return "An unexpected error occurred while validating your API Definition. Please try again later. If the problem persists, please reach out to our team at support@apimatic.io";
    }
  };
}
