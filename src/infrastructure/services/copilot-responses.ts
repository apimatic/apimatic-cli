import axios, { AxiosResponse } from 'axios';
import { isJsonObject } from '../../utils/json-utils.js';
import { handleServiceError, ServiceError } from '../service-error.js';

/** The service explains every refusal as `{ code, message }`; the message is what the user is shown. */
export function copilotFailureOf(response: AxiosResponse): ServiceError {
  const body = response.data as unknown;
  const message = isJsonObject(body) && typeof body.message === 'string' ? body.message : null;
  switch (response.status) {
    case 400:
    case 409:
    case 413:
    case 429:
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
export function copilotTransportFailure(error: unknown, timedOut: string): ServiceError {
  if (!axios.isAxiosError(error) || error.response !== undefined) {
    return handleServiceError(error);
  }
  return error.code === 'ETIMEDOUT' ? ServiceError.timeout(timedOut) : ServiceError.NetworkError;
}

export function duration(ms: number): string {
  if (ms < 60_000) {
    const seconds = Math.max(1, Math.round(ms / 1000));
    return `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
  }
  const minutes = Math.round(ms / 60_000);
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}
