import { Children } from "react";
import { Cards } from "fumadocs-ui/components/card";
import { cn } from "@/lib/cn";
import { ContextPluginAchievementCard } from "./achievement-card";
import { defaultAchievements } from "./data/default-achievements";
import type { ContextPluginAchievementsProps } from "./types";

export function ContextPluginAchievements({
  children,
  items,
  empty,
  className,
}: ContextPluginAchievementsProps) {
  // Children win over `items`; `items={[]}` still falls through to `empty`.
  const cards =
    Children.count(children) > 0
      ? children
      : (items ?? defaultAchievements).map((item, index) => (
          <ContextPluginAchievementCard key={item.id ?? index} {...item} />
        ));

  if (Children.count(cards) === 0) {
    return empty ? (
      <div className="text-sm text-fd-muted-foreground">{empty}</div>
    ) : null;
  }

  return <Cards className={cn("not-prose", className)}>{cards}</Cards>;
}
