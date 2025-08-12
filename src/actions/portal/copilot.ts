import { ApiService } from "../../infrastructure/services/api-service.js";
import { PortalCopilotPrompts } from "../../prompts/portal/copilot.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../action-result.js";
import { SubscriptionInfo } from "../../types/api/account.js";
import { BuildContext } from "../../types/build-context.js";

export class CopilotAction {
  private readonly apiService = new ApiService();
  private readonly prompts = new PortalCopilotPrompts();
  private readonly configDir: DirectoryPath;
  private readonly authKey: string | null;

  constructor(configDir: DirectoryPath, authKey: string | null = null) {
    this.configDir = configDir;
    this.authKey = authKey;
  }

  public async execute(buildDirectory: DirectoryPath, enable: boolean): Promise<ActionResult> {
    const buildContext = new BuildContext(buildDirectory);

    if (!(await buildContext.validate())) {
      return ActionResult.error(`Unable to locate a valid "src" directory. Navigate to the directory containing your APIMatic Portal source or set up a new project by running apimatic portal:quickstart.`);
    }

    const buildJson = await buildContext.getBuildFileContents();

    if (buildJson.apiCopilotConfig != null && !(await this.prompts.confirmOverwrite()))
      return ActionResult.error("Exiting without making any change.");

    const response = await this.apiService.getAccountInfo(this.configDir, this.authKey);
    if (response.isErr()) {
      return ActionResult.error(response._unsafeUnwrapErr());
    }
    const apiCopilotKey = await this.selectCopilotKey(response._unsafeUnwrap());
    if (apiCopilotKey === null) {
      return ActionResult.error("No copilot key found for the current subscription. Please contact support at support@apimatic.io.");
    }

    const welcomeMessage = await this.prompts.getWelcomeMessage();
    if (welcomeMessage === undefined)
      return ActionResult.error("Exiting without making any change.");

    buildJson.apiCopilotConfig = {
      isEnabled: enable,
      key: apiCopilotKey,
      welcomeMessage: welcomeMessage
    };

    await buildContext.updateBuildFileContents(buildJson);

    this.prompts.copilotConfigured(buildJson.apiCopilotConfig);
    return ActionResult.success();
  }

  private async selectCopilotKey(subscription: SubscriptionInfo | undefined): Promise<string | null> {
    if (
      subscription === undefined ||
      subscription.ApiCopilotKeys === undefined ||
      subscription.ApiCopilotKeys.length === 0
    ) {
      return null;
    }

    return await this.prompts.selectCopilotKey(subscription.ApiCopilotKeys);
  }
}
