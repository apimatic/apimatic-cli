import Link from "fumadocs-core/link";
import { cn } from "@/lib/cn";
import { resolveIdeIcon } from "./icons/resolve-ide-icon";
import { isExternal } from "./lib/is-external";
import type { ContextPluginIde } from "./types";

export function IdeChip({ ide }: { ide: ContextPluginIde }) {
  const body = (
    <>
      {resolveIdeIcon(ide.icon)}
      {ide.label}
    </>
  );

  // A chip is decorative until it is given somewhere to go.
  const className = cn(
    "inline-flex items-center gap-2 rounded-[9px] border bg-fd-secondary px-3 py-1.25 text-sm font-semibold text-fd-secondary-foreground",
    ide.href && "transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground",
  );

  return ide.href ? (
    <Link href={ide.href} external={isExternal(ide)} className={className}>
      {body}
    </Link>
  ) : (
    <span className={className}>{body}</span>
  );
}
