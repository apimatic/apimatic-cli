import { err, ok, Result } from 'neverthrow';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { ServiceError, ServiceErrorCode } from '../service-error.js';
import { ApiService } from './api-service.js';

/** Long enough for a slow connection, short enough that the build does not appear to hang. */
const PROFILE_TIMEOUT_MS = 10_000;

/**
 * Why the portal may not be built. `unverifiable` is deliberately distinct from
 * `notEntitled`: the first means we could not reach the account, the second means we did
 * and the plan says no.
 */
export type PortalAuthorizationFailure =
  | { kind: 'unauthenticated' }
  | { kind: 'unverifiable'; error: ServiceError }
  | { kind: 'notEntitled' };

/** Checks the account may generate a portal on this machine, before any build work starts. */
export class PortalAuthorizationService {
  private readonly apiService = new ApiService();

  public async authorize(
    configDir: DirectoryPath,
    shell: string,
    authKey: string | null
  ): Promise<Result<void, PortalAuthorizationFailure>> {
    const account = await this.apiService.getAccountInfo(configDir, shell, authKey, PROFILE_TIMEOUT_MS);

    if (account.isErr()) {
      // Fail closed: an unreachable profile endpoint never grants the entitlement.
      return err(
        account.error.code === ServiceErrorCode.UnAuthorized
          ? { kind: 'unauthenticated' }
          : { kind: 'unverifiable', error: account.error }
      );
    }

    if (!account.value.isOnPremGenerationAllowed) {
      return err({ kind: 'notEntitled' });
    }

    return ok(undefined);
  }
}
