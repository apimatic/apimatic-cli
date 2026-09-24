import { PortalGeneratePrompts } from '../../prompts/portal/generate.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { ActionResult } from '../action-result.js';
import { PortalContext } from '../../types/portal-context.js';
import { PortalSourceContext } from '../../types/portal-source-context.js';
import { PortalArtifactsContext } from '../../types/portal-artifacts-context.js';
import { withBuildDirectory, withDirPath } from '../../infrastructure/tmp-extensions.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { PortalAuthorizationService } from '../../infrastructure/services/portal-authorization-service.js';
import { PortalBuildService } from '../../infrastructure/portal-build-service.js';
import { PortalProjectService } from '../../infrastructure/portal-project-service.js';
import { PortalArtifactsService } from '../../infrastructure/services/portal-artifacts-service.js';

export class GenerateAction {
  private readonly prompts: PortalGeneratePrompts = new PortalGeneratePrompts();
  private readonly authorizationService = new PortalAuthorizationService();
  private readonly projectService = new PortalProjectService();
  private readonly artifactsService = new PortalArtifactsService();
  private readonly buildService = new PortalBuildService();
  private readonly configDir: DirectoryPath;
  private readonly commandMetadata: CommandMetadata;
  private readonly authKey: string | null;

  constructor(configDir: DirectoryPath, commandMetadata: CommandMetadata, authKey: string | null = null) {
    this.configDir = configDir;
    this.commandMetadata = commandMetadata;
    this.authKey = authKey;
  }

  public readonly execute = async (
    sourceDirectory: DirectoryPath,
    portalDirectory: DirectoryPath,
    force: boolean,
    zipPortal: boolean
  ): Promise<ActionResult> => {
    if (sourceDirectory.isEqual(portalDirectory)) {
      this.prompts.directoryCannotBeSame(portalDirectory);
      return ActionResult.failed();
    }

    // The destination is emptied before the site is written, so a destination that holds
    // the source would delete the very files being built from.
    if (portalDirectory.contains(sourceDirectory)) {
      this.prompts.destinationContainsSource(sourceDirectory, portalDirectory);
      return ActionResult.failed();
    }

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

    const portalContext = new PortalContext(portalDirectory);
    if (!force && (await portalContext.exists()) && !(await this.prompts.overwritePortal(portalDirectory))) {
      this.prompts.portalDirectoryNotEmpty();
      return ActionResult.cancelled();
    }

    // The artifacts live in this directory for as long as the build needs them, so it wraps
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
      // project getting its first SDK download would otherwise build without one.
      await new PortalArtifactsContext(sourceDirectory).place(artifacts.value);

      const sourceContext = new PortalSourceContext(sourceDirectory);
      const source = await sourceContext.resolve();
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

        const build = await this.prompts.buildPortal(this.buildService.build(project.value));

        if (build.isErr()) {
          // Written before the temp directory is removed, so the log outlives the build.
          const logPath = await portalContext.saveBuildLog(build.error.log);
          this.prompts.buildFailed(build.error.log, logPath);
          return ActionResult.failed();
        }

        const saved = await this.prompts.savePortal(portalContext.save(build.value.output, zipPortal));
        if (saved.isErr()) {
          return ActionResult.failed();
        }

        this.prompts.portalGenerated(portalDirectory);
        this.prompts.nextSteps(portalDirectory, zipPortal);

        return ActionResult.success();
      });
    });
  };
}
