import { PortalServePrompts } from '../../prompts/portal/serve.js';
import { APIMATIC_CONFIG_FILE_NAME } from '../../types/apimatic-config/document.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FileName } from '../../types/file/fileName.js';
import { ActionResult } from '../action-result.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { PortalSourceContext } from '../../types/portal-source-context.js';
import { PortalSource } from '../../types/portal/portal-source.js';
import { PreviewConfig } from '../../types/portal/preview-config.js';
import { FileWatch, FileWatchService } from '../../infrastructure/file-watch-service.js';
import { withBuildDirectory } from '../../infrastructure/tmp-extensions.js';
import { NetworkService } from '../../infrastructure/network-service.js';
import { LauncherService } from '../../infrastructure/launcher-service.js';
import { PortalAuthorizationService } from '../../infrastructure/services/portal-authorization-service.js';
import { PortalDevServerService } from '../../infrastructure/portal-dev-server-service.js';
import { PortalProjectService } from '../../infrastructure/portal-project-service.js';

export const DEFAULT_PORTAL_PORT = 23513;

export class PortalServeAction {
  private readonly prompts: PortalServePrompts = new PortalServePrompts();
  private readonly networkService: NetworkService = new NetworkService();
  private readonly launcherService: LauncherService = new LauncherService();
  private readonly authorizationService = new PortalAuthorizationService();
  private readonly projectService = new PortalProjectService();
  private readonly devServerService = new PortalDevServerService();
  private readonly fileWatchService = new FileWatchService();
  private readonly configDir: DirectoryPath;
  private readonly commandMetadata: CommandMetadata;
  private readonly authKey: string | null;

  public constructor(configDir: DirectoryPath, commandMetadata: CommandMetadata, authKey: string | null = null) {
    this.configDir = configDir;
    this.commandMetadata = commandMetadata;
    this.authKey = authKey;
  }

  public readonly execute = async (
    sourceDirectory: DirectoryPath,
    port: number,
    openInBrowser: boolean
  ): Promise<ActionResult> => {
    const runtimeProblem = this.projectService.runtimeProblem();
    if (runtimeProblem !== null) {
      this.prompts.runtimeUnsupported(runtimeProblem);
      return ActionResult.failed();
    }

    // Checked once, at startup: the preview then runs unattended for as long as the user
    // keeps editing, and re-checking on every reload would be a request per keystroke.
    const authorization = await this.authorizationService.authorize(
      this.configDir,
      this.commandMetadata.shell,
      this.authKey
    );
    if (authorization.isErr()) {
      this.prompts.authorizationFailed(authorization.error);
      return ActionResult.failed();
    }

    const sourceContext = new PortalSourceContext(sourceDirectory);
    const source = await sourceContext.resolve();
    if (source.isErr()) {
      this.prompts.sourceProblem(source.error, sourceDirectory);
      return ActionResult.failed();
    }
    this.prompts.filesShadowedByStatic(source.value.shadowedFiles);
    this.prompts.pagesHiddenBySpecs(source.value.hiddenPages, sourceDirectory);
    this.prompts.ignoredNavigationFiles(source.value.ignoredNavigationFiles, sourceDirectory);

    const servePort = await this.networkService.getServerPort([port, 3000, 3001, 3002]);
    if (servePort !== port) {
      this.prompts.usingFallbackPort(port, servePort);
    }

    return await withBuildDirectory(sourceDirectory, async (tempDirectory) => {
      const project = await this.projectService.prepare(tempDirectory, source.value);
      if (project.isErr()) {
        this.prompts.runtimeUnsupported(project.error);
        return ActionResult.failed();
      }

      const server = await this.prompts.startPreview(this.devServerService.start(project.value, servePort));

      if (server.isErr()) {
        this.prompts.startFailed(server.error.log);
        return ActionResult.failed();
      }

      this.prompts.portalServed(server.value.url, sourceDirectory);
      if (openInBrowser) {
        await this.launcherService.openUrlInBrowser(server.value.url);
      }

      const configWatch = this.watchConfig(
        sourceContext,
        source.value,
        project.value.projectDirectory,
        sourceDirectory
      );

      this.clearStandardInput();

      try {
        // Whichever comes first: the user stopping the preview, or the preview stopping on its
        // own. Waiting only on the signal left a crashed server advertised as running.
        const interrupted = this.prompts.blockExecution().then(() => ({ kind: 'interrupted' as const }));
        const stopped = server.value.exited.then((output) => ({ kind: 'exited' as const, output }));
        const outcome = await Promise.race([interrupted, stopped]);

        if (outcome.kind === 'exited') {
          this.prompts.previewStopped(outcome.output);
          return ActionResult.failed();
        }

        // First, so a save still being handled is not reported after the preview says it stops.
        await configWatch?.close();
        this.prompts.stopping();
        await server.value.stop();
        return ActionResult.stopped();
      } finally {
        // Before the build directory goes: a save being handled writes into it.
        await configWatch?.close();
      }
    });
  };

  /**
   * Re-applies `apimatic.json` to the running preview each time it is saved, held to the rules
   * a build applies: an edit a build would refuse is reported as `portal generate` would
   * report it, and the preview keeps what it last accepted. Compared by what the preview shows
   * rather than by the file's text, since the plugin commands rewrite the whole file to change
   * their own block. What the build set-up reads once, `portal.api`, is not re-applied.
   */
  private watchConfig(
    sourceContext: PortalSourceContext,
    source: PortalSource,
    projectDirectory: DirectoryPath,
    sourceDirectory: DirectoryPath
  ): FileWatch | undefined {
    const preview = new PreviewConfig(source.config, source.staticDirectory !== null);

    const reapply = async () => {
      const reloaded = await sourceContext.resolveConfig(source.suggestedSite);
      if (reloaded.isErr()) {
        preview.refuse();
        this.prompts.configRejected(reloaded.error, sourceDirectory);
        return;
      }
      const config = reloaded.value;

      const notices = preview.noticesFor(config);
      if (notices.restartNeeded) {
        this.prompts.restartNeeded();
      }
      if (notices.staticDirectoryNotServed) {
        this.prompts.staticDirectoryNotServed(sourceDirectory);
      }

      const applied = await this.projectService.applyConfig(projectDirectory, config);
      if (applied.isErr()) {
        this.prompts.configNotApplied(applied.error);
        return;
      }
      if (preview.show(config, applied.value)) {
        this.prompts.configApplied();
      }
    };

    const watch = this.fileWatchService.watch(
      sourceDirectory,
      new FileName(APIMATIC_CONFIG_FILE_NAME),
      reapply,
      (reason) => this.prompts.configWatchFailed(reason)
    );
    if (watch.isErr()) {
      this.prompts.configNotWatched(watch.error);
      return undefined;
    }
    // The file was read before the preview started, which can take a minute, and a save made
    // in the meantime reached no watch.
    watch.value.recheck();
    return watch.value;
  }

  // Clack leaves stdin in raw mode, which swallows CTRL+C until it is released.
  private clearStandardInput() {
    if (process.platform !== 'darwin' && process.stdin.isTTY) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }
  }
}
