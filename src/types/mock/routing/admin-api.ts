import { RequestModel } from '../matching/request-model.js';
import { ADMIN_PREFIX, isUnderAdminPrefix } from '../stub-format/admin-prefix.js';
import { RequestLog, requestLogJson } from './request-log.js';
import { wireRefusal, WireResponse, wireResponseOf } from './wire-response.js';

export const REQUEST_LOG_PATH = `${ADMIN_PREFIX}/requests`;

const ALLOWED = ['GET', 'DELETE'];

/**
 * The mock's own API: the request log, read with GET and cleared with DELETE, and nothing else.
 * It answers before any stub and without credentials, so it offers no write beyond that clear and
 * nothing that reads a file or takes a pattern. Nothing for a path outside the prefix, which
 * leaves the request to the router.
 */
export function adminAnswer(request: RequestModel, log: RequestLog): WireResponse | undefined {
  if (!isUnderAdminPrefix(request.path)) {
    return undefined;
  }
  if (request.path !== REQUEST_LOG_PATH) {
    return wireRefusal(
      404,
      `The mock's admin API is the request log at ${REQUEST_LOG_PATH} alone; there is no ${request.path}.`
    );
  }
  switch (request.method) {
    case 'GET':
      return wireResponseOf(
        { status: 200, headers: [], body: { kind: 'json', json: requestLogJson(log.requests()) } },
        request.method
      );
    case 'DELETE':
      log.clear();
      return wireResponseOf({ status: 204, headers: [], body: { kind: 'empty' } }, request.method);
    default:
      return wireRefusal(
        405,
        `The mock's request log is read with GET and cleared with DELETE; ${request.method} is refused.`,
        [{ name: 'Allow', value: ALLOWED.join(', ') }]
      );
  }
}
