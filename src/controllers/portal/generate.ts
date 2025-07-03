import fsExtra from "fs-extra";
import { deleteFile, extractZipFile, getMessageInRedColor, parseStreamBodyToJson } from "../../utils/utils.js";
import { ErrorResponse, GeneratePortalParams } from "../../types/portal/generate.js";
import { AuthInfo, getAuthInfo } from "../../client-utils/auth-manager.js";
import {
  ApiError,
  ApiResponse,
  Client,
  ContentType,
  DocsPortalManagementController,
  FileWrapper,
  ProblemDetailsError,
  UnauthorizedResponseError
} from "@apimatic/sdk";
import { Result } from "../../types/common/result.js";
const CONTENT_TYPE = ContentType.EnumMultipartformdata;
const TIMEOUT = 0;

export const downloadDocsPortal = async (
  params: GeneratePortalParams,
  configDir: string
): Promise<Result<string, string>> => {
  if (!(await fsExtra.pathExists(params.sourceBuildInputZipFilePath))) {
    return Result.failure("Build file doesn't exist");
  }

  const authInfo: AuthInfo | null = await getAuthInfo(configDir);
  const authorizationHeader = createAuthorizationHeader(authInfo, params.overrideAuthKey);
  const client = createApiClient(authorizationHeader);
  const docsPortalManagementController = new DocsPortalManagementController(client);

  try {
    const stream = await generatePortalFromSyncEndpoint(docsPortalManagementController, params.sourceBuildInputZipFilePath);
    await saveGeneratedPortalStreamToZipFile(stream, params.generatedPortalArtifactsZipFilePath);
    await deleteFile(params.sourceBuildInputZipFilePath);

    if (params.generateZipFile) {
      return Result.success(params.generatedPortalArtifactsZipFilePath);
    }

    await extractZipFile(params.generatedPortalArtifactsZipFilePath, params.generatedPortalArtifactsFolderPath);
    await deleteFile(params.generatedPortalArtifactsZipFilePath);
    
    return Result.success(params.generatedPortalArtifactsFolderPath);
  } catch (error) {
    return handlePortalGenerationErrors(error, params);
  }
};

const createAuthorizationHeader = (authInfo: AuthInfo | null, overrideAuthKey: string | null): string => {
  if (overrideAuthKey) {
    return `X-Auth-Key ${overrideAuthKey}`;
  }
  if (!authInfo) {
    return "";
  }
  return `X-Auth-Key ${authInfo.authKey}`;
};

const createApiClient = (authorizationHeader: string): Client => {
  return new Client({
    customHeaderAuthenticationCredentials: {
      Authorization: authorizationHeader
    },
    timeout: TIMEOUT
  });
};

const generatePortalFromSyncEndpoint = async (
  docsPortalManagementController: DocsPortalManagementController,
  zippedBuildFilePath: string
): Promise<NodeJS.ReadableStream> => {
  const file = new FileWrapper(fsExtra.createReadStream(zippedBuildFilePath));
  const response: ApiResponse<NodeJS.ReadableStream | Blob> =
    await docsPortalManagementController.generateOnPremPortalViaBuildInput(CONTENT_TYPE, file);

  return response.result as NodeJS.ReadableStream;
};

const saveGeneratedPortalStreamToZipFile = async (data: NodeJS.ReadableStream, generatedPortalArtifactsZipFilePath: string): Promise<void> => {
  const writeStream = fsExtra.createWriteStream(generatedPortalArtifactsZipFilePath);
  await new Promise<void>((resolve, reject) => {
    data
      .pipe(writeStream)
      .on("finish", () => resolve())
      .on("error", (error) =>
        reject(Result.failure(`Failed to save downloaded portal to file: ${error.message}`))
      );
  });
};

const handlePortalGenerationErrors = async (error: unknown, params: GeneratePortalParams): Promise<Result<string, string>> => {
  if (error instanceof UnauthorizedResponseError) {
    //401
    const body = await parseErrorResponse(error);
    return Result.failure(getMessageInRedColor(body.message ?? "Unauthorized access"));
  } else if (error instanceof ProblemDetailsError) {
    //400 & 403
    const body = await parseErrorResponse(error);
    const message = body.errors[Object.keys(body.errors)[0]][0];
    return Result.failure(getMessageInRedColor(body.title + " " + (body.detail ?? "") + ":\n" + message));
  } else if (error instanceof ApiError && error.statusCode === 422) {
    //422
    await extractErrorZipFile(error, params);
    return Result.failure(
      getMessageInRedColor(
        "An error occurred during portal generation due to an issue with the input. An error report has been written at the destination path: " +
          params.generatedPortalArtifactsFolderPath
      )
    );
  } else {
    return Result.failure(getMessageInRedColor(error instanceof Error ? error.message : String(error)));
  }
};

const parseErrorResponse = async (error: unknown): Promise<ErrorResponse> => {
  if (error instanceof Error && "body" in error) {
    const stream = (error as { body: NodeJS.ReadableStream }).body;
    return await parseStreamBodyToJson(stream);
  }
  throw error;
};

const extractErrorZipFile = async (error: ApiError, params: GeneratePortalParams): Promise<void> => {
  const data = error.body as NodeJS.ReadableStream;
  const writeStream = fsExtra.createWriteStream(params.generatedPortalArtifactsZipFilePath);

  await new Promise<void>((resolve, reject) => {
    data
      .pipe(writeStream)
      .on("finish", () => resolve())
      .on("error", reject);
  });

  if (!params.generateZipFile) {
    await extractZipFile(params.generatedPortalArtifactsZipFilePath, params.generatedPortalArtifactsFolderPath);
    await deleteFile(params.generatedPortalArtifactsZipFilePath);
  }
};
