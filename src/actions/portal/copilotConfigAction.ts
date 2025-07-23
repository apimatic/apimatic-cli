import { FileService } from "../../infrastructure/file-service.js";
import { ApiService } from "../../infrastructure/services/api-service.js";
import { PortalCopilotPrompts } from "../../prompts/portal/copilot.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../actionResult.js";
import { FilePath } from "../../types/file/filePath.js";
import { FileName } from "../../types/file/fileName.js";
import { BuildConfig } from "../../types/build/build.js";
import { SubscriptionInfo } from "../../types/api/account.js";

export class CopilotConfigAction {
  private readonly fileService = new FileService();
  private readonly apiService = new ApiService();
  private readonly prompts = new PortalCopilotPrompts();
  private readonly configDir: DirectoryPath;
  private readonly authKey: string | null;

  constructor(configDir: DirectoryPath, authKey: string | null = null) {
    this.configDir = configDir;
    this.authKey = authKey;
  }

  public async execute(buildDirectory: DirectoryPath, welcomeMessage: string, enable: boolean): Promise<ActionResult> {
    if (!(await this.validateBuild(buildDirectory))) {
      return ActionResult.error("build directory is empty or not valid");
    }

    const buildFile = new FilePath(buildDirectory, new FileName("APIMATIC-BUILD.json"));
    const buildFileContent = await this.fileService.getContents(buildFile);

    const buildJson = JSON.parse(buildFileContent) as BuildConfig;

    const response = await this.apiService.getAccountInfo(this.configDir, this.authKey);
    if (!response.isSuccess()) {
      return ActionResult.error(response.error!);
    }
    const apiCopilotKey = await this.selectCopilotKey(response.value);
    if (apiCopilotKey === null) {
      return ActionResult.error("No copilot key found for the current subscription. Please contact support.");
    }

    buildJson.apiCopilotConfig = {
      isEnabled: enable,
      key: apiCopilotKey,
      welcomeMessage: welcomeMessage,
      llm: "open_ai",
    };

    await this.fileService.writeContents(buildFile, JSON.stringify(buildJson, null, 2));

    this.prompts.copilotConfigured()
    return ActionResult.success();
  }

  private async validateBuild(buildDirectory: DirectoryPath) {
    // TODO: add more checks here
    if (!(await this.fileService.directoryExists(buildDirectory))) return false;

    const buildFile = new FilePath(buildDirectory, new FileName("APIMATIC-BUILD.json"));
    return await this.fileService.fileExists(buildFile);
  }

  private async selectCopilotKey(subscription: SubscriptionInfo | undefined): Promise<string | null> {
    if (subscription === undefined || subscription.ApiCopilotKeys === undefined || subscription.ApiCopilotKeys.length === 0) {
      return null;
    }
    if (subscription.ApiCopilotKeys.length === 1) {
      return subscription.ApiCopilotKeys[0];
    }

    return await this.prompts.selectCopilotKey(subscription.ApiCopilotKeys);
  }
}
