import axios from 'axios';
import { err, ok, Result } from 'neverthrow';
import { ServiceAddress } from '../../types/portal/config/service-address.js';
import { CopilotKey } from '../../types/portal/copilot/copilot-key.js';
import { CopilotRegistration } from '../../types/portal/copilot/copilot-registration.js';
import { LookupOutcome, RegistrationOutcome, RevocationOutcome } from '../../types/portal/copilot/portal-key-outcomes.js';
import { isJsonObject } from '../../utils/json-utils.js';
import { envInfo } from '../env-info.js';
import { ServiceError } from '../service-error.js';
import { copilotFailureOf, copilotTransportFailure, duration } from './copilot-responses.js';

const COPILOT_PORTAL_TIMEOUT_MS = 30_000;

/** Registers a portal's key with the Ask AI service, which checks the account's subscription, looks it up and revokes it. */
export class CopilotPortalService {
  constructor(private readonly timeoutMs: number = COPILOT_PORTAL_TIMEOUT_MS) {}

  public async register(
    address: ServiceAddress,
    key: CopilotKey,
    registration: CopilotRegistration,
    shell: string,
    authKey: string
  ): Promise<Result<RegistrationOutcome, ServiceError>> {
    try {
      const response = await this.axiosInstance(address, key.toString(), shell, authKey).put(
        '/v1/portals',
        registration.toJSON()
      );
      if (response.status === 201) return ok('created');
      if (response.status === 200) return ok('updated');
      return err(copilotFailureOf(response));
    } catch (error) {
      return err(copilotTransportFailure(error, this.timedOut()));
    }
  }

  /** Takes the key as `apimatic.json` holds it, so a key the CLI did not write can be revoked too. */
  public async revoke(
    address: ServiceAddress,
    key: string,
    shell: string,
    authKey: string
  ): Promise<Result<RevocationOutcome, ServiceError>> {
    try {
      const response = await this.axiosInstance(address, key, shell, authKey).delete('/v1/portals');
      if (response.status === 204 || response.status === 200) return ok('revoked');
      if (response.status === 404 && isUnknownKey(response.data)) return ok('unknown');
      return err(copilotFailureOf(response));
    } catch (error) {
      return err(copilotTransportFailure(error, this.timedOut()));
    }
  }

  /** Takes the key as `apimatic.json` holds it, as `revoke` does. */
  public async lookUp(
    address: ServiceAddress,
    key: string,
    shell: string,
    authKey: string
  ): Promise<Result<LookupOutcome, ServiceError>> {
    try {
      const response = await this.axiosInstance(address, key, shell, authKey).get('/v1/portals');
      if (response.status === 200) return ok('registered');
      if (response.status === 404 && isUnknownKey(response.data)) return ok('unknown');
      if (response.status === 403 && isOtherAccountsKey(response.data)) return ok('otherAccount');
      return err(copilotFailureOf(response));
    } catch (error) {
      return err(copilotTransportFailure(error, this.timedOut()));
    }
  }

  private timedOut(): string {
    return `The Ask AI service did not answer within ${duration(this.timeoutMs)}.`;
  }

  // The key travels in a header rather than the path, so it stays out of access logs, as on `ingest`.
  private axiosInstance(address: ServiceAddress, key: string, shell: string, authKey: string) {
    return axios.create({
      baseURL: address.toString(),
      timeout: this.timeoutMs,
      validateStatus: () => true,
      transitional: { clarifyTimeoutError: true },
      headers: {
        'User-Agent': envInfo.getUserAgent(shell),
        Authorization: `X-Auth-Key ${authKey}`,
        'X-Copilot-Key': key
      }
    });
  }
}

// Only the service's own answer says it holds no such key; a 404 from another host is a failure, so the key is kept.
function isUnknownKey(body: unknown): boolean {
  return isJsonObject(body) && body.code === 'not_found';
}

function isOtherAccountsKey(body: unknown): boolean {
  return isJsonObject(body) && body.code === 'forbidden';
}
