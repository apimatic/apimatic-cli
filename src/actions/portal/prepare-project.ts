import { PortalProjectPaths, PortalProjectService } from '../../infrastructure/portal-project-service.js';
import { PortalArtifactsService } from '../../infrastructure/services/portal-artifacts-service.js';
import { withPortalProjectDirectory, withDirPath } from '../../infrastructure/tmp-extensions.js';
import { PreparePortalProjectPrompts } from '../../prompts/portal/prepare-project.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { PortalSourceContext } from '../../types/portal-source-context.js';
import { PortalArtifacts } from '../../types/portal/portal-artifacts.js';
import { PortalSource } from '../../types/portal/portal-source.js';
import { ActionResult } from '../action-result.js';

/** What the caller does within the shared run, in the order the run does it. */
export interface PreparationSteps {
  /** Asked once the source is read, before the artifacts are fetched; false cancels the run. */
  confirm?: () => Promise<boolean>;
  onPrepared: (project: PortalProjectPaths, source: PortalSource, artifacts: PortalArtifacts) => Promise<ActionResult>;
}

/**
 * The run `portal generate` and `portal serve` share: read the source, fetch what
 * `/portal-artifacts` builds from it, and prepare the Vite project both of them then run. Only
 * what happens to that project differs — one builds it to disk, the other serves it.
 */
export class PreparePortalProjectAction {
  private readonly prompts: PreparePortalProjectPrompts = new PreparePortalProjectPrompts();
  private readonly projectService = new PortalProjectService();
  private readonly artifactsService = new PortalArtifactsService();

  public constructor(
    private readonly configDir: DirectoryPath,
    private readonly commandMetadata: CommandMetadata,
    private readonly authKey: string | null = null
  ) {}

  /**
   * Takes the caller's next step rather than returning the project, because the artifacts and the
   * project live in temporary directories that have to outlive this call: the build reads them,
   * and the preview goes on reading them until the user stops it.
   */
  public readonly execute = async (
    sourceDirectory: DirectoryPath,
    { confirm = async () => true, onPrepared }: PreparationSteps
  ): Promise<ActionResult> => {
    // Ahead of the server run, which can take minutes: a mistake or a question should not wait on it.
    const source = await new PortalSourceContext(sourceDirectory).resolve();
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
        const project = await this.projectService.prepare(tempDirectory, source.value, artifacts.value);
        if (project.isErr()) {
          this.prompts.runtimeUnsupported(project.error);
          return ActionResult.failed();
        }

        return await onPrepared(project.value, source.value, artifacts.value);
      });
    });
  };
}
