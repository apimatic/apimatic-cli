import { Client } from "@apimatic/sdk";
import { AuthInfo } from "../client-utils/auth-manager.js";
import { envInfo } from "./env-info.js";

export function createApiClient(authorizationHeader: string, timeout: number): Client {
  return new Client({
    customHeaderAuthenticationCredentials: {
      Authorization: authorizationHeader
    },
    userAgent: envInfo.getUserAgent(),
    timeout: timeout
  });
}


export function createAuthorizationHeader(authInfo: AuthInfo | null, overrideAuthKey: string | null): string {
  const key = overrideAuthKey || authInfo?.authKey;
  return `X-Auth-Key ${key ?? ""}`;
}

