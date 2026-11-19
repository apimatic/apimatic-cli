import { RequestModel } from '../matching/request-model.js';
import { isAnswer, responseOn } from '../matching/verdict.js';
import { adminAnswer } from './admin-api.js';
import { loggedRequest, RequestLog } from './request-log.js';
import { StubRouter } from './stub-router.js';
import { wireMismatch, WireResponse, wireResponseOf } from './wire-response.js';

/**
 * What the mock sends back to a request that arrived on `origin`. The admin API answers first and
 * is not logged; every other request is decided by the router and logged with what came of it.
 */
export function respond(router: StubRouter, log: RequestLog, request: RequestModel, origin: string): WireResponse {
  const admin = adminAnswer(request, log);
  if (admin !== undefined) {
    return admin;
  }
  const verdict = router.decide(request);
  log.add(loggedRequest(request, verdict));
  return isAnswer(verdict)
    ? wireResponseOf(responseOn(verdict, origin), request.method)
    : wireMismatch(request, verdict);
}
