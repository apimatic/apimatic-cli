import { PortalServePrompts } from '../../prompts/portal/serve.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { ActionResult } from '../action-result.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { PortalSourceContext } from '../../types/portal-source-context.js';
import { withBuildDirectory } from '../../infrastructure/tmp-extensions.js';
import { NetworkService } from '../../infrastructure/network-service.js';
import { LauncherService } from '../../infrastructure/launcher-service.js';
import { PortalAuthorizationService } from '../../infrastructure/services/portal-authorization-service.js';
import { PortalDevServerService } from '../../infrastructure/portal-dev-server-service.js';
import { PortalProjectService } from '../../infrastructure/portal-project-service.js';
import { PortalArtifactsService } from '../../infrastructure/services/portal-artifacts-service.js';

export const DEFAULT_PORTAL_PORT = 23513;

export class PortalServeAction {
  private readonly prompts: PortalServePrompts = new PortalServePrompts();
  private readonly networkService: NetworkService = new NetworkService();
  private readonly launcherService: LauncherService = new LauncherService();
  private readonly authorizationService = new PortalAuthorizationService();
  private readonly projectService = new PortalProjectService();
  private readonly artifactsService = new PortalArtifactsService();
  private readonly devServerService = new PortalDevServerService();
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
    openInBrowser: boolean,
    onAfterServe?: () => void
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

    const generated = await this.prompts.generateCodeSamples(this.artifactsService.generate());
    if (generated.isErr()) {
      return ActionResult.failed();
    }
    const codeSamples = generated.value.samples;
    this.prompts.ignoredSampleKeys(generated.value.ignoredKeys);
    this.prompts.unplacedSamples(codeSamples.unplacedIn(source.value.specs.flatMap((spec) => spec.endpoints)));

    const servePort = await this.networkService.getServerPort([port, 3000, 3001, 3002]);
    if (servePort !== port) {
      this.prompts.usingFallbackPort(port, servePort);
    }

    return await withBuildDirectory(sourceDirectory, async (tempDirectory) => {
      const project = await this.projectService.prepare(tempDirectory, source.value, codeSamples);
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
      if (onAfterServe) {
        onAfterServe();
      }

      this.clearStandardInput();

      // Whichever comes first: the user stopping the preview, or the preview stopping on its
      // own. Waiting only on the signal left a crashed server advertised as running.
      const interrupted = this.prompts.blockExecution().then(() => ({ kind: 'interrupted' as const }));
      const stopped = server.value.exited.then((output) => ({ kind: 'exited' as const, output }));
      const outcome = await Promise.race([interrupted, stopped]);

      if (outcome.kind === 'exited') {
        this.prompts.previewStopped(outcome.output);
        return ActionResult.failed();
      }

      this.prompts.stopping();
      await server.value.stop();
      return ActionResult.stopped();
    });
  };

  // Clack leaves stdin in raw mode, which swallows CTRL+C until it is released.
  private clearStandardInput() {
    if (process.platform !== 'darwin' && process.stdin.isTTY) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }
  }
}
