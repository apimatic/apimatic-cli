import { Card } from "fumadocs-ui/components/card";
import { cn } from "@/lib/cn";
import type { ContextPluginAchievementCardProps } from "./types";

export function ContextPluginAchievementCard({
  title,
  description,
  icon,
  className,
}: ContextPluginAchievementCardProps) {
  return (
    <Card
      // `Card` titles are `text-sm`; the reference sets these a step larger.
      className={cn(
        "p-5.5 [&>h3]:mb-2 [&>h3]:text-base [&>h3]:font-semibold",
        className,
      )}
      icon={icon}
      title={title}
      description={description}
    />
  );
}
