import { AuthService } from "../../infrastructure/services/auth-service.js";
import { ApiService } from "../../infrastructure/services/api-service.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { err, ok, Result } from "neverthrow";
import { v4 as uuid } from "uuid";
import open from "open";
import { setAuthInfo } from "../../client-utils/auth-manager.js";
import { LoginPrompts } from "../../prompts/auth/login.js";
import { getErrorMessage, ServiceError } from "../../infrastructure/api-utils.js";

export class LoginAction {
  private readonly authService = new AuthService();
  private readonly apiService = new ApiService();
  private readonly prompts = new LoginPrompts();

  constructor(private readonly configDir: DirectoryPath) {}

  public async execute(shell: string, apiKey: string | undefined = undefined): Promise<Result<string, string>> {
    if (!apiKey) {
      const result = await this.poolDeviceToken(shell);
      return (
        await result.asyncMap(async (token) => {
          return await this.verifyKeyAndSave(token, shell);
        })
      ).andThen((r) => r);
    } else {
      return await this.verifyKeyAndSave(apiKey, shell);
    }
  }

  private async poolDeviceToken(shell: string): Promise<Result<string, string>> {
    const state = uuid();
    this.prompts.openBrowser();
    await open(this.authService.getDeviceLoginUrl(state));

    const timeoutDuration = 5 * 60 * 1000; // 5 minutes in milliseconds
    const startTime = Date.now();
    const delayMs = 3 * 1000;

    while (true) {
      if (Date.now() - startTime > timeoutDuration) {
        return err("Authentication timed out. Please try again.");
      }

      const result = await this.authService.getDeviceLoginToken(state, shell);
      const token = result.match(
        (res) => res.apiKey,
        () => {
          /* ignore errors */
        }
      );
      if (token) return ok(token);

      // eslint-disable-next-line no-undef
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  private async verifyKeyAndSave(apiKey: string, shell: string): Promise<Result<string, string>> {
    const result = await this.apiService.getAccountInfo(this.configDir, shell, apiKey);
    return result.asyncMap(async (info) => {
      await setAuthInfo(info.Email, apiKey, false, this.configDir);
      return info.Email;
    }).mapErr(e => {
        switch (e) {
          case ServiceError.UnAuthorized:
            return "The provided auth key is invalid"
          default:
            return getErrorMessage(e);
        }
    });
  }
}
