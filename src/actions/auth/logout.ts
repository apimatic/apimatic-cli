import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../action-result.js";
import { removeAuthInfo } from "../../client-utils/auth-manager.js";
import { LogoutPrompts } from "../../prompts/auth/logout.js";

export class LogoutAction {

  private readonly prompts = new LogoutPrompts();

  constructor(private readonly configDir: DirectoryPath) {}

  public async execute(): Promise<ActionResult> {
    this.prompts.removeAuthInfo();
    await removeAuthInfo(this.configDir)
    return ActionResult.success();
  }
}
