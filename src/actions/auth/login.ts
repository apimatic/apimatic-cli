import { AuthService } from "../../infrastructure/services/auth-service.js";
import { ApiService } from "../../infrastructure/services/api-service.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { v4 as uuid } from "uuid";
import open from "open";
import { setAuthInfo } from "../../client-utils/auth-manager.js";
import { LoginPrompts } from "../../prompts/auth/login.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { ActionResult } from "../action-result.js";
import { err, ok, Result } from "neverthrow";

type LoginTimeout = "TIMEOUT";

export class LoginAction {
  private readonly authService = new AuthService();
  private readonly apiService = new ApiService();
  private readonly prompts = new LoginPrompts();

  constructor(private readonly configDir: DirectoryPath, private readonly commandMetadata: CommandMetadata) {}

  public async execute(apiKey: string | undefined = undefined): Promise<ActionResult> {
    const apiKeyResult = await this.pollDeviceToken(apiKey, this.commandMetadata.shell);
    if (apiKeyResult.isErr()) {
      this.prompts.loginTimeout();
      return ActionResult.failed();
    }

    // TODO: Use status endpoint here
    // Problem, we don't have email info here, just the key and required for setAuthInfo
    const accountInfoResult =
      await this.prompts.accountInfoSpinner(
        this.apiService.getAccountInfo(this.configDir, this.commandMetadata.shell, apiKeyResult.value)
      );
    if (accountInfoResult.isErr()) {
      this.prompts.invalidKeyProvided(accountInfoResult.error);
      return ActionResult.failed();
    }
    await setAuthInfo(accountInfoResult.value.Email, apiKeyResult.value, false, this.configDir);
    this.prompts.loginSuccessful(accountInfoResult.value.Email);
    return ActionResult.success();
  }

  private async pollDeviceToken(apiKey: string | undefined, shell: string): Promise<Result<string, LoginTimeout>> {
    if (apiKey) return ok(apiKey);
    const state = uuid();
    this.prompts.openBrowser();
    await open(this.authService.getDeviceLoginUrl(state));

    const timeoutDuration = 5 * 60 * 1000; // 5 minutes in milliseconds
    const startTime = Date.now();
    const delayMs = 3 * 1000;

    while (true) {
      if (Date.now() - startTime > timeoutDuration) {
        return err("TIMEOUT");
      }
      const result = await this.authService.getDeviceLoginToken(state, shell);
      if (result.isOk()) {
        return ok(result.value.apiKey);
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
