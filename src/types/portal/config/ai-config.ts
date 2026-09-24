import { Result } from 'neverthrow';
import { allOf, namespace, optionalBoolean, Parsed, unknownKeys } from './fields.js';

const KNOWN = ['pageActions'];

export class AiConfig {
  private constructor(private readonly pageActions: boolean) {}

  public static readonly defaults = new AiConfig(true);

  public static parse(value: unknown, path: string): Parsed<AiConfig> {
    return namespace(value, path).andThen((data) =>
      allOf(
        unknownKeys(data, KNOWN, path),
        Result.combineWithAllErrors([
          optionalBoolean(data.pageActions, `${path}.pageActions`, AiConfig.defaults.pageActions)
        ])
      ).map(([pageActions]) => new AiConfig(pageActions))
    );
  }

  /**
   * Whether each page offers to open itself in an external AI assistant. A portal published
   * under someone else's brand carries that endorsement, so it can be turned off.
   */
  public offersPageActions(): boolean {
    return this.pageActions;
  }

  public toJSON(): { pageActions: boolean } {
    return { pageActions: this.pageActions };
  }
}
