import { log } from '@clack/prompts';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FilePath } from '../../types/file/filePath.js';
import { PluginContents } from '../../types/plugin/plugin-contents.js';
import { PluginRelease, PluginReleaseProblem } from '../../types/plugin/plugin-release.js';
import { format as f } from '../format.js';
import { noteWrapped } from '../prompt.js';

const PLUGIN_CONFIG_FILE = 'plugin-config.json';
const NOTE_TITLE = 'printed, not executed';

export class PluginPublishPrompts {
  public firstPublishInstructions(release: PluginRelease, contents: PluginContents, pluginDirectory: DirectoryPath) {
    const message =
      `Publish version ${f.var(release.toVersion())} of your plugin to a new public GitHub repository.\n\n` +
      `${this.contentsLine(contents)}\n\n` +
      `${this.changeDirectory(pluginDirectory)}\n` +
      `${f.cmdAlt('git', 'init', '-b', 'main')}\n` +
      `${this.createRepository(release)}\n` +
      `${this.stageAndCommit(release)}\n` +
      `${f.cmdAlt('git', 'push', '-u', 'origin', 'main')}\n` +
      `${this.tagAndPush(release)}`;
    noteWrapped(message, NOTE_TITLE);
  }

  public updateInstructions(release: PluginRelease, contents: PluginContents, pluginDirectory: DirectoryPath) {
    const message =
      `Publish version ${f.var(release.toVersion())} of your plugin as a new release of your ` +
      `existing repository.\n\n` +
      `${this.contentsLine(contents)}\n\n` +
      `${this.changeDirectory(pluginDirectory)}\n` +
      `${this.stageAndCommit(release)}\n` +
      `${f.cmdAlt('git', 'push')}\n` +
      `${this.tagAndPush(release)}`;
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
      `${f.var(PLUGIN_CONFIG_FILE)} cannot be used: ${reason}. ` + `Fix or delete it at ${f.path(path)} and try again.`;
    log.error(message);
  }

  public pluginReleaseIncomplete(problem: PluginReleaseProblem) {
    const message =
      `${f.var(problem.field)} ${this.releaseProblemDetail(problem)}. ` +
      `Run '${f.cmdAlt('apimatic', 'plugin', 'generate')}' to set it.`;
    log.error(message);
  }

  private releaseProblemDetail(problem: PluginReleaseProblem): string {
    if (problem.reason === 'missing') {
      return `is not set in ${f.var(PLUGIN_CONFIG_FILE)}`;
    }
    if (problem.field === 'pluginId') {
      return `must be lower-case alphanumeric words separated by single dashes, for example ${f.var('acme-payments')}`;
    }
    return `must be a version in the format major.minor.patch, for example ${f.var('0.1.0')}`;
  }

  private contentsLine(contents: PluginContents): string {
    const files = `${contents.fileCount} ${contents.fileCount === 1 ? 'file' : 'files'}`;
    const directories = `${contents.directoryCount} ${contents.directoryCount === 1 ? 'dir' : 'dirs'}`;
    return `what is about to become public: ${files}, ${directories}`;
  }

  /**
   * Double quotes rather than `f.path`: single quotes are not quoting to `cmd.exe`, so a path
   * containing spaces would break the line the user pastes.
   */
  private changeDirectory(pluginDirectory: DirectoryPath): string {
    return f.cmdAlt('cd', `"${pluginDirectory}"`);
  }

  /** `--push` is left out on purpose: nothing is committed yet at this point in the sequence. */
  private createRepository(release: PluginRelease): string {
    return f.cmdAlt('gh', 'repo', 'create', release.toRepositoryName(), '--public', '--source=.', '--remote=origin');
  }

  private stageAndCommit(release: PluginRelease): string {
    const commitMessage = `"Publish ${release.toRepositoryName()} ${release.toVersion()}"`;
    return `${f.cmdAlt('git', 'add', '.')} && ${f.cmdAlt('git', 'commit', '-m', commitMessage)}`;
  }

  /** Chained so an existing tag stops the push instead of publishing a stale one. */
  private tagAndPush(release: PluginRelease): string {
    const tag = release.toTag();
    return `${f.cmdAlt('git', 'tag', tag)} && ${f.cmdAlt('git', 'push', 'origin', tag)}`;
  }
}
