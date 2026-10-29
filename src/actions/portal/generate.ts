import { envInfo } from '../../infrastructure/env-info.js';
import { PortalBuildService } from '../../infrastructure/portal-build-service.js';
import { PortalProjectPaths } from '../../infrastructure/portal-project-service.js';
import { PortalGeneratePrompts } from '../../prompts/portal/generate.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { PortalContext } from '../../types/portal-context.js';
import { SiteAddress } from '../../types/portal/config/site-address.js';
import { CopilotBundle } from '../../types/portal/copilot/copilot-bundle.js';
import { GeneratedPortalContext } from '../../types/portal/copilot/generated-portal-context.js';
import { ProjectContext } from '../../types/project-context.js';
import { ActionResult } from '../action-result.js';
import { PreparePortalProjectAction } from './prepare-project.js';

export class GenerateAction {
  private readonly prompts: PortalGeneratePrompts = new PortalGeneratePrompts();
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
    project: ProjectContext,
    portalDirectory: DirectoryPath,
    force: boolean,
    zipPortal: boolean
  ): Promise<ActionResult> => {
    if (project.isSourceDirectory(portalDirectory)) {
      this.prompts.directoryCannotBeSame(portalDirectory);
      return ActionResult.failed();
    }

    // The destination is emptied before the site is written, so a destination that holds
    // the source would delete the very files being built from.
    if (project.isSourceWithin(portalDirectory)) {
      this.prompts.destinationContainsSource(project.sourceDirectory(), portalDirectory);
      return ActionResult.failed();
    }

    const portalContext = new PortalContext(portalDirectory);
    return await new PreparePortalProjectAction(this.configDir, this.commandMetadata, this.authKey).execute(project, {
      confirm: () => this.confirmOverwrite(portalContext, portalDirectory, force),
      onPrepared: (portalProject, source) =>
        this.build(portalProject, source.config.siteAddress(), portalContext, portalDirectory, zipPortal, {
          copilot: source.config.identity().copilot !== null
        })
    });
  };

  private async confirmOverwrite(
    portalContext: PortalContext,
    portalDirectory: DirectoryPath,
    force: boolean
  ): Promise<boolean> {
    if (force || !(await portalContext.exists()) || (await this.prompts.overwritePortal(portalDirectory))) {
      return true;
    }
    this.prompts.portalDirectoryNotEmpty();
    return false;
  }

  private async build(
    portalProject: PortalProjectPaths,
    site: SiteAddress | null,
    portalContext: PortalContext,
    portalDirectory: DirectoryPath,
    zipPortal: boolean,
    { copilot }: { copilot: boolean }
  ): Promise<ActionResult> {
    const build = await this.prompts.buildPortal(this.buildService.build(portalProject));

    if (build.isErr()) {
      // Written before the temp directory is removed, so the log outlives the build.
      const logPath = await portalContext.saveBuildLog(build.error.log);
      this.prompts.buildFailed(build.error.log, logPath);
      return ActionResult.failed();
    }

    // Added before saving, so a zipped portal carries the bundle too.
    const copilotPublished = copilot && (await this.publishCopilotBundle(build.value.output, site));

    const saved = await this.prompts.savePortal(portalContext.save(build.value.output, zipPortal));
    if (saved.isErr()) {
      return ActionResult.failed();
    }

    this.prompts.portalGenerated(portalDirectory);
    this.prompts.nextSteps(portalDirectory, zipPortal, site);
    if (copilotPublished) this.prompts.copilotUpdatesAfterDeploy(site);

    return ActionResult.success();
  }

  /** The portal still saves without the bundle, whatever stops it. */
  private async publishCopilotBundle(builtDirectory: DirectoryPath, site: SiteAddress | null): Promise<boolean> {
    const portal = new GeneratedPortalContext(builtDirectory);
    const taken = await portal.takePages();
    if (taken.isErr()) {
      this.prompts.copilotBundleNotWritten(taken.error);
      return false;
    }
    const pages = taken.value;
    if (pages === null) {
      this.prompts.copilotPagesNotBuilt();
      return false;
    }
    if (pages.length === 0) {
      this.prompts.copilotPagesNotFound();
      return false;
    }
    const published = await portal.publish(CopilotBundle.of(pages, site, envInfo.getCLIVersion(), new Date()));
    if (published.isErr()) {
      this.prompts.copilotBundleNotWritten(published.error);
      return false;
    }
    return true;
  }
}
