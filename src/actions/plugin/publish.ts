import { PluginPublishPrompts } from '../../prompts/plugin/publish.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { PluginConfigContext } from '../../types/plugin-config-context.js';
import { PluginContext } from '../../types/plugin-context.js';
import { ActionResult } from '../action-result.js';

export class PluginPublishAction {
  private readonly prompts: PluginPublishPrompts = new PluginPublishPrompts();

  public readonly execute = async (
    buildDirectory: DirectoryPath,
    pluginDirectory: DirectoryPath
  ): Promise<ActionResult> => {
    if (buildDirectory.isEqual(pluginDirectory)) {
      this.prompts.directoryCannotBeSame(pluginDirectory);
      return ActionResult.failed();
    }

    const pluginContext = new PluginContext(pluginDirectory);
    if (!(await pluginContext.exists())) {
      this.prompts.pluginNotGenerated(pluginDirectory);
      return ActionResult.failed();
    }

    const configState = await new PluginConfigContext(buildDirectory).getPluginConfigState();
    if (configState.state === 'unreadable') {
      this.prompts.pluginConfigUnreadable(configState.reason, configState.path);
      return ActionResult.failed();
    }

    if (configState.state === 'missing') {
      this.prompts.pluginConfigMissing(buildDirectory);
      return ActionResult.failed();
    }

    const release = configState.getRelease();
    if (!release) {
      this.prompts.pluginDetailsNotSet();
      return ActionResult.failed();
    }

    const contents = await pluginContext.describeContents();

    if (await pluginContext.isGitInitialized()) {
      this.prompts.updateInstructions(release, contents, pluginDirectory);
    } else {
      this.prompts.firstPublishInstructions(release, contents, pluginDirectory);
    }

    return ActionResult.success();
  };
}
