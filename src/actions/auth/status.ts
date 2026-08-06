import { ActionResult } from "../action-result.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { getAuthInfo } from "../../client-utils/auth-manager.js";
import { StatusPrompts } from "../../prompts/auth/status.js";
import { ApiService } from "../../infrastructure/services/api-service.js";

export class StatusAction {
  private readonly prompts = new StatusPrompts();
  private readonly apiService = new ApiService();

  constructor(private readonly configDir: DirectoryPath, private readonly commandMetadata: CommandMetadata) {}

  public async execute(authKey: string | null): Promise<ActionResult> {
    const accountInfo = await getAuthInfo(this.configDir.toString());
    // `auth logout` blanks config.json rather than deleting it, so a logged-out user still
    // has a non-null AuthInfo with an empty key. Checking the key catches both that and a
    // missing config file, and avoids a request that can only come back 401.
    if (!accountInfo?.authKey) {
      this.prompts.notLoggedIn();
      return ActionResult.failed();
    }
    const result = await this.prompts.accountInfoSpinner(
      this.apiService.getAccountInfo(this.configDir, this.commandMetadata.shell, authKey)
    );
    if (result.isErr()) {
      this.prompts.invalidKeyProvided(result.error);
      return ActionResult.failed();
    }
    this.prompts.showAccountInfo(result.value);
    return ActionResult.success();
  }
}
