import axios from 'axios';
import { err, ok, Result } from 'neverthrow';
import { CopilotService } from '../../types/portal/config/copilot-config.js';
import { CopilotBundle } from '../../types/portal/copilot/copilot-bundle.js';
import { IndexedVersion, IndexingState, IngestReceipt, IngestStatus } from '../../types/portal/copilot/ingest.js';
import { isJsonObject } from '../../utils/json-utils.js';
import { envInfo } from '../env-info.js';
import { pollUntilSettled } from '../generation-status-poller.js';
import { ServiceError, ServiceErrorCode } from '../service-error.js';
import { sleep } from '../timer-extensions.js';
import { copilotFailureOf, copilotTransportFailure, duration } from './copilot-responses.js';

export const COPILOT_INGEST_TIMINGS = {
  pollIntervalMs: 2000,
  indexTimeoutMs: 10 * 60 * 1000,
  uploadTimeoutMs: 120_000,
  statusTimeoutMs: 15_000
};

export type CopilotIngestTimings = Partial<typeof COPILOT_INGEST_TIMINGS>;

/** All the service needs of the portal's Ask AI settings: where it is, and which portal's chat it is. */
export type CopilotTarget = CopilotService;

const STATES = new Set<IndexingState>(['queued', 'building', 'active', 'superseded', 'failed']);

/** A status check may fail this often in a row, to a dropped connection, a timeout or a 5xx, before the wait ends. */
const STATUS_ATTEMPTS = 3;
const TRANSIENT = new Set([ServiceErrorCode.NetworkError, ServiceErrorCode.Timeout, ServiceErrorCode.ServerError]);

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
        return err(copilotFailureOf(response));
      }
      const receipt = response.data as unknown;
      return isReceipt(receipt) ? ok(receipt) : err(ServiceError.InvalidResponse);
    } catch (error) {
      const timedOut = `The upload did not finish within ${duration(this.timings.uploadTimeoutMs)}.`;
      return err(copilotTransportFailure(error, timedOut));
    }
  }

  /** Waits for the uploaded version to finish indexing; a failed one is an error carrying the service's reason. */
  public async awaitIndexing(
    copilot: CopilotTarget,
    versionId: string,
    shell: string,
    authKey: string
  ): Promise<Result<IndexedVersion, ServiceError>> {
    return pollUntilSettled({
      pollIntervalMs: this.timings.pollIntervalMs,
      fetchStatus: () => this.statusRetried(copilot, versionId, shell, authKey),
      timeout: { budgetMs: this.timings.indexTimeoutMs, label: 'Indexing' },
      settle: (current): Result<IndexedVersion, ServiceError> | null => {
        const { status, error } = current;
        if (status === 'failed') {
          return err(ServiceError.processingFailed(error));
        }
        return status === 'queued' || status === 'building' ? null : ok({ ...current, status });
      }
    });
  }

  // A wait of minutes meets the odd dropped connection or redeploy; only a check that keeps failing ends it.
  private async statusRetried(
    copilot: CopilotTarget,
    versionId: string,
    shell: string,
    token: string,
    attemptsLeft: number = STATUS_ATTEMPTS
  ): Promise<Result<IngestStatus, ServiceError>> {
    const status = await this.status(copilot, versionId, shell, token);
    if (status.isOk() || attemptsLeft <= 1 || !TRANSIENT.has(status.error.code)) {
      return status;
    }
    await sleep(this.timings.pollIntervalMs);
    return this.statusRetried(copilot, versionId, shell, token, attemptsLeft - 1);
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
        return err(copilotFailureOf(response));
      }
      const status = statusOf(response.data);
      return status === null ? err(ServiceError.InvalidResponse) : ok(status);
    } catch (error) {
      const timedOut = `The Ask AI service did not answer within ${duration(this.timings.statusTimeoutMs)}.`;
      return err(copilotTransportFailure(error, timedOut));
    }
  }

  private axiosInstance(copilot: CopilotTarget, shell: string, token: string, timeout: number) {
    return axios.create({
      baseURL: copilot.address.toString(),
      timeout,
      validateStatus: () => true,
      // A request that runs out of time then fails as ETIMEDOUT, apart from one that never got through.
      transitional: { clarifyTimeoutError: true },
      headers: {
        'User-Agent': envInfo.getUserAgent(shell),
        Authorization: `X-Auth-Key ${token}`,
        'X-Copilot-Key': copilot.key
      }
    });
  }
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
