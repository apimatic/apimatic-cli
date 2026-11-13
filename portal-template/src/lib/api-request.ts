import type { FetchResult } from 'fumadocs-openapi/playground';
import type { PortalEvents } from './analytics';

/** A playground result as `docs_api_request` reports it; a request that never reached the API is timed from `sentAt`. */
export function apiRequest(
  endpoint: string,
  result: FetchResult,
  sentAt: number | null,
  now: number
): PortalEvents['docs_api_request'] {
  if (result.type === 'response') {
    return { endpoint, status: String(result.status), duration_ms: Math.round(result.duration) };
  }
  return { endpoint, status: 'client_error', duration_ms: sentAt === null ? 0 : now - sentAt };
}
