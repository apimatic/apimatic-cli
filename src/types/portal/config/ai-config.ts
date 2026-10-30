import { Result } from 'neverthrow';
import { CopilotConfig, CopilotService, PortalCopilot } from './copilot-config.js';
import { allOf, namespace, optional, optionalBoolean, Parsed, unknownKeys } from './fields.js';
import { ServiceAddress } from './service-address.js';

const KNOWN = ['pageActions', 'copilot'];

export class AiConfig {
  private constructor(private readonly pageActions: boolean, private readonly copilotSettings: CopilotConfig | null) {}

  public static readonly defaults = new AiConfig(true, null);

  public static parse(value: unknown, path: string, copilotAddress: ServiceAddress): Parsed<AiConfig> {
    return namespace(value, path).andThen((data) =>
      allOf(
        unknownKeys(data, KNOWN, path),
        Result.combineWithAllErrors([
          optionalBoolean(data.pageActions, `${path}.pageActions`, AiConfig.defaults.pageActions),
          optional(data.copilot, (present) => CopilotConfig.parse(present, `${path}.copilot`, copilotAddress))
        ])
      ).map(([pageActions, copilot]) => new AiConfig(pageActions, copilot))
    );
  }

  /**
   * Whether each page offers to open itself in an external AI assistant. A portal published
   * under someone else's brand carries that endorsement, so it can be turned off.
   */
  public offersPageActions(): boolean {
    return this.pageActions;
  }

  /** The Ask AI chat the portal offers, or null when it offers none. */
  public copilot(): PortalCopilot | null {
    return this.copilotSettings?.identity() ?? null;
  }

  /** The service the Ask AI chat is on, or null when the portal offers none. */
  public copilotService(): CopilotService | null {
    return this.copilotSettings?.service() ?? null;
  }

  public toJSON(): { pageActions: boolean; copilot?: ReturnType<CopilotConfig['toJSON']> } {
    return {
      pageActions: this.pageActions,
      ...(this.copilotSettings === null ? {} : { copilot: this.copilotSettings.toJSON() })
    };
  }
}
