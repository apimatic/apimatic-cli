import { PluginPublishPrompts } from '../../prompts/plugin/publish.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { PluginContext } from '../../types/plugin-context.js';
import { ProjectContext } from '../../types/project-context.js';
import { ActionResult } from '../action-result.js';

export class PluginPublishAction {
  private readonly prompts: PluginPublishPrompts = new PluginPublishPrompts();

  public readonly execute = async (project: ProjectContext, pluginDirectory: DirectoryPath): Promise<ActionResult> => {
    if (project.isSourceDirectory(pluginDirectory)) {
      this.prompts.directoryCannotBeSame(pluginDirectory);
      return ActionResult.failed();
    }

    const pluginContext = new PluginContext(pluginDirectory);
    if (!(await pluginContext.exists())) {
      this.prompts.pluginNotGenerated(pluginDirectory);
      return ActionResult.failed();
    }

    const configState = await project.pluginConfig().getPluginConfigState();
    if (configState.state === 'unreadable') {
      this.prompts.pluginConfigUnreadable(configState.reason, configState.path);
      return ActionResult.failed();
    }

    if (configState.state === 'missing') {
      this.prompts.pluginConfigMissing(project.sourceDirectory());
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
