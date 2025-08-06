import { ApiService } from "../../infrastructure/services/api-service.js";
import { PortalCopilotPrompts } from "../../prompts/portal/copilot.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../action-result.js";
import { SubscriptionInfo } from "../../types/api/account.js";
import { BuildContext } from "../../types/build-context.js";
import { withDirPath } from "../../infrastructure/tmp-extensions.js";
import { FilePath } from "../../types/file/filePath.js";
import { FileName } from "../../types/file/fileName.js";
import { FileService } from "../../infrastructure/file-service.js";
import { LauncherService } from "../../infrastructure/launcher-service.js";

export class CopilotAction {
  private readonly apiService = new ApiService();
  private readonly fileService = new FileService();
  private readonly launcherService = new LauncherService();
  private readonly prompts = new PortalCopilotPrompts();
  private readonly configDir: DirectoryPath;
  private readonly authKey: string | null;

  constructor(configDir: DirectoryPath, authKey: string | null = null) {
    this.configDir = configDir;
    this.authKey = authKey;
  }

  public async execute(buildDirectory: DirectoryPath, force: boolean, enable: boolean): Promise<ActionResult> {
    const buildContext = new BuildContext(buildDirectory);

    if (!(await buildContext.validate())) {
      return ActionResult.error("'src' directory is empty or not valid.");
    }

    const buildJson = await buildContext.getBuildFileContents();

    if (!force && buildJson.apiCopilotConfig != null && !(await this.prompts.confirmOverwrite()))
      return ActionResult.error("Exiting without making any change.");

    const response = await this.apiService.getAccountInfo(this.configDir, this.authKey);
    if (response.isErr()) {
      return ActionResult.error(response._unsafeUnwrapErr());
    }
    const apiCopilotKey = await this.selectCopilotKey(response._unsafeUnwrap(), force);
    if (apiCopilotKey === null) {
      return ActionResult.error(
        "No copilot key found for the current subscription. Please contact support at support@apimatic.io."
      );
    }

    const welcomeMessage = await this.getWelcomeMessage();
    if (welcomeMessage === undefined) return ActionResult.error("Exiting without making any change.");

    buildJson.apiCopilotConfig = {
      isEnabled: enable,
      key: apiCopilotKey,
      welcomeMessage: welcomeMessage
    };

    await buildContext.updateBuildFileContents(buildJson);

    this.prompts.copilotConfigured(buildJson.apiCopilotConfig);
    return ActionResult.success();
  }

  private async selectCopilotKey(subscription: SubscriptionInfo | undefined, force: boolean): Promise<string | null> {
    if (
      subscription === undefined ||
      subscription.ApiCopilotKeys === undefined ||
      subscription.ApiCopilotKeys.length === 0
    ) {
      return null;
    }

    if (force && subscription.ApiCopilotKeys.length === 1) return subscription.ApiCopilotKeys[0];

    return await this.prompts.selectCopilotKey(subscription.ApiCopilotKeys);
  }

  private async getWelcomeMessage(): Promise<string> {
    return await withDirPath(async (tempDir) => {
      const tempFile = new FilePath(tempDir, new FileName("welcome-message.md"));
      const defaultContent = "[//]: # (Enter your welcome message here...)";
      await this.fileService.writeContents(tempFile, defaultContent);
      await this.launcherService.openFile(tempFile);
      const welcomeMessage = await this.fileService.getContents(tempFile);
      return welcomeMessage.replace(/\r\n|\r/g, "\n");
    });
  }
}
