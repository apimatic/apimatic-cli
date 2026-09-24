import { PortalBuildService } from '../../infrastructure/portal-build-service.js';
import { PortalProjectService } from '../../infrastructure/portal-project-service.js';
import { PortalAuthorizationService } from '../../infrastructure/services/portal-authorization-service.js';
import { PortalGeneratePrompts } from '../../prompts/portal/generate.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { PortalContext } from '../../types/portal-context.js';
import { ActionResult } from '../action-result.js';
import { PreparePortalProjectAction } from './prepare-project.js';

export class GenerateAction {
  private readonly prompts: PortalGeneratePrompts = new PortalGeneratePrompts();
  private readonly authorizationService = new PortalAuthorizationService();
  private readonly projectService = new PortalProjectService();
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

    return await new PreparePortalProjectAction(this.configDir, this.commandMetadata, this.authKey).execute(
      sourceDirectory,
      async (project) => {
        const build = await this.prompts.buildPortal(this.buildService.build(project));

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
      }
    );
  };
}
