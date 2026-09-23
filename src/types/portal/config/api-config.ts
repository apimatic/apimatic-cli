import { Result } from 'neverthrow';
import { allOf, namespace, oneOf, optionalBoolean, Parsed, unknownKeys } from './fields.js';

/** Fumadocs' own values, which decide the operation URLs as well as the sidebar. */
export const GROUP_BY = ['tag', 'route', 'none'] as const;

export type GroupBy = (typeof GROUP_BY)[number];

const KNOWN = ['groupBy', 'showDeprecated', 'showInternal'];

/** `portal.api`: how the reference pages are grouped, and which operations they leave out. */
export class ApiConfig {
  private constructor(
    private readonly groupBy: GroupBy,
    private readonly showDeprecated: boolean,
    private readonly showInternal: boolean
  ) {}

  public static readonly defaults = new ApiConfig('tag', true, false);

  public static parse(value: unknown, path: string): Parsed<ApiConfig> {
    const { defaults } = ApiConfig;
    return namespace(value, path).andThen((data) =>
      allOf(
        unknownKeys(data, KNOWN, path),
        Result.combineWithAllErrors([
          oneOf(data.groupBy, `${path}.groupBy`, GROUP_BY, defaults.groupBy),
          optionalBoolean(data.showDeprecated, `${path}.showDeprecated`, defaults.showDeprecated),
          optionalBoolean(data.showInternal, `${path}.showInternal`, defaults.showInternal)
        ])
      ).map(([groupBy, showDeprecated, showInternal]) => new ApiConfig(groupBy, showDeprecated, showInternal))
    );
  }

  public grouping(): GroupBy {
    return this.groupBy;
  }

  public showsDeprecated(): boolean {
    return this.showDeprecated;
  }

  /** Whether operations marked `x-internal: true` are documented. */
  public showsInternal(): boolean {
    return this.showInternal;
  }

  public isEqual(other: ApiConfig): boolean {
    return (
      this.groupBy === other.groupBy &&
      this.showDeprecated === other.showDeprecated &&
      this.showInternal === other.showInternal
    );
  }

  public toJSON(): { groupBy: GroupBy; showDeprecated: boolean; showInternal: boolean } {
    return { groupBy: this.groupBy, showDeprecated: this.showDeprecated, showInternal: this.showInternal };
  }
}
