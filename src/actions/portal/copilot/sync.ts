import { getAuthInfo } from '../../../client-utils/auth-manager.js';
import { CopilotIngestService } from '../../../infrastructure/services/copilot-ingest-service.js';
import { PortalCopilotSyncPrompts } from '../../../prompts/portal/copilot/sync.js';
import { CommandMetadata } from '../../../types/common/command-metadata.js';
import { DirectoryPath } from '../../../types/file/directoryPath.js';
import { PLACEHOLDER_SITE } from '../../../types/portal/config/site-config.js';
import { GeneratedPortalContext } from '../../../types/portal/copilot/generated-portal-context.js';
import { ProjectContext } from '../../../types/project-context.js';
import { ActionResult } from '../../action-result.js';

export class PortalCopilotSyncAction {
  private readonly prompts = new PortalCopilotSyncPrompts();
  private readonly ingestService = new CopilotIngestService();

  constructor(
    private readonly configDir: DirectoryPath,
    private readonly commandMetadata: CommandMetadata,
    private readonly authKey: string | null = null
  ) {}

  public readonly execute = async (
    project: ProjectContext,
    portalDirectory: DirectoryPath,
    wait: boolean
  ): Promise<ActionResult> => {
    // The site's name is never synced, so the specifications need not be read to default it.
    const settings = await project.portalSource().resolveSettings(PLACEHOLDER_SITE);
    if (settings.isErr()) {
      this.prompts.sourceProblem(settings.error, project.sourceDirectory());
      return ActionResult.failed();
    }
    const { config } = settings.value;

    const copilot = config.identity().copilot;
    if (copilot === null) {
      this.prompts.copilotNotConfigured(project.sourceDirectory());
      return ActionResult.failed();
    }
    const authKey = await this.uploadKey();
    if (authKey === null) {
      return ActionResult.failed();
    }

    // As `generate` wrote it for the deploy, under the address the portal was built for.
    const bundled = await new GeneratedPortalContext(portalDirectory).bundle();
    if (bundled.isErr()) {
      this.prompts.portalNotRead(portalDirectory, bundled.error);
      return ActionResult.failed();
    }
    const bundle = bundled.value;
    if (bundle === null) {
      this.prompts.portalNotGenerated(portalDirectory);
      return ActionResult.failed();
    }

    const { shell } = this.commandMetadata;
    const receipt = await this.prompts.upload(
      this.ingestService.upload(copilot, bundle, shell, authKey),
      bundle.pageCount()
    );
    if (receipt.isErr()) {
      this.prompts.uploadFailed(receipt.error, copilot.apiUrl);
      return ActionResult.failed();
    }
    if (receipt.value.status === 'unchanged') {
      this.prompts.alreadyUpToDate(receipt.value.pageCount);
      return ActionResult.success();
    }
    if (!wait) {
      this.prompts.indexingQueued();
      return ActionResult.success();
    }

    const indexed = await this.prompts.awaitIndexing(
      this.ingestService.awaitIndexing(copilot, receipt.value.versionId, shell, authKey)
    );
    if (indexed.isErr()) {
      this.prompts.indexingFailed(indexed.error, copilot.apiUrl);
      return ActionResult.failed();
    }
    if (indexed.value.status === 'superseded') {
      this.prompts.superseded();
    } else {
      this.prompts.indexed(indexed.value);
    }
    return ActionResult.success();
  };

  /**
   * The only place that decides which key the service receives: the passed one, else the saved login. The
   * service is APIMatic's own, or one on this machine, as the `portal` block allows no other.
   */
  private async uploadKey(): Promise<string | null> {
    // A blank `--auth-key` (say, from an unset variable) is no key, so it falls back to the saved login.
    const passed = this.authKey?.trim() ?? '';
    if (passed !== '') {
      return passed;
    }
    // `auth logout` blanks the stored key rather than deleting the file, so the key is checked, not the file.
    const saved = (await getAuthInfo(this.configDir.toString()))?.authKey;
    if (!saved) {
      this.prompts.notLoggedIn();
      return null;
    }
    return saved;
  }
}
