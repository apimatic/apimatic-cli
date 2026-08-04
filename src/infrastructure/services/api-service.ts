import axios from "axios";
import { AuthInfo, getAuthInfo } from "../../client-utils/auth-manager.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { SubscriptionInfo } from "../../types/api/account.js";
import { envInfo } from "../env-info.js";
import { err, ok, Result } from "neverthrow";
import { handleServiceError, serviceErrorForStatus, ServiceError } from "../service-error.js";
import { Status } from "@apimatic/sdk";
import { GenerationStatusEndpoint } from "../../types/api/generation-status-endpoint.js";
import { GenerationStatusResponse } from "./generation-status-poller.js";

export class ApiService {
  private readonly apiBaseUrl = "https://api.apimatic.io" as const;

  public async getAccountInfo(
    configDir: DirectoryPath,
    shell: string,
    authKey: string | null
  ): Promise<Result<SubscriptionInfo, ServiceError>> {
    const authInfo: AuthInfo | null = await getAuthInfo(configDir.toString());
    if (authInfo === null && !authKey) {
      return err(ServiceError.UnAuthorized);
    }

    try {
      const token = authKey || authInfo?.authKey;
      const response = await this.axiosInstance(shell, token).get("/account/profile");

      if (response.status === 200) {
        return ok(response.data as SubscriptionInfo);
      }
      return err(ServiceError.InvalidResponse);
    } catch (error: unknown) {
      return err(handleServiceError(error));
    }
  }

  /**
   * Reads the status of one in-flight generation request. Shared by every
   * async generation endpoint — see `GenerationStatusEndpoint`.
   */
  public async getGenerationStatus(
    endpoint: GenerationStatusEndpoint,
    requestId: string,
    configDir: DirectoryPath,
    shell: string,
    authKey: string | null
  ): Promise<Result<GenerationStatusResponse, ServiceError>> {
    const authInfo: AuthInfo | null = await getAuthInfo(configDir.toString());
    if (authInfo === null && !authKey) {
      return err(ServiceError.UnAuthorized);
    }

    try {
      const token = authKey || authInfo?.authKey;
      const response = await this.axiosInstance(shell, token).get(`${endpoint}/${requestId}/status`, {
        headers: { Accept: "application/json" },
        maxRedirects: 0,
        validateStatus: () => true
      });

      if (response.status === 200) {
        return ok(response.data as GenerationStatusResponse);
      }

      // Once generation finishes, the API redirects to the download location.
      if (response.status === 302) {
        return ok({ status: Status.Completed });
      }

      // `validateStatus` above stops axios throwing, so nothing reaches the
      // catch block — classify the status here, or a mistyped endpoint path and
      // an expired auth key both surface as a generic "unexpected error".
      return err(serviceErrorForStatus(response.status) ?? ServiceError.InvalidResponse);
    } catch (error: unknown) {
      return err(handleServiceError(error));
    }
  }

  public async sendTelemetry(payload: string, authKey: string, shell: string): Promise<Result<string, string | ServiceError>> {
    try {
      const response = await this.axiosInstance(shell, authKey).post("/telemetry/track", payload, {
        headers: { "Content-Type": "application/json" }
      });

      if (response.status === 200) {
        return ok("telemetry sent");
      }
      return err("Failed to send telemetry data");
    } catch (error: unknown) {
      return err(handleServiceError(error));
    }
  }

  private axiosInstance(shell: string, apiKey: string | undefined) {
    const headers: Record<string, string> = {
      "User-Agent": envInfo.getUserAgent(shell)
    };

    if (apiKey) {
      headers.Authorization = `X-Auth-Key ${apiKey}`;
    }

    return axios.create({
      baseURL: envInfo.getBaseUrl() ?? this.apiBaseUrl,
      headers
    });
  }
}
