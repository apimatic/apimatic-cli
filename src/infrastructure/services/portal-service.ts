import * as os from "os";
import fs from "fs-extra";
import process from "process";
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
  ApiValidationSummary,
  ApiValidationExternalApisController,
  CodeGenerationExternalApisController,
  Platforms
} from "@apimatic/sdk";
import { AuthInfo, getAuthInfo } from "../../client-utils/auth-manager.js";
import { ErrorResponse } from "../../types/portal/generate.js";
import { Result } from "../../types/common/result.js";
import { getMessageInRedColor, parseStreamBodyToJson } from "../../utils/utils.js";
import { TransformationData } from "../../types/api/transform.js";
import { Sdl } from "../../types/sdl/sdl.js";
import { FilePath } from "../../types/file/filePath.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FileService } from "../file-service.js";
import { PortalQuickstartPrompts } from "../../prompts/portal/quickstart.js";
import { GetValidationParams, AuthorizationError } from "../../types/api/validate.js";
import { createTempDirectory, isValidUrl, unzipFile, deleteFile, zipDirectory } from "../../utils/utils.js";
import * as path from "path";
import filetype from "file-type";
import axios from "axios";
import { LoginCredentials, SpecFile } from "../../types/portal/quickstart.js";

export class PortalService {
  private readonly CONTENT_TYPE = ContentType.EnumMultipartformdata;
  private readonly TIMEOUT = 0;
  private readonly fileService = new FileService();

  async generatePortal(
    buildPath: FilePath,
    configDir: DirectoryPath,
    authKey: string | null
  ): Promise<Result<NodeJS.ReadableStream, string | NodeJS.ReadableStream>> {
    const buildFileStream = await this.fileService.getStream(buildPath);
    const file = new FileWrapper(buildFileStream);
    const authInfo: AuthInfo | null = await getAuthInfo(configDir.toString());
    const authorizationHeader = this.createAuthorizationHeader(authInfo, authKey);
    const client = this.createApiClient(authorizationHeader);
    const docsPortalManagementController = new DocsPortalManagementController(client);

    try {
      const response = await docsPortalManagementController.generateOnPremPortalViaBuildInput(this.CONTENT_TYPE, file);
      return Result.success(response.result as NodeJS.ReadableStream);
    } catch (error) {
      return Result.failure(await this.handlePortalGenerationErrors(error));
    } finally {
      buildFileStream.close();
    }
  }

  async generateSdk(
    specPath: FilePath,
    sdkPlatform: Platforms,
    configDir: DirectoryPath,
    authKey: string | null
  ): Promise<Result<NodeJS.ReadableStream, string>> {
    const specFileStream = await this.fileService.getStream(specPath);
    const file = new FileWrapper(specFileStream);
    const authInfo: AuthInfo | null = await getAuthInfo(configDir.toString());
    const authorizationHeader = this.createAuthorizationHeader(authInfo, authKey);
    const client = this.createApiClient(authorizationHeader);
    const sdkGenerationController = new CodeGenerationExternalApisController(client);

    try {
      const response = await sdkGenerationController.generateSdkViaFile(file, sdkPlatform);
      const sdkResponse = await sdkGenerationController.downloadSdk(response.result.id);
      return Result.success(sdkResponse.result as NodeJS.ReadableStream);
    } catch (error) {
      return Result.failure(await this.handleSdkGenerationErrors(error));
    } finally {
      specFileStream.close();
    }
  }

  public async generateSdl(specPath: string, configDir: string): Promise<Result<Sdl, string>> {
    if (!(await fs.pathExists(specPath))) {
      return Result.failure("Spec file doesn't exist");
    }

    const authInfo: AuthInfo | null = await getAuthInfo(configDir);
    const authorizationHeader = this.createAuthorizationHeader(authInfo, null);
    const client = this.createApiClient(authorizationHeader);
    const transformationController = new TransformationController(client);

    try {
      const file = new FileWrapper(fs.createReadStream(specPath));
      const generation: ApiResponse<Transformation> = await transformationController.transformViaFile(
        ContentType.EnumMultipartformdata,
        file,
        ExportFormats.Apimatic
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

  public async userLogin(credentials: LoginCredentials, configDir: string): Promise<void> {
    // Use SDKClient for login
    const { SDKClient } = await import("../../client-utils/sdk-client.js");
    await SDKClient.getInstance().login(credentials.email, credentials.password, configDir);
  }

  public async getSpecFile(spec: string): Promise<SpecFile> {
    const tempSpecDir = await createTempDirectory();
    if (spec) {
      let specPath = String(spec);
      if (isValidUrl(specPath)) {
        try {
          const response = await axios.head(specPath);
          if (response.headers["content-type"].includes("text/html")) {
            throw new Error(
              getMessageInRedColor(
                `Invalid URL. Please check the URL and ensure it points to a valid OpenAPI definition.`
              )
            );
          }
          const specFile = await axios.get(specPath, { responseType: "arraybuffer" });
          const fileName = path.basename(specPath);
          const filePath = path.join(tempSpecDir, fileName);
          await fs.writeFile(filePath, specFile.data);
        } catch (error) {
          if (axios.isAxiosError(error)) {
            if (error.response) {
              if (error.response.status === 404) {
                throw new Error(
                  getMessageInRedColor(
                    `Unable to download the API Definition. The server returned a 404 Not Found error. Please verify that the provided URL is correct and publicly accessible.`
                  )
                );
              } else {
                throw new Error(
                  getMessageInRedColor(
                    `Unable to download the API Definition. The server returned ${error.response.status} ${error.response.statusText}`
                  )
                );
              }
            } else if (error.request) {
              if (error.code === "ECONNABORTED") {
                throw new Error(
                  getMessageInRedColor(
                    `Unable to download the API Definition, your request timed out. Please check your internet connection and try again, or contact APIMatic support for help if your problem persists.`
                  )
                );
              } else if (error.code === "ENOTFOUND" || error.code === "ERR_NETWORK") {
                throw new Error(
                  getMessageInRedColor(
                    `Failed to download the API Definition file due to network issues. Please check your internet connection and try again.`
                  )
                );
              } else {
                throw new Error(
                  getMessageInRedColor(
                    `Failed to download the API Definition file, no response was received from the server. Please try again later.`
                  )
                );
              }
            } else {
              throw new Error(getMessageInRedColor(`Failed to download API Definition: ${error.message}`));
            }
          } else {
            throw new Error(
              getMessageInRedColor(
                `Unable to save API Definition : ${error instanceof Error ? error.message : "Unknown error"}`
              )
            );
          }
        }
      } else {
        specPath = path.normalize(specPath);
        const fileType = await filetype.fromFile(specPath);
        if (fileType?.ext === "zip") {
          await unzipFile(fs.createReadStream(specPath), tempSpecDir);
        } else {
          const destinationPath = path.join(tempSpecDir, path.basename(specPath));
          await fs.copy(specPath, destinationPath);
        }
      }
    }
    // Use the static URL as in the original controller
    return { localPath: tempSpecDir, url: "https://github.com/apimatic/static-portal-workflow/blob/master/spec/Apimatic-Calculator.json" };
  }

  //TODO: update spec 
  public async getSpecValidationSummary(
    prompts: PortalQuickstartPrompts,
    specFile: SpecFile,
    configDir: string,
    authKey: string | null
  ): Promise<ApiValidationSummary> {
    // Create SDK client and controller
    const authInfo: AuthInfo | null = await getAuthInfo(configDir.toString());
    const authorizationHeader = this.createAuthorizationHeader(authInfo, authKey);
    const client = this.createApiClient(authorizationHeader);
    const apiValidationController = new ApiValidationExternalApisController(client);
    const validationFlags: GetValidationParams = {
      file: specFile.localPath,
      url: specFile.url
    };
    try {
      const validation = await this.getValidationSummaryInternal(validationFlags, apiValidationController);
      return validation;
    } catch (error) {
      prompts.displaySpecValidationErrorMessage();
      if (axios.isAxiosError(error)) {
        if (error.response) {
          if (error.response.status === 400) {
            throw new Error(
              getMessageInRedColor(
                `The provided spec file is not valid. Please ensure that the spec you have provided is a valid API definition file.`
              )
            );
          } else if (error.response.status === 500) {
            throw new Error(
              getMessageInRedColor(
                `The server encountered an error while validating your spec file, please try again later. If the issue persists, contact our team at support@apimatic.io`
              )
            );
          } else {
            throw new Error(
              getMessageInRedColor(
                `Something went wrong while validating your spec file. The server returned the following error ${error.response.status} ${error.response.statusText}. Please try again later. If the issue persists, contact our team at support@apimatic.io`
              )
            );
          }
        } else if (error.request) {
          if (error.code === "ECONNABORTED") {
            throw new Error(getMessageInRedColor(`The spec validation request timed out. Please try again.`));
          } else if (error.code === "ENOTFOUND" || error.code === "ERR_NETWORK") {
            throw new Error(
              getMessageInRedColor(
                `Network error encountered while validating the spec file. Please check your connection and try again.`
              )
            );
          } else {
            throw new Error(
              getMessageInRedColor(
                `Something went wrong while validating the spec file, please try again. If the issue persists, reach out to our support team at support@apimatic.io`
              )
            );
          }
        } else {
          throw new Error(getMessageInRedColor(`Failed to validate spec file: ${error.message}`));
        }
      } else if ((error as ApiError).result) {
        const apiError = error as ApiError;
        if ((error as AuthorizationError).body && apiError.statusCode === 401) {
          throw new Error("You are not authorized to perform this action.");
        } else {
          throw new Error((error as Error).message);
        }
      } else {
        throw new Error(
          getMessageInRedColor(
            `Something went wrong while validating the spec file, please try again later. If the issue persists, contact our team at support@apimatic.io`
          )
        );
      }
    }
  }

  private async getValidationSummaryInternal(
    { file, url }: GetValidationParams,
    apiValidationController: ApiValidationExternalApisController
  ): Promise<ApiValidationSummary> {
    let validation: ApiResponse<ApiValidationSummary>;
    if (file) {
      const fileStatus = fs.statSync(file);
      if (fileStatus.isDirectory()) {
        const tempDir = await createTempDirectory();
        const zipPath = await zipDirectory(file, tempDir);
        const zipFile = new FileWrapper(fs.createReadStream(zipPath));
        validation = await apiValidationController.validateApiViaFile(ContentType.EnumMultipartformdata, zipFile);
        await deleteFile(zipPath);
        await fs.remove(tempDir);
      } else {
        const fileDescriptor = new FileWrapper(fs.createReadStream(file));
        validation = await apiValidationController.validateApiViaFile(ContentType.EnumMultipartformdata, fileDescriptor);
      }
    } else if (url) {
      validation = await apiValidationController.validateApiViaUrl(url);
    } else {
      throw new Error("Please provide a specification file");
    }
    return validation.result;
  }

  private createGenericErrorResult() {
    return Result.failure<Sdl, string>("An unexpected error occurred");
  }

  private createAuthorizationHeader = (authInfo: AuthInfo | null, overrideAuthKey: string | null): string => {
    const key = overrideAuthKey || authInfo?.authKey;
    return `X-Auth-Key ${key ?? ""}`;
  };

  private getUserAgent(): string {
    const osInfo = `${os.platform()} ${os.release()}`;
    const engine = "Node.js";
    const engineVersion = process.version;

    return `APIMATIC CLI - [OS: ${osInfo}, Engine: ${engine}/${engineVersion}]`;
  }

  private createApiClient = (authorizationHeader: string): Client => {
    return new Client({
      customHeaderAuthenticationCredentials: {
        Authorization: authorizationHeader
      },
      userAgent: this.getUserAgent(),
      timeout: this.TIMEOUT
    });
  };

  private handlePortalGenerationErrors = async (error: unknown): Promise<string | NodeJS.ReadableStream> => {
    if (error instanceof UnauthorizedResponseError) {
      //401
      const body = await this.parseErrorResponse(error);
      return getMessageInRedColor(body.message ?? "Unauthorized access.");
    } else if (error instanceof ProblemDetailsError) {
      //400 & 403
      const body = await this.parseErrorResponse(error);
      const message = body.errors[Object.keys(body.errors)[0]][0];
      return getMessageInRedColor(body.title + "\n- " + message);
    } else if (error instanceof ApiError && error.statusCode === 422) {
      //422
      return error.body as NodeJS.ReadableStream;
    } else if (error instanceof InternalServerErrorResponseError) {
      //500
      const body = await this.parseErrorResponse(error);
      return getMessageInRedColor(
        `${body.message} Please try again later or reach out to our team at support@apimatic.io for help if your problem persists.`
      );
    } else {
      return getMessageInRedColor(
        "An unexpected error occurred while generating the portal, please try again later. If the problem persists, please reach out to our team at support@apimatic.io"
      );
    }
  };

  private parseErrorResponse = async (error: unknown): Promise<ErrorResponse> => {
    if (error instanceof Error && "body" in error) {
      const stream = (error as { body: NodeJS.ReadableStream }).body;
      return await parseStreamBodyToJson(stream);
    }
    throw error;
  };

  private handleSdkGenerationErrors = async (error: unknown): Promise<string> => {
    if (error instanceof UnauthorizedResponseError) {
      //401
      const body = await this.parseErrorResponse(error);
      return getMessageInRedColor(body.message ?? "Unauthorized access.");
    } else if (error instanceof ProblemDetailsError) {
      //400 & 403
      const body = await this.parseErrorResponse(error);
      const message = body.errors[Object.keys(body.errors)[0]][0];
      return getMessageInRedColor(body.title + "\n- " + message);
    } else if (error instanceof ApiError && error.statusCode === 422) {
      const body = await this.parseErrorResponse(error);
      return getMessageInRedColor(
        `${body.message}`
      );
    } else if (error instanceof InternalServerErrorResponseError) {
      //500
      const body = await this.parseErrorResponse(error);
      return getMessageInRedColor(
        `${body.message} Please try again later or reach out to our team at support@apimatic.io for help if your problem persists.`
      );
    } else {
      return getMessageInRedColor(
        "An unexpected error occurred while generating the portal, please try again later. If the problem persists, please reach out to our team at support@apimatic.io"
      );
    }
  };
}