import axios, { AxiosResponse } from 'axios';
import { err, ok, Result } from 'neverthrow';
import { PortalCopilot } from '../../types/portal/config/copilot-config.js';
import { CopilotBundle } from '../../types/portal/copilot/copilot-bundle.js';
import { IndexedVersion, IndexingState, IngestReceipt, IngestStatus } from '../../types/portal/copilot/ingest.js';
import { isJsonObject } from '../../utils/json-utils.js';
import { envInfo } from '../env-info.js';
import { handleServiceError, ServiceError } from '../service-error.js';
import { sleep } from '../timer-extensions.js';

export const COPILOT_INGEST_TIMINGS = {
  pollIntervalMs: 2000,
  indexTimeoutMs: 10 * 60 * 1000,
  uploadTimeoutMs: 120_000,
  statusTimeoutMs: 15_000
};

export type CopilotIngestTimings = Partial<typeof COPILOT_INGEST_TIMINGS>;

/** All the service needs of the portal's Ask AI settings: where it is, and which portal's chat it is. */
export type CopilotTarget = Pick<PortalCopilot, 'key' | 'apiUrl'>;

const STATES = new Set<IndexingState>(['queued', 'building', 'active', 'superseded', 'failed']);

/** Uploads a portal's pages to the Ask AI service, which swaps them in once it has indexed them all. */
export class CopilotIngestService {
  private readonly timings: typeof COPILOT_INGEST_TIMINGS;

  constructor(timings: CopilotIngestTimings = {}) {
    this.timings = { ...COPILOT_INGEST_TIMINGS, ...timings };
  }

  public async upload(
    copilot: CopilotTarget,
    bundle: CopilotBundle,
    shell: string,
    authKey: string
  ): Promise<Result<IngestReceipt, ServiceError>> {
    try {
      const response = await this.axiosInstance(copilot, shell, authKey, this.timings.uploadTimeoutMs).post(
        '/v1/ingest',
        bundle.gzipped(),
        {
          headers: { 'Content-Type': 'application/gzip' },
          // The service owns the size limit, and answers 413 past it.
          maxBodyLength: Infinity
        }
      );
      if (response.status !== 200 && response.status !== 202) {
        return err(failureOf(response));
      }
      const receipt = response.data as unknown;
      return isReceipt(receipt) ? ok(receipt) : err(ServiceError.InvalidResponse);
    } catch (error) {
      return err(transportFailure(error));
    }
  }

  /** Waits for the uploaded version to finish indexing; a failed one is an error carrying the service's reason. */
  public async awaitIndexing(
    copilot: CopilotTarget,
    versionId: string,
    shell: string,
    authKey: string
  ): Promise<Result<IndexedVersion, ServiceError>> {
    const deadline = Date.now() + this.timings.indexTimeoutMs;
    for (;;) {
      await sleep(this.timings.pollIntervalMs);

      const current = await this.status(copilot, versionId, shell, authKey);
      if (current.isErr()) {
        return err(current.error);
      }
      const { status, error } = current.value;
      if (status === 'active' || status === 'superseded') {
        return ok({ ...current.value, status });
      }
      if (status === 'failed') {
        return err(ServiceError.badRequest(error ?? 'The Ask AI service could not index the pages.', {}));
      }
      // Read after the status, so a version that finished during the last wait still counts.
      if (Date.now() >= deadline) {
        const minutes = Math.max(1, Math.round(this.timings.indexTimeoutMs / 60_000));
        return err(
          ServiceError.timeout(`Indexing did not finish within ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`)
        );
      }
    }
  }

  private async status(
    copilot: CopilotTarget,
    versionId: string,
    shell: string,
    token: string
  ): Promise<Result<IngestStatus, ServiceError>> {
    try {
      const response = await this.axiosInstance(copilot, shell, token, this.timings.statusTimeoutMs).get(
        `/v1/ingest/${encodeURIComponent(versionId)}`
      );
      if (response.status !== 200) {
        return err(failureOf(response));
      }
      const status = statusOf(response.data);
      return status === null ? err(ServiceError.InvalidResponse) : ok(status);
    } catch (error) {
      return err(transportFailure(error));
    }
  }

  private axiosInstance(copilot: CopilotTarget, shell: string, token: string, timeout: number) {
    return axios.create({
      baseURL: copilot.apiUrl,
      timeout,
      validateStatus: () => true,
      headers: {
        'User-Agent': envInfo.getUserAgent(shell),
        Authorization: `X-Auth-Key ${token}`,
        'X-Copilot-Key': copilot.key
      }
    });
  }
}

/** The service explains every refusal as `{ code, message }`; the message is what the user is shown. */
function failureOf(response: AxiosResponse): ServiceError {
  const body = response.data as unknown;
  const message = isJsonObject(body) && typeof body.message === 'string' ? body.message : null;
  switch (response.status) {
    case 400:
    case 413:
      return message === null ? ServiceError.InvalidResponse : ServiceError.badRequest(message, {});
    case 401:
      return ServiceError.unauthorizedWithHint(message);
    case 403:
      return ServiceError.forbidden(message ?? 'Access denied.');
    case 404:
      return message === null ? ServiceError.NotFound : ServiceError.notFound(message);
    default:
      return response.status >= 500 ? ServiceError.ServerError : ServiceError.InvalidResponse;
  }
}

// Every request answers with its status, so an axios error here is one that never got an answer.
function transportFailure(error: unknown): ServiceError {
  return axios.isAxiosError(error) && error.response === undefined
    ? ServiceError.NetworkError
    : handleServiceError(error);
}

function isReceipt(body: unknown): body is IngestReceipt {
  return (
    isJsonObject(body) &&
    typeof body.versionId === 'string' &&
    (body.status === 'queued' || body.status === 'unchanged') &&
    typeof body.pageCount === 'number'
  );
}

// Only the state is needed to decide; the counts are reported, and a missing one reads as none.
function statusOf(body: unknown): IngestStatus | null {
  if (!isJsonObject(body) || typeof body.versionId !== 'string' || !STATES.has(body.status as IndexingState)) {
    return null;
  }
  const count = (key: string): number => {
    const value = body[key];
    return typeof value === 'number' ? value : 0;
  };
  return {
    versionId: body.versionId,
    status: body.status as IndexingState,
    pageCount: count('pageCount'),
    changedPages: count('changedPages'),
    removedPages: count('removedPages'),
    chunkCount: count('chunkCount'),
    error: typeof body.error === 'string' && body.error !== '' ? body.error : null
  };
}
