import { ActionResult } from "../action-result.js";
import { SDKClient } from "../../client-utils/sdk-client.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { getAuthInfo } from "../../client-utils/auth-manager.js";
import { StatusPrompts } from "../../prompts/auth/status.js";
import { ApiService } from "../../infrastructure/services/api-service.js";

export class StatusAction {

  private readonly prompts = new StatusPrompts();
  private readonly apiService = new ApiService();

  constructor(private readonly configDir: DirectoryPath, private readonly commandMetadata: CommandMetadata) {
  }

  public async execute(): Promise<ActionResult> {
    const accountInfo = await getAuthInfo(this.configDir.toString());
    if (accountInfo === null) {
      return ActionResult.failed();
    }
    const result =
      await this.prompts.accountInfoSpinner(
        this.apiService.getAccountInfo(this.configDir, this.commandMetadata.shell, accountInfo.authKey)
      );
    if (result.isErr()) {
      this.prompts.invalidKeyProvided(result.error);
      return ActionResult.failed();
    }
    return ActionResult.success();
  }
}
