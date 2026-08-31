import { log } from '@clack/prompts';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FilePath } from '../../types/file/filePath.js';
import { PluginContents } from '../../types/plugin/plugin-contents.js';
import { PluginReleaseData } from '../../types/plugin-config-context.js';
import { format as f } from '../format.js';
import { noteWrapped } from '../prompt.js';

const PLUGIN_CONFIG_FILE = 'plugin-config.json';
const NOTE_TITLE = 'Commands to Copy and Run';
const TAG_PREFIX = 'v';

export class PluginPublishPrompts {
  public firstPublishInstructions(
    release: PluginReleaseData,
    contents: PluginContents,
    pluginDirectory: DirectoryPath
  ) {
    const message =
      `Publish version ${f.var(`${release.version}`)} of your plugin to a new public GitHub repository.\n\n` +
      `${this.contentsLine(contents)}\n\n` +
      `${this.changeDirectory(pluginDirectory)}\n` +
      `${f.cmdAlt('git', 'init', '-b', 'main')}\n` +
      `${this.stageCommitAndTag(release)}\n` +
      `${this.createRepository(release)}\n` +
      `${f.cmdAlt('git', 'push', '-u', 'origin', 'main', '--follow-tags')}`;
    noteWrapped(message, NOTE_TITLE);
  }

  public updateInstructions(release: PluginReleaseData, contents: PluginContents, pluginDirectory: DirectoryPath) {
    const message =
      `Publish version ${f.var(`${release.version}`)} of your plugin as a new release of your ` +
      `existing repository.\n\n` +
      `${this.contentsLine(contents)}\n\n` +
      `${this.changeDirectory(pluginDirectory)}\n` +
      `${this.stageCommitAndTag(release)}\n` +
      `${f.cmdAlt('git', 'push', '--follow-tags')}`;
    noteWrapped(message, NOTE_TITLE);
  }

  public directoryCannotBeSame(directory: DirectoryPath) {
    const message =
      `The ${f.var('src')} and ${f.var('plugin')} directories must be different. ` +
      `Current value: ${f.path(directory)}`;
    log.error(message);
  }

  public pluginNotGenerated(directory: DirectoryPath) {
    const message =
      `No plugin found at ${f.path(directory)}. ` + `Run '${f.cmdAlt('apimatic', 'plugin', 'generate')}' first.`;
    log.error(message);
  }

  public pluginConfigMissing(directory: DirectoryPath) {
    const message =
      `${f.var(PLUGIN_CONFIG_FILE)} was not found in ${f.path(directory)}. ` +
      `Run '${f.cmdAlt('apimatic', 'plugin', 'generate')}' first.`;
    log.error(message);
  }

  public pluginConfigUnreadable(reason: string, path: FilePath) {
    const message =
      `${f.var(PLUGIN_CONFIG_FILE)} cannot be used: ${reason}. ` +
      `Fix or delete it at ${f.path(path)}, then run '${f.cmdAlt('apimatic', 'plugin', 'generate')}'.`;
    log.error(message);
  }

  public pluginDetailsNotSet() {
    const message =
      `${f.var(PLUGIN_CONFIG_FILE)} does not name the plugin or its version. ` +
      `Run '${f.cmdAlt('apimatic', 'plugin', 'generate')}' to set them.`;
    log.error(message);
  }

  private contentsLine(contents: PluginContents): string {
    const files = `${contents.fileCount} ${contents.fileCount === 1 ? 'file' : 'files'}`;
    const directories = `${contents.directoryCount} ${contents.directoryCount === 1 ? 'dir' : 'dirs'}`;
    return `What is about to become public: ${files}, ${directories}`;
  }

  /**
   * Double quotes rather than `f.path`: single quotes are not quoting to `cmd.exe`, so a path
   * containing spaces would break the line the user pastes.
   */
  private changeDirectory(pluginDirectory: DirectoryPath): string {
    return f.cmdAlt('cd', `"${pluginDirectory}"`);
  }

  private createRepository(release: PluginReleaseData): string {
    return f.cmdAlt('gh', 'repo', 'create', release.pluginId, '--public', '--source=.', '--remote=origin');
  }

  /**
   * The tag is annotated because `git push --follow-tags`, which ends both flows, carries annotated
   * tags only and would leave a lightweight one behind on the machine.
   */
  private stageCommitAndTag(release: PluginReleaseData): string {
    const label = `${release.pluginId} ${release.version}`;
    return (
      `${f.cmdAlt('git', 'add', '.')}\n` +
      `${f.cmdAlt('git', 'commit', '-m', `"Publish ${label}"`)}\n` +
      `${f.cmdAlt('git', 'tag', '-a', `${TAG_PREFIX}${release.version}`, '-m', `"${label}"`)}`
    );
  }
}
