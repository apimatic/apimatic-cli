import { resolveAuthKey } from '../../client-utils/auth-manager.js';
import { PortalProjectPaths, PortalProjectService } from '../../infrastructure/portal-project-service.js';
import { CopilotPortalService } from '../../infrastructure/services/copilot-portal-service.js';
import { PortalArtifactsService } from '../../infrastructure/services/portal-artifacts-service.js';
import { PortalAuthorizationService } from '../../infrastructure/services/portal-authorization-service.js';
import { withDirPath } from '../../infrastructure/tmp-extensions.js';
import { PreparePortalProjectPrompts } from '../../prompts/portal/prepare-project.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { CopilotService } from '../../types/portal/config/copilot-config.js';
import { CopilotKey } from '../../types/portal/copilot/copilot-key.js';
import { PortalArtifacts } from '../../types/portal/portal-artifacts.js';
import { PortalSource } from '../../types/portal/portal-source.js';
import { ProjectContext } from '../../types/project-context.js';
import { ActionResult } from '../action-result.js';

/** What the caller does within the shared run, in the order the run does it. */
export interface PreparationSteps {
  /** Asked once the source is read, before the artifacts are fetched; false cancels the run. */
  confirm?: () => Promise<boolean>;
  onPrepared: (
    portalProject: PortalProjectPaths,
    source: PortalSource,
    artifacts: PortalArtifacts
  ) => Promise<ActionResult>;
}

// Shorter than a registration's: the build goes on without the answer.
const COPILOT_LOOKUP_TIMEOUT_MS = 10_000;

export class PreparePortalProjectAction {
  private readonly prompts: PreparePortalProjectPrompts = new PreparePortalProjectPrompts();
  private readonly projectService = new PortalProjectService();
  private readonly authorizationService = new PortalAuthorizationService();
  private readonly artifactsService = new PortalArtifactsService();
  private readonly copilotService = new CopilotPortalService(COPILOT_LOOKUP_TIMEOUT_MS);

  public constructor(
    private readonly configDir: DirectoryPath,
    private readonly commandMetadata: CommandMetadata,
    private readonly authKey: string | null = null
  ) {}

  /** Takes the caller's next step rather than returning, because its temporary directories must outlive this call. */
  public readonly execute = async (
    project: ProjectContext,
    { confirm = async () => true, onPrepared }: PreparationSteps
  ): Promise<ActionResult> => {
    const sourceDirectory = project.sourceDirectory();

    const runtimeProblem = this.projectService.runtimeProblem();
    if (runtimeProblem !== null) {
      this.prompts.runtimeUnsupported(runtimeProblem);
      return ActionResult.failed();
    }

    // Vite drops a slash from a share's `\\server`, so the portal would be built without its static files.
    if (sourceDirectory.isOnNetworkShare()) {
      this.prompts.networkShareUnsupported(sourceDirectory);
      return ActionResult.failed();
    }

    const authorization = await this.authorizationService.authorize(
      this.configDir,
      this.commandMetadata.shell,
      this.authKey
    );
    if (authorization.isErr()) {
      this.prompts.authorizationFailed(authorization.error);
      return ActionResult.failed();
    }

    // Ahead of the server run, which can take minutes: a mistake or a question should not wait on it.
    const source = await project.portalSource().resolve();
    if (source.isErr()) {
      this.prompts.sourceProblem(source.error, sourceDirectory);
      return ActionResult.failed();
    }
    const copilot = source.value.config.copilotService();
    // Built in, the portal would only show its chat as unavailable; the service is not asked whether it knows the key.
    if (copilot !== null && CopilotKey.parse(copilot.key) === null) {
      this.prompts.copilotKeyUnrecognized(sourceDirectory);
      return ActionResult.failed();
    }
    if (copilot !== null && !authorization.value.includes('askAi')) {
      this.prompts.askAiNotEntitled({ kind: 'notEntitled', feature: 'askAi' }, sourceDirectory);
      return ActionResult.failed();
    }
    if (copilot !== null && !(await this.copilotKeyRegistered(copilot, sourceDirectory))) {
      return ActionResult.failed();
    }
    this.prompts.filesShadowedByStatic(source.value.shadowedFiles);
    this.prompts.contentNotices(source.value.contentNotices, sourceDirectory);
    this.prompts.unmergedSpecs(source.value.unmergedSpecs, sourceDirectory);
    this.prompts.leftOutSpecs(source.value.leftOutSpecs, sourceDirectory);

    if (!(await confirm())) {
      return ActionResult.cancelled();
    }

    // The artifacts live in this directory for as long as the caller needs them, so it wraps
    // everything that reads them rather than being opened and closed around the call.
    return await withDirPath(async (artifactsDirectory) => {
      const build = await project.buildZip(artifactsDirectory);
      if (build.isErr()) {
        this.prompts.sourceNotZipped(build.error, sourceDirectory);
        return ActionResult.failed();
      }

      const artifacts = await this.prompts.generateArtifacts(
        this.artifactsService.generate(
          build.value,
          artifactsDirectory,
          this.configDir,
          this.commandMetadata,
          this.authKey
        )
      );
      if (artifacts.isErr()) {
        return ActionResult.failed();
      }

      const codeSamples = artifacts.value.codeSampleCatalogs.placedOn(source.value.specs, source.value.specDirectory);
      this.prompts.sharedEndpoints(codeSamples.sharedEndpoints(), sourceDirectory);
      this.prompts.unplacedSamples(codeSamples.unplaced(), sourceDirectory);

      const missing = source.value.generatedPages.missingFrom(artifacts.value);
      if (missing !== null) {
        this.prompts.artifactsIncomplete(missing);
        return ActionResult.failed();
      }

      return await withDirPath(async (tempDirectory) => {
        const portalProject = await this.projectService.prepare(tempDirectory, source.value, artifacts.value);
        if (portalProject.isErr()) {
          this.prompts.runtimeUnsupported(portalProject.error);
          return ActionResult.failed();
        }

        return await onPrepared(portalProject.value, source.value, artifacts.value);
      });
    });
  };

  /** False once the prompts have said the service does not hold the key for this account; a failed check only warns. */
  private async copilotKeyRegistered(copilot: CopilotService, sourceDirectory: DirectoryPath): Promise<boolean> {
    // Signed in already: the account was just authorized with this key.
    const authKey = await resolveAuthKey(this.configDir, this.authKey);
    if (authKey === null) return true;
    const found = await this.prompts.lookUpCopilotKey(
      this.copilotService.lookUp(copilot.address, copilot.key, this.commandMetadata.shell, authKey)
    );
    if (found.isErr()) {
      this.prompts.copilotKeyNotChecked(found.error, copilot.address);
      return true;
    }
    if (found.value === 'registered') return true;
    this.prompts.copilotKeyNotRegistered(found.value, sourceDirectory);
    return false;
  }
}
