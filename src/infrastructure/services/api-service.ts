import axios from "axios";
import { ContentType } from "@apimatic/sdk";
import { AuthInfo, getAuthInfo } from "../../client-utils/auth-manager.js";
import { Result } from "../../types/common/result.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FileService } from "../file-service.js";
import { SubscriptionInfo } from "../../types/api/account.js";
import os from "os";

export class ApiService {
  private readonly CONTENT_TYPE = ContentType.EnumMultipartformdata;
  private readonly TIMEOUT = 0;
  private readonly fileService = new FileService();
  private readonly apiBaseUrl = "https://api.apimatic.io";

  public async getAccountInfo(
    configDir: DirectoryPath,
    authKey: string | null
  ): Promise<Result<SubscriptionInfo, string>> {
    const authInfo: AuthInfo | null = await getAuthInfo(configDir.toString());
    if (authInfo === null && !authKey) {
      return Result.failure("You are not logged in, please login using `auth:login` first.");
    }

    try {
      const token = authKey || authInfo?.authKey;
      const response = await axios.get(`${this.apiBaseUrl}/account/profile`, {
        headers: {
          Authorization: `X-Auth-Key ${token}`,
          "Content-Type": "application/json",
          "User-Agent": this.getUserAgent()
        }
      });

      if (response.status === 200) {
        return Result.success(response.data as SubscriptionInfo);
      }
      return Result.failure("Failed to fetch account information");
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          return Result.failure("Unauthorized access. Please check your authentication credentials.");
        }
        if (error.response?.status === 404) {
          return Result.failure("Account information not found.");
        }
        return Result.failure(`Error fetching account information: ${error.response?.data?.message || error.message}`);
      }
      return Result.failure("An unexpected error occurred while fetching account information.");
    }
  }

  private getUserAgent(): string {
    const osInfo = `${os.platform()} ${os.release()}`;
    const engine = "Node.js";
    const engineVersion = process.version;

    return `APIMATIC CLI - [OS: ${osInfo}, Engine: ${engine}/${engineVersion}]`;
  }
}
