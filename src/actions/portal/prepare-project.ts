import { PortalProjectPaths, PortalProjectService } from '../../infrastructure/portal-project-service.js';
import { PortalArtifactsService } from '../../infrastructure/services/portal-artifacts-service.js';
import { PortalAuthorizationService } from '../../infrastructure/services/portal-authorization-service.js';
import { withPortalProjectDirectory, withDirPath } from '../../infrastructure/tmp-extensions.js';
import { PreparePortalProjectPrompts } from '../../prompts/portal/prepare-project.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
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

export class PreparePortalProjectAction {
  private readonly prompts: PreparePortalProjectPrompts = new PreparePortalProjectPrompts();
  private readonly projectService = new PortalProjectService();
  private readonly authorizationService = new PortalAuthorizationService();
  private readonly artifactsService = new PortalArtifactsService();

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
    this.prompts.filesShadowedByStatic(source.value.shadowedFiles);
    this.prompts.contentNotices(source.value.contentNotices, sourceDirectory);

    if (!(await confirm())) {
      return ActionResult.cancelled();
    }

    // The artifacts live in this directory for as long as the caller needs them, so it wraps
    // everything that reads them rather than being opened and closed around the call.
    return await withDirPath(async (artifactsDirectory) => {
      const artifacts = await this.prompts.generateArtifacts(
        this.artifactsService.generate(
          sourceDirectory,
          artifactsDirectory,
          this.configDir,
          this.commandMetadata,
          this.authKey
        )
      );
      if (artifacts.isErr()) {
        return ActionResult.failed();
      }

      this.prompts.unplacedSamples(
        artifacts.value.codeSampleCatalogs.unplacedIn(source.value.specs.flatMap((spec) => spec.endpoints))
      );

      const missing = source.value.generatedPages.missingFrom(artifacts.value);
      if (missing !== null) {
        this.prompts.artifactsIncomplete(missing);
        return ActionResult.failed();
      }

      return await withPortalProjectDirectory(sourceDirectory, async (tempDirectory) => {
        const portalProject = await this.projectService.prepare(tempDirectory, source.value, artifacts.value);
        if (portalProject.isErr()) {
          this.prompts.runtimeUnsupported(portalProject.error);
          return ActionResult.failed();
        }

        return await onPrepared(portalProject.value, source.value, artifacts.value);
      });
    });
  };
}
