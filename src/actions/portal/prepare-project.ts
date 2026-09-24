import { PortalProjectPaths, PortalProjectService } from '../../infrastructure/portal-project-service.js';
import { PortalArtifactsService } from '../../infrastructure/services/portal-artifacts-service.js';
import { withBuildDirectory, withDirPath } from '../../infrastructure/tmp-extensions.js';
import { PreparePortalProjectPrompts } from '../../prompts/portal/prepare-project.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { PortalArtifactsContext } from '../../types/portal-artifacts-context.js';
import { PortalSourceContext } from '../../types/portal-source-context.js';
import { PortalSource } from '../../types/portal/portal-source.js';
import { ActionResult } from '../action-result.js';

/**
 * The run `portal generate` and `portal serve` share: fetch what `/portal-artifacts` built, place
 * it, read the source, and prepare the Vite project both of them then run. Only what happens to
 * that project differs — one builds it to disk, the other serves it.
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
    onPrepared: (project: PortalProjectPaths, source: PortalSource) => Promise<ActionResult>
  ): Promise<ActionResult> => {
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

      // Placed before the source is read: `resolve` records whether `static/` is there, so a
      // project getting its first SDK download would otherwise go on without one.
      await new PortalArtifactsContext(sourceDirectory).place(artifacts.value);

      const source = await new PortalSourceContext(sourceDirectory).resolve();
      if (source.isErr()) {
        this.prompts.sourceProblem(source.error, sourceDirectory);
        return ActionResult.failed();
      }
      this.prompts.filesShadowedByStatic(source.value.shadowedFiles);
      this.prompts.pagesHiddenBySpecs(source.value.hiddenPages, sourceDirectory);
      this.prompts.ignoredNavigationFiles(source.value.ignoredNavigationFiles, sourceDirectory);

      const codeSamples = artifacts.value.codeSamples;
      this.prompts.unplacedSamples(codeSamples.unplacedIn(source.value.specs.flatMap((spec) => spec.endpoints)));

      return await withBuildDirectory(sourceDirectory, async (tempDirectory) => {
        const project = await this.projectService.prepare(tempDirectory, source.value, codeSamples);
        if (project.isErr()) {
          this.prompts.runtimeUnsupported(project.error);
          return ActionResult.failed();
        }

        return await onPrepared(project.value, source.value);
      });
    });
  };
}
