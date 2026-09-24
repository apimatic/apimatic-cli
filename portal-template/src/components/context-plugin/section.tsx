import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** A small-caps label over a wrapping row — the shape both panel rows share. */
export function Section({
  label,
  gap,
  children,
}: {
  label: ReactNode;
  gap: string;
  children: ReactNode;
}) {
  return (
    <>
      <p className="mt-5 mb-2.5 font-mono text-xs tracking-[0.08em] text-fd-muted-foreground">
        {label}
      </p>
      <div className={cn("flex flex-wrap items-center", gap)}>{children}</div>
    </>
  );
}
