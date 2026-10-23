import { resolveAuthKey } from '../../../client-utils/auth-manager.js';
import { CopilotPortalService } from '../../../infrastructure/services/copilot-portal-service.js';
import { PortalCopilotDisablePrompts } from '../../../prompts/portal/copilot/disable.js';
import { CommandMetadata } from '../../../types/common/command-metadata.js';
import { DirectoryPath } from '../../../types/file/directoryPath.js';
import { PLACEHOLDER_SITE } from '../../../types/portal/config/site-config.js';
import { ProjectContext } from '../../../types/project-context.js';
import { ActionResult } from '../../action-result.js';

export class PortalCopilotDisableAction {
  private readonly prompts = new PortalCopilotDisablePrompts();
  private readonly portalService = new CopilotPortalService();

  constructor(
    private readonly configDir: DirectoryPath,
    private readonly commandMetadata: CommandMetadata,
    private readonly authKey: string | null = null
  ) {}

  public readonly execute = async (project: ProjectContext): Promise<ActionResult> => {
    const sourceDirectory = project.sourceDirectory();
    const settings = await project.portalSource().resolveSettings(PLACEHOLDER_SITE);
    if (settings.isErr()) {
      this.prompts.sourceProblem(settings.error, sourceDirectory);
      return ActionResult.failed();
    }
    const copilot = settings.value.config.copilotService();
    if (copilot === null) {
      this.prompts.notEnabled();
      return ActionResult.success();
    }

    // No subscription check: a lapsed account must still be able to take its key out of use.
    const authKey = await resolveAuthKey(this.configDir, this.authKey);
    if (authKey === null) {
      this.prompts.notLoggedIn();
      return ActionResult.failed();
    }

    const revoked = await this.prompts.revoke(
      this.portalService.revoke(copilot.address, copilot.key, this.commandMetadata.shell, authKey)
    );
    if (revoked.isErr()) {
      this.prompts.revocationFailed(revoked.error, copilot.address);
      return ActionResult.failed();
    }

    const written = await project.portalSource().writeCopilotKey(null);
    if (written.isErr()) {
      this.prompts.keyNotRemoved(written.error, sourceDirectory);
      return ActionResult.failed();
    }

    this.prompts.disabled(revoked.value);
    return ActionResult.success();
  };
}
