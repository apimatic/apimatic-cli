import { Result } from 'neverthrow';
import { CopilotConfig, PortalCopilot } from './copilot-config.js';
import { allOf, namespace, optional, optionalBoolean, Parsed, unknownKeys } from './fields.js';

const KNOWN = ['pageActions', 'copilot'];

export class AiConfig {
  private constructor(private readonly pageActions: boolean, private readonly copilotSettings: CopilotConfig | null) {}

  public static readonly defaults = new AiConfig(true, null);

  public static parse(value: unknown, path: string): Parsed<AiConfig> {
    return namespace(value, path).andThen((data) =>
      allOf(
        unknownKeys(data, KNOWN, path),
        Result.combineWithAllErrors([
          optionalBoolean(data.pageActions, `${path}.pageActions`, AiConfig.defaults.pageActions),
          optional(data.copilot, (present) => CopilotConfig.parse(present, `${path}.copilot`))
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

  public toJSON(): { pageActions: boolean; copilot?: ReturnType<CopilotConfig['toJSON']> } {
    return {
      pageActions: this.pageActions,
      ...(this.copilotSettings === null ? {} : { copilot: this.copilotSettings.toJSON() })
    };
  }
}
