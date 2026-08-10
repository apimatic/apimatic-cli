import axios from 'axios';
import FormData from 'form-data';
import { err, ok, Result } from 'neverthrow';
import { AuthInfo, getAuthInfo } from '../../client-utils/auth-manager.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FilePath } from '../../types/file/filePath.js';
import {
  GeneratedPluginResult,
  isInFlight,
  PluginGenerationInitiatedResponse,
  PluginGenerationStatus,
  PluginGenerationStatusResponse
} from '../../types/plugin/generation-status.js';
import { discardStreamBody } from '../../utils/utils.js';
import { envInfo } from '../env-info.js';
import { FileService } from '../file-service.js';
import { handleServiceError, ServiceError } from '../service-error.js';

const STATUS_POLL_INTERVAL_MS = 3000;
const GENERATION_TIMEOUT_MS = 5 * 60 * 1000;

interface ProblemDetailsBody {
  title?: string;
  detail?: string;
  errors?: Record<string, string[]>;
}

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
  ): Promise<Result<GeneratedPluginResult, ServiceError>> {
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

    const download = await this.downloadPlugin(generationId, commandMetadata.shell, token);
    if (download.isErr()) {
      return err(download.error);
    }

    return ok({ plugin: download.value, deferred: completed.value.deferred ?? [] });
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
      return err(mapProblemDetails(error) ?? handleServiceError(error));
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
      if (axios.isAxiosError(error)) {
        discardStreamBody(error.response?.data);
      }
      return err(handleServiceError(error));
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

const TIMED_OUT_MESSAGE = 'Plugin generation timed out after 5 minutes.';
const UNKNOWN_STATUS_MESSAGE = 'Unable to determine generation status. Please try again.';

type PollDecision = { kind: 'continue' } | { kind: 'done' } | { kind: 'error'; error: ServiceError };

/**
 * Context plugin generation reports completion as a status body rather than a redirect, and
 * unlike the portal and SDK endpoints it is bounded: a run that never reaches a terminal
 * status gives up rather than polling forever.
 */
async function pollUntilCompleted(
  pollIntervalMs: number,
  timeoutMs: number,
  fetchStatus: () => Promise<Result<PluginGenerationStatusResponse, ServiceError>>
): Promise<Result<PluginGenerationStatusResponse, ServiceError>> {
  const startedAt = Date.now();

  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

    if (Date.now() - startedAt >= timeoutMs) {
      return err(ServiceError.timeout(TIMED_OUT_MESSAGE));
    }

    const statusResult = await fetchStatus();
    if (statusResult.isErr()) {
      return err(statusResult.error);
    }

    const decision = classifyPluginStatus(statusResult.value);
    if (decision.kind === 'done') {
      return ok(statusResult.value);
    }
    if (decision.kind === 'error') {
      return err(decision.error);
    }
  }
}

function classifyPluginStatus({ status, errors }: PluginGenerationStatusResponse): PollDecision {
  if (isInFlight(status)) {
    return { kind: 'continue' };
  }
  if (status === PluginGenerationStatus.Completed) {
    return { kind: 'done' };
  }
  if (status === PluginGenerationStatus.Failed) {
    return { kind: 'error', error: ServiceError.ServerError };
  }
  if (status === PluginGenerationStatus.ValidationError) {
    const validationErrors = errors ?? {};
    return {
      kind: 'error',
      error: ServiceError.badRequest(formatValidationErrors(validationErrors), validationErrors)
    };
  }
  // `Unknown`, and anything a newer backend adds, ends the run rather than polling to the timeout.
  return { kind: 'error', error: ServiceError.serverError(UNKNOWN_STATUS_MESSAGE) };
}

const formatValidationErrors = (errors: Record<string, string[]>): string => {
  const messages = Object.values(errors).flat();
  return 'One or more validation errors occurred.' + (messages.length ? '\n- ' + messages.join('\n- ') : '');
};

/**
 * `handleServiceError` only reads ProblemDetails off the SDK's typed errors, so a raw axios
 * 400/403/404 would otherwise collapse into a generic server error and lose its message.
 * Unlike the SDK path this also falls back to `detail`, which io uses when it sends no
 * `errors` map.
 */
function mapProblemDetails(error: unknown): ServiceError | undefined {
  if (!axios.isAxiosError(error)) {
    return undefined;
  }

  const body = error.response?.data as ProblemDetailsBody | undefined;
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }

  const errors = body.errors ?? {};
  const firstMessage = Object.values(errors).flat()[0] ?? body.detail;
  const title = body.title ?? 'Request failed.';
  const message = firstMessage ? `${title}\n- ${firstMessage}` : title;

  if (error.response?.status === 400) {
    return ServiceError.badRequest(message, errors);
  }
  if (error.response?.status === 403) {
    return ServiceError.forbidden(message);
  }
  return undefined;
}
