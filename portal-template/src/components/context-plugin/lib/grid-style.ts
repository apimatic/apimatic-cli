import type { CSSProperties } from "react";
import type { ContextPluginAchievementsProps } from "../types";

/** Fixed columns when asked for, else auto-fit; collapses to one when narrow. */
export function gridStyle({
  columns,
  minCardWidth = "15rem",
}: Pick<
  ContextPluginAchievementsProps,
  "columns" | "minCardWidth"
>): CSSProperties {
  return {
    gridTemplateColumns: columns
      ? `repeat(${columns}, minmax(0, 1fr))`
      : `repeat(auto-fill, minmax(min(${minCardWidth}, 100%), 1fr))`,
  };
}
