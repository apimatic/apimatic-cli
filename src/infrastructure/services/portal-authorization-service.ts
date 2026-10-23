import { err, ok, Result } from 'neverthrow';
import { AccountEntitlements, SubscriptionFeature } from '../../types/api/account-entitlements.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { ServiceError, ServiceErrorCode } from '../service-error.js';
import { ApiService } from './api-service.js';

/** Long enough for a slow connection, short enough that the build does not appear to hang. */
const PROFILE_TIMEOUT_MS = 10_000;

/**
 * Why the work may not go ahead. `unverifiable` is deliberately distinct from `notEntitled`:
 * the first means we could not reach the account, the second means we did and the plan says no.
 */
export type PortalAuthorizationFailure =
  | { kind: 'unauthenticated' }
  | { kind: 'unverifiable'; error: ServiceError; host: string }
  | { kind: 'notEntitled'; feature: SubscriptionFeature };

/** Checks what the account's subscription allows, before any work that needs it starts. */
export class PortalAuthorizationService {
  private readonly apiService = new ApiService();

  /** Whether the account may generate a portal on this machine; answers with the rest of what it may do. */
  public async authorize(
    configDir: DirectoryPath,
    shell: string,
    authKey: string | null
  ): Promise<Result<AccountEntitlements, PortalAuthorizationFailure>> {
    return await this.require('portalGeneration', configDir, shell, authKey);
  }

  /** Whether the account may give a portal an Ask AI chat. */
  public async authorizeAskAi(
    configDir: DirectoryPath,
    shell: string,
    authKey: string | null
  ): Promise<Result<AccountEntitlements, PortalAuthorizationFailure>> {
    return await this.require('askAi', configDir, shell, authKey);
  }

  private async require(
    feature: SubscriptionFeature,
    configDir: DirectoryPath,
    shell: string,
    authKey: string | null
  ): Promise<Result<AccountEntitlements, PortalAuthorizationFailure>> {
    const account = await this.apiService.getAccountInfo(configDir, shell, authKey, PROFILE_TIMEOUT_MS);

    if (account.isErr()) {
      // Fail closed: an unreachable profile endpoint never grants the entitlement.
      return err(
        account.error.code === ServiceErrorCode.UnAuthorized
          ? { kind: 'unauthenticated' }
          : { kind: 'unverifiable', error: account.error, host: this.apiService.apiHost() }
      );
    }

    const entitlements = AccountEntitlements.of(account.value);
    return entitlements.includes(feature) ? ok(entitlements) : err({ kind: 'notEntitled', feature });
  }
}
