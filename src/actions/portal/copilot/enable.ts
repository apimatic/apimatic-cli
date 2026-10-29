import { ok } from 'neverthrow';
import { CopilotPortalService } from '../../../infrastructure/services/copilot-portal-service.js';
import { PortalCopilotEnablePrompts } from '../../../prompts/portal/copilot/enable.js';
import { CommandMetadata } from '../../../types/common/command-metadata.js';
import { DirectoryPath } from '../../../types/file/directoryPath.js';
import { ServiceAddress } from '../../../types/portal/config/service-address.js';
import { PLACEHOLDER_SITE } from '../../../types/portal/config/site-config.js';
import { CopilotKey, CopilotKeyKind } from '../../../types/portal/copilot/copilot-key.js';
import { CopilotRegistration } from '../../../types/portal/copilot/copilot-registration.js';
import { ProjectContext } from '../../../types/project-context.js';
import { ActionResult } from '../../action-result.js';
import { AskAiAccessAction } from './access.js';

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
    const source = project.portalSource();
    // Named as `generate` names it, from the only specification when `site.name` is left out. A specification the
    // build would refuse is the build's to report, so it only leaves the placeholder.
    const suggested = (await source.resolveSuggestedSite()).unwrapOr(PLACEHOLDER_SITE);
    const settings = await source.resolveSettings(suggested);
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
    // A new key when the portal has none or one is asked for; otherwise the same key is registered again, so
    // changed origins reach the service.
    const fresh = current === null || rotate;
    // Spelt out again rather than `fresh`, so TypeScript knows `current` is a key on the second branch.
    const key = current === null || rotate ? ok(CopilotKey.generate(kind)) : CopilotKey.reusable(current, kind);
    if (key.isErr()) {
      this.prompts.keyNotReusable(key.error, kind);
      return ActionResult.failed();
    }

    const { shell } = this.commandMetadata;
    const access = new AskAiAccessAction(this.configDir, this.commandMetadata, this.authKey, 'set up Ask AI');
    const authKey = await access.execute();
    if (authKey === null) {
      return ActionResult.failed();
    }

    const registered = await this.prompts.register(
      this.portalService.register(address.value, key.value, registration.value, shell, authKey)
    );
    if (registered.isErr()) {
      this.prompts.registrationFailed(registered.error, address.value);
      return ActionResult.failed();
    }

    const replaced = rotate ? current : null;
    if (fresh) {
      const written = await source.writeCopilotKey(key.value);
      if (written.isErr()) {
        this.prompts.keyNotSaved(written.error, key.value, sourceDirectory);
        return ActionResult.failed();
      }
    }

    // Revoked only once the new key is saved, so a failure on the way never leaves the portal without one.
    if (replaced !== null) {
      await this.revokePrevious(address.value, replaced, shell, authKey);
    }

    this.prompts.enabled(registered.value, key.value, registration.value.origins(), replaced !== null);
    this.prompts.nextSteps(key.value.kind());
    return ActionResult.success();
  };

  /** A key that is not revoked keeps working, but the new one is saved, so this only warns. */
  private async revokePrevious(address: ServiceAddress, previous: string, shell: string, authKey: string) {
    const revoked = await this.prompts.revokePrevious(this.portalService.revoke(address, previous, shell, authKey));
    if (revoked.isErr()) {
      this.prompts.previousKeyNotRevoked(revoked.error);
    }
  }
}
