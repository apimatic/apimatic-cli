import { Client, Environment } from "@apimatic/sdk";
import { envInfo } from "../env-info.js";

export class ApiClientFactory {
  private readonly TIMEOUT = 0;

  public createApiClient = (authorizationHeader: string, shell: string): Client => {
    const baseConfig = {
      customHeaderAuthenticationCredentials: {
        Authorization: authorizationHeader
      },
      userAgent: envInfo.getUserAgent(shell),
      timeout: this.TIMEOUT
    };

    const baseUrl = envInfo.getBaseUrl();
    return new Client({
      ...baseConfig,
      environment: baseUrl ? Environment.Testing : Environment.Production,
      ...(baseUrl && { customUrl: baseUrl })
    });
  };
}

export const apiClientFactory = new ApiClientFactory();
