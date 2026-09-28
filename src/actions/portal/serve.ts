import { Result } from 'neverthrow';
import { PortalServePrompts } from '../../prompts/portal/serve.js';
import { APIMATIC_CONFIG_FILE_NAME } from '../../types/apimatic-config/document.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FileName } from '../../types/file/fileName.js';
import { ActionResult } from '../action-result.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { ProjectContext } from '../../types/project-context.js';
import { isSkippedByGlob } from '../../types/portal/content-tree.js';
import { GeneratedPages } from '../../types/portal/generated-pages.js';
import { PortalArtifacts } from '../../types/portal/portal-artifacts.js';
import { PortalSettings, PortalSource } from '../../types/portal/portal-source.js';
import { PreviewConfig } from '../../types/portal/preview-config.js';
import { PreviewContent } from '../../types/portal/preview-content.js';
import { FileWatch, FileWatchService } from '../../infrastructure/file-watch-service.js';
import { NetworkService } from '../../infrastructure/network-service.js';
import { LauncherService } from '../../infrastructure/launcher-service.js';
import { PortalDevServerService } from '../../infrastructure/portal-dev-server-service.js';
import { PortalProjectService } from '../../infrastructure/portal-project-service.js';
import { errorMessage } from '../../utils/error-utils.js';
import { PreparePortalProjectAction } from './prepare-project.js';

export const DEFAULT_PORTAL_PORT = 23513;

export class PortalServeAction {
  private readonly prompts: PortalServePrompts = new PortalServePrompts();
  private readonly networkService: NetworkService = new NetworkService();
  private readonly launcherService: LauncherService = new LauncherService();
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
    project: ProjectContext,
    port: number,
    openInBrowser: boolean,
    onServing?: () => void
  ): Promise<ActionResult> => {
    return await new PreparePortalProjectAction(this.configDir, this.commandMetadata, this.authKey).execute(project, {
      onPrepared: async (portalProject, source, artifacts) => {
        const servePort = await this.networkService.getServerPort([port, 3000, 3001, 3002]);
        if (servePort !== port) {
          this.prompts.usingFallbackPort(port, servePort);
        }

        const server = await this.prompts.startPreview(this.devServerService.start(portalProject, servePort));

        if (server.isErr()) {
          this.prompts.startFailed(server.error.log);
          return ActionResult.failed();
        }

        this.prompts.portalServed(server.value.url, project.sourceDirectory());
        if (openInBrowser) {
          await this.launcherService.openUrlInBrowser(server.value.url);
        }
        if (onServing) {
          onServing();
        }

        // The content's tab names are checked against the generated tabs, which apimatic.json adds and removes.
        let generatedPages = source.generatedPages;
        const contentWatch = this.watchContent(project, source, () => generatedPages, portalProject.projectDirectory);
        const configWatch = this.watchConfig(project, source, artifacts, portalProject.projectDirectory, (settings) => {
          const tabsChanged = !settings.generatedPages.makesSameTabsAs(generatedPages);
          generatedPages = settings.generatedPages;
          if (tabsChanged) {
            contentWatch?.recheck();
          }
        });
        const closeWatches = async () => {
          await configWatch?.close();
          await contentWatch?.close();
        };

        this.clearStandardInput();

        try {
          // Raced with the exit too: waiting only on the signal left a crashed server advertised as running.
          const interrupted = this.prompts.blockExecution().then(() => ({ kind: 'interrupted' as const }));
          const stopped = server.value.exited.then((output) => ({ kind: 'exited' as const, output }));
          const outcome = await Promise.race([interrupted, stopped]);
          // First, so a save still being handled is not reported after the preview says it stops.
          await closeWatches();

          if (outcome.kind === 'exited') {
            this.prompts.previewStopped(outcome.output);
            return ActionResult.failed();
          }

          this.prompts.stopping();
          await server.value.stop();
          return ActionResult.stopped();
        } finally {
          // Before the portal project goes: a save being handled writes into it.
          await closeWatches();
        }
      }
    });
  };

  /**
   * Held to the rules a build applies: an edit a build would refuse is reported as `portal
   * generate` would report it, and the preview keeps what it last accepted.
   */
  private watchConfig(
    project: ProjectContext,
    source: PortalSource,
    artifacts: PortalArtifacts,
    portalProjectDirectory: DirectoryPath,
    onApplied: (settings: PortalSettings) => void
  ): FileWatch | undefined {
    const sourceDirectory = project.sourceDirectory();
    const sourceContext = project.portalSource();
    const preview = new PreviewConfig(source.config, source.staticDirectory !== null);

    const applyEdit = async () => {
      const reloaded = await sourceContext.resolveSettings(source.suggestedSite);
      if (reloaded.isErr()) {
        preview.refuse();
        this.prompts.configRejected(reloaded.error, sourceDirectory);
        return;
      }
      const settings = reloaded.value;
      const { config } = settings;

      const missing = settings.generatedPages.missingFrom(artifacts);
      if (missing !== null) {
        preview.refuse();
        this.prompts.editNeedsRestart(missing);
        return;
      }

      if (preview.staticDirectoryNotServed(config)) {
        this.prompts.staticDirectoryNotServed(sourceDirectory);
      }

      const applied = await this.projectService.applyConfig(portalProjectDirectory, settings);
      if (applied.isErr()) {
        this.prompts.configNotApplied(applied.error);
        return;
      }
      if (preview.show(config, applied.value)) {
        this.prompts.configApplied();
      }
      onApplied(settings);
    };

    return this.startWatch(
      (onChange) =>
        this.fileWatchService.watch(sourceDirectory, new FileName(APIMATIC_CONFIG_FILE_NAME), onChange, (reason) =>
          this.prompts.configWatchFailed(reason)
        ),
      applyEdit,
      {
        notWatched: (reason) => this.prompts.configNotWatched(reason),
        thrown: (reason) => this.prompts.configNotApplied(reason)
      }
    );
  }

  /** Held to a build's rules, as `apimatic.json` is: a refused save is reported, and the preview kept as it was. */
  private watchContent(
    project: ProjectContext,
    source: PortalSource,
    generatedPages: () => GeneratedPages,
    portalProjectDirectory: DirectoryPath
  ): FileWatch | undefined {
    const contentDirectory = source.contentDirectory;
    if (contentDirectory === null) {
      return undefined;
    }
    const sourceDirectory = project.sourceDirectory();
    const sourceContext = project.portalSource();
    const preview = new PreviewContent(source.contentNotices);

    const check = async () => {
      const checked = await sourceContext.resolveContent(source.specs, generatedPages());
      if (checked.isErr()) {
        preview.refuse();
        this.prompts.contentRejected(checked.error, sourceDirectory);
        return;
      }
      const applied = await this.projectService.applyContent(
        portalProjectDirectory,
        contentDirectory,
        checked.value.files
      );
      if (applied.isErr()) {
        this.prompts.contentNotApplied(applied.error, sourceDirectory);
        return;
      }
      const shown = preview.show(checked.value.notices);
      if (shown.fixed) {
        this.prompts.contentAccepted(sourceDirectory);
      }
      this.prompts.contentNotices(shown.notices, sourceDirectory);
    };

    return this.startWatch(
      (onChange) =>
        this.fileWatchService.watchTree(
          contentDirectory,
          onChange,
          (reason) => this.prompts.contentWatchFailed(reason, sourceDirectory),
          // What the build never reads, as an editor's swap file, would only have the check run again.
          isSkippedByGlob
        ),
      check,
      {
        notWatched: (reason) => this.prompts.contentNotWatched(reason, sourceDirectory),
        thrown: (reason) => this.prompts.contentNotChecked(reason, sourceDirectory)
      }
    );
  }

  /**
   * Runs `handle` on each save the watch reports, and once at the start: what it handles was read
   * before the preview started, which can take a minute, and a save made meanwhile reached no watch.
   */
  private startWatch(
    watch: (onChange: () => Promise<void>) => Result<FileWatch, string>,
    handle: () => Promise<void>,
    report: { notWatched: (reason: string) => void; thrown: (reason: string) => void }
  ): FileWatch | undefined {
    // The watch drops whatever its handler throws, which would leave the preview stale without a word.
    const onChange = async () => {
      try {
        await handle();
      } catch (error) {
        report.thrown(errorMessage(error));
      }
    };
    const started = watch(onChange);
    if (started.isErr()) {
      report.notWatched(started.error);
      return undefined;
    }
    started.value.recheck();
    return started.value;
  }

  // Clack leaves stdin in raw mode, which swallows CTRL+C until it is released.
  private clearStandardInput() {
    if (process.platform !== 'darwin' && process.stdin.isTTY) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }
  }
}
