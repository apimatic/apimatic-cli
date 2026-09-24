"use client";

import { Check, Copy } from "lucide-react";
import { buttonVariants } from "fumadocs-ui/components/ui/button";
import { useCopyButton } from "fumadocs-ui/utils/use-copy-button";
import { cn } from "@/lib/cn";

export function CopyCommandButton({ command }: { command: string }) {
  const [checked, onClick] = useCopyButton(() =>
    navigator.clipboard.writeText(command),
  );

  return (
    <button
      type="button"
      onClick={onClick}
      data-checked={checked || undefined}
      aria-label={checked ? "Copied install command" : "Copy install command"}
      className={cn(
        buttonVariants({ size: "icon-xs" }),
        "text-fd-muted-foreground hover:text-fd-accent-foreground data-checked:text-fd-accent-foreground",
      )}
    >
      {checked ? <Check /> : <Copy />}
    </button>
  );
}
