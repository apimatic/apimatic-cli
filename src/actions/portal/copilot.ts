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
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { err, ok, Result } from "neverthrow";

type SelectKeyFailure = "failed" | "cancelled";
type SelectKeyResult = Result<string, SelectKeyFailure>;

export class CopilotAction {
  private readonly apiService = new ApiService();
  private readonly fileService = new FileService();
  private readonly launcherService = new LauncherService();
  private readonly prompts = new PortalCopilotPrompts();
  private readonly configDir: DirectoryPath;
  private readonly commandMetadata: CommandMetadata;
  private readonly authKey: string | null;

  constructor(configDir: DirectoryPath, commandMetadata: CommandMetadata, authKey: string | null = null) {
    this.configDir = configDir;
    this.commandMetadata = commandMetadata;
    this.authKey = authKey;
  }

  public readonly execute = async (
    buildDirectory: DirectoryPath,
    force: boolean,
    enable: boolean
  ): Promise<ActionResult> => {


    this.prompts.copilotConfigured(enable, 'asdfadsfadsf');

    const buildContext = new BuildContext(buildDirectory);

    if (!(await buildContext.validate())) {
      this.prompts.srcDirectoryEmpty(buildDirectory);
      return ActionResult.failed();
    }

    const buildJson = await buildContext.getBuildFileContents();

    if (!force && buildJson.apiCopilotConfig != null && !(await this.prompts.confirmOverwrite())) {
      this.prompts.cancelled();
      return ActionResult.cancelled();
    }

    const response = await this.prompts.spinnerAccountInfo(
      this.apiService.getAccountInfo(this.configDir, this.commandMetadata.shell, this.authKey)
    );

    if (response.isErr()) {
      this.prompts.serviceError(response.error);
      return ActionResult.failed();
    }

    const apiCopilotKeyResult = await this.selectCopilotKey(response.value, force);
    if (apiCopilotKeyResult.isErr()) {
      if (apiCopilotKeyResult.error === "cancelled") return ActionResult.cancelled();
      return ActionResult.failed();
    }

    const welcomeMessage = await this.prepareWelcomeMessage();

    buildJson.apiCopilotConfig = {
      isEnabled: enable,
      key: apiCopilotKeyResult.value,
      welcomeMessage: welcomeMessage
    };

    await buildContext.updateBuildFileContents(buildJson);

    this.prompts.copilotConfigured(enable, apiCopilotKeyResult.value);

    return ActionResult.success();
  };

  private async selectCopilotKey(subscription: SubscriptionInfo, force: boolean): Promise<SelectKeyResult> {
    if (subscription.ApiCopilotKeys === undefined || subscription.ApiCopilotKeys.length === 0) {
      this.prompts.noCopilotKeyFound();
      return err("failed");
    }

    if (subscription.ApiCopilotKeys.length === 1) {
      if (force || (await this.prompts.confirmSingleKeyUsage(subscription.ApiCopilotKeys[0])))
        return ok(subscription.ApiCopilotKeys[0]);
      this.prompts.noCopilotKeySelected();
      return err("cancelled");
    }

    const key = await this.prompts.selectCopilotKey(subscription.ApiCopilotKeys);
    if (key === null) {
      this.prompts.noCopilotKeySelected();
      return err("cancelled");
    }
    await this.prompts.displayApiCopilotKeyUsageWarning();
    return ok(key);
  }

  private async prepareWelcomeMessage(): Promise<string> {
    return await withDirPath(async (tempDir) => {
      const tempFile = new FilePath(tempDir, new FileName("welcome-message.md"));
      const defaultContent =
        "Hi there! I'm your API Integration Assistant, here to help you learn and integrate with this API.\n" +
        "\n" +
        "Ask me anything about this API or try one of these example prompts:\n" +
        "\n" +
        "`- What authentication methods does this API support?`\n" +
        "`- [Enter another prompt here]`";
      await this.fileService.writeContents(tempFile, defaultContent);
      this.prompts.openWelcomeMessageEditor();
      await this.launcherService.openInEditor(tempFile);
      const welcomeMessage = await this.fileService.getContents(tempFile);
      return welcomeMessage.replace(/\r\n|\r/g, "\n");
    });
  }
}
