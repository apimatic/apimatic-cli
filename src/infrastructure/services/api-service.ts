import axios from "axios";
import { AuthInfo, getAuthInfo } from "../../client-utils/auth-manager.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { SubscriptionInfo } from "../../types/api/account.js";
import { envInfo } from "../env-info.js";
import { err, ok, Result } from "neverthrow";
import { handleServiceError, ServiceError } from "../api-utils.js";
import https from "https";

export class ApiService {
  //private readonly apiBaseUrl = "https://api.apimatic.io" as const;
  private readonly apiBaseUrl = "https://localhost:44301/api" as const;

  public async getAccountInfo(
    configDir: DirectoryPath,
    authKey: string | null
  ): Promise<Result<SubscriptionInfo, ServiceError>> {
    const authInfo: AuthInfo | null = await getAuthInfo(configDir.toString());
    if (authInfo === null && !authKey) {
      return err(ServiceError.UnAuthorized);
    }

    try {
      const token = authKey || authInfo?.authKey;
      const response = await this.axiosInstance(token).get("/account/profile");

      if (response.status === 200) {
        return ok(response.data as SubscriptionInfo);
      }
      return err(ServiceError.InvalidResponse);
    } catch (error: unknown) {
      return err(handleServiceError(error));
    }
  }

  public async sendTelemetry(payload: string, authKey: string): Promise<Result<string, string>> {
    try {
      const response = await this.axiosInstance(authKey).post("/telemetry/track", payload);

      if (response.status === 200) {
        return ok("telemetry sent");
      }
      return err("Failed to send telemetry data");
    } catch (error: unknown) {
      return err(handleServiceError(error));
    }
  }

  private axiosInstance(apiKey: string | undefined) {
    const headers: Record<string, string> = {
      "User-Agent": envInfo.getUserAgent()
    };

    if (apiKey) {
      headers.Authorization = `X-Auth-Key ${apiKey}`;
    }

    return axios.create({
      baseURL: this.apiBaseUrl,
      headers,
      // TODO: remove this before pushing to prod
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    });
  }
}
