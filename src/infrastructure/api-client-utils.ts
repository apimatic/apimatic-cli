import { Client, Environment } from "@apimatic/sdk";
import { AuthInfo } from "../client-utils/auth-manager.js";
import { envInfo } from "./env-info.js";

export function createAuthorizationHeader(authInfo: AuthInfo | null, overrideAuthKey: string | null): string {
  const key = overrideAuthKey || authInfo?.authKey;
  return `X-Auth-Key ${key ?? ""}`;
}

export function createApiClient(authorizationHeader: string, timeout: number): Client {
  if (envInfo.getBaseUrl()) {
    return createTestingApiClient(authorizationHeader, timeout);
  }
  return createProductionApiClient(authorizationHeader, timeout);
}

export function createProductionApiClient(authorizationHeader: string, timeout: number): Client {
  return new Client({
    customHeaderAuthenticationCredentials: {
      Authorization: authorizationHeader
    },
    userAgent: envInfo.getUserAgent(),
    timeout: timeout,
    environment: Environment.Production
  });
}

export function createTestingApiClient(authorizationHeader: string, timeout: number): Client {
  return new Client({
    customHeaderAuthenticationCredentials: {
      Authorization: authorizationHeader
    },
    userAgent: envInfo.getUserAgent(),
    timeout: timeout,
    environment: Environment.Testing,
    customUrl: envInfo.getBaseUrl()
  });
}
