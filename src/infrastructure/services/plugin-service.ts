import axios from 'axios';
import FormData from 'form-data';
import { err, ok, Result } from 'neverthrow';
import { AuthInfo, getAuthInfo } from '../../client-utils/auth-manager.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FilePath } from '../../types/file/filePath.js';
import {
  PluginGenerationInitiatedResponse,
  PluginGenerationStatus,
  PluginGenerationStatusResponse
} from '../../types/plugin/generation-status.js';
import { discardStreamBody } from '../../utils/utils.js';
import { envInfo } from '../env-info.js';
import { FileService } from '../file-service.js';
import { handleServiceError, mapRequestError, mapTransportError, ServiceError } from '../service-error.js';

const STATUS_POLL_INTERVAL_MS = 3000;
const GENERATION_TIMEOUT_MS = 5 * 60 * 1000;

export class PluginService {
  private readonly apiBaseUrl = 'https://api.apimatic.io' as const;
  private readonly fileService = new FileService();
  private readonly statusPollIntervalMs: number;
  private readonly generationTimeoutMs: number;

  constructor(
    statusPollIntervalMs: number = STATUS_POLL_INTERVAL_MS,
    generationTimeoutMs: number = GENERATION_TIMEOUT_MS
  ) {
    this.statusPollIntervalMs = statusPollIntervalMs;
    this.generationTimeoutMs = generationTimeoutMs;
  }

  public async generatePlugin(
    buildPath: FilePath,
    configDir: DirectoryPath,
    commandMetadata: CommandMetadata,
    authKey: string | null
  ): Promise<Result<NodeJS.ReadableStream, ServiceError>> {
    const authInfo: AuthInfo | null = await getAuthInfo(configDir.toString());
    // `auth logout` blanks config.json rather than deleting it, so a logged-out user
    // still has a non-null AuthInfo with an empty key — check the key, not the object.
    const token = authKey || authInfo?.authKey;
    if (!token) {
      return err(ServiceError.unauthorizedWithHint(null));
    }

    const initiated = await this.initiateGeneration(buildPath, commandMetadata, token);
    if (initiated.isErr()) {
      return err(initiated.error);
    }

    const generationId = initiated.value.id;
    const completed = await pollUntilCompleted(this.statusPollIntervalMs, this.generationTimeoutMs, () =>
      this.getGenerationStatus(generationId, commandMetadata.shell, token)
    );
    if (completed.isErr()) {
      return err(completed.error);
    }

    return await this.downloadPlugin(generationId, commandMetadata.shell, token);
  }

  private async initiateGeneration(
    buildPath: FilePath,
    commandMetadata: CommandMetadata,
    token: string
  ): Promise<Result<PluginGenerationInitiatedResponse, ServiceError>> {
    const buildFileStream = await this.fileService.getStream(buildPath);

    try {
      const formData = new FormData();
      formData.append('file', buildFileStream);

      const response = await this.axiosInstance(commandMetadata.shell, token).post('/plugin', formData, {
        headers: formData.getHeaders(),
        params: { origin: `APIMATIC CLI ${commandMetadata.commandName}` },
        responseType: 'json'
      });

      const id = (response.data as PluginGenerationInitiatedResponse | undefined)?.id;
      return id ? ok({ id }) : err(ServiceError.InvalidResponse);
    } catch (error) {
      return err(mapRequestError(error));
    } finally {
      buildFileStream.close();
    }
  }

  private async getGenerationStatus(
    generationId: string,
    shell: string,
    token: string
  ): Promise<Result<PluginGenerationStatusResponse, ServiceError>> {
    try {
      const response = await this.axiosInstance(shell, token).get(`/plugin/${generationId}/status`, {
        headers: { Accept: 'application/json' },
        // This endpoint reports completion as a status body, never a redirect. Refusing to
        // follow one surfaces a contract change immediately instead of polling to the timeout.
        maxRedirects: 0,
        validateStatus: () => true
      });

      if (response.status === 200) {
        return ok(response.data as PluginGenerationStatusResponse);
      }

      // `validateStatus` above stops axios throwing, so nothing reaches the catch block.
      if (response.status === 401) {
        return err(ServiceError.unauthorizedWithHint(null));
      }
      if (response.status === 404) {
        return err(ServiceError.NotFound);
      }
      if (response.status === 500) {
        return err(ServiceError.ServerError);
      }

      return err(ServiceError.InvalidResponse);
    } catch (error) {
      return err(handleServiceError(error));
    }
  }

  private async downloadPlugin(
    generationId: string,
    shell: string,
    token: string
  ): Promise<Result<NodeJS.ReadableStream, ServiceError>> {
    try {
      const response = await this.axiosInstance(shell, token).get(`/plugin/${generationId}/download`, {
        responseType: 'stream'
      });
      return ok(response.data as NodeJS.ReadableStream);
    } catch (error) {
      // The body of a failed streamed response is itself a stream; leaving it open hangs the CLI.
      // Discarding it also rules out reading ProblemDetails here, so only the status code maps.
      if (axios.isAxiosError(error)) {
        discardStreamBody(error.response?.data);
      }
      return err(mapTransportError(error));
    }
  }

  private axiosInstance(shell: string, apiKey: string) {
    return axios.create({
      baseURL: envInfo.getBaseUrl() ?? this.apiBaseUrl,
      headers: {
        'User-Agent': envInfo.getUserAgent(shell),
        Authorization: `X-Auth-Key ${apiKey}`
      }
    });
  }
}

async function pollUntilCompleted(
  pollIntervalMs: number,
  timeoutMs: number,
  fetchStatus: () => Promise<Result<PluginGenerationStatusResponse, ServiceError>>
): Promise<Result<PluginGenerationStatusResponse, ServiceError>> {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

    const statusResult = await fetchStatus();
    if (statusResult.isErr()) {
      return err(statusResult.error);
    }

    const { status, errors } = statusResult.value;

    if (status === PluginGenerationStatus.Completed) {
      return ok(statusResult.value);
    }
    if (status === PluginGenerationStatus.Failed) {
      return err(ServiceError.ServerError);
    }
    if (status === PluginGenerationStatus.ValidationError) {
      const validationErrors = errors ?? {};
      return err(ServiceError.badRequest(formatValidationErrors(validationErrors), validationErrors));
    }

    // `Unknown` joins the in-flight values here rather than ending the run: the orchestrator
    // reports it whenever it has not written a custom status yet, which includes the window
    // right after a healthy run starts. The deadline is what stops a genuinely stuck one, and
    // it is read after the status so a run that finished during the last wait still counts.
    if (Date.now() >= deadline) {
      return err(ServiceError.timeout(timedOutMessage(timeoutMs)));
    }
  }
}

const timedOutMessage = (timeoutMs: number): string => {
  const minutes = Math.round(timeoutMs / 60_000);
  return minutes >= 1 ? `Plugin generation timed out after ${minutes} minutes.` : 'Plugin generation timed out.';
};

const formatValidationErrors = (errors: Record<string, string[]>): string => {
  const messages = Object.values(errors).flat();
  return 'One or more validation errors occurred.' + (messages.length ? '\n- ' + messages.join('\n- ') : '');
};
