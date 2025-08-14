import axios, { AxiosInstance } from "axios";
import { envInfo } from "../env-info.js";
import { err, ok, Result } from "neverthrow";
import { ServiceError, handleServiceError } from "../api-utils.js";

export interface DeviceAuthToken {
  apiKey: string;
}

export class AuthService {
  private readonly apiBaseUrl = "https://auth.apimatic.io" as const;

  private axiosInstance: AxiosInstance = axios.create({
    baseURL: envInfo.getAuthBaseUrl() ?? this.apiBaseUrl,
    timeout: 20000,
    headers: {
      "User-Agent": envInfo.getUserAgent()
    }
  });

  public getDeviceLoginUrl(state: string): string {
    return `${envInfo.getAuthBaseUrl() ?? this.apiBaseUrl}/device-auth/login?state=${state}`;
  }

  public async getDeviceLoginToken(state: string): Promise<Result<DeviceAuthToken, ServiceError>> {
    try {
      const response = await this.axiosInstance.get(`/device-auth/token?state=${state}`);
      if (response.status === 200 && response.data?.apiKey) {
        return ok({ apiKey: response.data.apiKey });
      }
      return err(ServiceError.InvalidResponse);
    } catch (error) {
      return err(handleServiceError(error));
    }
  }
}
