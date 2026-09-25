import { PortalProjectPaths, PortalProjectService } from '../../infrastructure/portal-project-service.js';
import { PortalArtifactsService } from '../../infrastructure/services/portal-artifacts-service.js';
import { withPortalProjectDirectory, withDirPath } from '../../infrastructure/tmp-extensions.js';
import { PreparePortalProjectPrompts } from '../../prompts/portal/prepare-project.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { PortalBuildDirectoryContext } from '../../types/portal-build-directory-context.js';
import { PortalBuildDirectoryContents } from '../../types/portal/portal-build-directory.js';
import { ActionResult } from '../action-result.js';

/**
 * The run `portal generate` and `portal serve` share: fetch what `/portal-artifacts` built, read
 * the build directory, and prepare the Vite project both of them then run. Only what happens to
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
    buildDirectory: DirectoryPath,
    onPrepared: (project: PortalProjectPaths, contents: PortalBuildDirectoryContents) => Promise<ActionResult>
  ): Promise<ActionResult> => {
    // The artifacts live in this directory for as long as the caller needs them, so it wraps
    // everything that reads them rather than being opened and closed around the call.
    return await withDirPath(async (artifactsDirectory) => {
      const artifacts = await this.prompts.generateArtifacts(
        this.artifactsService.generate(
          buildDirectory,
          artifactsDirectory,
          this.configDir,
          this.commandMetadata,
          this.authKey
        )
      );
      if (artifacts.isErr()) {
        return ActionResult.failed();
      }

      const contents = await new PortalBuildDirectoryContext(buildDirectory).resolve();
      if (contents.isErr()) {
        this.prompts.buildDirectoryProblem(contents.error, buildDirectory);
        return ActionResult.failed();
      }
      this.prompts.filesShadowedByStatic(contents.value.shadowedFiles);
      this.prompts.pagesHiddenBySpecs(contents.value.hiddenPages, buildDirectory);
      this.prompts.ignoredNavigationFiles(contents.value.ignoredNavigationFiles, buildDirectory);

      this.prompts.unplacedSamples(
        artifacts.value.codeSampleCatalogs.unplacedIn(contents.value.specs.flatMap((spec) => spec.endpoints))
      );

      return await withPortalProjectDirectory(buildDirectory, async (tempDirectory) => {
        const project = await this.projectService.prepare(tempDirectory, contents.value, artifacts.value);
        if (project.isErr()) {
          this.prompts.runtimeUnsupported(project.error);
          return ActionResult.failed();
        }

        return await onPrepared(project.value, contents.value);
      });
    });
  };
}
