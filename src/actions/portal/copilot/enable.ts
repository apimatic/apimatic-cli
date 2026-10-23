import { ok } from 'neverthrow';
import { resolveAuthKey } from '../../../client-utils/auth-manager.js';
import { CopilotPortalService } from '../../../infrastructure/services/copilot-portal-service.js';
import { PortalAuthorizationService } from '../../../infrastructure/services/portal-authorization-service.js';
import { PortalCopilotEnablePrompts } from '../../../prompts/portal/copilot/enable.js';
import { CommandMetadata } from '../../../types/common/command-metadata.js';
import { DirectoryPath } from '../../../types/file/directoryPath.js';
import { ServiceAddress } from '../../../types/portal/config/service-address.js';
import { PLACEHOLDER_SITE } from '../../../types/portal/config/site-config.js';
import { CopilotKey, CopilotKeyKind } from '../../../types/portal/copilot/copilot-key.js';
import { CopilotRegistration } from '../../../types/portal/copilot/copilot-registration.js';
import { ProjectContext } from '../../../types/project-context.js';
import { ActionResult } from '../../action-result.js';

export interface CopilotEnableOptions {
  kind: CopilotKeyKind;
  /** Replace the portal's key with a new one, and revoke the old one. */
  rotate: boolean;
  /** Sites besides `site.url` allowed to use the key. */
  origins: string[];
}

export class PortalCopilotEnableAction {
  private readonly prompts = new PortalCopilotEnablePrompts();
  private readonly portalService = new CopilotPortalService();
  private readonly authorizationService = new PortalAuthorizationService();

  constructor(
    private readonly configDir: DirectoryPath,
    private readonly commandMetadata: CommandMetadata,
    private readonly authKey: string | null = null
  ) {}

  public readonly execute = async (
    project: ProjectContext,
    { kind, rotate, origins }: CopilotEnableOptions
  ): Promise<ActionResult> => {
    const sourceDirectory = project.sourceDirectory();
    // The site's name is all the service is told of it, so the specifications need not be read to default it.
    const settings = await project.portalSource().resolveSettings(PLACEHOLDER_SITE);
    if (settings.isErr()) {
      this.prompts.sourceProblem(settings.error, sourceDirectory);
      return ActionResult.failed();
    }
    const { config } = settings.value;

    const address = ServiceAddress.current();
    if (address.isErr()) {
      this.prompts.invalidServiceAddress(address.error);
      return ActionResult.failed();
    }

    const registration = CopilotRegistration.of(config, origins, kind);
    if (registration.isErr()) {
      this.prompts.registrationInvalid(registration.error, sourceDirectory);
      return ActionResult.failed();
    }

    const current = config.copilotService()?.key ?? null;
    // An existing key is registered again, so changed origins reach the service.
    const key = current === null || rotate ? ok(CopilotKey.generate(kind)) : CopilotKey.reusable(current, kind);
    if (key.isErr()) {
      this.prompts.keyNotReusable(key.error, kind);
      return ActionResult.failed();
    }

    const authKey = await resolveAuthKey(this.configDir, this.authKey);
    if (authKey === null) {
      this.prompts.notLoggedIn();
      return ActionResult.failed();
    }
    const { shell } = this.commandMetadata;
    const entitled = await this.prompts.checkSubscription(
      this.authorizationService.authorizeAskAi(this.configDir, shell, authKey)
    );
    if (entitled.isErr()) {
      this.prompts.authorizationFailed(entitled.error);
      return ActionResult.failed();
    }

    const registered = await this.prompts.register(
      this.portalService.register(address.value, key.value, registration.value, shell, authKey)
    );
    if (registered.isErr()) {
      this.prompts.registrationFailed(registered.error, address.value);
      return ActionResult.failed();
    }

    const replaced = current !== null && current !== key.value.toString() ? current : null;
    if (current !== key.value.toString()) {
      const written = await project.portalSource().writeCopilotKey(key.value.toString());
      if (written.isErr()) {
        this.prompts.keyNotSaved(written.error, key.value, sourceDirectory);
        return ActionResult.failed();
      }
    }

    // Revoked only once the new key is saved, so a failure on the way never leaves the portal without one.
    if (replaced !== null) {
      const revoked = await this.prompts.revokePrevious(
        this.portalService.revoke(address.value, replaced, shell, authKey)
      );
      if (revoked.isErr()) {
        this.prompts.previousKeyNotRevoked(revoked.error);
      }
    }

    this.prompts.enabled(registered.value, key.value, registration.value.origins(), replaced !== null);
    this.prompts.nextSteps(key.value.kind());
    return ActionResult.success();
  };
}
